import type { ItemStack } from "@minecraft/server";
import { clampTier, loreForTier, TIER_KEY, type Tier } from "../core/tier";

/**
 * Tier storage on an item instance.
 *
 * ItemStack dynamic properties are the right home for per-instance state, but
 * every ItemStack handed to us by an event or a container read is a **copy** -
 * mutating it changes nothing in the world until it is written back with
 * setEquipment or Container.setItem. Callers must do that.
 */

/** Whether a tier has ever been written - a freshly crafted Lens has none. */
export function hasTier(item: ItemStack): boolean {
  try {
    return item.getDynamicProperty(TIER_KEY) !== undefined;
  } catch {
    return false;
  }
}

export function readTier(item: ItemStack): Tier {
  try {
    return clampTier(item.getDynamicProperty(TIER_KEY));
  } catch {
    return 1;
  }
}

/**
 * Stamp a tier onto a stack, updating its visible lore to match.
 *
 * Mutates the given copy in place; the caller writes it back.
 */
export function stampTier(item: ItemStack, tier: Tier): void {
  item.setDynamicProperty(TIER_KEY, tier);
  item.setLore(loreForTier(tier));
}
