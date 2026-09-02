import { describe, expect, it } from "vitest";
import {
  CAULDRON_RULES,
  MAX_LEVEL,
  type CauldronState,
  type ItemRef,
} from "@qol/shared/core/fluids";
import {
  applyWear,
  fillOne,
  plan,
  type Endpoint,
  type Policy,
} from "../scripts/core/machine";

const water = (level: number): CauldronState => ({ fluid: "water", level });
const lava = (level: number): CauldronState => ({ fluid: "lava", level });
const empty: CauldronState = { fluid: "empty", level: 0 };
const tank = (state: CauldronState): Endpoint => ({ kind: "cauldron", state });
const item = (typeId: string, amount = 1): ItemRef => ({ typeId, amount });
const chest = (...items: (ItemRef | undefined)[]): Endpoint => ({
  kind: "container",
  items,
});

const ALL: Policy = {
  rules: {
    cauldron_concrete: true,
    cauldron_buckets: true,
    cauldron_bottles: true,
    cauldron_dye: true,
    cauldron_wash: true,
  },
  transfer: true,
  rain: true,
  concretePerLevel: 16,
};
const ctx = (wear = 0, raining = false) => ({ wear, raining });
const run = (input: Endpoint, output: Endpoint, c = ctx(), policy = ALL) =>
  plan(input, output, c, policy, CAULDRON_RULES);

describe("fillOne", () => {
  it("starts an empty tank at one level", () => {
    expect(fillOne(empty, "water")).toEqual(water(1));
  });
  it("adds one to the same fluid and refuses a full tank or a different fluid", () => {
    expect(fillOne(water(3), "water")).toEqual(water(4));
    expect(fillOne(water(MAX_LEVEL), "water")).toBeUndefined();
    expect(fillOne(lava(2), "water")).toBeUndefined();
  });
});

describe("applyWear", () => {
  it("does nothing under the threshold", () => {
    expect(applyWear(water(3), 15, 16)).toEqual({
      cauldron: water(3),
      wear: 15,
    });
  });
  it("drains one level at the threshold and keeps the remainder", () => {
    expect(applyWear(water(3), 16, 16)).toEqual({
      cauldron: water(2),
      wear: 0,
    });
    expect(applyWear(water(1), 17, 16)).toEqual({ cauldron: empty, wear: 1 });
  });
  it("treats a threshold below one as one", () => {
    expect(applyWear(water(2), 1, 0)).toEqual({ cauldron: water(1), wear: 0 });
  });
});

describe("plan: nothing without a tank at the spout", () => {
  it("is idle for any input when the output is not a cauldron", () => {
    for (const input of [
      chest(item("minecraft:red_concrete_powder")),
      { kind: "source", fluid: "water" } as Endpoint,
      { kind: "sky" } as Endpoint,
    ]) {
      expect(run(input, { kind: "other" })).toEqual({ kind: "idle" });
      expect(run(input, chest())).toEqual({ kind: "idle" });
    }
  });
});

