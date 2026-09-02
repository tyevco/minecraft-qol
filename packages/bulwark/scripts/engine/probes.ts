import { Player, system, world, type Entity, type Vector3 } from "@minecraft/server";
import { withBlock } from "@qol/shared/engine/safeBlock";
import { AMMO_CAP } from "../core/ammo";
import { recordKey } from "../core/record";
import { TURRET_ENTITY, isTurretEntity, readArmed, readLink } from "./head";
import * as hooks from "./hooks";
import * as storage from "./storage";
import * as turret from "./turret";

/**
 * In-pack probes for the load-bearing unknowns. See docs/bulwark-turret-probe.md
 * for the protocol: which command answers which question, and what each
 * possible readout means for the design.
 *
 * Same shape as the probe pack: /scriptevent-driven so it survives /reload,
 * log-only unless the command's name says it mutates, and anything it creates
 * is tagged so `bulwark:probe-cleanup` can find it.
 *
 * These live here rather than in packages/probe because every question needs
 * the real entity and block definitions, which only this pack carries.
 */

const TAG = "[Bulwark]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

const PROBE_TAG = "bulwark:probe";
/** World property remembering the ids of probe heads, so a check survives a restart. */
const PROP_PROBE_IDS = "bw:probe-ids";
const PROP_PROBE_STAMP = "bw:probe-stamp";
const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

function readIds(): string[] {
  try {
    const raw = world.getDynamicProperty(PROP_PROBE_IDS);
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  world.setDynamicProperty(PROP_PROBE_IDS, ids.length ? JSON.stringify(ids) : undefined);
}

const v3 = (l: Vector3): string => `${l.x.toFixed(2)},${l.y.toFixed(2)},${l.z.toFixed(2)}`;

function floorOf(player: Player): Vector3 {
  const l = player.location;
  return { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) };
}

// ---------------------------------------------------------------------------
// P1 - entity persistence
// ---------------------------------------------------------------------------

/**
 * Spawn an UNLINKED head where the player stands, stamped with a property.
 * Unlinked heads are inert and untouched by reconciliation, so this measures
 * the engine alone: does a persistent custom entity with no spawn rules, and
 * its dynamic properties, survive chunk unload, /reload, re-entry, dimension
 * travel and a full restart?
 */
function probePersist(player: Player): void {
  const dim = player.dimension;
  const at = floorOf(player);
  try {
    const e = dim.spawnEntity(TURRET_ENTITY, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 }, {
      initialPersistence: true,
    });
    e.addTag(PROBE_TAG);
    const stamp = `${system.currentTick}`;
    e.setDynamicProperty(PROP_PROBE_STAMP, stamp);
    const ids = readIds();
    ids.push(e.id);
    writeIds(ids);
    log(
      `P1 spawned probe head id=${e.id} at ${v3(e.location)} in ${dim.id} stamp=${stamp}. ` +
        `Now: walk away until the chunk unloads / run /reload / leave and rejoin / change ` +
        `dimension / restart - then come back and run bulwark:probe-check.`,
    );
  } catch (err) {
    log(`P1 spawn FAILED: ${err} <-- the entity definition did not load; check the content log`);
  }
}

function probeCheck(player: Player): void {
  const ids = readIds();
  if (ids.length === 0) {
    log("P1 check: no probe heads remembered. Run bulwark:probe-persist first.");
    return;
  }
  const here = player.dimension.id;
  for (const id of ids) {
    let e: Entity | undefined;
    try {
      e = world.getEntity(id);
    } catch (err) {
      log(`P1 id=${id} getEntity THREW ${err}`);
      continue;
    }
    if (!e) {
      log(
        `P1 id=${id} NOT FOUND (you are in ${here}). Either its chunk is not loaded - ` +
          `stand within simulation distance and re-run - or the entity is gone: that is ` +
          `the finding the whole design depends on.`,
      );
      continue;
    }
    let stamp: unknown = "?";
    let valid: unknown = "?";
    let tags: unknown = "?";
    try {
      valid = e.isValid;
      stamp = e.getDynamicProperty(PROP_PROBE_STAMP);
      tags = e.getTags().join(",");
    } catch (err) {
      stamp = `ERR ${err}`;
    }
    log(
      `P1 id=${id} FOUND type=${e.typeId} valid=${valid} dim=${e.dimension.id} ` +
        `at ${v3(e.location)} stamp=${stamp} (${typeof stamp === "string" ? "intact" : "LOST"}) tags=${tags}`,
    );
  }
}

