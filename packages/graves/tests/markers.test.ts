import { describe, expect, it } from "vitest";
import {
  graveKey,
  graveMarkers,
  isGraveKey,
  type GraveRef,
} from "../scripts/core/markers";

const OW = "minecraft:overworld";
const NETHER = "minecraft:nether";

const grave = (id: string, owner: string, dimId = OW, x = 0): GraveRef => ({
  id,
  owner,
  dimId,
  x,
  y: 64,
  z: 0,
});

describe("graveMarkers", () => {
  const stones = [
    grave("a", "kid", OW, 10),
    grave("b", "kid", NETHER, 20),
    grave("c", "parent", OW, 30),
  ];

  it("marks only the player's own stones", () => {
    const keys = graveMarkers(stones, "kid", OW, true).map((m) => m.key);
    expect(keys).toEqual([graveKey("a")]);
  });

  it("marks every stone the player has in this dimension", () => {
    const two = [...stones, grave("d", "kid", OW, 40)];
    expect(graveMarkers(two, "kid", OW, true).map((m) => m.key).sort()).toEqual([
      graveKey("a"),
      graveKey("d"),
    ]);
  });

  it("withholds a stone in another dimension rather than pointing the wrong way", () => {
    expect(graveMarkers(stones, "kid", NETHER, true).map((m) => m.key)).toEqual([
      graveKey("b"),
    ]);
  });

  it("marks nothing when the panel says so", () => {
    expect(graveMarkers(stones, "kid", OW, false)).toEqual([]);
  });

  it("carries the stone's position through untouched", () => {
    const [only] = graveMarkers([grave("z", "kid", OW, -123)], "kid", OW, true);
    expect(only).toEqual({ key: graveKey("z"), dimId: OW, x: -123, y: 64, z: 0 });
  });
});

describe("keys", () => {
  it("are this pack's own and distinct per stone", () => {
    expect(isGraveKey(graveKey("1"))).toBe(true);
    expect(isGraveKey("hs:bed")).toBe(false);
    expect(graveKey("1")).not.toBe(graveKey("2"));
  });
});
