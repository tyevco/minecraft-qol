import type { CauldronState } from "./cauldron";

/**
 * The cauldron recipe layer, shared by every pack that puts an item into a
 * cauldron: QOL Times does it from a dispenser, Fluidworks from a funnel.
 * Pure - no @minecraft imports.
 *
 * A rule sees an item and a cauldron and answers with the cauldron's new
 * state and what the item becomes. It does not know where the item came from
 * or where the answer goes; that is the caller's business, which is exactly
 * what lets one rule serve both a dispenser (the output goes back into the
 * dispenser) and a funnel (the output goes out of the tank).
 */

/** A plain-data view of an item stack. No engine types. */
export interface ItemRef {
  typeId: string;
  amount: number;
  /** Packed 0xRRGGBB from minecraft:dyeable, or undefined when undyed/not dyeable. */
  colorRgb?: number;
  /** For minecraft:potion, the effect id, e.g. "minecraft:water". */
  potionEffectId?: string;
}

/**
 * What the input item becomes.
 *
 * `new` constructs a fresh stack (an empty bucket, a glass bottle, a block of
 * concrete). `transform` mutates the input stack in place - used for washing,
 * so enchantments and durability survive. `typeId` is readonly on ItemStack,
 * so anything that would change the id must be `new`, and must not carry state.
 * No output at all means the item is consumed (dye).
 */
export type Output =
  | { mode: "new"; typeId: string; amount: number }
  | { mode: "transform"; clearDye: true };

/** A change to the cauldron that its block states cannot express. */
export type CauldronEffect = { kind: "add_dye"; dyeTypeId: string };

export interface RuleInput {
  item: ItemRef;
  /** undefined when the block in question is not a cauldron. */
  cauldron: CauldronState | undefined;
}

export type RuleResult =
  | { kind: "none" }
  | {
      kind: "apply";
      /** Desired resulting cauldron state, in 0..6 level units. */
      cauldron: CauldronState;
      effects?: CauldronEffect[];
      output?: Output;
      /**
       * Wear on the cauldron's contents that is too small to be a whole level.
       * The caller accumulates it and drains a level when enough has built up;
       * how much is "enough" is the caller's setting. Rules that drain whole
       * levels express that in `cauldron` and leave this unset.
       */
      wear?: number;
      /** Sound to play at the cauldron so the result feels vanilla. */
      sound?: string;
    };

export const NONE: RuleResult = { kind: "none" };

export type Rule = (input: RuleInput) => RuleResult;
