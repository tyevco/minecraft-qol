import { concreteFor } from "./items";
import { NONE, type RuleResult, type Rule } from "./types";

/**
 * Concrete powder + water -> concrete. The Fluidworks flagship.
 *
 * The level is not drained per block: that would make a cauldron worth six
 * blocks, which nobody would build. Instead each block adds one unit of wear
 * and the machine drains a level once enough wear has built up, at a rate the
 * settings panel decides. The rule still requires water to be present, so an
 * empty tank makes nothing.
 */
export const concreteRule: Rule = ({ item, cauldron }): RuleResult => {
  if (!cauldron) return NONE;
  const concrete = concreteFor(item.typeId);
  if (!concrete) return NONE;
  if (cauldron.fluid !== "water" || cauldron.level <= 0) return NONE;

  return {
    kind: "apply",
    cauldron,
    output: { mode: "new", typeId: concrete, amount: 1 },
    wear: 1,
    sound: "bucket.empty_water",
  };
};
