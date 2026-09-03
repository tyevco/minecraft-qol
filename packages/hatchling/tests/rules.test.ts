import { describe, expect, it } from "vitest";
import {
  cooldownRemaining,
  cracksFor,
  DEFAULT_POLICY,
  describeWait,
  feed,
  FOOD,
  parsePolicy,
  samePolicy,
  VARIANTS,
  variantById,
  variantOfEggItem,
  warm,
  type EggState,
  type PetState,
  type Policy,
} from "../scripts/core/rules";

const MIN = 60_000;
const T0 = 1_700_000_000_000;

const policy = (over: Partial<Policy> = {}): Policy => ({ ...DEFAULT_POLICY, ...over });

describe("variants", () => {
  it("map egg items to variants and back", () => {
    for (const v of VARIANTS) {
      expect(variantOfEggItem(v.eggItem)).toBe(v);
      expect(variantById(v.id)).toBe(v);
    }
    expect(variantOfEggItem("minecraft:egg")).toBeUndefined();
    expect(variantOfEggItem(undefined)).toBeUndefined();
    expect(variantById(7)).toBeUndefined();
  });

  it("each variant warms with something a kid can find in the Overworld", () => {
    const warmItems = new Set(VARIANTS.map((v) => v.warmItem));
    expect(warmItems.size).toBe(VARIANTS.length);
    for (const v of VARIANTS) expect(v.warmItem.startsWith("minecraft:")).toBe(true);
  });
});

describe("parsePolicy", () => {
  it("defaults on an empty panel", () => {
    expect(parsePolicy({})).toEqual(DEFAULT_POLICY);
  });

  it("reads sliders and the toggle, as numbers or strings", () => {
    const p = parsePolicy({
      "hatchling:warmings": 5,
      "hatchling:warm_cooldown": "2",
      "hatchling:feedings": "7",
      "hatchling:feed_cooldown": 0,
      "hatchling:anyone_tends": false,
    });
    expect(p).toEqual({
      warmingsToHatch: 5,
      warmCooldownMs: 2 * MIN,
      feedingsPerStage: 7,
      feedCooldownMs: 0,
      anyoneCanTend: false,
    });
  });

  it("clamps out-of-range values and falls back on garbage", () => {
    const p = parsePolicy({
      "hatchling:warmings": 99,
      "hatchling:warm_cooldown": -5,
      "hatchling:feedings": "lots",
      "hatchling:anyone_tends": "maybe",
    });
    expect(p.warmingsToHatch).toBe(6);
    expect(p.warmCooldownMs).toBe(0);
    expect(p.feedingsPerStage).toBe(DEFAULT_POLICY.feedingsPerStage);
    expect(p.anyoneCanTend).toBe(true);
  });

  it("samePolicy compares every field", () => {
    expect(samePolicy(DEFAULT_POLICY, parsePolicy({}))).toBe(true);
    expect(samePolicy(DEFAULT_POLICY, policy({ feedCooldownMs: 1 }))).toBe(false);
  });
});

describe("cooldowns", () => {
  it("is zero when never tended or the rest is off", () => {
    expect(cooldownRemaining(undefined, T0, 10 * MIN)).toBe(0);
    expect(cooldownRemaining(T0, T0, 0)).toBe(0);
  });

  it("counts down and never goes negative", () => {
    expect(cooldownRemaining(T0, T0 + 4 * MIN, 10 * MIN)).toBe(6 * MIN);
    expect(cooldownRemaining(T0, T0 + 11 * MIN, 10 * MIN)).toBe(0);
  });

  it("does not lock an egg forever if the clock went backwards", () => {
    expect(cooldownRemaining(T0 + 60 * MIN, T0, 10 * MIN)).toBe(10 * MIN);
  });

  it("describes a wait in whole minutes, never 'zero minutes'", () => {
    expect(describeWait(500)).toBe("a minute");
    expect(describeWait(MIN)).toBe("a minute");
    expect(describeWait(MIN + 1)).toBe("2 minutes");
    expect(describeWait(9.5 * MIN)).toBe("10 minutes");
  });
});