// ---------------------------------------------------------------------------
// P2/P3 - acquisition, firing and rotation
// ---------------------------------------------------------------------------

function nearestHead(player: Player): Entity | undefined {
  try {
    const found = player.dimension.getEntities({
      type: TURRET_ENTITY,
      location: player.location,
      maxDistance: 24,
      closest: 1,
    });
    return found[0];
  } catch {
    return undefined;
  }
}

/**
 * Sample the nearest head for ten seconds: rotation every half second, and
 * the shot counter. Log-only. Stand near a turret with ammo and let a mob
 * approach, or use bulwark:probe-target to spawn one.
 */
function probeWatch(player: Player): void {
  const head = nearestHead(player);
  if (!head) {
    log("P3 watch: no turret head within 24 blocks");
    return;
  }
  const link = readLink(head);
  const record = link ? storage.get(link) : undefined;
  log(
    `P3 watching head id=${head.id} linked=${link ? recordKey(link) : "no"} ` +
      `ammo=${record?.ammo ?? "?"} armed=${readArmed(head)} for 200 ticks`,
  );
  const shotsAtStart = hooks.stats.shots;
  let samples = 0;
  let lastRot = "";
  const id = system.runInterval(() => {
    samples++;
    try {
      if (!head.isValid) {
        log("P3 head became invalid mid-watch");
        system.clearRun(id);
        return;
      }
      const r = head.getRotation();
      const rot = `yaw=${r.y.toFixed(1)} pitch=${r.x.toFixed(1)}`;
      if (rot !== lastRot) {
        log(`P3 t+${samples * 10} ${rot} at ${v3(head.location)}`);
        lastRot = rot;
      }
    } catch (err) {
      log(`P3 sample failed: ${err}`);
    }
    if (samples >= 20) {
      system.clearRun(id);
      const shots = hooks.stats.shots - shotsAtStart;
      log(
        `P3 done: ${shots} turret shot(s) attributed in 10s, ` +
          `${hooks.stats.unattributed} arrow(s) with no owner overall. ` +
          `A changing yaw means the body turns; a flat one with shots landing means only ` +
          `the head bone should be animated.`,
      );
    }
  }, 10);
}

/**
 * MUTATES: spawns one zombie 8 blocks from the player, then watches. A zombie
 * is the plainest `monster`-family target; it walks toward the player, which
 * carries it through the turret's acquisition radius.
 */
function probeTarget(player: Player): void {
  const at = floorOf(player);
  const dir = player.getViewDirection();
  const len = Math.hypot(dir.x, dir.z) || 1;
  const where = { x: at.x + (dir.x / len) * 8 + 0.5, y: at.y, z: at.z + (dir.z / len) * 8 + 0.5 };
  try {
    const z = player.dimension.spawnEntity("minecraft:zombie", where);
    z.addTag(PROBE_TAG);
    log(`P2 spawned a probe zombie id=${z.id} at ${v3(where)}; watching the nearest head`);
  } catch (err) {
    log(`P2 could not spawn a zombie: ${err}`);
    return;
  }
  probeWatch(player);
}

// ---------------------------------------------------------------------------
// P4 - mob cap
// ---------------------------------------------------------------------------

/**
 * Count monsters and heads within 64 blocks. The mob-cap question cannot be
 * answered by one reading: run it several times across a night with N turrets
 * placed, then again with them removed, and compare the monster counts.
 */
