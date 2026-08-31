import {
  BlockComponentTypes,
  BlockPermutation,
  ItemComponentTypes,
  ItemStack,
  ItemTypes,
  type Block,
} from "@minecraft/server";
import type { CauldronState, Fluid } from "../core/cauldron";
import type { Residue } from "../core/rules";

const CAULDRON = "minecraft:cauldron";

/**
 * The single adapter between the engine and the pure rules layer. Nothing else
 * knows how a cauldron is represented.
 *
 * Levels are read and written through the raw block states (fill_level 0-6,
 * cauldron_liquid), which the Phase 0 probe observed directly. The
 * minecraft:fluid_container component IS present on vanilla cauldrons, but its
 * fillLevel is documented only as a "relative fill level" and the probe could
 * not distinguish 0-6 from a normalised 0-1 (both read 0 on an empty cauldron).
 * So the component is used only for what states cannot express - dye mixing.
 */

const FLUID_FROM_STATE: Record<string, Fluid> = {
  water: "water",
  lava: "lava",
  powder_snow: "powder_snow",
};

const STATE_FROM_FLUID: Partial<Record<Fluid, string>> = {
  water: "water",
  lava: "lava",
  powder_snow: "powder_snow",
};

export function readCauldron(block: Block): CauldronState | undefined {
  if (!block.isValid) return undefined;
  try {
    if (!block.matches(CAULDRON)) return undefined;
    const level = (block.permutation.getState("fill_level") as number | undefined) ?? 0;
    // An empty cauldron still reports cauldron_liquid "water" (measured), so the
    // fluid is only meaningful once there is something in it.
    if (level <= 0) return { fluid: "empty", level: 0 };
    const liquid = (block.permutation.getState("cauldron_liquid") as string | undefined) ?? "water";
    return { fluid: FLUID_FROM_STATE[liquid] ?? "water", level };
  } catch {
    return undefined;
  }
}

/**
 * Resolve the target permutation up front so an illegal state combination
 * throws during planning rather than between two mutations.
 */
export function planCauldronPermutation(next: CauldronState): BlockPermutation | undefined {
  const level = Math.max(0, Math.min(6, next.level));
  if (level === 0) {
    return BlockPermutation.resolve(CAULDRON, { fill_level: 0, cauldron_liquid: "water" });
  }
  const liquid = STATE_FROM_FLUID[next.fluid];
  if (!liquid) return undefined;
  try {
    return BlockPermutation.resolve(CAULDRON, { fill_level: level, cauldron_liquid: liquid });
  } catch {
    // The exact cauldron_liquid value for powder snow is unverified; if the
    // engine rejects it, the caller falls back to the fluid_container component.
    return undefined;
  }
}

export function applyCauldron(
  block: Block,
  next: CauldronState,
  permutation: BlockPermutation | undefined,
  addDye?: string,
): void {
  if (permutation) {
    block.setPermutation(permutation);
  } else {
    // Fallback path: express the change through the component instead.
    const fc = block.getComponent(BlockComponentTypes.FluidContainer);
    if (!fc) throw new Error(`cannot represent cauldron state ${next.fluid}/${next.level}`);
    fc.fillLevel = next.level;
  }

  if (addDye) {
    const fc = block.getComponent(BlockComponentTypes.FluidContainer);
    const dyeType = ItemTypes.get(addDye);
    if (fc && dyeType) fc.addDye(dyeType);
  }
}

/**
 * Build the item to push back into the dispenser.
 *
 * `transform` mutates the ejected stack so enchantments and durability survive;
 * `new` builds a fresh stack. ItemStack.typeId is readonly, which is exactly why
 * anything that changes the id must go through `new` and carry no other state.
 * Returns undefined when the rule produced no residue (e.g. dye is consumed).
 */
export function buildResidue(residue: Residue | undefined, ejected: ItemStack): ItemStack | undefined {
  if (!residue) return undefined;

  if (residue.mode === "new") {
    return new ItemStack(residue.typeId, residue.amount);
  }

  // transform: clear the dye in place
  const dyeable = ejected.getComponent(ItemComponentTypes.Dyeable);
  if (dyeable) dyeable.color = undefined;
  return ejected;
}

/** Read the dye colour of an item as packed 0xRRGGBB, or undefined if undyed. */
export function readItemColor(stack: ItemStack): number | undefined {
  const dyeable = stack.getComponent(ItemComponentTypes.Dyeable);
  const c = dyeable?.color;
  if (!c) return undefined;
  return ((c.red & 0xff) << 16) | ((c.green & 0xff) << 8) | (c.blue & 0xff);
}

/** The potion variant id, e.g. "minecraft:water" for a plain water bottle. */
export function readPotionEffectId(stack: ItemStack): string | undefined {
  try {
    const potion = stack.getComponent(ItemComponentTypes.Potion);
    return potion?.potionEffectType?.id;
  } catch {
    return undefined;
  }
}
