import { describe, it, expect } from "vitest";
import {
  clampTier,
  loreForTier,
  nextTier,
  tierSuggestsLighting,
  MAX_TIER,
  MIN_TIER,
  type Tier,
} from "../scripts/core/tier";

describe("clampTier", () => {
  it("defaults to tier 1 for anything unstored or unreadable", () => {
    // A Lens made before tiers existed has no property at all.
    for (const v of [undefined, null, "2", {}, NaN, Infinity, -Infinity]) {
      expect(clampTier(v)).toBe(MIN_TIER);
    }
  });

  it("clamps out-of-range numbers rather than trusting storage", () => {
    expect(clampTier(0)).toBe(MIN_TIER);
    expect(clampTier(-5)).toBe(MIN_TIER);
    expect(clampTier(99)).toBe(MAX_TIER);
  });

  it("round-trips legal tiers", () => {
    expect(clampTier(1)).toBe(1);
    expect(clampTier(2)).toBe(2);
  });
});

describe("nextTier", () => {
  it("advances until the maximum, then stops", () => {
    expect(nextTier(1)).toBe(2);
    expect(nextTier(2)).toBeUndefined();
  });
});

describe("loreForTier", () => {
  const tiers: Tier[] = [1, 2];

  it("stays inside the engine's lore limits", () => {
    // setLore throws above 20 lines or 50 characters per line.
    for (const tier of tiers) {
      const lore = loreForTier(tier);
      expect(lore.length).toBeLessThanOrEqual(20);
      for (const line of lore) expect(line.length).toBeLessThanOrEqual(50);
    }
  });

  it("names the tier so the item reads like an upgrade", () => {
    expect(loreForTier(1)[0]).toContain("I");
    expect(loreForTier(2)[0]).toContain("II");
  });

  it("describes what each tier actually does differently", () => {
    expect(loreForTier(1)).not.toEqual(loreForTier(2));
  });
});

describe("tierSuggestsLighting", () => {
  it("gates torch suggestions behind tier 2", () => {
    expect(tierSuggestsLighting(1)).toBe(false);
    expect(tierSuggestsLighting(2)).toBe(true);
  });
});