function probeCensus(player: Player): void {
  const dim = player.dimension;
  const opts = { location: player.location, maxDistance: 64 };
  let monsters = -1;
  let heads = -1;
  let all = -1;
  try {
    monsters = dim.getEntities({ ...opts, families: ["monster"] }).length;
    heads = dim.getEntities({ ...opts, type: TURRET_ENTITY }).length;
    all = dim.getEntities(opts).length;
  } catch (err) {
    log(`P4 census failed: ${err}`);
  }
  log(
    `P4 census r=64 in ${dim.id} at tick ${system.currentTick} time=${world.getTimeOfDay()}: ` +
      `monsters=${monsters} heads=${heads} entities=${all}`,
  );
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

function probeCleanup(): void {
  let removed = 0;
  for (const dimId of DIMENSIONS) {
    try {
      for (const e of world.getDimension(dimId).getEntities({ tags: [PROBE_TAG] })) {
        e.remove();
        removed++;
      }
    } catch {
      // Dimension unavailable.
    }
  }
  writeIds([]);
  log(`cleanup: removed ${removed} probe entit${removed === 1 ? "y" : "ies"} (loaded chunks only)`);
}

function debug(player: Player): void {
  const census = hooks.headCensus();
  player.sendMessage(
    `§7records §f${storage.count()}§7, heads loaded ` +
      Object.entries(census)
        .map(([d, n]) => `§f${n}§7 ${d.replace("minecraft:", "")}`)
        .join(", "),
  );
  const t = turret.stats;
  const h = hooks.stats;
  player.sendMessage(
    `§7spawned §f${t.spawned}§7 adopted §f${t.adopted}§7 reseated §f${t.reseated}§7 ` +
      `dupes §f${t.duplicatesRemoved}§7 orphans §f${h.orphansRemoved}§7 retired §f${t.retired}§7 ` +
      `(stale §f${h.staleRetired}§7)`,
  );
  player.sendMessage(
    `§7shots §f${h.shots}§7 (unattributed §f${h.unattributed}§7) kills §f${h.kills}§7 ` +
      `pulled §f${t.pulled}§7 fed §f${t.fed}§7 sweeps §f${h.sweeps}§7 ` +
      `last §f${h.lastSweep.keep}k/${h.lastSweep.remove}r/${h.lastSweep.inert}i`,
  );

  // The nearest record, with both halves of its pairing.
  const at = floorOf(player);
  let best: { d: number; key: string; ammo: number; kills: number; entityId?: string } | undefined;
  for (const r of storage.all()) {
    if (r.dimId !== player.dimension.id) continue;
    const d = (r.x - at.x) ** 2 + (r.y - at.y) ** 2 + (r.z - at.z) ** 2;
    if (!best || d < best.d) best = { d, key: recordKey(r), ammo: r.ammo, kills: r.kills, entityId: r.entityId };
  }
  if (!best) {
    player.sendMessage("§7nearest turret: §cnone in this dimension");
    return;
  }
  let head: Entity | undefined;
  try {
    head = best.entityId ? world.getEntity(best.entityId) : undefined;
  } catch {
    head = undefined;
  }
  const headState = !best.entityId
    ? "§cnever spawned"
    : !isTurretEntity(head)
      ? `§cid ${best.entityId} not loaded`
      : `§f${head.id}§7 armed=§f${readArmed(head)}§7 at §f${v3(head.location)}`;
  player.sendMessage(
    `§7nearest §f${best.key}§7 ammo §f${best.ammo}/${AMMO_CAP}§7 kills §f${best.kills}§7 head ${headState}`,
  );
}

/** Force a tick on every recorded turret whose chunk is loaded. */
function reconcileAll(player: Player): void {
  let ticked = 0;
  let unloaded = 0;
  for (const r of storage.all()) {
    let dim;
    try {
      dim = world.getDimension(r.dimId);
    } catch {
      continue;
    }
    const done = withBlock(dim, r, (b) => {
      if (b.typeId !== turret.TURRET_BLOCK) return false;
      turret.tick(b);
      return true;
    });
    if (done === undefined) unloaded++;
    else if (done) ticked++;
  }
  player.sendMessage(`§7reconciled §f${ticked}§7 turret(s); §f${unloaded}§7 in unloaded chunks`);
}

export function install(): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (!ev.id.startsWith("bulwark:")) return;
    const cmd = ev.id.slice("bulwark:".length);
    const src = ev.sourceEntity;
    if (cmd === "probe-cleanup") {
      probeCleanup();
      return;
    }
    if (!(src instanceof Player)) {
      log(`${cmd}: run this as a player`);
      return;
    }
    switch (cmd) {
      case "debug":
        debug(src);
        break;
      case "reconcile":
        reconcileAll(src);
        break;
      case "probe-persist":
        probePersist(src);
        break;
      case "probe-check":
        probeCheck(src);
        break;
      case "probe-watch":
        probeWatch(src);
        break;
      case "probe-target":
        probeTarget(src);
        break;
      case "probe-census":
        probeCensus(src);
        break;
      default:
        log(`unknown command bulwark:${cmd}`);
    }
  });
}
