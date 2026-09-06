/**
 * Diagnostics and the hatches the GameTests drive. A SimulatedPlayer is no
 * player to this pack (docs/README.md), so the table's form cannot be tested
 * headlessly; `builder:place` runs the same path the form does from a
 * command, and writes its verdict to a world property a test can read.
 *
 *   /scriptevent builder:debug
 *   /scriptevent builder:place <key> x y z <rotation> [ticksPerBlock] [free]
 *   /scriptevent builder:remove x y z [ticksPerBlock]
 *   /scriptevent builder:resume x y z [ticksPerBlock]
 *   /scriptevent builder:forget x y z [radius]
 *
 * Console and operators only; `x y z` is the building's origin (its
 * minimum corner, the footing layer), and the table is the nearest blueprint
 * table within sixteen blocks of it. `rotation` is 0-3, degrees, a
 * StructureRotation name, or the way the door should face; `free` builds
 * as though the panel's free-build toggle were on.
 */
import { BlockVolume, CommandPermissionLevel, Player, system, world, type Dimension, type Vector3 } from "@minecraft/server";
import { catalogueEntry, CATALOGUE } from "../core/blueprint";
import { contains } from "../core/record";
import { parseRotation } from "../core/rotate";
import * as jobs from "./jobs";
import * as placing from "./placing";
import * as settings from "./settings";
import * as storage from "./storage";
import { TABLE } from "./table";
import { log } from "./tell";

/**
 * The last hatch verdict, for a test to read: `builder:place ok ...` or
 * `builder:place refused: ...`. Measured: a world dynamic property is the
 * pack's own - the GameTest pack read `bd:last` and `bd:buildings` as
 * undefined while this pack read both back across a restart - so the verdict
 * is also left where a test can see it: as the name tag of a `builder:verdict`
 * -tagged waypoint entity at the spot asked about, gone sixty ticks later.
 */
export const LAST = "bd:last";
export const VERDICT_TAG = "builder:verdict";

function verdict(text: string, dim?: Dimension, at?: Vector3): void {
  log(text);
  try {
    world.setDynamicProperty(LAST, text);
  } catch {
    /* nothing to do */
  }
  if (!dim || !at) return;
  try {
    for (const old of dim.getEntities({ type: "builder:waypoint", tags: [VERDICT_TAG], location: at, maxDistance: 4 })) old.remove();
    const marker = dim.spawnEntity("builder:waypoint", { x: at.x + 0.5, y: at.y + 1, z: at.z + 0.5 });
    marker.addTag(VERDICT_TAG);
    marker.nameTag = text;
    system.runTimeout(() => {
      try {
        if (marker.isValid) marker.remove();
      } catch {
        /* gone */
      }
    }, 60);
  } catch (e) {
    log(`could not leave the verdict at ${at.x},${at.y},${at.z}: ${e}`);
  }
}

function nearestTable(dim: Dimension, at: Vector3): Vector3 | undefined {
  try {
    const vol = new BlockVolume({ x: at.x - 16, y: at.y - 4, z: at.z - 16 }, { x: at.x + 16, y: at.y + 4, z: at.z + 16 });
    let best: Vector3 | undefined;
    let bestD = Infinity;
    for (const loc of dim.getBlocks(vol, { includeTypes: [TABLE] }, true).getBlockLocationIterator()) {
      const d = (loc.x - at.x) ** 2 + (loc.y - at.y) ** 2 + (loc.z - at.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x: loc.x, y: loc.y, z: loc.z };
      }
    }
    return best;
  } catch (e) {
    log(`could not look for a table near ${at.x},${at.y},${at.z}: ${e}`);
    return undefined;
  }
}

