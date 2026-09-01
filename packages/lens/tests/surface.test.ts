import { describe, it, expect } from "vitest";
import {
  isClearSpace,
  isDeniedSurface,
  isStandable,
  isStandableFloor,
  type BlockFlags,
} from "../scripts/core/surface";

/** Flags exactly as measured by /scriptevent qolprobe:solid on Bedrock 1.26.45. */
const MEASURED: Record<string, BlockFlags> = {
  dirt: { typeId: "minecraft:dirt", isAir: false, isLiquid: false, blocksWater: true },
  grass: { typeId: "minecraft:grass_block", isAir: false, isLiquid: false, blocksWater: true },
  slab: { typeId: "minecraft:smooth_stone_slab", isAir: false, isLiquid: false, blocksWater: true },
  glass: { typeId: "minecraft:glass", isAir: false, isLiquid: false, blocksWater: true },
  torch: { typeId: "minecraft:torch", isAir: false, isLiquid: false, blocksWater: false },
  lever: { typeId: "minecraft:lever", isAir: false, isLiquid: false, blocksWater: false },
};

const AIR: BlockFlags = { typeId: "minecraft:air", isAir: true, isLiquid: false, blocksWater: false };
const WATER: BlockFlags = { typeId: "minecraft:water", isAir: false, isLiquid: true, blocksWater: false };

describe("floors, against measured flags", () => {
  it("accepts real floors", () => {
    expect(isStandableFloor(MEASURED.dirt!)).toBe(true);
    expect(isStandableFloor(MEASURED.grass!)).toBe(true);
  });

  it("accepts a bottom slab - the case that nearly broke the proxy", () => {
    // Mobs do spawn on bottom slabs, and the slab reports blocksWater=true just
    // like a full block, so the proxy gets this right.
    expect(isStandableFloor(MEASURED.slab!)).toBe(true);
  });

  it("rejects attachments, which is what the proxy is for", () => {
    expect(isStandableFloor(MEASURED.torch!)).toBe(false);
    expect(isStandableFloor(MEASURED.lever!)).toBe(false);
  });

  it("rejects glass despite it blocking water", () => {
    // blocksWater alone would accept it: vanilla spawning also wants opacity.
    expect(MEASURED.glass!.blocksWater).toBe(true);
    expect(isStandableFloor(MEASURED.glass!)).toBe(false);
  });

  it("rejects air and liquids", () => {
    expect(isStandableFloor(AIR)).toBe(false);
    expect(isStandableFloor(WATER)).toBe(false);
  });
});

describe("denied surfaces", () => {
  it("covers stained glass and pane variants by pattern", () => {
    for (const id of [
      "minecraft:glass",
      "minecraft:white_stained_glass",
      "minecraft:red_stained_glass_pane",
      "minecraft:glass_pane",
      "minecraft:oak_leaves",
      "minecraft:blue_ice",
    ]) {
      expect(isDeniedSurface(id)).toBe(true);
    }
  });

  it("does not over-match ordinary blocks", () => {
    for (const id of [
      "minecraft:stone",
      "minecraft:dirt",
      "minecraft:smooth_stone_slab",
      "minecraft:glowstone", // contains "stone", must not be caught by a pattern
    ]) {
      expect(isDeniedSurface(id)).toBe(false);
    }
  });
});

describe("clear space", () => {
  it("treats air as clear", () => {
    expect(isClearSpace(AIR)).toBe(true);
  });

  it("treats attachments and liquids as non-obstructing", () => {
    expect(isClearSpace(MEASURED.torch!)).toBe(true);
    expect(isClearSpace(WATER)).toBe(true);
  });

  it("treats solid blocks as obstructing", () => {
    expect(isClearSpace(MEASURED.stone ?? MEASURED.dirt!)).toBe(false);
    expect(isClearSpace(MEASURED.glass!)).toBe(false);
  });
});

describe("full standability", () => {
  it("needs a floor and two clear blocks", () => {
    expect(isStandable(MEASURED.dirt!, AIR, AIR)).toBe(true);
  });

  it("rejects a one-block gap", () => {
    expect(isStandable(MEASURED.dirt!, AIR, MEASURED.dirt!)).toBe(false);
  });

  it("rejects standing on a torch even with headroom", () => {
    expect(isStandable(MEASURED.torch!, AIR, AIR)).toBe(false);
  });

  it("rejects a blocked feet position", () => {
    expect(isStandable(MEASURED.dirt!, MEASURED.dirt!, AIR)).toBe(false);
  });
});
