import { describe, it, expect } from "vitest";
import {
  chooseRespawn,
  nearestAnchor,
  RESPAWN_OFFSETS,
  type Anchor,
  type Point,
} from "../scripts/core/anchors";

const OW = "minecraft:overworld";

const anchor = (x: number, z: number, radius = 32, seq = 0, dimId = OW): Anchor => ({
  dimId,
  x,
  y: 64,
  z,
  radius,
  seq,
});

const at = (x: number, z: number, dimId = OW): Point => ({ dimId, x, y: 64, z });

describe("nearestAnchor", () => {
  it("returns nothing when there are no anchors", () => {
    expect(nearestAnchor(at(0, 0), [])).toBeUndefined();
  });

  it("ignores anchors beyond their own radius", () => {
    expect(nearestAnchor(at(100, 0), [anchor(0, 0, 32)])).toBeUndefined();
    expect(nearestAnchor(at(30, 0), [anchor(0, 0, 32)])).toBeDefined();
  });

  it("respects each anchor's own radius, not a shared one", () => {
    const small = anchor(0, 0, 8, 0);
    const large = anchor(40, 0, 64, 1);
    // 20 blocks out: outside the small anchor, inside the large one.
    expect(nearestAnchor(at(20, 0), [small, large])).toBe(large);
  });

  it("picks the nearest of several", () => {
    const near = anchor(5, 0, 64, 0);
    const far = anchor(40, 0, 64, 1);
    expect(nearestAnchor(at(0, 0), [near, far])).toBe(near);
    expect(nearestAnchor(at(45, 0), [near, far])).toBe(far);
  });

  it("breaks ties by placement order so the choice never flickers", () => {
    const first = anchor(-10, 0, 64, 1);
    const second = anchor(10, 0, 64, 2);
    // Exactly equidistant: the earlier-placed one must win, both orderings.
    expect(nearestAnchor(at(0, 0), [first, second])).toBe(first);
    expect(nearestAnchor(at(0, 0), [second, first])).toBe(first);
  });

  it("never returns an anchor from another dimension", () => {
    const nether = anchor(0, 0, 999, 0, "minecraft:nether");
    expect(nearestAnchor(at(0, 0), [nether])).toBeUndefined();
  });

  it("measures in three dimensions, not just horizontally", () => {
    const deep: Anchor = { dimId: OW, x: 0, y: 0, z: 0, radius: 32, seq: 0 };
    // 64 blocks straight up is outside a 32 radius even though x/z match.
    expect(nearestAnchor({ dimId: OW, x: 0, y: 64, z: 0 }, [deep])).toBeUndefined();
  });
});

describe("chooseRespawn", () => {
  const anchorAt = at(10, 10);

  it("never returns the anchor's own block", () => {
    const result = chooseRespawn(anchorAt, () => true);
    expect(result).toBeDefined();
    expect(result!.x === anchorAt.x && result!.z === anchorAt.z).toBe(false);
  });

  it("uses a neighbour with room to stand", () => {
    const result = chooseRespawn(anchorAt, (x, _y, z) => x === 11 && z === 10);
    expect(result).toEqual({ dimId: OW, x: 11, y: 64, z: 10 });
  });

  it("reports obstruction rather than returning somewhere unsafe", () => {
    // Visible failure over silent failure - the caller marks it obstructed.
    expect(chooseRespawn(anchorAt, () => false)).toBeUndefined();
  });

  it("prefers the requested face when it is usable", () => {
    const preferred = { dx: 0, dz: -1 };
    const result = chooseRespawn(anchorAt, () => true, preferred);
    expect(result).toEqual({ dimId: OW, x: 10, y: 64, z: 9 });
  });

  it("falls back past an unusable preferred face without repeating it", () => {
    const preferred = { dx: 0, dz: -1 };
    const tried: string[] = [];
    const result = chooseRespawn(
      anchorAt,
      (x, _y, z) => {
        tried.push(`${x},${z}`);
        return x === 10 && z === 11;
      },
      preferred,
    );
    expect(result).toEqual({ dimId: OW, x: 10, y: 64, z: 11 });
    expect(tried.length).toBe(new Set(tried).size);
  });

  it("only ever considers the four horizontal neighbours", () => {
    const seen: { dx: number; dz: number }[] = [];
    chooseRespawn(anchorAt, (x, y, z) => {
      seen.push({ dx: x - anchorAt.x, dz: z - anchorAt.z });
      expect(y).toBe(anchorAt.y);
      return false;
    });
    expect(seen).toHaveLength(RESPAWN_OFFSETS.length);
    for (const s of seen) {
      expect(Math.abs(s.dx) + Math.abs(s.dz)).toBe(1);
    }
  });
});
