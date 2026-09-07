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
  type EntityEquippableComponent,
  type Player,
  type Vector3,
} from "@minecraft/server";
import { NEIGHBOURS } from "@qol/shared/core/facing";
import { safeGetBlock } from "@qol/shared/engine/safeBlock";
import {
  AMMO_CAP,
  AMMO_ITEM,
  KIND_LABEL,
  acceptFeed,
  arming,
  findGated,
  findKind,
  findSpecial,
  planPull,
  type Kind,
  type Slot,
  type StackView,
} from "../core/ammo";
import {
  AXIS_LABEL,
  BASE_TIERS,
  MATERIALS,
  TIER_NAME,
  aimEvent,
  describeTiers,
  feedUpgrade,
  gateAllows,
  gateFor,
  materialsToReturn,
  withTier,
  type Tier,
  type Tiers,
} from "../core/tiers";
import { hopperFeeds } from "../core/hopper";
import { linkKey, samePosition, type Position, type TurretRecord } from "../core/record";
import { HEAD_SEAT, reconcileBlock, spawnAllowed } from "../core/reconcile";
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
import { effectiveRange } from "../core/policy";
import { PRIORITY_LABEL, chooseSelector, tally, targetEvent, type Priority } from "../core/targeting";
import { RANGE_BLOCKS } from "../core/tiers";
import { openTurretForm } from "./form";
import * as settings from "./settings";
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
  /** Upgrade materials accepted, by hand or from a hopper. */
  upgraded: 0,
};

/** Consecutive ticks a block has failed to find the head it remembers. */
const misses = new Map<string, number>();
let spawnFailuresLogged = 0;

export function positionOf(block: Block): Position {
  return { dimId: block.dimension.id, x: block.x, y: block.y, z: block.z };
}

function fresh(pos: Position): TurretRecord {
  return { ...pos, ammo: 0, kills: 0, tiers: { ...BASE_TIERS }, priority: "nearest", held: false };
}

/** A friendly item name for a message: `minecraft:redstone_block` -> `redstone block`. */
function itemName(typeId: string): string {
  return typeId.replace(/^minecraft:/, "").replace(/_/g, " ");
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

/**
 * Take one item from a container slot, clearing the slot at one. Returns
 * false, taking nothing, when the slot no longer holds what was expected:
 * a hopper may have moved the stack between the snapshot and the take.
 */
function takeOneFrom(container: Container, slot: number, expectTypeId: string): boolean {
  const item = container.getItem(slot);
  if (!item || item.typeId !== expectTypeId) return false;
  if (item.amount > 1) {
    item.amount -= 1;
    container.setItem(slot, item);
  } else {
    container.setItem(slot, undefined);
  }
  return true;
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

/** The special kind the turret should be firing, if any hopper offers one its gate allows. */
function specialOffered(hoppers: Feeder[], gate: Tier): Kind | undefined {
  if (!settings.policy().specialAmmo) return undefined;
  const allowed = (k: Kind) => gateAllows(gate, k);
  for (const { slots } of hoppers) {
    const found = findSpecial(slots, allowed);
    if (found) return found.kind;
  }
  return undefined;
}

/** The first special kind a hopper offers that the gate refuses, for the status text. */
function specialGated(hoppers: Feeder[], gate: Tier): Kind | undefined {
  const allowed = (k: Kind) => gateAllows(gate, k);
  for (const { slots } of hoppers) {
    const found = findGated(slots, allowed);
    if (found) return found.kind;
  }
  return undefined;
}

/**
 * Take one upgrade material from a feeding hopper, if one is there and it is
 * the next step on its axis. One per tick, so a chest of diamonds upgrades
 * visibly rather than instantly, and a hopper never loses more than the one
 * item the tier cost.
 */
function upgradeFromHoppers(hoppers: Feeder[], tiers: Tiers): Tiers | undefined {
  if (!settings.policy().upgrades) return undefined;
  for (const { container, slots } of hoppers) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s) continue;
      const verdict = feedUpgrade(tiers, s.typeId);
      if (verdict.kind !== "upgrade") continue;
      try {
        if (!takeOneFrom(container, i, s.typeId)) continue;
      } catch (e) {
        console.warn(`${TAG} could not take an upgrade from a hopper: ${e}`);
        continue;
      }
      stats.upgraded++;
      return withTier(tiers, verdict.axis, verdict.tier);
    }
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
      if (!takeOneFrom(container, i, slots[i]!.typeId)) continue;
      stats.charged++;
      return true;
    } catch (e) {
      console.warn(`${TAG} could not charge a ${kind} shot at ${linkKey(pos)}: ${e}`);
    }
  }
  stats.uncharged++;
  return false;
}

/** The range tier a record aims at, with the panel's cap applied. */
function rangeFor(record: TurretRecord): Tier {
  return effectiveRange(record.tiers.range, settings.policy().rangeCap);
}

/** The aim group for a record's tiers, with the panel's range cap applied. */
function aimFor(record: TurretRecord): string {
  return aimEvent(record.tiers.rate, rangeFor(record));
}

