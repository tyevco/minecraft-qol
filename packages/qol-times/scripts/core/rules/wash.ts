import { WASH_LEVELS, normalise } from "../cauldron";
import { isWashable } from "../items";
import { NONE, type DispenseResult, type Rule } from "./types";

/**
 * Washing dye off leather armour and wolf armour, consuming one water level.
 *
 * Residue mode is `transform`, not `new`: we clear the stack's dyeable
 * component in place so enchantments and durability survive. Rebuilding the
 * stack would silently strip them.
 */
export const washRule: Rule = ({ item, cauldron }): DispenseResult => {
  if (!cauldron) return NONE;
  if (!isWashable(item.typeId)) return NONE;
  if (cauldron.fluid !== "water" || cauldron.level < WASH_LEVELS) return NONE;
  // Nothing to wash off - do not consume a level for a no-op.
  if (item.colorRgb === undefined) return NONE;

  return {
    kind: "apply",
    cauldron: normalise({ fluid: "water", level: cauldron.level - WASH_LEVELS }),
    residue: { mode: "transform", clearDye: true },
    sound: "cauldron.cleanarmor",
  };
};
