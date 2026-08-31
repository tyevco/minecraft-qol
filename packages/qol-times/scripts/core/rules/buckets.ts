import { MAX_LEVEL, isFull, type Fluid } from "../cauldron";
import { BUCKET, LAVA_BUCKET, POWDER_SNOW_BUCKET, WATER_BUCKET } from "../items";
import { NONE, type DispenseResult, type Rule } from "./types";

const FLUID_OF: Record<string, Fluid> = {
  [WATER_BUCKET]: "water",
  [LAVA_BUCKET]: "lava",
  [POWDER_SNOW_BUCKET]: "powder_snow",
};

const BUCKET_OF: Partial<Record<Fluid, string>> = {
  water: WATER_BUCKET,
  lava: LAVA_BUCKET,
  powder_snow: POWDER_SNOW_BUCKET,
};

const FILL_SOUND: Record<string, string> = {
  water: "bucket.fill_water",
  lava: "bucket.fill_lava",
  powder_snow: "bucket.fill_powder_snow",
};

const EMPTY_SOUND: Record<string, string> = {
  water: "bucket.empty_water",
  lava: "bucket.empty_lava",
  powder_snow: "bucket.empty_powder_snow",
};

/**
 * A filled bucket fills the cauldron completely; an empty bucket drains a full
 * one and comes back filled.
 *
 * Draining deliberately requires a FULL cauldron, matching vanilla hand
 * behaviour - you cannot scoop a partial cauldron with a bucket.
 */
export const bucketRule: Rule = ({ item, cauldron }): DispenseResult => {
  if (!cauldron) return NONE;

  const fluid = FLUID_OF[item.typeId];
  if (fluid) {
    // Filling. Allowed into an empty cauldron, or to top up the same fluid.
    // Mixing fluids is refused rather than silently replacing the contents.
    const targetEmpty = cauldron.fluid === "empty" || cauldron.level === 0;
    if (!targetEmpty && cauldron.fluid !== fluid) return NONE;
    if (isFull(cauldron) && cauldron.fluid === fluid) return NONE;

    return {
      kind: "apply",
      cauldron: { fluid, level: MAX_LEVEL },
      residue: { mode: "new", typeId: BUCKET, amount: 1 },
      sound: EMPTY_SOUND[fluid],
    };
  }

  if (item.typeId === BUCKET) {
    if (!isFull(cauldron)) return NONE;
    const filled = BUCKET_OF[cauldron.fluid];
    if (!filled) return NONE; // e.g. a potion cauldron - not bucketable

    return {
      kind: "apply",
      cauldron: { fluid: "empty", level: 0 },
      residue: { mode: "new", typeId: filled, amount: 1 },
      sound: FILL_SOUND[cauldron.fluid],
    };
  }

  return NONE;
};