describe("warm", () => {
  const fresh: EggState = { variant: 1, warmings: 0, lastWarmAt: undefined };

  it("wants the variant's own item, and names it", () => {
    const r = warm(fresh, "minecraft:coal", T0, policy());
    expect(r).toEqual({ kind: "not_warm_item", wants: "bone meal" });
    expect(warm(fresh, undefined, T0, policy()).kind).toBe("not_warm_item");
  });

  it("cracks on the way to hatching with the default three warmings", () => {
    const p = policy();
    const w1 = warm(fresh, "minecraft:bone_meal", T0, p);
    expect(w1).toEqual({ kind: "warmed", warmings: 1, cracks: 1 });
    const w2 = warm({ ...fresh, warmings: 1, lastWarmAt: T0 }, "minecraft:bone_meal", T0 + 10 * MIN, p);
    expect(w2).toEqual({ kind: "warmed", warmings: 2, cracks: 2 });
    const w3 = warm({ ...fresh, warmings: 2, lastWarmAt: T0 }, "minecraft:bone_meal", T0 + 10 * MIN, p);
    expect(w3).toEqual({ kind: "hatch" });
  });

  it("rests between warmings", () => {
    const r = warm({ ...fresh, lastWarmAt: T0 }, "minecraft:bone_meal", T0 + 3 * MIN, policy());
    expect(r).toEqual({ kind: "cooldown", remainingMs: 7 * MIN });
  });

  it("hatches on the first warming when the panel says one", () => {
    expect(warm(fresh, "minecraft:bone_meal", T0, policy({ warmingsToHatch: 1 }))).toEqual({ kind: "hatch" });
  });

  it("spreads two crack stages over any number of warmings", () => {
    expect([1, 2, 3, 4, 5].map((w) => cracksFor(w, 6))).toEqual([1, 1, 1, 2, 2]);
    expect([1].map((w) => cracksFor(w, 2))).toEqual([1]);
    expect(cracksFor(3, 0)).toBe(2);
  });
});

describe("feed", () => {
  const owner = "p-owner";
  const bonded: PetState = { stage: 0, feedings: 0, lastFedAt: undefined, ownerId: owner };

  it("only counts sweet berries", () => {
    expect(feed(bonded, "minecraft:apple", owner, T0, policy())).toEqual({ kind: "not_food" });
    expect(feed(bonded, undefined, owner, T0, policy())).toEqual({ kind: "not_food" });
  });

  it("lets anyone feed by default, and only the owner when the panel says so", () => {
    expect(feed(bonded, FOOD, "p-sibling", T0, policy()).kind).toBe("fed");
    expect(feed(bonded, FOOD, "p-sibling", T0, policy({ anyoneCanTend: false }))).toEqual({ kind: "not_owner" });
    expect(feed(bonded, FOOD, owner, T0, policy({ anyoneCanTend: false })).kind).toBe("fed");
  });

  it("rests between feedings", () => {
    const r = feed({ ...bonded, lastFedAt: T0 }, FOOD, owner, T0 + MIN, policy());
    expect(r).toEqual({ kind: "cooldown", remainingMs: 14 * MIN });
  });

  it("grows a stage every feedingsPerStage feedings and resets the count", () => {
    const p = policy({ feedingsPerStage: 2, feedCooldownMs: 0 });
    expect(feed(bonded, FOOD, owner, T0, p)).toEqual({ kind: "fed", feedings: 1, toGo: 1 });
    expect(feed({ ...bonded, feedings: 1 }, FOOD, owner, T0, p)).toEqual({ kind: "grow", stage: 1 });
    expect(feed({ ...bonded, stage: 1, feedings: 1 }, FOOD, owner, T0, p)).toEqual({ kind: "grow", stage: 2 });
  });

  it("a grown hatchling still takes a treat, and never grows past the last stage", () => {
    expect(feed({ ...bonded, stage: 2, feedings: 9 }, FOOD, owner, T0, policy({ feedingsPerStage: 1 }))).toEqual({
      kind: "treat",
    });
  });
});
