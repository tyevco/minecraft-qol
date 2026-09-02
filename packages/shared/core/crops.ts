/**
 * Crops that can be harvested and replanted in place. Pure - no @minecraft
 * imports. Used by the Fluidworks harvester funnel; the Harvest proposal
 * (docs/design/harvest.md) would use the same table from a player's hand.
 *
 * Hand-built, like the item tables: no API exposes a crop's age state or its
 * seed. Melon and pumpkin stems are deliberately absent - their fruit is a
 * separate block and breaking the stem is never what anyone wants.
 */
export interface Crop {
  /** The block state that holds the age. */
  ageState: string;
  /** The age value at which the crop is fully grown. */
  mature: number;
  /** The item withheld from the drops to replant. */
  seed: string;
  /** States to carry over when replanting (cocoa's direction). */
  keepStates?: readonly string[];
}

export const CROPS: Readonly<Record<string, Crop>> = {
  "minecraft:wheat": {
    ageState: "growth",
    mature: 7,
    seed: "minecraft:wheat_seeds",
  },
  "minecraft:carrots": {
    ageState: "growth",
    mature: 7,
    seed: "minecraft:carrot",
  },
  "minecraft:potatoes": {
    ageState: "growth",
    mature: 7,
    seed: "minecraft:potato",
  },
  "minecraft:beetroot": {
    ageState: "growth",
    mature: 7,
    seed: "minecraft:beetroot_seeds",
  },
  "minecraft:nether_wart": {
    ageState: "age",
    mature: 3,
    seed: "minecraft:nether_wart",
  },
  "minecraft:cocoa": {
    ageState: "age",
    mature: 2,
    seed: "minecraft:cocoa_beans",
    keepStates: ["direction"],
  },
};

export function cropOf(blockId: string): Crop | undefined {
  return CROPS[blockId];
}

export function isMature(crop: Crop, age: unknown): boolean {
  return typeof age === "number" && age >= crop.mature;
}

export interface Drop {
  typeId: string;
  amount: number;
}

/**
 * Take one seed back out of the drops to pay for the replant.
 *
 * Same drops, same seeds: if the roll produced no seed, nothing is withheld
 * and the tile is not replanted - exactly what breaking it by hand would do.
 */
export function withholdSeed(
  drops: readonly Drop[],
  crop: Crop,
): { drops: Drop[]; replant: boolean } {
  const out: Drop[] = [];
  let withheld = false;
  for (const d of drops) {
    if (!withheld && d.typeId === crop.seed && d.amount > 0) {
      withheld = true;
      if (d.amount > 1) out.push({ typeId: d.typeId, amount: d.amount - 1 });
      continue;
    }
    out.push({ ...d });
  }
  return { drops: out, replant: withheld };
}
