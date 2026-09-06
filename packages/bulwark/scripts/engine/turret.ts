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
import {
  AMMO_CAP,
  AMMO_ITEM,
  KIND_LABEL,
  acceptFeed,
  arming,
  findKind,
  findSpecial,
  planPull,
  type Kind,
  type Slot,
  type StackView,
} from "../core/ammo";
import { hopperFeeds } from "../core/hopper";
import { linkKey, samePosition, type Position, type TurretRecord } from "../core/record";
import { reconcileBlock, spawnAllowed } from "../core/reconcile";
import {
  headsAt,
  isTurretEntity,
  linkedEntity,
  readArmed,
  readKind,
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
 *
 * Ammo comes two ways (core/ammo.ts): plain arrows are pulled into the
 * record's buffer, and anything special - a tipped arrow, a snowball, a
 * splash potion - stays in its hopper and is charged there shot by shot.
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
  /** Special shots charged to a hopper stack. */
  charged: 0,
  /** Special shots that found no stack to charge: the hopper emptied mid-tick. */
  uncharged: 0,
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

/** What the classifier needs to know about a stack, read defensively. */
export function viewOf(item: ItemStack | undefined): StackView | undefined {
  if (!item) return undefined;
  const view: StackView = { typeId: item.typeId, amount: item.amount };
  try {
    view.localizationKey = item.localizationKey;
  } catch {
    // Left undefined: an arrow with no readable key is never treated as plain.
  }
  try {
    view.potionEffectId = item.getComponent("minecraft:potion")?.potionEffectType.id;
  } catch {
    // Not a potion, or the component threw; either way no effect id.
  }
  return view;
}

function snapshot(container: Container): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < container.size; i++) out.push(viewOf(container.getItem(i)) ?? null);
  return out;
}

interface Feeder {
  container: Container;
  slots: Slot[];
}

/** Every adjacent hopper that points into this block, with its contents. */
function feeders(dim: Dimension, pos: Position): Feeder[] {
  const out: Feeder[] = [];
  for (const offset of NEIGHBOURS) {
    const block = safeGetBlock(dim, { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z });
    if (!block || !block.isValid) continue;
    try {
      if (block.typeId !== HOPPER) continue;
      if (!hopperFeeds(offset, block.permutation.getState("facing_direction"))) continue;
      const container = block.getComponent(BlockComponentTypes.Inventory)?.container;
      if (!container || !container.isValid) continue;
      out.push({ container, slots: snapshot(container) });
    } catch {
      continue;
    }
  }
  return out;
}

/** Pull plain arrows from every feeding hopper into the buffer. */
function pullFromHoppers(hoppers: Feeder[], ammo: number): number {
  for (const { container, slots } of hoppers) {
    if (ammo >= AMMO_CAP) break;
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
      console.warn(`${TAG} hopper pull interrupted: ${e}`);
    }
    ammo += taken;
    stats.pulled += taken;
  }
  return ammo;
}

/** The special kind the turret should be firing, if any hopper offers one. */
function specialOffered(hoppers: Feeder[]): Kind | undefined {
  for (const { slots } of hoppers) {
    const found = findSpecial(slots);
    if (found) return found.kind;
  }
  return undefined;
}

/**
 * Charge one special shot to the hopper that supplies it: the first stack of
 * that kind, decremented in place. Measured safe against the hopper's own
 * transfers (`rig_hopper_decrement_survives_transfer`). False when nothing
 * was there to charge, which the next block tick resolves by re-arming.
 */
export function chargeSpecial(dim: Dimension, pos: Position, kind: Kind): boolean {
  for (const { container, slots } of feeders(dim, pos)) {
    const i = findKind(slots, kind);
    if (i === undefined) continue;
    try {
      const item = container.getItem(i);
      if (!item) continue;
      if (item.amount > 1) {
        item.amount -= 1;
        container.setItem(i, item);
      } else {
        container.setItem(i, undefined);
      }
      stats.charged++;
      return true;
    } catch (e) {
      console.warn(`${TAG} could not charge a ${kind} shot at ${linkKey(pos)}: ${e}`);
    }
  }
  stats.uncharged++;
  return false;
}

/** The head's arming for a record and its hoppers, without touching either. */
export function armingFor(dim: Dimension, record: TurretRecord): ReturnType<typeof arming> {
  return arming(record.ammo, specialOffered(feeders(dim, record)));
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * One block tick: top up the buffer, note what the hoppers offer, then make
 * sure exactly one head stands on this block and that it is armed with the
 * right ammo if and only if there is any.
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

  const hoppers = feeders(dim, pos);
  if (record.ammo < AMMO_CAP) {
    const ammo = pullFromHoppers(hoppers, record.ammo);
    if (ammo !== record.ammo) {
      record.ammo = ammo;
      dirty = true;
    }
  }
  // Read after the pull: a hopper's first special stack is unchanged by it,
  // but its slots may have shifted.
  const special = specialOffered(hoppers.map((h) => ({ container: h.container, slots: snapshot(h.container) })));

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
    syncArming(head, arming(record.ammo, special));
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
 * Special ammo was never taken from its hopper, so there is nothing of it to
 * give back.
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
  const armed = head ? readArmed(head) : undefined;
  const kind = head ? readKind(head) : undefined;
  const headState = !head ? "§cmissing" : armed ? "§aarmed" : "§eidle";
  const firing = armed && kind && kind !== "arrow" ? ` §7firing §f${KIND_LABEL[kind]}§7 from a hopper.` : "";
  const base =
    `§6Bulwark Turret §7ammo §f${record.ammo}/${AMMO_CAP}§7, kills §f${record.kills}§7, ` +
    `head ${headState}§7.${firing}`;
  if (record.ammo === 0 && !firing) {
    return `${base} §cNo ammo§7 - use arrows on it, or point a hopper into it.`;
  }
  return base;
}

/** Right-click: feed plain arrows from the hand, otherwise report status. */
export function interact(player: Player, block: Block): void {
  const pos = positionOf(block);
  const record = storage.get(pos) ?? fresh(pos);
  const head = linkedEntity(record.entityId, pos.dimId);

  try {
    const equippable = player.getComponent(EntityComponentTypes.Equippable);
    const held = equippable?.getEquipment(EquipmentSlot.Mainhand);
    const feed = acceptFeed(record.ammo, viewOf(held));

    if (feed.refused) {
      player.sendMessage(
        `§7A turret takes §f${KIND_LABEL[feed.refused]}§7 only from a hopper pointed into it, ` +
          `so it can fire them as they are.`,
      );
      return;
    }

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
      const want = armingFor(block.dimension, record);
      if (head) syncArming(head, want);
      player.sendMessage(
        `§7Loaded §f${feed.accepted}§7 arrow(s). Ammo §f${record.ammo}/${AMMO_CAP}§7` +
          (want.armed && head ? " §a- armed." : "."),
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
