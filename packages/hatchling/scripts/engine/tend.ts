/**
 * Shared engine helpers for tending: taking one of the held item, telling the
 * player something short, and reading numbers back from an entity.
 */
import { EntityComponentTypes, GameMode, type Entity, type Player } from "@minecraft/server";

export const EGG = "hatchling:egg";
export const PET = "hatchling:hatchling";

type Log = (...parts: unknown[]) => void;

/**
 * Take one of the item in the player's hand, unless they are in Creative.
 * Checks the slot still holds that item: the before-event that decided this
 * ran a tick earlier, and the player may have switched hands since.
 */
export function consumeOne(player: Player, itemId: string): boolean {
  if (player.getGameMode() === GameMode.Creative) return true;
  const inventory = player.getComponent(EntityComponentTypes.Inventory);
  const container = inventory?.container;
  if (!container) return false;
  const slot = player.selectedSlotIndex;
  const stack = container.getItem(slot);
  if (!stack || stack.typeId !== itemId) return false;
  if (stack.amount > 1) {
    stack.amount -= 1;
    container.setItem(slot, stack);
  } else {
    container.setItem(slot, undefined);
  }
  return true;
}

/** A short line on the action bar; never lets a message failure break tending. */
export function tell(player: Player, text: string): void {
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    try {
      player.sendMessage(text);
    } catch {
      // The player left between the decision and the message.
    }
  }
}

export function numberProperty(entity: Entity, id: string): number | undefined {
  try {
    const v = entity.getDynamicProperty(id);
    return typeof v === "number" ? v : undefined;
  } catch {
    return undefined;
  }
}

export function intProperty(entity: Entity, id: string, fallback: number): number {
  try {
    const v = entity.getProperty(id);
    return typeof v === "number" ? v : fallback;
  } catch {
    return fallback;
  }
}

/** Cosmetic: a particle burst that must never fail the thing it decorates. */
export function puff(entity: Entity, effect: string, log: Log, lift = 0.5): void {
  try {
    const l = entity.location;
    entity.dimension.spawnParticle(effect, { x: l.x, y: l.y + lift, z: l.z });
  } catch (e) {
    log(`particle ${effect} failed: ${e}`);
  }
}