/** Where the head's eye is: the barrel, 0.4 above the seat (docs/bulwark-turret-results.md). */
function eyeOf(record: Position): Vector3 {
  return { x: record.x + 0.5, y: record.y + HEAD_SEAT + 0.4, z: record.z + 0.5 };
}

/**
 * Whether a straight line from the head's eye to a mob's middle crosses a
 * block. The filtered selector groups carry `must_see`, so a mob the head
 * cannot see must not be counted either: counting a wounded zombie in a
 * cave below would put the head in the wounded-only group with nothing it
 * may shoot, and it would stand idle beside a healthy one at the door.
 */
function canSee(dim: Dimension, eye: Vector3, mob: Entity): boolean {
  try {
    const at = mob.location;
    const to = { x: at.x - eye.x, y: at.y + 0.9 - eye.y, z: at.z - eye.z };
    const dist = Math.hypot(to.x, to.y, to.z);
    if (dist < 0.5) return true;
    const dir = { x: to.x / dist, y: to.y / dist, z: to.z / dist };
    return dim.getBlockFromRay(eye, dir, { maxDistance: dist, includePassableBlocks: false }) === undefined;
  } catch {
    return false;
  }
}

/**
 * The target selector group for a record's priority and what is in range
 * right now. Nearest needs no look; the other two count the monsters the
 * head can see and prefer the wounded or the healthy while any are there
 * (core/targeting.ts, measured on the rig). One filtered query and one
 * block raycast per visible candidate, per block tick, per turret that
 * asked for it.
 */
function targetFor(dim: Dimension, record: TurretRecord): string {
  const range = rangeFor(record);
  if (record.priority === "nearest") return targetEvent("any", range);
  const healths: number[] = [];
  try {
    const eye = eyeOf(record);
    for (const e of dim.getEntities({ location: eye, maxDistance: RANGE_BLOCKS[range], families: ["monster"] })) {
      const h = e.getComponent(EntityComponentTypes.Health)?.currentValue;
      if (typeof h === "number" && canSee(dim, eye, e)) healths.push(h);
    }
  } catch {
    // An unloaded edge or a vanished mob: prefer nothing this tick.
  }
  return targetEvent(chooseSelector(record.priority, tally(healths)), range);
}

/** The head's arming for a record and its hoppers, without touching either. */
export function armingFor(dim: Dimension, record: TurretRecord): ReturnType<typeof arming> {
  return arming(
    record.ammo,
    specialOffered(feeders(dim, record), record.tiers.gate),
    aimFor(record),
    targetFor(dim, record),
    record.held,
  );
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
  const upgraded = upgradeFromHoppers(hoppers, record.tiers);
  if (upgraded) {
    record.tiers = upgraded;
    dirty = true;
  }
  // Read after the pull and the upgrade: a hopper's first special stack is
  // unchanged by them, but its slots may have shifted.
  const special = specialOffered(
    hoppers.map((h) => ({ container: h.container, slots: snapshot(h.container) })),
    record.tiers.gate,
  );

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
    syncArming(
      head,
      arming(record.ammo, special, aimFor(record), targetFor(dim, record), record.held),
      record.tiers.damage,
    );
  }

  if (dirty) storage.put(record);
}

// ---------------------------------------------------------------------------
// Placement, removal, interaction
// ---------------------------------------------------------------------------

