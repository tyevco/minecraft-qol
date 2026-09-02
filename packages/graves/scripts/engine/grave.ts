import {
  EntityComponentTypes,
  EquipmentSlot,
  PlayerPermissionLevel,
  system,
  world,
  type Container,
  type Entity,
  type Player,
} from "@minecraft/server";
import { gravePosition, type GroundSample } from "../core/placement";
import { parseEquipmentAt, planTransfer, type Source } from "../core/transfer";
import { playerId } from "./identity";
import * as registry from "./registry";

export const GRAVE_ENTITY = "graves:gravestone";

const PROP_OWNER = "gv:owner";
const PROP_OWNER_NAME = "gv:name";
const PROP_EQUIPMENT = "gv:eq";
const PROP_CREATED = "gv:created";

type Log = (...parts: unknown[]) => void;

export function isGrave(entity: Entity): boolean {
  try {
    return entity.isValid && entity.typeId === GRAVE_ENTITY;
  } catch {
    return false;
  }
}

function graveContainer(grave: Entity): Container | undefined {
  try {
    const c = grave.getComponent(EntityComponentTypes.Inventory)?.container;
    return c && c.isValid ? c : undefined;
  } catch {
    return undefined;
  }
}

function occupiedSources(player: Player): Source[] {
  const out: Source[] = [];
  const container = player.getComponent(
    EntityComponentTypes.Inventory,
  )?.container;
  if (container && container.isValid) {
    for (let i = 0; i < container.size; i++)
      if (container.getItem(i)) out.push({ kind: "slot", index: i });
  }
  const equippable = player.getComponent(EntityComponentTypes.Equippable);
  if (equippable) {
    for (const slot of [
      EquipmentSlot.Head,
      EquipmentSlot.Chest,
      EquipmentSlot.Legs,
      EquipmentSlot.Feet,
      EquipmentSlot.Offhand,
    ]) {
      if (equippable.getEquipment(slot)) out.push({ kind: "equipment", slot });
    }
  }
  return out;
}

/**
 * Move a dead player's items into a fresh gravestone.
 *
 * Runs inside entityDie, while the player's inventory is intact thanks to the
 * keep-on-death flag. Every step that can fail fails towards "the player keeps
 * the item": a move that throws leaves the stack where it was, and a stone that
 * ends up empty is removed again.
 *
 * Returns the grave, or undefined if none was placed.
 */
export function placeGrave(
  player: Player,
  lastGround: GroundSample | undefined,
  log: Log,
): Entity | undefined {
  const sources = occupiedSources(player);
  if (sources.length === 0) return undefined;

  const dim = player.dimension;
  const pos = gravePosition(
    player.location,
    player.isOnGround,
    dim.heightRange,
    system.currentTick,
    lastGround,
  );

  let grave: Entity;
  try {
    grave = dim.spawnEntity(GRAVE_ENTITY, pos);
  } catch (e) {
    log(`could not place a gravestone at ${pos.x},${pos.y},${pos.z}: ${e}`);
    return undefined;
  }

  const target = graveContainer(grave);
  if (!target) {
    log("gravestone has no container; leaving items with the player");
    grave.remove();
    return undefined;
  }

  const plan = planTransfer(sources, target.size);
  const container = player.getComponent(
    EntityComponentTypes.Inventory,
  )?.container;
  const equippable = player.getComponent(EntityComponentTypes.Equippable);

  let moved = 0;
  for (const move of plan.moves) {
    try {
      if (move.from.kind === "slot") {
        const item = container?.getItem(move.from.index);
        if (!item) continue;
        target.setItem(move.to, item);
        container!.setItem(move.from.index, undefined);
      } else {
        const slot = move.from.slot as EquipmentSlot;
        const item = equippable?.getEquipment(slot);
        if (!item) continue;
        target.setItem(move.to, item);
        equippable!.setEquipment(slot, undefined);
      }
      moved++;
    } catch (e) {
      // The item is still with the player, flagged to survive. Nothing lost.
      log(`move ${JSON.stringify(move.from)} failed: ${e}`);
    }
  }

  if (moved === 0) {
    grave.remove();
    return undefined;
  }

  const owner = playerId(player);
  try {
    grave.setDynamicProperty(PROP_OWNER, owner);
    grave.setDynamicProperty(PROP_OWNER_NAME, player.name);
    grave.setDynamicProperty(PROP_EQUIPMENT, JSON.stringify(plan.equipmentAt));
    grave.setDynamicProperty(PROP_CREATED, Date.now());
    grave.nameTag = `§7${player.name}'s grave`;
  } catch (e) {
    log(`failed to label gravestone: ${e}`);
  }

  registry.add({
    id: grave.id,
    owner,
    ownerName: player.name,
    dimId: dim.id,
    x: Math.floor(pos.x),
    y: Math.floor(pos.y),
    z: Math.floor(pos.z),
    createdMs: Date.now(),
  });

  if (plan.leftover.length > 0) {
    log(
      `gravestone full: ${plan.leftover.length} stack(s) stayed with ${player.name}`,
    );
  }
  return grave;
}

