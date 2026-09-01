import { describe, it, expect } from "vitest";
import { makeGrid, toIndex, l1, type Grid } from "../scripts/core/grid";
import { Flooder, TORCH_REACH, TORCH_EMISSION } from "../scripts/core/lighting";
import { solveSync } from "../scripts/core/solver";

/** Build a grid where every cell is passable, then carve walls in. */
function openGrid(spanX: number, spanY: number, spanZ: number): Grid {
  const grid = makeGrid(spanX, spanY, spanZ);
  grid.passable.fill(1);
  return grid;
}

const block = (grid: Grid, x: number, y: number, z: number) => {
  grid.passable[toIndex(grid, x, y, z)] = 0;
};

describe("torch arithmetic", () => {
  it("reaches exactly 13 steps, matching the measured torch", () => {
    // Emission 14, losing 1 per step, so light is 1 at distance 13 and 0 at 14.
    // Spawning needs block light exactly 0, so 13 is the true coverage radius.
    expect(TORCH_EMISSION).toBe(14);
    expect(TORCH_REACH).toBe(13);
  });
});

describe("flood fill", () => {
  it("measures taxicab distance in open space, not Euclidean", () => {
    const grid = openGrid(21, 1, 21);
    const flooder = new Flooder(grid);
    const dist = flooder.run(toIndex(grid, 10, 0, 10), 20);
    // A diagonal neighbour is 2 steps away, not 1.4.
    expect(dist[toIndex(grid, 11, 0, 11)]).toBe(2);
    expect(dist[toIndex(grid, 10, 0, 15)]).toBe(5);
    expect(dist[toIndex(grid, 13, 0, 14)]).toBe(7);
  });

  it("respects maxDepth", () => {
    const grid = openGrid(41, 1, 41);
    const dist = new Flooder(grid).run(toIndex(grid, 20, 0, 20), TORCH_REACH);
    expect(dist[toIndex(grid, 20, 0, 33)]).toBe(13); // exactly at reach
    expect(dist[toIndex(grid, 20, 0, 34)]).toBe(-1); // one beyond
  });

  it("does not pass through solid blocks", () => {
    const grid = openGrid(5, 1, 3);
    for (let z = 0; z < 3; z++) block(grid, 2, 0, z); // full wall at x=2
    const dist = new Flooder(grid).run(toIndex(grid, 0, 0, 1), 20);
    expect(dist[toIndex(grid, 1, 0, 1)]).toBe(1);
    expect(dist[toIndex(grid, 3, 0, 1)]).toBe(-1); // sealed off
  });

  it("does not leak across the volume edge via index wrapping", () => {
    // The classic flat-array bug: adding a stride at x=0 lands at x=spanX-1.
    const grid = openGrid(4, 1, 4);
    const dist = new Flooder(grid).run(toIndex(grid, 0, 0, 0), 20);
    expect(dist[toIndex(grid, 3, 0, 0)]).toBe(3); // the long way round the axis
    expect(dist[toIndex(grid, 0, 0, 3)]).toBe(3);
  });

  it("goes around corners, costing more than the straight-line guess", () => {
    // L-shaped corridor: L1 says 4, the real path is 8.
    const grid = makeGrid(7, 1, 7);
    const carve = (x: number, z: number) => (grid.passable[toIndex(grid, x, 0, z)] = 1);
    for (let x = 1; x <= 5; x++) carve(x, 1); // along the top
    for (let z = 1; z <= 5; z++) carve(5, z); // down the right
    const from = { x: 1, y: 0, z: 1 };
    const to = { x: 5, y: 0, z: 5 };
    expect(l1(from, to)).toBe(8);
    const dist = new Flooder(grid).run(toIndex(grid, 1, 0, 1), 30);
    expect(dist[toIndex(grid, 5, 0, 5)]).toBe(8);
  });
});

