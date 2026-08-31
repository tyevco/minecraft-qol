import type { CauldronState } from "../cauldron";

/** A plain-data view of the ejected item stack. No engine types. */
export interface ItemRef {
  typeId: string;
  amount: number;
  /** Packed 0xRRGGBB from minecraft:dyeable, or undefined when undyed/not dyeable. */
  colorRgb?: number;
  /** For minecraft:potion, the effect id, e.g. "minecraft:water". */
  potionEffectId?: string;
}

/**
 * What to put back into the dispenser.
 *
 * `new` constructs a fresh stack (an empty bucket, a glass bottle).
 * `transform` mutates the ejected stack in place - used for washing, so
 * enchantments and durability survive. `typeId` is readonly on ItemStack, so
 * anything that would change the id must be `new`, and must not carry state.
 */
export type Residue =
  | { mode: "new"; typeId: string; amount: number }
  | { mode: "transform"; clearDye: true };

export interface DispenseInput {
  item: ItemRef;
  /** undefined when the block the dispenser faces is not a cauldron. */
  cauldron: CauldronState | undefined;
}

export type DispenseResult =
  | { kind: "none" }
  | {
      kind: "apply";
      /** Desired resulting cauldron state, in 0..6 level units. */
      cauldron: CauldronState;
      /** Dye item id to apply via BlockFluidContainerComponent.addDye. */
      addDye?: string;
      residue?: Residue;
      /** Sound to play at the cauldron so the result feels vanilla. */
      sound?: string;
    };

export const NONE: DispenseResult = { kind: "none" };

export type Rule = (input: DispenseInput) => DispenseResult;
