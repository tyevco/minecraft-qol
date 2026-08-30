/**
 * Item id tables. Deliberately hand-copied rather than imported from
 * @minecraft/vanilla-data so that scripts/core stays dependency-free and
 * trivially unit-testable. Ids verified against @minecraft/vanilla-data@1.26.44.
 */

export const BUCKET = "minecraft:bucket";
export const WATER_BUCKET = "minecraft:water_bucket";
export const LAVA_BUCKET = "minecraft:lava_bucket";
export const POWDER_SNOW_BUCKET = "minecraft:powder_snow_bucket";

export const GLASS_BOTTLE = "minecraft:glass_bottle";
export const POTION = "minecraft:potion";

/** The potion variant that counts as a plain water bottle. */
export const WATER_POTION_EFFECT = "minecraft:water";

export const FILLED_BUCKETS: readonly string[] = [
  WATER_BUCKET,
  LAVA_BUCKET,
  POWDER_SNOW_BUCKET,
];

export const DYES: readonly string[] = [
  "minecraft:white_dye",
  "minecraft:light_gray_dye",
  "minecraft:gray_dye",
  "minecraft:black_dye",
  "minecraft:brown_dye",
  "minecraft:red_dye",
  "minecraft:orange_dye",
  "minecraft:yellow_dye",
  "minecraft:lime_dye",
  "minecraft:green_dye",
  "minecraft:cyan_dye",
  "minecraft:light_blue_dye",
  "minecraft:blue_dye",
  "minecraft:purple_dye",
  "minecraft:magenta_dye",
  "minecraft:pink_dye",
];

/**
 * Items a cauldron can wash dye off. Restricted to things whose colour lives in
 * the stable `minecraft:dyeable` component, so washing is an in-place mutation
 * of the existing stack and never rebuilds it.
 *
 * Banners and shulker boxes are deliberately absent: banner patterns have no
 * stable component at all, and un-dyeing a shulker box would require changing
 * the readonly typeId, which means constructing a new stack and losing contents.
 */
export const WASHABLE: readonly string[] = [
  "minecraft:leather_helmet",
  "minecraft:leather_chestplate",
  "minecraft:leather_leggings",
  "minecraft:leather_boots",
  "minecraft:leather_horse_armor",
  "minecraft:wolf_armor",
];

const set = (xs: readonly string[]) => new Set(xs);

const FILLED_BUCKET_SET = set(FILLED_BUCKETS);
const DYE_SET = set(DYES);
const WASHABLE_SET = set(WASHABLE);

export const isFilledBucket = (id: string) => FILLED_BUCKET_SET.has(id);
export const isDye = (id: string) => DYE_SET.has(id);
export const isWashable = (id: string) => WASHABLE_SET.has(id);

/** Every item id this addon ever claims from a dispenser ejection. */
export const ALL_CLAIMED: readonly string[] = [
  BUCKET,
  ...FILLED_BUCKETS,
  GLASS_BOTTLE,
  POTION,
  ...DYES,
  ...WASHABLE,
];
