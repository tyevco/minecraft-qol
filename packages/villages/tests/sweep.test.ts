import { describe, expect, it } from "vitest";
import { planSweep, type Presence } from "../scripts/core/sweep";
import { FRESH, type PostRecord } from "../scripts/core/record";

const at = (x: number, y = 64, z = 0): PostRecord => ({
  dimId: "minecraft:overworld",
  x,
  y,
  z,
  people: 0,
  job: 0,
  ...FRESH,
});

/** Look the rows up by x, so a test reads as a little world. */
const world = (byX: Record<number, Presence>) => (row: PostRecord): Presence => byX[row.x] ?? "post";

const xs = (rows: readonly PostRecord[]): number[] => rows.map((r) => r.x);

describe("planSweep", () => {
  it("retires a row whose block is gone and keeps the one that is there", () => {
    const rows = [at(0), at(1), at(2)];
    const plan = planSweep(rows, 0, 10, world({ 1: "gone" }));
    expect(xs(plan.retire)).toEqual([1]);
    expect(xs(plan.checked)).toEqual([0, 1, 2]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips, never evicts, an unloaded chunk (CLAUDE.md rule 6)", () => {
    const rows = [at(0), at(1)];
    const plan = planSweep(rows, 0, 10, world({ 0: "unloaded", 1: "unloaded" }));
    expect(plan.retire).toEqual([]);
    expect(xs(plan.skipped)).toEqual([0, 1]);
  });

  it("tells an unloaded post apart from a gone one in the same sweep", () => {
    const rows = [at(0), at(1), at(2)];
    const plan = planSweep(rows, 0, 10, world({ 0: "unloaded", 2: "gone" }));
    expect(xs(plan.retire)).toEqual([2]);
    expect(xs(plan.skipped)).toEqual([0]);
  });

  it("looks at no more than the budget, and leaves the cursor where it stopped", () => {
    const rows = [at(0), at(1), at(2), at(3)];
    const plan = planSweep(rows, 0, 2, world({}));
    expect(xs(plan.checked)).toEqual([0, 1]);
    expect(plan.next).toBe(2);
  });

  it("carries on from the cursor and wraps round the end", () => {
    const rows = [at(0), at(1), at(2), at(3)];
    const plan = planSweep(rows, 3, 2, world({}));
    expect(xs(plan.checked)).toEqual([3, 0]);
    expect(plan.next).toBe(1);
  });

  it("reaches every row over enough sweeps, and only once each", () => {
    const rows = [at(0), at(1), at(2), at(3), at(4)];
    const seen: number[] = [];
    let cursor = 0;
    for (let i = 0; i < 3; i++) {
      const plan = planSweep(rows, cursor, 2, world({}));
      seen.push(...xs(plan.checked));
      cursor = plan.next;
    }
    // Three sweeps of two over five rows: every row once, then the first again.
    expect(seen.slice(0, 5).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("never looks at a row twice in one sweep, however large the budget", () => {
    const rows = [at(0), at(1), at(2)];
    const plan = planSweep(rows, 1, 99, world({}));
    expect(xs(plan.checked).sort()).toEqual([0, 1, 2]);
    expect(plan.next).toBe(1);
  });

  it("does nothing with an empty index, and parks the cursor at zero", () => {
    expect(planSweep([], 7, 10, world({}))).toEqual({ checked: [], retire: [], skipped: [], next: 0 });
  });

  it("looks at nothing when the budget is zero or less", () => {
    const rows = [at(0), at(1)];
    for (const budget of [0, -1]) {
      const plan = planSweep(rows, 1, budget, world({ 0: "gone", 1: "gone" }));
      expect(plan.checked).toEqual([]);
      expect(plan.retire).toEqual([]);
      expect(plan.next).toBe(1);
    }
  });

  it("starts over when the index shrank past the cursor, rather than skipping rows", () => {
    const rows = [at(0), at(1)];
    const plan = planSweep(rows, 9, 1, world({}));
    expect(xs(plan.checked)).toEqual([0]);
  });

  it("starts over on a cursor that is negative or not whole", () => {
    const rows = [at(0), at(1)];
    expect(xs(planSweep(rows, -3, 1, world({})).checked)).toEqual([0]);
    expect(xs(planSweep(rows, 1.5, 1, world({})).checked)).toEqual([0]);
  });

  it("retires the whole index when every post is gone", () => {
    const rows = [at(0), at(1), at(2)];
    const plan = planSweep(rows, 0, 10, () => "gone");
    expect(xs(plan.retire)).toEqual([0, 1, 2]);
  });
});
