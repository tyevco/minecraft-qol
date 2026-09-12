import { describe, expect, it } from "vitest";
import { FALLING_SPEED, GLIDE_SPEED, MAX_ASSIST, glide } from "../scripts/core/glide";

/** Free fall, tick by tick, with the glide allowed to push back each tick. */
function fall(from: number, ticks: number, enabled = true): number[] {
  // Vanilla-ish: gravity pulls about 0.08 blocks/tick/tick, drag takes 2%.
  const seen: number[] = [];
  let vy = from;
  for (let t = 0; t < ticks; t++) {
    vy = (vy - 0.08) * 0.98;
    vy += glide(vy, false, enabled).impulseY;
    seen.push(vy);
  }
  return seen;
}

describe("glide", () => {
  it("leaves a hatchling on the ground alone", () => {
    expect(glide(-3, true, true)).toEqual({ gliding: false, impulseY: 0 });
  });

  it("does nothing when the panel switch is off", () => {
    expect(glide(-3, false, false)).toEqual({ gliding: false, impulseY: 0 });
  });

  it("never fights a jump: it only ever pushes up, and only while falling", () => {
    for (const vy of [1, 0.42, 0.1, 0, -FALLING_SPEED / 2])
      expect(glide(vy, false, true)).toEqual({ gliding: false, impulseY: 0 });
  });

  it("spreads its wings as soon as it is really falling", () => {
    const action = glide(-0.5, false, true);
    expect(action.gliding).toBe(true);
    expect(action.impulseY).toBeGreaterThan(0);
  });

  it("holds a fall at the glide speed without stopping dead", () => {
    // Already at the glide speed: wings out, but nothing to correct.
    expect(glide(-GLIDE_SPEED, false, true)).toEqual({ gliding: true, impulseY: 0 });
    // Falling slowly, still under the glide speed: nothing to correct either.
    expect(glide(-(GLIDE_SPEED - 0.05), false, true).impulseY).toBe(0);
  });

  it("catches a long fall over several ticks rather than in one", () => {
    // Terminal velocity is about -3.9: a single impulse that big would fling
    // the hatchling back up. The clamp is what makes it a swoop.
    expect(glide(-3.9, false, true).impulseY).toBe(MAX_ASSIST);
  });

  it("brings a plummet down to a drift, and keeps it there", () => {
    const speeds = fall(0, 60);
    const settled = speeds.slice(20);
    for (const vy of settled) {
      expect(vy).toBeLessThan(0); // still going down, never launched upwards
      expect(vy).toBeGreaterThan(-GLIDE_SPEED - 0.15);
    }
  });

  it("is the difference between a drift and a plummet", () => {
    const glided = fall(0, 60).at(-1)!;
    const plain = fall(0, 60, false).at(-1)!;
    expect(glided).toBeGreaterThan(plain + 2);
  });

  it("ignores a velocity the engine could not give it", () => {
    expect(glide(NaN, false, true)).toEqual({ gliding: false, impulseY: 0 });
    expect(glide(Number.NEGATIVE_INFINITY, false, true)).toEqual({
      gliding: false,
      impulseY: 0,
    });
  });
});
