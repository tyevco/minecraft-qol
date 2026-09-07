import { describe, expect, it } from "vitest";
import type { Cell } from "../scripts/core/blueprint";
import { boxOf, fits, grounded, intersects, overlapping, paidFor, type Lookup, type WorldCell } from "../scripts/core/checks";

const AIR: WorldCell = { typeId: "minecraft:air", isAir: true, isLiquid: false };
const STONE: WorldCell = { typeId: "minecraft:stone", isAir: false, isLiquid: false };
const GRASS: WorldCell = { typeId: "minecraft:grass_block", isAir: false, isLiquid: false };
const WATER: WorldCell = { typeId: "minecraft:water", isAir: false, isLiquid: true };
const FLOWER: WorldCell = { typeId: "minecraft:poppy", isAir: false, isLiquid: false };
const CHEST: WorldCell = { typeId: "minecraft:chest", isAir: false, isLiquid: false };

/** A world: grass at y = 10 on stone below, air above, with overrides. */
function flatWorld(overrides: Record<string, WorldCell | undefined> = {}): Lookup {
  return (x, y, z) => {
    const key = `${x},${y},${z}`;
    if (key in overrides) return overrides[key];
    if (y === 10) return GRASS;
    if (y < 10) return STONE;
    return AIR;
  };
}

const origin = { x: 100, y: 10, z: 200 };
const size = { x: 3, y: 2, z: 3 };

describe("fits", () => {
  it("accepts air above the turf, and the turf itself on the footing layer", () => {
    expect(fits(origin, size, flatWorld())).toEqual({ ok: true });
  });
  it("accepts a flower or water in the box", () => {
    expect(fits(origin, size, flatWorld({ "101,11,201": FLOWER, "102,11,202": WATER })).ok).toBe(true);
  });
  it("refuses a stone in the way and names it by coordinate", () => {
    const v = fits(origin, size, flatWorld({ "101,11,201": STONE }));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.at).toEqual({ x: 101, y: 11, z: 201, name: "minecraft:stone" });
      expect(v.reason).toBe("stone is in the way at 101,11,201");
    }
  });
  it("refuses a chest on the footing layer: only natural ground may be replaced", () => {
    const v = fits(origin, size, flatWorld({ "100,10,200": CHEST }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.at?.name).toBe("minecraft:chest");
  });
  it("checks the whole box, not only the cells the building writes", () => {
    const v = fits(origin, size, flatWorld({ "102,11,202": STONE }));
    expect(v.ok).toBe(false);
  });
  it("refuses an unloaded chunk rather than guessing", () => {
    const v = fits(origin, size, flatWorld({ "100,11,200": undefined }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain("not loaded");
  });
  it("reports the first offender bottom layer first", () => {
    const v = fits(origin, size, flatWorld({ "102,11,202": STONE, "100,11,200": CHEST }));
    if (!v.ok) expect(v.at).toEqual({ x: 100, y: 11, z: 200, name: "minecraft:chest" });
  });
});

describe("grounded", () => {
  const footing: Cell[] = [
    { x: 100, y: 10, z: 200, name: "minecraft:cobblestone", states: {} },
    { x: 101, y: 10, z: 200, name: "minecraft:cobblestone", states: {} },
    { x: 101, y: 11, z: 200, name: "minecraft:oak_fence", states: {} },
  ];
  it("is happy on stone", () => {
    expect(grounded(10, footing, flatWorld())).toEqual({ ok: true });
  });
  it("refuses a footing over air, and says where", () => {
    const v = grounded(10, footing, flatWorld({ "101,9,200": AIR }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("nothing to stand on at 101,9,200 (air)");
  });
  it("refuses a footing over water for a ground building", () => {
    expect(grounded(10, footing, flatWorld({ "100,9,200": WATER })).ok).toBe(false);
  });
  it("lets a building on stilts stand on water, but never on air", () => {
    expect(grounded(10, footing, flatWorld({ "100,9,200": WATER }), true)).toEqual({ ok: true });
    const v = grounded(10, footing, flatWorld({ "100,9,200": AIR }), true);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("nothing to stand on at 100,9,200 (air)");
  });
  it("only looks under the bottom layer", () => {
    // The fence at y = 11 stands on the footing, not the ground; nothing under it is checked.
    expect(grounded(10, footing, flatWorld({ "101,10,200": AIR })).ok).toBe(true);
  });
});

describe("paidFor", () => {
  it("passes when the chest has at least every material", () => {
    expect(paidFor({ "minecraft:cobblestone": 32, "minecraft:lantern": 1 }, { "minecraft:cobblestone": 40, "minecraft:lantern": 1, "minecraft:bread": 3 })).toEqual({ ok: true });
  });
  it("lists what is short, by how much", () => {
    const v = paidFor({ "minecraft:cobblestone": 32, "minecraft:lantern": 1, "minecraft:oak_fence": 8 }, { "minecraft:cobblestone": 31, "minecraft:oak_fence": 8 });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.short).toEqual([
        { item: "minecraft:cobblestone", need: 32, have: 31 },
        { item: "minecraft:lantern", need: 1, have: 0 },
      ]);
      expect(v.reason).toBe("short of 1 cobblestone, 1 lantern");
    }
  });
});

describe("boxes", () => {
  const a = boxOf({ x: 0, y: 0, z: 0 }, { x: 5, y: 7, z: 5 });
  it("may touch but not share a cell", () => {
    expect(intersects(a, boxOf({ x: 5, y: 0, z: 0 }, { x: 5, y: 7, z: 5 }))).toBe(false);
    expect(intersects(a, boxOf({ x: 4, y: 0, z: 0 }, { x: 5, y: 7, z: 5 }))).toBe(true);
    expect(intersects(a, boxOf({ x: 0, y: 7, z: 0 }, { x: 5, y: 7, z: 5 }))).toBe(false);
    expect(intersects(a, boxOf({ x: -4, y: 6, z: -4 }, { x: 5, y: 7, z: 5 }))).toBe(true);
  });
  it("finds the first recorded box in the way", () => {
    const b = { ...boxOf({ x: 3, y: 0, z: 3 }, { x: 5, y: 7, z: 5 }), key: "well" };
    expect(overlapping(a, [{ ...boxOf({ x: 20, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }), key: "far" }, b])).toBe(b);
    expect(overlapping(a, [])).toBeUndefined();
  });
});