describe("plan: processing items from a container", () => {
  it("picks the first slot any enabled rule accepts", () => {
    const p = run(
      chest(
        undefined,
        item("minecraft:sand"),
        item("minecraft:lime_concrete_powder", 12),
      ),
      tank(water(3)),
    );
    expect(p.kind).toBe("process");
    if (p.kind !== "process") throw new Error();
    expect(p.slot).toBe(2);
    expect(p.ruleId).toBe("cauldron_concrete");
    expect(p.result.output).toEqual({
      mode: "new",
      typeId: "minecraft:lime_concrete",
      amount: 1,
    });
    expect(p.cauldron).toEqual(water(3));
    expect(p.wear).toBe(1);
  });

  it("drains a level once wear reaches the panel's threshold", () => {
    const p = run(
      chest(item("minecraft:red_concrete_powder")),
      tank(water(3)),
      ctx(15),
    );
    if (p.kind !== "process") throw new Error();
    expect(p.cauldron).toEqual(water(2));
    expect(p.wear).toBe(0);
  });

  it("respects the per-machine toggles", () => {
    const off = { ...ALL, rules: { ...ALL.rules, cauldron_concrete: false } };
    expect(
      run(
        chest(item("minecraft:red_concrete_powder")),
        tank(water(3)),
        ctx(),
        off,
      ),
    ).toEqual({ kind: "idle" });
  });

  it("runs the shared rules unchanged: a water bucket fills the tank", () => {
    const p = run(chest(item("minecraft:water_bucket")), tank(empty));
    if (p.kind !== "process") throw new Error();
    expect(p.cauldron).toEqual(water(MAX_LEVEL));
    expect(p.result.output).toEqual({
      mode: "new",
      typeId: "minecraft:bucket",
      amount: 1,
    });
    expect(p.wear).toBe(0);
  });

  it("is idle when nothing in the container applies", () => {
    expect(
      run(chest(item("minecraft:sand"), undefined), tank(water(3))),
    ).toEqual({ kind: "idle" });
    expect(run(chest(), tank(water(3)))).toEqual({ kind: "idle" });
  });
});

describe("plan: fluid transfer", () => {
  it("fills one level per cycle from a source block", () => {
    expect(run({ kind: "source", fluid: "water" }, tank(empty))).toEqual({
      kind: "fill",
      dest: water(1),
      sound: "bucket.empty_water",
    });
    expect(run({ kind: "source", fluid: "lava" }, tank(lava(5)))).toEqual({
      kind: "fill",
      dest: lava(6),
      sound: "bucket.empty_lava",
    });
  });

  it("refuses to mix or overfill from a source", () => {
    expect(run({ kind: "source", fluid: "lava" }, tank(water(2)))).toEqual({
      kind: "idle",
    });
    expect(
      run({ kind: "source", fluid: "water" }, tank(water(MAX_LEVEL))),
    ).toEqual({ kind: "idle" });
  });

  it("moves one level from tank to tank", () => {
    expect(run(tank(water(3)), tank(empty))).toEqual({
      kind: "move",
      src: water(2),
      dest: water(1),
    });
    expect(run(tank(water(1)), tank(water(2)))).toEqual({
      kind: "move",
      src: empty,
      dest: water(3),
    });
  });

  it("does not move from an empty tank, into a full one, or across fluids", () => {
    expect(run(tank(empty), tank(water(1)))).toEqual({ kind: "idle" });
    expect(run(tank(water(3)), tank(water(MAX_LEVEL)))).toEqual({
      kind: "idle",
    });
    expect(run(tank(lava(3)), tank(water(1)))).toEqual({ kind: "idle" });
  });

  it("is off when the panel says so", () => {
    const off = { ...ALL, transfer: false };
    expect(
      run({ kind: "source", fluid: "water" }, tank(empty), ctx(), off),
    ).toEqual({ kind: "idle" });
    expect(run(tank(water(3)), tank(empty), ctx(), off)).toEqual({
      kind: "idle",
    });
  });
});

describe("plan: rain collector", () => {
  it("fills with water only while it rains", () => {
    expect(run({ kind: "sky" }, tank(empty), ctx(0, true))).toEqual({
      kind: "fill",
      dest: water(1),
      sound: "bucket.empty_water",
    });
    expect(run({ kind: "sky" }, tank(empty), ctx(0, false))).toEqual({
      kind: "idle",
    });
  });
  it("never rains into lava, and stops at full", () => {
    expect(run({ kind: "sky" }, tank(lava(1)), ctx(0, true))).toEqual({
      kind: "idle",
    });
    expect(run({ kind: "sky" }, tank(water(MAX_LEVEL)), ctx(0, true))).toEqual({
      kind: "idle",
    });
  });
  it("is off when the panel says so", () => {
    expect(
      run({ kind: "sky" }, tank(empty), ctx(0, true), { ...ALL, rain: false }),
    ).toEqual({ kind: "idle" });
  });
});
