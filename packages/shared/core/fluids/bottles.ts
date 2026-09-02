import { BOTTLE_LEVELS, MAX_LEVEL, normalise } from "./cauldron";
import { GLASS_BOTTLE, POTION, WATER_POTION_EFFECT } from "./items";
import { NONE, type RuleResult, type Rule } from "./types";

/**
 * Water bottle adds 2 levels, glass bottle takes 2 back out.
 *
 * Two is Bedrock's rate - Java uses 1. A water bottle is identified precisely
 * via ItemPotionComponent.potionEffectType ("minecraft:water"), which is why
 * this rule takes potionEffectId rather than guessing from typeId: every potion
 * variant shares the id "minecraft:potion".
 */
export const bottleRule: Rule = ({ item, cauldron }): RuleResult => {
  if (!cauldron) return NONE;

  const isWaterBottle =
    item.typeId === POTION && item.potionEffectId === WATER_POTION_EFFECT;

  if (isWaterBottle) {
    const empty = cauldron.fluid === "empty" || cauldron.level === 0;
    if (!empty && cauldron.fluid !== "water") return NONE;
    // Refuse rather than silently wasting the bottle on an almost-full cauldron.
    if (!empty && cauldron.level + BOTTLE_LEVELS > MAX_LEVEL) return NONE;

    return {
      kind: "apply",
      cauldron: normalise({
        fluid: "water",
        level: (empty ? 0 : cauldron.level) + BOTTLE_LEVELS,
      }),
      output: { mode: "new", typeId: GLASS_BOTTLE, amount: 1 },
      sound: "bucket.empty_water",
    };
  }

  if (item.typeId === GLASS_BOTTLE) {
    if (cauldron.fluid !== "water") return NONE;
    if (cauldron.level < BOTTLE_LEVELS) return NONE;

    return {
      kind: "apply",
      cauldron: normalise({
        fluid: "water",
        level: cauldron.level - BOTTLE_LEVELS,
      }),
      // A fresh water bottle: no state to preserve, so `new` is safe here.
      output: { mode: "new", typeId: POTION, amount: 1 },
      sound: "bucket.fill_water",
    };
  }

  return NONE;
};
