import {
  BlockComponentTypes,
  EntityComponentTypes,
  EquipmentSlot,
  ItemStack,
  world,
  type Block,
  type BlockCustomComponent,
  type Container,
  type Dimension,
  type Entity,
  type Player,
} from "@minecraft/server";
import { NEIGHBOURS } from "@qol/shared/core/facing";
import { safeGetBlock } from "@qol/shared/engine/safeBlock";
import { AMMO_CAP, AMMO_ITEM, acceptFeed, isArmed, planPull, type Slot } from "../core/ammo";
import { hopperFeeds } from "../core/hopper";
import { linkKey, samePosition, type Position, type TurretRecord } from "../core/record";
import { reconcileBlock, spawnAllowed } from "../core/reconcile";
import {
  headsAt,
  isTurretEntity,
  linkedEntity,
  readArmed,
  readLink,
  removeHead,
  seat,
  spawnHead,
  syncArming,
  toHead,
  writeLink,
} from "./head";
import * as storage from "./storage";

/**
 * The turret block: the anchor half of the block/entity pair.
 *
 * Everything per-turret runs from the block's own tick (`minecraft:tick`, 1-2
 * seconds), which the engine schedules only for blocks in ticking chunks. So
 * there is no world scan, no per-tick script, and an unloaded turret costs
 * nothing - the lazy, loaded-chunks-only reconciliation the design asks for
 * falls out of the block component model for free.
 */

export const TURRET_BLOCK = "bulwark:turret";
export const COMPONENT_ID = "bulwark:turret";
const HOPPER = "minecraft:hopper";
const TAG = "[Bulwark]";

/**
 * Arrows taken from a feeding hopper per block tick. A vanilla hopper moves
 * 2.5 items a second; this is faster but still visibly a supply line rather
 * than an instant fill from a chest.
 */
const PULL_PER_TICK = 16;

export const stats = {
  spawned: 0,
  adopted: 0,
  reseated: 0,
  duplicatesRemoved: 0,
  retired: 0,
  pulled: 0,
  fed: 0,
};

/** Consecutive ticks a block has failed to find the head it remembers. */
const misses = new Map<string, number>();
let spawnFailuresLogged = 0;

export function positionOf(block: Block): Position {
  return { dimId: block.dimension.id, x: block.x, y: block.y, z: block.z };
}

function fresh(pos: Position): TurretRecord {
  return { ...pos, ammo: 0, kills: 0 };
}

// ---------------------------------------------------------------------------
// Ammo
// ---------------------------------------------------------------------------

function snapshot(container: Container): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < container.size; i++) {
    const slot = container.getSlot(i);
    out.push(slot.hasItem() ? [slot.typeId, slot.amount] : null);
  }
  return out;
}