function dropItems(dim: Dimension, pos: Position, typeId: string, count: number): void {
  const at = { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 };
  let left = count;
  while (left > 0) {
    const n = Math.min(64, left);
    left -= n;
    try {
      dim.spawnItem(new ItemStack(typeId, n), at);
    } catch (e) {
      console.warn(`${TAG} could not drop ${n} ${typeId} at ${linkKey(pos)}: ${e}`);
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
  // Buffered ammo and fed upgrades are the player's; a broken turret gives
  // them back. Special ammo was never taken from its hopper.
  if (record.ammo > 0) dropItems(dim, pos, AMMO_ITEM, record.ammo);
  const materials = materialsToReturn(record.tiers);
  for (const typeId of materials) dropItems(dim, pos, typeId, 1);
  const returned: string[] = [];
  if (record.ammo > 0) returned.push(`§f${record.ammo}§7 arrow(s)`);
  if (materials.length > 0) returned.push(materials.map((m) => `§f${itemName(m)}§7`).join(", "));
  player?.sendMessage(
    returned.length > 0 ? `§7Turret dismantled. ${returned.join(" and ")} returned.` : "§7Turret dismantled.",
  );
}

function statusLine(dim: Dimension, record: TurretRecord, head: Entity | undefined): string {
  const armed = head ? readArmed(head) : undefined;
  const kind = head ? readKind(head) : undefined;
  const headState = !head ? "§cmissing" : record.held ? "§eholding fire" : armed ? "§aarmed" : "§eidle";
  const firing = armed && kind && kind !== "arrow" ? ` §7firing §f${KIND_LABEL[kind]}§7 from a hopper.` : "";
  const base =
    `§6Bulwark Turret §7ammo §f${record.ammo}/${AMMO_CAP}§7, kills §f${record.kills}§7, ` +
    `head ${headState}§7.${firing} §7Tiers: §f${describeTiers(record.tiers)}§7. Target: §f${PRIORITY_LABEL[record.priority]}§7.`;
  const pol = settings.policy();
  const capped = effectiveRange(record.tiers.range, pol.rangeCap) < record.tiers.range;
  const notes: string[] = [];
  if (capped) notes.push(`§7Range is capped at §f${pol.rangeCap}§7 blocks by the pack settings.`);
  if (!pol.specialAmmo) notes.push("§7Special ammo is switched off in the pack settings.");
  if (!pol.upgrades) notes.push("§7Upgrades are switched off in the pack settings.");
  if (notes.length > 0) return `${base} ${notes.join(" ")}`;
  const gated = specialGated(feeders(dim, record), record.tiers.gate);
  if (gated) {
    const need = gateFor(gated);
    return (
      `${base} §eA hopper offers ${KIND_LABEL[gated]}§7, which needs ammo tier §f${TIER_NAME[need]}§7 ` +
      `(feed it a ${itemName(record.tiers.gate === 1 ? MATERIALS.gate[0] : MATERIALS.gate[1])}).`
    );
  }
  if (record.ammo === 0 && !firing) {
    return `${base} §cNo ammo§7 - use arrows on it, or point a hopper into it.`;
  }
  return base;
}

/** One from the hand. */
function takeOne(equippable: EntityEquippableComponent, held: ItemStack): void {
  if (held.amount > 1) {
    held.amount -= 1;
    equippable.setEquipment(EquipmentSlot.Mainhand, held);
  } else {
    equippable.setEquipment(EquipmentSlot.Mainhand, undefined);
  }
}

/** Apply the turret's form: targeting priority and hold fire. */
export function applyForm(pos: Position, choice: { priority: Priority; held: boolean }, player?: Player): void {
  const record = storage.get(pos);
  if (!record) return;
  record.priority = choice.priority;
  record.held = choice.held;
  storage.put(record);
  let dim: Dimension | undefined;
  try {
    dim = world.getDimension(pos.dimId);
  } catch {
    dim = undefined;
  }
  const head = linkedEntity(record.entityId, pos.dimId);
  if (dim && head) syncArming(head, armingFor(dim, record), record.tiers.damage);
  player?.sendMessage(
    `§7Target: §f${PRIORITY_LABEL[record.priority]}§7.` + (record.held ? " §eHolding fire§7 until switched back." : ""),
  );
}

/**
 * Right-click: sneaking with an empty hand opens the turret's form; an
 * upgrade material or plain arrows are fed; anything else reports status.
 */
export function interact(player: Player, block: Block): void {
  const pos = positionOf(block);
  const record = storage.get(pos) ?? fresh(pos);
  const head = linkedEntity(record.entityId, pos.dimId);

  try {
    const equippable = player.getComponent(EntityComponentTypes.Equippable);
    const held = equippable?.getEquipment(EquipmentSlot.Mainhand);

    if (player.isSneaking && !held) {
      if (!storage.get(pos)) storage.put(record);
      openTurretForm(player, record, (choice) => applyForm(pos, choice, player));
      return;
    }

    // An upgrade material first: one item raises one axis one tier.
    const upgrade = held ? feedUpgrade(record.tiers, held.typeId) : { kind: "not_material" as const };
    if (upgrade.kind !== "not_material" && !settings.policy().upgrades) {
      player.sendMessage("§7Upgrades are switched off in the pack settings.");
      return;
    }
    if (upgrade.kind === "upgrade" && equippable && held) {
      takeOne(equippable, held);
      record.tiers = withTier(record.tiers, upgrade.axis, upgrade.tier);
      storage.put(record);
      stats.upgraded++;
      if (head) syncArming(head, armingFor(block.dimension, record), record.tiers.damage);
      player.sendMessage(
        `§7${AXIS_LABEL[upgrade.axis]} raised to tier §f${TIER_NAME[upgrade.tier]}§7. ` +
          `Tiers: §f${describeTiers(record.tiers)}§7.`,
      );
      return;
    }
    if (upgrade.kind === "maxed") {
      player.sendMessage(`§7${AXIS_LABEL[upgrade.axis]} is already tier §f${TIER_NAME[record.tiers[upgrade.axis]]}§7.`);
      return;
    }
    if (upgrade.kind === "order") {
      player.sendMessage(`§7${AXIS_LABEL[upgrade.axis]} needs a ${itemName(upgrade.needs)} first.`);
      return;
    }

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
      if (head) syncArming(head, want, record.tiers.damage);
      player.sendMessage(
        `§7Loaded §f${feed.accepted}§7 arrow(s). Ammo §f${record.ammo}/${AMMO_CAP}§7` +
          (want.armed && head ? " §a- armed." : "."),
      );
      return;
    }
  } catch (e) {
    console.warn(`${TAG} feed failed at ${linkKey(pos)}: ${e}`);
  }

  player.sendMessage(statusLine(block.dimension, record, head));
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
