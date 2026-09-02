import { describe, expect, it } from "vitest";
import { gravePosition, snapToBlock } from "../scripts/core/placement";

const OVERWORLD = { min: -64, max: 320 };

describe("snapToBlock", () => {
  it("centres x and z and floors y", () => {
    expect(snapToBlock({ x: 10.7, y: 64.9, z: -3.2 })).toEqual({
      x: 10.5,
      y: 64,
      z: -3.5,
    });
  });
});

describe("gravePosition", () => {
  it("uses the death spot when standing inside the world", () => {
    const p = gravePosition(
      { x: 1.2, y: 70.1, z: 2.9 },
      true,
      OVERWORLD,
      1000,
      undefined,
    );
    expect(p).toEqual({ x: 1.5, y: 70, z: 2.5 });
  });

  it("prefers recent ground for a void death", () => {
    const ground = { pos: { x: 100.4, y: 64.2, z: 100.6 }, tick: 900 };
    const p = gravePosition(
      { x: 103, y: -80, z: 100 },
      false,
      OVERWORLD,
      1000,
      ground,
    );
    expect(p).toEqual({ x: 100.5, y: 64, z: 100.5 });
  });

  it("prefers recent ground for a mid-air death", () => {
    const ground = { pos: { x: 0, y: 64, z: 0 }, tick: 990 };
    const p = gravePosition(
      { x: 4, y: 90, z: 4 },
      false,
      OVERWORLD,
      1000,
      ground,
    );
    expect(p).toEqual({ x: 0.5, y: 64, z: 0.5 });
  });

  it("ignores stale ground samples and clamps into the world", () => {
    const ground = { pos: { x: 0, y: 64, z: 0 }, tick: 100 };
    const p = gravePosition(
      { x: 4, y: -200, z: 4 },
      false,
      OVERWORLD,
      1000,
      ground,
    );
    expect(p).toEqual({ x: 4.5, y: -63, z: 4.5 });
  });

  it("clamps a death above the ceiling", () => {
    const p = gravePosition(
      { x: 0, y: 400, z: 0 },
      false,
      OVERWORLD,
      1000,
      undefined,
    );
    expect(p.y).toBe(318);
  });

  it("never trusts a ground sample outside the world", () => {
    const ground = { pos: { x: 0, y: -100, z: 0 }, tick: 999 };
    const p = gravePosition(
      { x: 4, y: -70, z: 4 },
      false,
      OVERWORLD,
      1000,
      ground,
    );
    expect(p).toEqual({ x: 4.5, y: -63, z: 4.5 });
  });
});
