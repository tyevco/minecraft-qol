import { describe, expect, it } from "vitest";
import {
  AMMO_CAP,
  AMMO_ITEM,
  EVENT_ARM,
  EVENT_DISARM,
  acceptFeed,
  armEvent,
  consumeShot,
  isArmed,
  planPull,
  type Slot,
} from "../scripts/core/ammo";

const arrows = (n: number): Slot => [AMMO_ITEM, n];
const other = (n: number): Slot => ["minecraft:cobblestone", n];

describe("planPull", () => {
  it("takes nothing from an empty hopper", () => {
    expect(planPull(0, [null, null, null, null, null])).toEqual({ takes: [], ammo: 0 });
  });

  it("ignores everything that is not an arrow", () => {
    expect(planPull(0, [other(64), ["minecraft:spectral_arrow", 8], null])).toEqual({
      takes: [],
      ammo: 0,
    });
  });

  it("takes a whole stack when there is room", () => {
    expect(planPull(0, [arrows(16)])).toEqual({ takes: [{ slot: 0, amount: 16 }], ammo: 16 });
  });

  it("stops exactly at the cap, splitting the last slot", () => {
    const plan = planPull(50, [arrows(10), arrows(10)]);
    expect(plan.ammo).toBe(AMMO_CAP);
    expect(plan.takes).toEqual([
      { slot: 0, amount: 10 },
      { slot: 1, amount: 4 },
    ]);
  });

  it("takes nothing when already full", () => {
    expect(planPull(AMMO_CAP, [arrows(64)])).toEqual({ takes: [], ammo: AMMO_CAP });
  });

  it("never overshoots when the buffer is somehow over the cap", () => {
    expect(planPull(AMMO_CAP + 5, [arrows(64)])).toEqual({ takes: [], ammo: AMMO_CAP + 5 });
  });

  it("honours a per-pull limit", () => {
    const plan = planPull(0, [arrows(64)], AMMO_CAP, 8);
    expect(plan).toEqual({ takes: [{ slot: 0, amount: 8 }], ammo: 8 });
  });

  it("skips empty and foreign slots without losing its place", () => {
    const plan = planPull(0, [null, other(3), arrows(5), null, arrows(7)]);
    expect(plan.takes).toEqual([
      { slot: 2, amount: 5 },
      { slot: 4, amount: 7 },
    ]);
    expect(plan.ammo).toBe(12);
  });

  it("is exhaustive: total taken always equals min(available, room)", () => {
    for (let ammo = 0; ammo <= AMMO_CAP; ammo += 7) {
      for (let a = 0; a <= 64; a += 9) {
        for (let b = 0; b <= 64; b += 11) {
          const plan = planPull(ammo, [arrows(a), other(5), arrows(b)]);
          const taken = plan.takes.reduce((n, t) => n + t.amount, 0);
          expect(taken).toBe(Math.min(a + b, AMMO_CAP - ammo));
          expect(plan.ammo).toBe(ammo + taken);
          for (const t of plan.takes) expect(t.amount).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("acceptFeed", () => {
  it("accepts arrows up to the cap", () => {
    expect(acceptFeed(60, { typeId: AMMO_ITEM, amount: 16 })).toEqual({ accepted: 4, ammo: 64 });
    expect(acceptFeed(0, { typeId: AMMO_ITEM, amount: 16 })).toEqual({ accepted: 16, ammo: 16 });
  });

  it("rejects an empty hand, other items, and a full buffer", () => {
    expect(acceptFeed(10, undefined)).toEqual({ accepted: 0, ammo: 10 });
    expect(acceptFeed(10, { typeId: "minecraft:bow", amount: 1 })).toEqual({ accepted: 0, ammo: 10 });
    expect(acceptFeed(AMMO_CAP, { typeId: AMMO_ITEM, amount: 1 })).toEqual({
      accepted: 0,
      ammo: AMMO_CAP,
    });
  });
});

describe("shots and arming", () => {
  it("consumes one arrow per shot and never goes negative", () => {
    expect(consumeShot(3)).toBe(2);
    expect(consumeShot(1)).toBe(0);
    expect(consumeShot(0)).toBe(0);
  });

  it("is armed exactly when there is ammo", () => {
    expect(isArmed(0)).toBe(false);
    expect(isArmed(1)).toBe(true);
  });

  it("fires an event only when the entity's state disagrees with the ammo", () => {
    expect(armEvent(5, true)).toBeUndefined();
    expect(armEvent(0, false)).toBeUndefined();
    expect(armEvent(5, false)).toBe(EVENT_ARM);
    expect(armEvent(0, true)).toBe(EVENT_DISARM);
  });

  it("fires the correct event when the entity's state is unknown", () => {
    expect(armEvent(5, undefined)).toBe(EVENT_ARM);
    expect(armEvent(0, undefined)).toBe(EVENT_DISARM);
  });
});
