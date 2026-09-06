import { describe, expect, it } from "vitest";
import { BUILDINGS } from "../buildings";

/**
 * A blueprint must be buildable block by block, not only placeable whole:
 * `structureManager.place` sets every cell at once and skips the game's
 * support checks, but the builder sets one cell at a time and each gets
 * them. Measured on the inn (docs/settlements-results.md): a ladder whose
 * wall cell was a window pane placed fine by `place` and popped when placed
 * by the builder. So every ladder leans on a full block.
 */
const LADDER_WALL: Record<number, [number, number]> = { 2: [0, 1], 3: [0, -1], 4: [1, 0], 5: [-1, 0] };
const NOT_FULL = /pane|glass$|fence|gate|door|slab|stairs|wall$|ladder|lantern|torch|sign|carpet|bed$|water/;

describe("every blueprint is buildable block by block", () => {
  for (const bp of BUILDINGS) {
    it(`${bp.key}: each ladder leans on a full block`, () => {
      for (const b of bp.blocks()) {
        if (b.name !== "minecraft:ladder") continue;
        const d = LADDER_WALL[b.states.facing_direction as number];
        expect(d, `${bp.key}: ladder at ${b.x},${b.y},${b.z} has no facing`).toBeDefined();
        const behind = bp.at(b.x + d![0], b.y, b.z + d![1]);
        expect(behind, `${bp.key}: the ladder at ${b.x},${b.y},${b.z} has nothing behind it`).toBeDefined();
        expect(NOT_FULL.test(behind!), `${bp.key}: the ladder at ${b.x},${b.y},${b.z} leans on ${behind}, not a full block`).toBe(false);
      }
    });
  }
});