describe("solver", () => {
  it("covers an open floor with a single torch when one suffices", () => {
    const grid = openGrid(11, 1, 11);
    const targets = [toIndex(grid, 0, 0, 0), toIndex(grid, 10, 0, 10)];
    const candidates = [toIndex(grid, 5, 0, 5)];
    const result = solveSync(grid, targets, candidates);
    expect(result.picks).toHaveLength(1);
    expect(result.uncovered).toEqual([]);
  });

  it("NEVER suggests a torch whose light a wall blocks", () => {
    // Two sealed rooms either side of a wall. The candidate in room A is 2
    // blocks from the target in room B by taxicab - a naive radius solver would
    // happily suggest it, the player would place it, and nothing would change.
    const grid = makeGrid(5, 1, 1);
    grid.passable[toIndex(grid, 0, 0, 0)] = 1;
    grid.passable[toIndex(grid, 1, 0, 0)] = 1;
    grid.passable[toIndex(grid, 2, 0, 0)] = 0; // wall
    grid.passable[toIndex(grid, 3, 0, 0)] = 1;
    grid.passable[toIndex(grid, 4, 0, 0)] = 1;

    const targetInB = toIndex(grid, 4, 0, 0);
    const candidateInA = toIndex(grid, 0, 0, 0);

    // The optimistic bound would claim it: taxicab distance is only 4.
    expect(l1({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 })).toBeLessThanOrEqual(TORCH_REACH);

    const result = solveSync(grid, [targetInB], [candidateInA]);
    expect(result.picks).toEqual([]);
    expect(result.uncovered).toEqual([targetInB]);
  });

  it("reports unreachable targets instead of silently dropping them", () => {
    const grid = makeGrid(3, 1, 1);
    grid.passable[toIndex(grid, 0, 0, 0)] = 1;
    grid.passable[toIndex(grid, 1, 0, 0)] = 0; // sealed
    grid.passable[toIndex(grid, 2, 0, 0)] = 1;
    const result = solveSync(grid, [toIndex(grid, 2, 0, 0)], [toIndex(grid, 0, 0, 0)]);
    expect(result.uncovered).toHaveLength(1);
  });

  it("does not light a sealed room from the floor above", () => {
    // y=0 room, y=1 ceiling, y=2 corridor. A torch upstairs helps nobody below.
    const grid = makeGrid(1, 3, 1);
    grid.passable[toIndex(grid, 0, 0, 0)] = 1;
    grid.passable[toIndex(grid, 0, 1, 0)] = 0; // ceiling
    grid.passable[toIndex(grid, 0, 2, 0)] = 1;
    const result = solveSync(grid, [toIndex(grid, 0, 0, 0)], [toIndex(grid, 0, 2, 0)]);
    expect(result.picks).toEqual([]);
  });

  it("prefers the candidate covering the most, as greedy requires", () => {
    const grid = openGrid(60, 1, 1);
    // Three targets clustered left, one far right.
    const targets = [
      toIndex(grid, 0, 0, 0),
      toIndex(grid, 1, 0, 0),
      toIndex(grid, 2, 0, 0),
      toIndex(grid, 59, 0, 0),
    ];
    const nearCluster = toIndex(grid, 1, 0, 0);
    const nearFar = toIndex(grid, 59, 0, 0);
    const result = solveSync(grid, targets, [nearFar, nearCluster], { maxPicks: 1 });
    expect(result.picks[0]?.candidate).toBe(nearCluster);
    expect(result.picks[0]?.covered).toHaveLength(3);
  });

  it("honours maxPicks and leaves the rest reported", () => {
    const grid = openGrid(90, 1, 1);
    const targets = [toIndex(grid, 0, 0, 0), toIndex(grid, 45, 0, 0), toIndex(grid, 89, 0, 0)];
    const candidates = targets.slice();
    const result = solveSync(grid, targets, candidates, { maxPicks: 1 });
    expect(result.picks).toHaveLength(1);
    expect(result.uncovered.length).toBeGreaterThan(0);
  });

  it("never double-counts a target across picks", () => {
    const grid = openGrid(60, 1, 1);
    const targets = [toIndex(grid, 0, 0, 0), toIndex(grid, 30, 0, 0), toIndex(grid, 59, 0, 0)];
    const candidates = targets.slice();
    const result = solveSync(grid, targets, candidates, { maxPicks: 8 });
    const all = result.picks.flatMap((p) => p.covered);
    expect(new Set(all).size).toBe(all.length);
  });

  it("matches exhaustive greedy on a random occluded grid", () => {
    // The lazy ordering must not change the outcome. Build a maze-ish grid and
    // compare against a deliberately naive exact-greedy implementation.
    const grid = openGrid(15, 1, 15);
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let x = 0; x < 15; x++) {
      for (let z = 0; z < 15; z++) if (rand() < 0.25) block(grid, x, 0, z);
    }

    const open: number[] = [];
    for (let x = 0; x < 15; x++) {
      for (let z = 0; z < 15; z++) {
        const i = toIndex(grid, x, 0, z);
        if (grid.passable[i]) open.push(i);
      }
    }
    const targets = open.filter((_, n) => n % 3 === 0);
    const candidates = open;

    const lazy = solveSync(grid, targets, candidates, { reach: 4, maxPicks: 5 });

    // Exact greedy: flood every candidate every round, pick the true argmax.
    const flooder = new Flooder(grid);
    const remaining = new Set(targets);
    const exactPicks: number[] = [];
    for (let round = 0; round < 5 && remaining.size > 0; round++) {
      let bestCand = -1;
      let bestGain = 0;
      for (const c of candidates) {
        const dist = flooder.run(c, 4);
        let gain = 0;
        for (const t of remaining) {
          const d = dist[t]!;
          if (d >= 0 && d <= 4) gain++;
        }
        if (gain > bestGain) {
          bestGain = gain;
          bestCand = c;
        }
      }
      if (bestCand < 0) break;
      const dist = flooder.run(bestCand, 4);
      for (const t of [...remaining]) {
        const d = dist[t]!;
        if (d >= 0 && d <= 4) remaining.delete(t);
      }
      exactPicks.push(bestCand);
    }

    // Same number of picks, and the same set of targets left over.
    expect(lazy.picks.length).toBe(exactPicks.length);
    expect(lazy.uncovered.length).toBe(remaining.size);
  });

  it("handles empty inputs without throwing", () => {
    const grid = openGrid(3, 1, 3);
    expect(solveSync(grid, [], [toIndex(grid, 0, 0, 0)]).picks).toEqual([]);
    expect(solveSync(grid, [toIndex(grid, 0, 0, 0)], []).uncovered).toHaveLength(1);
  });
});