export function ownerOf(grave: Entity): string | undefined {
  try {
    const raw = grave.getDynamicProperty(PROP_OWNER);
    return typeof raw === "string" ? raw : undefined;
  } catch {
    return undefined;
  }
}

export function ownerNameOf(grave: Entity): string {
  try {
    const raw = grave.getDynamicProperty(PROP_OWNER_NAME);
    return typeof raw === "string" ? raw : "someone";
  } catch {
    return "someone";
  }
}

/**
 * Hand a gravestone's contents back to a player.
 *
 * Armour goes back on if the matching slot is free, everything else into the
 * inventory; whatever does not fit stays in the stone. The stone removes itself
 * only once it is empty, so a full inventory just means a second visit.
 */
export function retrieve(
  player: Player,
  grave: Entity,
  log: Log,
): { taken: number; remaining: number } {
  const source = graveContainer(grave);
  const inventory = player.getComponent(
    EntityComponentTypes.Inventory,
  )?.container;
  const equippable = player.getComponent(EntityComponentTypes.Equippable);
  if (!source || !inventory) return { taken: 0, remaining: -1 };

  const equipmentAt = parseEquipmentAt(
    grave.getDynamicProperty(PROP_EQUIPMENT),
  );
  let taken = 0;

  for (let i = 0; i < source.size; i++) {
    const item = source.getItem(i);
    if (!item) continue;
    try {
      const slotName = equipmentAt[i];
      if (
        slotName &&
        equippable &&
        !equippable.getEquipment(slotName as EquipmentSlot)
      ) {
        if (equippable.setEquipment(slotName as EquipmentSlot, item)) {
          source.setItem(i, undefined);
          taken++;
          continue;
        }
      }
      const leftover = inventory.addItem(item);
      source.setItem(i, leftover);
      if (!leftover || leftover.amount < item.amount) taken++;
    } catch (e) {
      log(`retrieve slot ${i} failed: ${e}`);
    }
  }

  let remaining = 0;
  for (let i = 0; i < source.size; i++) if (source.getItem(i)) remaining++;

  if (remaining === 0) {
    registry.remove(grave.id);
    try {
      grave.remove();
    } catch (e) {
      log(`could not remove empty gravestone: ${e}`);
    }
  }
  return { taken, remaining };
}

/** Whether `player` may open `grave`: its owner, or any operator. */
export function mayOpen(player: Player, grave: Entity): boolean {
  if (player.playerPermissionLevel === PlayerPermissionLevel.Operator)
    return true;
  return ownerOf(grave) === playerId(player);
}

export function graveAt(id: string): Entity | undefined {
  try {
    const e = world.getEntity(id);
    return e && isGrave(e) ? e : undefined;
  } catch {
    return undefined;
  }
}
