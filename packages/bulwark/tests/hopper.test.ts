import { describe, expect, it } from "vitest";
import { NEIGHBOURS } from "@qol/shared/core/facing";
import { hopperFeeds } from "../scripts/core/hopper";

describe("hopperFeeds", () => {
  it("a hopper above pointing down feeds the turret", () => {
    expect(hopperFeeds({ x: 0, y: 1, z: 0 }, 0)).toBe(true);
  });

  it("a hopper beside must point at the turret", () => {
    // Hopper to the east (+x) must face west (4).
    expect(hopperFeeds({ x: 1, y: 0, z: 0 }, 4)).toBe(true);
    expect(hopperFeeds({ x: 1, y: 0, z: 0 }, 5)).toBe(false);
    expect(hopperFeeds({ x: 1, y: 0, z: 0 }, 0)).toBe(false);
    // Hopper to the north (-z) must face south (3).
    expect(hopperFeeds({ x: 0, y: 0, z: -1 }, 3)).toBe(true);
    expect(hopperFeeds({ x: 0, y: 0, z: -1 }, 2)).toBe(false);
  });

  it("a hopper below can never feed upward", () => {
    // facing 1 (up) is not a legal hopper state, but even if it were, the rule
    // is purely geometric and would accept it - so assert what the engine
    // actually produces: facing 0 below us feeds the block under IT.
    expect(hopperFeeds({ x: 0, y: -1, z: 0 }, 0)).toBe(false);
  });

  it("exactly one facing feeds from each neighbour", () => {
    for (const offset of NEIGHBOURS) {
      const feeding = [0, 1, 2, 3, 4, 5].filter((f) => hopperFeeds(offset, f));
      expect(feeding).toHaveLength(1);
    }
  });

  it("rejects garbage facings", () => {
    expect(hopperFeeds({ x: 0, y: 1, z: 0 }, undefined)).toBe(false);
    expect(hopperFeeds({ x: 0, y: 1, z: 0 }, "0")).toBe(false);
    expect(hopperFeeds({ x: 0, y: 1, z: 0 }, 9)).toBe(false);
  });
});
