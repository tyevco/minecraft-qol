import { describe, it, expect } from "vitest";
import {
  blockLight,
  classify,
  shouldMark,
  HOSTILE_MAX_BLOCK_LIGHT,
  type LightSample,
} from "../scripts/core/spawn";

/**
 * The eight rows measured in game by `/scriptevent qolprobe:lightmatrix` on
 * Bedrock 1.26.45. These are observations, not assumptions - if a future game
 * version changes them, these tests fail and tell us the model moved.
 */
const MEASURED = [
  { label: "open @noon", total: 12, sky: 12, expectBlockLight: undefined },
  { label: "open @midnight", total: 4, sky: 4, expectBlockLight: undefined },
  { label: "open +torch @noon", total: 13, sky: 12, expectBlockLight: 13 },
  { label: "open +torch @midnight", total: 13, sky: 4, expectBlockLight: 13 },
  { label: "sealed @noon", total: 0, sky: 0, expectBlockLight: 0 },
  { label: "sealed @midnight", total: 0, sky: 0, expectBlockLight: 0 },
  { label: "sealed +torch @noon", total: 13, sky: 0, expectBlockLight: 13 },
  { label: "sealed +torch @midnight", total: 13, sky: 0, expectBlockLight: 13 },
] as const;

describe("blockLight recovery, against measured engine values", () => {
  for (const row of MEASURED) {
    it(`${row.label} -> ${row.expectBlockLight ?? "uncertain"}`, () => {
      expect(blockLight({ total: row.total, sky: row.sky })).toBe(row.expectBlockLight);
    });
  }

  it("does not mistake (total - sky) for block light", () => {
    // The naive formula would give 13 - 4 = 9 here. It is 13.
    expect(blockLight({ total: 13, sky: 4 })).toBe(13);
    expect(blockLight({ total: 13, sky: 4 })).not.toBe(9);
  });

  it("returns undefined only when the sky term genuinely masks block light", () => {
    for (let sky = 1; sky <= 15; sky++) {
      // total === sky: block light could be anything from 0 to sky.
      expect(blockLight({ total: sky, sky })).toBeUndefined();
      // total > sky: the max is the block term, so it is exact.
      if (sky < 15) expect(blockLight({ total: sky + 1, sky })).toBe(sky + 1);
    }
  });

  it("treats total < sky as unusable rather than inventing a value", () => {
    // Cannot occur if total is a max, so refuse rather than guess.
    expect(blockLight({ total: 3, sky: 9 })).toBeUndefined();
  });
});

describe("classify", () => {
  const at = (total: number, sky: number, standable = true) =>
    classify({ light: { total, sky }, standable });

  it("marks a fully dark, enclosed, standable spot as spawnable", () => {
    expect(at(0, 0)).toBe("spawnable");
  });

  it("marks a torch-lit enclosed spot as safe", () => {
    expect(at(13, 0)).toBe("safe");
  });

  it("reports uncertain where sky light masks block light", () => {
    expect(at(4, 4)).toBe("uncertain"); // open sky, midnight
    expect(at(12, 12)).toBe("uncertain"); // open sky, noon
  });

  it("is safe wherever a mob could not stand, regardless of light", () => {
    expect(at(0, 0, false)).toBe("safe");
  });

  it("uses the spawn threshold rather than a hardcoded zero", () => {
    // Guards the one constant we infer rather than read from an API.
    expect(at(HOSTILE_MAX_BLOCK_LIGHT, 0)).toBe("spawnable");
    expect(at(HOSTILE_MAX_BLOCK_LIGHT + 1, 0)).toBe("safe");
  });
});

describe("invariants over the whole light space", () => {
  const samples: LightSample[] = [];
  for (let total = 0; total <= 15; total++) {
    for (let sky = 0; sky <= 15; sky++) samples.push({ total, sky });
  }

  it("never reports a block light above the total", () => {
    // Block light is one input to max(), so it can never exceed the result.
    for (const s of samples) {
      const b = blockLight(s);
      if (b !== undefined) expect(b).toBeLessThanOrEqual(s.total);
    }
  });

  it("is a total function - every sample classifies", () => {
    const allowed = new Set(["spawnable", "safe", "uncertain"]);
    for (const s of samples) {
      expect(allowed.has(classify({ light: s, standable: true }))).toBe(true);
    }
  });

  it("never reports spawnable where block light is provably above threshold", () => {
    for (const s of samples) {
      const b = blockLight(s);
      if (b !== undefined && b > HOSTILE_MAX_BLOCK_LIGHT) {
        expect(classify({ light: s, standable: true })).toBe("safe");
      }
    }
  });

  it("danger mode warns on uncertainty, safe mode does not claim it", () => {
    // The conservative direction: over-warn rather than under-warn.
    expect(shouldMark("uncertain", "danger")).toBe(true);
    expect(shouldMark("uncertain", "safe")).toBe(false);
    expect(shouldMark("spawnable", "danger")).toBe(true);
    expect(shouldMark("safe", "safe")).toBe(true);
  });
});
