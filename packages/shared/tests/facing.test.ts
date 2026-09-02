import { describe, expect, it } from "vitest";
import { FACING, NEIGHBOURS, facingVector, negate, sameOffset } from "../core/facing";

describe("facing_direction decoding", () => {
  it("maps every state to a unit axis vector", () => {
    for (const v of FACING) {
      expect(Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z)).toBe(1);
    }
  });

  it("uses the measured mapping: down, up, north, south, west, east", () => {
    expect(facingVector(0)).toEqual({ x: 0, y: -1, z: 0 });
    expect(facingVector(1)).toEqual({ x: 0, y: 1, z: 0 });
    expect(facingVector(2)).toEqual({ x: 0, y: 0, z: -1 });
    expect(facingVector(3)).toEqual({ x: 0, y: 0, z: 1 });
    expect(facingVector(4)).toEqual({ x: -1, y: 0, z: 0 });
    expect(facingVector(5)).toEqual({ x: 1, y: 0, z: 0 });
  });

  it("pairs opposite faces as negations", () => {
    expect(sameOffset(negate(FACING[0]!), FACING[1]!)).toBe(true);
    expect(sameOffset(negate(FACING[2]!), FACING[3]!)).toBe(true);
    expect(sameOffset(negate(FACING[4]!), FACING[5]!)).toBe(true);
  });

  it("rejects anything that is not a valid state", () => {
    expect(facingVector(6)).toBeUndefined();
    expect(facingVector(-1)).toBeUndefined();
    expect(facingVector(2.5)).toBeUndefined();
    expect(facingVector("2")).toBeUndefined();
    expect(facingVector(undefined)).toBeUndefined();
    expect(facingVector(true)).toBeUndefined();
  });

  it("exposes exactly six distinct neighbours", () => {
    const keys = new Set(NEIGHBOURS.map((o) => `${o.x},${o.y},${o.z}`));
    expect(keys.size).toBe(6);
  });
});