/** Pull arrows from every adjacent hopper that points into this block. */
function pullFromHoppers(dim: Dimension, pos: Position, ammo: number): number {
  for (const offset of NEIGHBOURS) {
    if (ammo >= AMMO_CAP) break;
    const block = safeGetBlock(dim, { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z });
    if (!block || !block.isValid) continue;

    let container: Container | undefined;
    let slots: Slot[];
    try {
      if (block.typeId !== HOPPER) continue;
      if (!hopperFeeds(offset, block.permutation.getState("facing_direction"))) continue;
      container = block.getComponent(BlockComponentTypes.Inventory)?.container;
      if (!container || !container.isValid) continue;
      slots = snapshot(container);
    } catch {
      continue;
    }

    const plan = planPull(ammo, slots, AMMO_CAP, PULL_PER_TICK);
    // Count what was actually taken, take by take, so a failure part-way
    // through can never destroy arrows: whatever left the hopper is credited.
    let taken = 0;
    try {
      for (const take of plan.takes) {
        const slot = container.getSlot(take.slot);
        if (slot.amount <= take.amount) slot.setItem(undefined);
        else slot.amount -= take.amount;
        taken += take.amount;
      }
    } catch (e) {
      console.warn(`${TAG} hopper pull interrupted at ${linkKey(pos)}: ${e}`);
    }
    ammo += taken;
    stats.pulled += taken;
  }
  return ammo;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * One block tick: top up ammo, then make sure exactly one head stands on this
 * block and that it is armed if and only if there is ammo.
 */
export function tick(block: Block): void {
  if (!block.isValid) return;
  const dim = block.dimension;
  const pos = positionOf(block);
  const key = linkKey(pos);

  let record = storage.get(pos);
  let dirty = false;
  if (!record) {
    // A turret with no record: placed by structure or /fill before the pack
    // was active, or its record was lost. Adopt it.
    record = fresh(pos);
    dirty = true;
  }

  if (record.ammo < AMMO_CAP) {
    const ammo = pullFromHoppers(dim, pos, record.ammo);
    if (ammo !== record.ammo) {
      record.ammo = ammo;
      dirty = true;
    }
  }

  const linked = linkedEntity(record.entityId, pos.dimId);
  const nearby = headsAt(dim, pos).map((e) => toHead(e, pos));
  const verdict = reconcileBlock(pos, linked ? toHead(linked, pos) : undefined, nearby);

  for (const id of verdict.remove) {
    const dup = world.getEntity(id);
    if (isTurretEntity(dup)) {
      removeHead(dup);
      stats.duplicatesRemoved++;
    }
  }

  let head: Entity | undefined;
  switch (verdict.action.kind) {
    case "keep":
      head = linked;
      misses.delete(key);
      break;
    case "teleport":
      head = linked;
      if (head) {
        seat(head, pos);
        stats.reseated++;
      }
      misses.delete(key);
      break;
    case "adopt": {
      const found = world.getEntity(verdict.action.id);
      if (isTurretEntity(found)) {
        head = found;
        record.entityId = found.id;
        dirty = true;
        stats.adopted++;
      }
      misses.delete(key);
      break;
    }
    case "spawn": {
      const missed = (misses.get(key) ?? 0) + 1;
      misses.set(key, missed);
      if (!spawnAllowed(record.entityId !== undefined, missed)) break;
      head = spawnHead(dim, pos);
      if (head) {
        record.entityId = head.id;
        dirty = true;
        stats.spawned++;
        misses.delete(key);
      } else if (spawnFailuresLogged < 3) {
        spawnFailuresLogged++;
        console.warn(
          `${TAG} head spawn failed at ${key}. If this repeats, check the content log for ` +
            `an entity definition error on ${TURRET_BLOCK}'s head; the block keeps retrying.`,
        );
      }
      break;
    }
  }

  if (head) {
    const link = readLink(head);
    if (!link || !samePosition(link, pos)) writeLink(head, pos);
    syncArming(head, record.ammo);
  }

  if (dirty) storage.put(record);
}

// ---------------------------------------------------------------------------
// Placement, removal, interaction
// ---------------------------------------------------------------------------

function dropArrows(dim: Dimension, pos: Position, count: number): void {
  const at = { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 };
  let left = count;
  while (left > 0) {
    const n = Math.min(64, left);
    left -= n;
    try {
      dim.spawnItem(new ItemStack(AMMO_ITEM, n), at);
    } catch (e) {
      console.warn(`${TAG} could not drop ${n} arrows at ${linkKey(pos)}: ${e}`);
    }
  }
}

/**
 * Forget a turret: record, head, and any other head claiming the block.
 * Idempotent, so it is safe to call from every removal path at once.
 */
export function retire(dim: Dimension, pos: Position, player?: Player): void {
  const record = storage.remove(pos);

  const linked = linkedEntity(record?.entityId, pos.dimId);
  if (linked) removeHead(linked);
  for (const entity of headsAt(dim, pos)) {
    const link = readLink(entity);
    if (link && samePosition(link, pos)) removeHead(entity);
  }
  misses.delete(linkKey(pos));

  if (!record) return;
  stats.retired++;
  // Buffered ammo is the player's; a broken turret gives it back.
  if (record.ammo > 0) dropArrows(dim, pos, record.ammo);
  player?.sendMessage(
    record.ammo > 0
      ? `§7Turret dismantled. §f${record.ammo}§7 arrow(s) returned.`
      : "§7Turret dismantled.",
  );
}

function statusLine(record: TurretRecord, head: Entity | undefined): string {
  const headState = !head ? "§cmissing" : readArmed(head) ? "§aarmed" : "§eidle";
  const base =
    `§6Bulwark Turret §7ammo §f${record.ammo}/${AMMO_CAP}§7, kills §f${record.kills}§7, ` +
    `head ${headState}§7.`;
  if (record.ammo === 0) {
    return `${base} §cNo ammo§7 - use arrows on it, or point a hopper into it.`;
  }
  return base;
}

/** Right-click: feed arrows from the hand, otherwise report status. */
export function interact(player: Player, block: Block): void {
  const pos = positionOf(block);
  const record = storage.get(pos) ?? fresh(pos);
  const head = linkedEntity(record.entityId, pos.dimId);

  try {
    const equippable = player.getComponent(EntityComponentTypes.Equippable);
    const held = equippable?.getEquipment(EquipmentSlot.Mainhand);
    const feed = acceptFeed(record.ammo, held ? { typeId: held.typeId, amount: held.amount } : undefined);

    if (feed.accepted > 0 && equippable && held) {
      if (held.amount > feed.accepted) {
        held.amount -= feed.accepted;
        equippable.setEquipment(EquipmentSlot.Mainhand, held);
      } else {
        equippable.setEquipment(EquipmentSlot.Mainhand, undefined);
      }
      record.ammo = feed.ammo;
      storage.put(record);
      stats.fed += feed.accepted;
      if (head) syncArming(head, record.ammo);
      player.sendMessage(
        `§7Loaded §f${feed.accepted}§7 arrow(s). Ammo §f${record.ammo}/${AMMO_CAP}§7` +
          (isArmed(record.ammo) && head ? " §a- armed." : "."),
      );
      return;
    }
  } catch (e) {
    console.warn(`${TAG} feed failed at ${linkKey(pos)}: ${e}`);
  }

  player.sendMessage(statusLine(record, head));
}

// ---------------------------------------------------------------------------
// The custom component
// ---------------------------------------------------------------------------

/**
 * Custom Components V2: registered by name at startup, attached in the block
 * JSON as `"bulwark:turret": {}` alongside the native components.
 *
 * `onPlace` fires for player placement, /setblock, /fill and structure loads
 * alike, so every way a turret can appear registers it. Both break hooks call
 * `retire`, which is idempotent, so it does not matter which of them the
 * engine fires for a given destruction, or whether it fires both.
 */
export const turretComponent: BlockCustomComponent = {
  onPlace(ev) {
    const pos = positionOf(ev.block);
    if (!storage.get(pos)) storage.put(fresh(pos));
    tick(ev.block);
  },
  onPlayerBreak(ev) {
    retire(ev.dimension, positionOf(ev.block), ev.player);
  },
  onBreak(ev) {
    retire(ev.dimension, positionOf(ev.block));
  },
  onPlayerInteract(ev) {
    if (ev.player) interact(ev.player, ev.block);
  },
  onTick(ev) {
    tick(ev.block);
  },
};
