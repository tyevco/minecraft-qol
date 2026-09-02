import { describe, expect, it } from "vitest";
import { belowWorld, chooseRescue, DEFAULT_RESCUE } from "../scripts/core/rescue";

const OVERWORLD = { min: -64, max: 320 };
const END = { min: 0, max: 256 };

describe("belowWorld", () => {
  it("needs the margin, so clipping the floor does not count", () => {
    expect(belowWorld(-64, OVERWORLD)).toBe(false);
    expect(belowWorld(-65, OVERWORLD)).toBe(false);
    expect(belowWorld(-66.5, OVERWORLD)).toBe(true);
  });

  it("uses the dimension's own floor", () => {
    expect(belowWorld(-3, END)).toBe(true);
    expect(belowWorld(-3, OVERWORLD)).toBe(false);
  });
});

describe("chooseRescue", () => {
  const ledge = { pos: { x: 100.4, y: 64.2, z: 100.6 }, tick: 900 };
  const spawn = { x: 0, y: 70, z: 0 };

  it("prefers where they last stood", () => {
    expect(chooseRescue(END, 1000, ledge, spawn)).toEqual({ pos: ledge.pos, source: "ground" });
  });

  it("trusts a sample as old as the longest fall in the game", () => {
    expect(chooseRescue(END, 900 + DEFAULT_RESCUE.maxAgeTicks, ledge, undefined)?.source).toBe(
      "ground",
    );
  });

  it("falls back to the spawn point when the sample is stale", () => {
    expect(chooseRescue(END, 900 + DEFAULT_RESCUE.maxAgeTicks + 1, ledge, spawn)).toEqual({
      pos: spawn,
      source: "spawn",
    });
  });

  it("falls back to the spawn point when there is no sample at all", () => {
    // A /reload mid-fall: the tracker starts empty.
    expect(chooseRescue(END, 1000, undefined, spawn)).toEqual({ pos: spawn, source: "spawn" });
  });

  it("never puts a player somewhere outside the world", () => {
    const belowFloor = { pos: { x: 0, y: -5, z: 0 }, tick: 999 };
    expect(chooseRescue(END, 1000, belowFloor, { x: 0, y: -10, z: 0 })).toBeUndefined();
    expect(chooseRescue(END, 1000, belowFloor, spawn)?.source).toBe("spawn");
  });

  it("gives up rather than guess", () => {
    expect(chooseRescue(END, 1000, undefined, undefined)).toBeUndefined();
  });
});
