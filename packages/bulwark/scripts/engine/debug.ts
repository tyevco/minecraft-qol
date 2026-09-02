import { Player, system, world, type Entity } from "@minecraft/server";
import { withBlock } from "@qol/shared/engine/safeBlock";
import { AMMO_CAP } from "../core/ammo";
import { linkKey } from "../core/record";
import { isTurretEntity, readArmed } from "./head";
import * as hooks from "./hooks";
import * as storage from "./storage";
import * as turret from "./turret";

/**
 * Diagnostics, in the shape every pack uses (CLAUDE.md rule 3):
 *
 *   /scriptevent bulwark:debug       counters, loaded heads, the nearest record
 *   /scriptevent bulwark:reconcile   tick every recorded turret in a loaded
 *                                    chunk now - the escape hatch after /reload
 *
 * The engine probes for the unknowns live in the probe pack as
 * qolprobe:turret-* (docs/bulwark-turret-probe.md).
 */

const v3 = (l: { x: number; y: number; z: number }): string =>
  `${l.x.toFixed(2)},${l.y.toFixed(2)},${l.z.toFixed(2)}`;

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
      : `§f${head.id}§7 armed=§f${readArmed(head)}§7 at §f${v3(head.location)}`;
  player.sendMessage(
    `§7nearest §f${best.key}§7 ammo §f${best.ammo}/${AMMO_CAP}§7 kills §f${best.kills}§7 head ${headState}`,
  );
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
    if (ev.id !== "bulwark:debug" && ev.id !== "bulwark:reconcile") return;
    const src = ev.sourceEntity;
    if (!(src instanceof Player)) {
      console.warn(`[Bulwark] ${ev.id}: run this as a player`);
      return;
    }
    if (ev.id === "bulwark:debug") debug(src);
    else reconcileAll(src);
  });
}
