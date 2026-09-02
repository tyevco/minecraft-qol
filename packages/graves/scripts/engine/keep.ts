import {
  EntityComponentTypes,
  EquipmentSlot,
  world,
  type Player,
} from "@minecraft/server";
import { keepsItems } from "../core/prefs";
import { getMode } from "./prefs";

/**
 * The substrate: `ItemStack.keepOnDeath`.
 *
 * Every stack a participating player carries is flagged to survive death, and
 * every stack a vanilla player carries is unflagged. The engine then does the
 * hard part - nothing drops for a flagged stack - and we never have to chase
 * item entities on the death tick or prove which drop belonged to whom.
 *
 * The flag travels with the stack, so an item handed to another player carries
 * the giver's setting for up to one sweep. The sweep corrects it on the next
 * pass; the window is under a second and only matters if they die inside it.
 */

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = [
  EquipmentSlot.Head,
  EquipmentSlot.Chest,
  EquipmentSlot.Legs,
  EquipmentSlot.Feet,
  EquipmentSlot.Offhand,
];

/** Bring one player's stacks into line with their mode. Returns stacks rewritten. */
export function reconcile(player: Player): number {
  const desired = keepsItems(getMode(player));
  let changed = 0;

  const container = player.getComponent(
    EntityComponentTypes.Inventory,
  )?.container;
  if (container && container.isValid) {
    for (let i = 0; i < container.size; i++) {
      const item = container.getItem(i);
      if (!item || item.keepOnDeath === desired) continue;
      // Every ItemStack we are handed is a copy; the write-back is the change.
      item.keepOnDeath = desired;
      container.setItem(i, item);
      changed++;
    }
  }

  const equippable = player.getComponent(EntityComponentTypes.Equippable);
  if (equippable) {
    for (const slot of EQUIPMENT_SLOTS) {
      const item = equippable.getEquipment(slot);
      if (!item || item.keepOnDeath === desired) continue;
      item.keepOnDeath = desired;
      equippable.setEquipment(slot, item);
      changed++;
    }
  }
  return changed;
}

export function sweep(log: (...parts: unknown[]) => void): void {
  for (const player of world.getAllPlayers()) {
    try {
      reconcile(player);
    } catch (e) {
      log(`keep sweep failed for ${player.name}: ${e}`);
    }
  }
}