export function install(): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (!ev.id.startsWith("builder:")) return;
    const src = ev.sourceEntity;
    if (src instanceof Player && src.commandPermissionLevel < CommandPermissionLevel.GameDirectors) return;
    const parts = ev.message.trim().split(/\s+/).filter(Boolean);
    const dim = world.getDimension("minecraft:overworld");

    if (ev.id === "builder:debug") {
      const lines = [`${settings.policy().secondsPerBlock}s a block; ${storage.count()} building(s) recorded, ${jobs.count()} job(s) running`];
      for (const r of storage.all()) lines.push(`  ${r.key} at ${r.x},${r.y},${r.z} rot ${r.rotation} ${r.sx}x${r.sy}x${r.sz}: ${r.phase}, ${r.done} done, table ${r.table.x},${r.table.y},${r.table.z}`);
      lines.push(...jobs.describe().map((l) => `  job: ${l}`));
      lines.push(`  blueprints: ${CATALOGUE.map((e) => e.key).join(", ")}`);
      log(lines.join("\n"));
      return;
    }

    if (ev.id === "builder:place") {
      const [key, xs, ys, zs, rs, ts, freeText] = parts;
      const free = freeText === "free" || settings.policy().freeBuild;
      const [x, y, z] = [xs, ys, zs].map(Number);
      const rotation = parseRotation(rs ?? "0");
      if (!key || [x, y, z].some((n) => n === undefined || !Number.isInteger(n)) || rotation === undefined) {
        verdict("builder:place wants <key> x y z <rotation> [ticksPerBlock] [free]");
        return;
      }
      const origin = { x: x!, y: y!, z: z! };
      const table = nearestTable(dim, origin);
      if (!table) {
        verdict(`builder:place refused: no blueprint table within sixteen blocks of ${x},${y},${z}`, dim, origin);
        return;
      }
      const p = placing.plan(dim, key, origin, rotation, table, free);
      if (!("record" in p)) {
        verdict(`builder:place refused: ${p.refused}`, dim, origin);
        return;
      }
      log(placing.describe(p).join("\n"));
      if (p.refused) {
        verdict(`builder:place refused: ${p.refused}`, dim, origin);
        return;
      }
      storage.put(p.record);
      const ticks = ts ? Number(ts) : undefined;
      const started = jobs.start(p.record, ticks && Number.isInteger(ticks) && ticks > 0 ? ticks : undefined);
      verdict(started ? `builder:place ok: ${catalogueEntry(key)?.title ?? key} at ${x},${y},${z} rot ${rotation}, ${p.cells.length} cells${free ? ", free" : ""}` : `builder:place refused: the job did not start`, dim, origin);
      return;
    }

    if (ev.id === "builder:forget") {
      // Drop the record of the building at x y z (any cell of it), blocks
      // left standing; with a radius, every record whose origin is within
      // it - the GameTests' sweep, since a structure reload restores blocks
      // and not this pack's records.
      const [x, y, z, radius] = parts.slice(0, 4).map(Number);
      if ([x, y, z].some((n) => n === undefined || !Number.isInteger(n))) return verdict("builder:forget wants x y z [radius]");
      const at = { x: x!, y: y!, z: z! };
      const hits = storage.all().filter((r) => r.dimId === dim.id && (radius ? Math.hypot(r.x - at.x, r.z - at.z) <= radius : contains(r, at)));
      for (const r of hits) jobs.forget(r);
      verdict(hits.length ? `builder:forget ok: ${hits.map((r) => `${r.key} at ${r.x},${r.y},${r.z}`).join(", ")}` : `builder:forget: no building stands at ${x},${y},${z}`);
      return;
    }

    if (ev.id === "builder:remove" || ev.id === "builder:resume") {
      const [x, y, z] = parts.slice(0, 3).map(Number);
      const ticks = parts[3] ? Number(parts[3]) : undefined;
      if ([x, y, z].some((n) => n === undefined || !Number.isInteger(n))) {
        verdict(`${ev.id} wants x y z [ticksPerBlock]`);
        return;
      }
      const at = { x: x!, y: y!, z: z! };
      const record = storage.all().find((r) => r.dimId === dim.id && contains(r, at));
      if (!record) {
        verdict(`${ev.id} refused: no building stands at ${x},${y},${z}`, dim, at);
        return;
      }
      const pace = ticks && Number.isInteger(ticks) && ticks > 0 ? ticks : undefined;
      const ok = ev.id === "builder:remove" ? jobs.startRemoval(record, pace) : jobs.start(record, pace);
      verdict(ok ? `${ev.id} ok: ${record.key} at ${record.x},${record.y},${record.z}` : `${ev.id} refused: a job is already running there`, dim, record);
    }
  });
}
