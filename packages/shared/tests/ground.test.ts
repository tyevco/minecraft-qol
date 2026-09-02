import { describe, expect, it } from "vitest";
import { freshGround } from "../core/ground";

describe("freshGround", () => {
  const sample = { pos: { x: 1, y: 64, z: 1 }, tick: 1000 };

  it("returns a recent sample", () => {
    expect(freshGround(sample, 1100, 200)).toBe(sample);
    expect(freshGround(sample, 1200, 200)).toBe(sample);
  });

  it("drops a stale one", () => {
    expect(freshGround(sample, 1201, 200)).toBeUndefined();
  });

  it("is undefined for no sample at all", () => {
    expect(freshGround(undefined, 1000, 200)).toBeUndefined();
  });
});
