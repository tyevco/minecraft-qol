/**
 * Pure cauldron model. NOTHING in scripts/core may import @minecraft/* - this
 * layer is plain data so it runs under Vitest in Node with no game and no mocks.
 *
 * Levels are always expressed in Bedrock's 0..6 block-state units. The engine
 * adapter (scripts/dispenser/io.ts) is the only place allowed to convert, which
 * matters because BlockFluidContainerComponent.fillLevel is documented only as
 * "relative fill level" and its scale is unverified.
 */

export type Fluid = "empty" | "water" | "lava" | "powder_snow" | "potion";

/** A full cauldron. Bedrock uses fill_level 0..6 on a single minecraft:cauldron block. */
export const MAX_LEVEL = 6;

/** Bedrock gives 2 levels per bottle, unlike Java's 1. */
export const BOTTLE_LEVELS = 2;

/** Washing dye off an item costs one level. */
export const WASH_LEVELS = 1;

export interface CauldronState {
  fluid: Fluid;
  /** 0..MAX_LEVEL */
  level: number;
}

export const EMPTY_CAULDRON: CauldronState = { fluid: "empty", level: 0 };

export function isEmpty(c: CauldronState): boolean {
  return c.level <= 0 || c.fluid === "empty";
}

export function isFull(c: CauldronState): boolean {
  return c.level >= MAX_LEVEL && c.fluid !== "empty";
}

/** Clamp into the legal range and normalise "0 level" to the empty fluid. */
export function normalise(c: CauldronState): CauldronState {
  const level = Math.max(0, Math.min(MAX_LEVEL, c.level));
  if (level === 0) return { fluid: "empty", level: 0 };
  return { fluid: c.fluid, level };
}
