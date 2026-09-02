import { describe, expect, it } from "vitest";
import { CROPS, cropOf, isMature, withholdSeed } from "../core/crops";

describe("crops", () => {
  it("knows wheat and not stems", () => {
    expect(cropOf("minecraft:wheat")?.seed).toBe("minecraft:wheat_seeds");
    expect(cropOf("minecraft:melon_stem")).toBeUndefined();
  });
  it("is mature only at or past the table's value", () => {
    const wheat = CROPS["minecraft:wheat"]!;
    expect(isMature(wheat, 7)).toBe(true);
    expect(isMature(wheat, 6)).toBe(false);
    expect(isMature(wheat, "7")).toBe(false);
  });
  it("withholds exactly one seed and replants", () => {
    const wheat = CROPS["minecraft:wheat"]!;
    const r = withholdSeed(
      [
        { typeId: "minecraft:wheat", amount: 1 },
        { typeId: "minecraft:wheat_seeds", amount: 3 },
      ],
      wheat,
    );
    expect(r).toEqual({
      drops: [
        { typeId: "minecraft:wheat", amount: 1 },
        { typeId: "minecraft:wheat_seeds", amount: 2 },
      ],
      replant: true,
    });
  });
  it("removes a lone seed entirely", () => {
    const r = withholdSeed(
      [{ typeId: "minecraft:wheat_seeds", amount: 1 }],
      CROPS["minecraft:wheat"]!,
    );
    expect(r).toEqual({ drops: [], replant: true });
  });
  it("does not replant when the roll gave no seed", () => {
    const r = withholdSeed(
      [{ typeId: "minecraft:wheat", amount: 1 }],
      CROPS["minecraft:wheat"]!,
    );
    expect(r).toEqual({
      drops: [{ typeId: "minecraft:wheat", amount: 1 }],
      replant: false,
    });
  });
  it("crops whose seed is the crop itself pay one back", () => {
    const r = withholdSeed(
      [{ typeId: "minecraft:carrot", amount: 3 }],
      CROPS["minecraft:carrots"]!,
    );
    expect(r).toEqual({
      drops: [{ typeId: "minecraft:carrot", amount: 2 }],
      replant: true,
    });
  });
});
