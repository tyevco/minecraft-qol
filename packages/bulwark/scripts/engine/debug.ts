import { Player, system, world, type Entity } from "@minecraft/server";
import { withBlock } from "@qol/shared/engine/safeBlock";
import { AMMO_CAP } from "../core/ammo";
import { linkKey } from "../core/record";
import { describePolicy } from "../core/policy";
import { describeTiers } from "../core/tiers";
import { isTurretEntity, readArmed, readKind } from "./head";
import * as settings from "./settings";
import * as hooks from "./hooks";
import * as storage from "./storage";
import * as turret from "./turret";

/**
 * Diagnostics, in the shape every pack uses (CLAUDE.md rule 3):
 *
 *   /scriptevent bulwark:debug       counters, loaded heads, the nearest record
 *   /scriptevent bulwark:reconcile   tick every recorded turret in a loaded
 *                                    chunk now - the escape hatch after /reload
 *   /scriptevent bulwark:forget x y z [radius]
 *                                    drop what the pack remembers about the
 *                                    turret(s) there, blocks left standing and
 *                                    nothing given back - the GameTests' sweep
 *                                    (issue #106)
 *
 * The engine probes for the unknowns live in the probe pack as
 * qolprobe:turret-* (docs/bulwark-turret-probe.md).
 */

const v3 = (l: { x: number; y: number; z: number }): string =>
  `${l.x.toFixed(2)},${l.y.toFixed(2)},${l.z.toFixed(2)}`;

function debug(player: Player): void {
  player.sendMessage(`§7policy: §f${describePolicy(settings.policy())}`);
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
      `(by projectile §f${h.killsByProjectile}§7) pulled §f${t.pulled}§7 fed §f${t.fed}§7 ` +
      `charged §f${t.charged}§7 (uncharged §f${t.uncharged}§7) sweeps §f${h.sweeps}§7 ` +
      `last §f${h.lastSweep.keep}k/${h.lastSweep.remove}r/${h.lastSweep.inert}i`,
  );

  // The nearest record, with both halves of its pairing.
  const l = player.location;
  const at = { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) };
  let best:
    | { d: number; key: string; ammo: number; kills: number; entityId?: string }
    | undefined;
  for (const r of storage.all()) {
    if (r.dimId !== player.dimension.id) continue;
    const d = (r.x - at.x) ** 2 + (r.y - at.y) ** 2 + (r.z - at.z) ** 2;
    if (!best || d < best.d) {
      best = { d, key: linkKey(r), ammo: r.ammo, kills: r.kills, entityId: r.entityId };
    }
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
      : `§f${head.id}§7 armed=§f${readArmed(head)}§7 kind=§f${readKind(head) ?? "-"}§7 at §f${v3(head.location)}`;
  player.sendMessage(
    `§7nearest §f${best.key}§7 ammo §f${best.ammo}/${AMMO_CAP}§7 kills §f${best.kills}§7 head ${headState}`,
  );

  // One line per turret within 64 blocks: what it holds, its tiers, and what
  // its head is set to fire.
  let listed = 0;
  for (const r of storage.all()) {
    if (r.dimId !== player.dimension.id) continue;
    if ((r.x - at.x) ** 2 + (r.y - at.y) ** 2 + (r.z - at.z) ** 2 > 64 * 64) continue;
    let h: Entity | undefined;
    try {
      h = r.entityId ? world.getEntity(r.entityId) : undefined;
    } catch {
      h = undefined;
    }
    const kind = isTurretEntity(h) ? (r.held ? "holding fire" : readArmed(h) ? (readKind(h) ?? "arrow") : "idle") : "no head";
    player.sendMessage(
      `§7  ${linkKey(r)} ammo §f${r.ammo}§7 kills §f${r.kills}§7 tiers §f${describeTiers(r.tiers)}§7 firing §f${kind}`,
    );
    if (++listed >= 12) {
      player.sendMessage("§7  ...");
      break;
    }
  }
}

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
    const src = ev.sourceEntity;

    // `forget` takes its position on the line, so it needs no sender: a
    // command from a SimulatedPlayer or the server console arrives with no
    // sourceEntity at all (docs/README.md corrections), and the GameTests
    // are the whole reason this event exists.
    if (ev.id === "bulwark:forget") {
      forget(ev.message, src instanceof Player ? src : undefined);
      return;
    }

    if (ev.id !== "bulwark:debug" && ev.id !== "bulwark:reconcile") return;
    if (!(src instanceof Player)) {
      console.warn(`[Bulwark] ${ev.id}: run this as a player`);
      return;
    }
    if (ev.id === "bulwark:debug") debug(src);
    else reconcileAll(src);
  });
}

/**
 * `bulwark:forget x y z [radius]` - drop the record (and head) of the turret
 * at that block, or of every turret whose record is within `radius` on x/z.
 * Blocks are left standing and nothing is given back, which is what a test
 * wants: `retire` would drop the buffer and the fed upgrades as items into
 * the arena.
 *
 * Why the tests need it: a structure reload restores blocks but not a pack's
 * position-keyed records, and the runner re-runs a failure in a fresh server
 * session, which puts the test back on the first spot of the column - the one
 * every earlier run has already written a record to. A turret adopted from
 * such a record starts at whatever tiers that test left behind, which is how
 * three ammo-gate tests came to fail on a world that had seen the suite
 * before (issue #106).
 */
function forget(message: string, player: Player | undefined): void {
  const say = (text: string): void => {
    player?.sendMessage(`§7${text}`);
    console.warn(`[Bulwark] ${text}`);
  };
  const parts = message.trim().split(/\s+/).filter((p) => p.length > 0);
  const [x, y, z, radius] = parts.slice(0, 4).map(Number);
  if ([x, y, z].some((n) => n === undefined || !Number.isInteger(n))) {
    say("bulwark:forget wants x y z [radius]");
    return;
  }
  const at = { x: x!, y: y!, z: z! };
  const within = radius !== undefined && Number.isFinite(radius) ? radius : undefined;
  const hits = storage
    .all()
    .filter((r) => (within !== undefined ? Math.hypot(r.x - at.x, r.z - at.z) <= within : r.x === at.x && r.y === at.y && r.z === at.z));
  let forgotten = 0;
  for (const r of hits) {
    let dim;
    try {
      dim = world.getDimension(r.dimId);
    } catch {
      continue;
    }
    turret.forget(dim, r);
    forgotten++;
  }
  say(
    forgotten > 0
      ? `bulwark:forget ok: ${forgotten} turret(s) forgotten near ${at.x},${at.y},${at.z}; ${storage.count()} record(s) left`
      : `bulwark:forget: no turret record at ${at.x},${at.y},${at.z}${within !== undefined ? ` within ${within}` : ""}`,
  );
}
