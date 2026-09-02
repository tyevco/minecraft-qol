import { describe, expect, it } from "vitest";
import {
  adjust,
  announcement,
  CAUSES,
  DEFAULT_POLICY,
  decide,
  describePolicy,
  HAZARD_CAUSES,
  HAZARDS,
  hazardOf,
  isProtectedRole,
  parsePolicy,
  parseScale,
  PASS_THROUGH,
  ROLES,
  samePolicy,
  SCALES,
  SETTING,
  type Policy,
  type Verdict,
} from "../scripts/core/rules";

const vanillaEverywhere: Policy = {
  scale: { visitor: 100, member: 100, operator: 100 },
  immune: { fall: false, burn: false, drown: false },
  voidCatch: false,
  announce: false,
};

describe("parseScale", () => {
  it("accepts every scale as the option name the panel reads back", () => {
    for (const s of SCALES) expect(parseScale(String(s), 100)).toBe(s);
  });
  it("accepts a number too", () => {
    for (const s of SCALES) expect(parseScale(s, 100)).toBe(s);
  });
  it("falls back for anything outside the tested set", () => {
    expect(parseScale("60", 50)).toBe(50);
    expect(parseScale("half", 50)).toBe(50);
    expect(parseScale(undefined, 25)).toBe(25);
    expect(parseScale(150, 100)).toBe(100);
    expect(parseScale(-25, 100)).toBe(100);
  });
});

describe("parsePolicy", () => {
  it("reads the panel", () => {
    const p = parsePolicy({
      [SETTING.visitor]: "0",
      [SETTING.member]: "75",
      [SETTING.operator]: "50",
      [SETTING.fall]: false,
      [SETTING.burn]: false,
      [SETTING.drown]: true,
      [SETTING.voidCatch]: false,
      [SETTING.announce]: true,
    });
    expect(p).toEqual({
      scale: { visitor: 0, member: 75, operator: 50 },
      immune: { fall: false, burn: false, drown: true },
      voidCatch: false,
      announce: true,
    });
  });

  it("is the default policy for an empty blob", () => {
    expect(parsePolicy({})).toEqual(DEFAULT_POLICY);
  });

  it("falls back per field, to the default rather than to vanilla", () => {
    const p = parsePolicy({ [SETTING.member]: "banana", [SETTING.fall]: "yes" });
    expect(p.scale.member).toBe(DEFAULT_POLICY.scale.member);
    expect(p.immune.fall).toBe(DEFAULT_POLICY.immune.fall);
  });
});

describe("samePolicy", () => {
  it("compares every field", () => {
    const base = parsePolicy({});
    expect(samePolicy(base, parsePolicy({}))).toBe(true);
    // Every setting on the panel must be able to make two policies differ,
    // or a change to it would never be noticed by the poller.
    for (const role of ROLES)
      expect(samePolicy(base, parsePolicy({ [SETTING[role]]: "0" }))).toBe(false);
    for (const key of [SETTING.fall, SETTING.burn, SETTING.drown, SETTING.voidCatch, SETTING.announce])
      expect(samePolicy(base, parsePolicy({ [key]: !boolAt(base, key) }))).toBe(false);
  });
});

function boolAt(p: Policy, key: string): boolean {
  switch (key) {
    case SETTING.fall:
      return p.immune.fall;
    case SETTING.burn:
      return p.immune.burn;
    case SETTING.drown:
      return p.immune.drown;
    case SETTING.voidCatch:
      return p.voidCatch;
    case SETTING.announce:
      return p.announce;
  }
  throw new Error(`not a boolean setting: ${key}`);
}

describe("the cause list", () => {
  it("has every hazard cause and every pass-through cause in it", () => {
    for (const h of HAZARDS)
      for (const c of HAZARD_CAUSES[h]) expect(CAUSES).toContain(c);
    for (const c of PASS_THROUGH) expect(CAUSES).toContain(c);
  });

  it("assigns each cause to at most one hazard", () => {
    const seen = new Set<string>();
    for (const h of HAZARDS)
      for (const c of HAZARD_CAUSES[h]) {
        expect(seen.has(c)).toBe(false);
        seen.add(c);
      }
  });

  it("never treats a pass-through cause as a hazard", () => {
    for (const c of PASS_THROUGH) expect(hazardOf(c)).toBeUndefined();
  });

  it("has no void cause - the void catch exists because of this", () => {
    expect(CAUSES).not.toContain("void");
  });
});

describe("isProtectedRole", () => {
  it("protects visitors and members, never operators", () => {
    expect(isProtectedRole("visitor")).toBe(true);
    expect(isProtectedRole("member")).toBe(true);
    expect(isProtectedRole("operator")).toBe(false);
  });
});

describe("decide", () => {
  it("leaves everything alone when every role is at 100% with no switches", () => {
    for (const role of ROLES)
      for (const cause of CAUSES)
        expect(decide(role, cause, vanillaEverywhere)).toEqual({ kind: "vanilla" });
  });

  it("scales by the role's own percentage", () => {
    const p: Policy = { ...vanillaEverywhere, scale: { visitor: 25, member: 50, operator: 75 } };
    expect(decide("visitor", "entityAttack", p)).toEqual({ kind: "scale", multiplier: 0.25 });
    expect(decide("member", "entityAttack", p)).toEqual({ kind: "scale", multiplier: 0.5 });
    expect(decide("operator", "entityAttack", p)).toEqual({ kind: "scale", multiplier: 0.75 });
  });

  it("treats 0% as immunity to every scalable cause", () => {
    const p: Policy = { ...vanillaEverywhere, scale: { ...vanillaEverywhere.scale, member: 0 } };
    for (const cause of CAUSES) {
      const v = decide("member", cause, p);
      if ((PASS_THROUGH as readonly string[]).includes(cause)) expect(v).toEqual({ kind: "vanilla" });
      else expect(v).toEqual({ kind: "immune", why: "scale" });
    }
  });

  it("applies a hazard switch to protected roles even at 100%", () => {
    const p: Policy = { ...vanillaEverywhere, immune: { fall: true, burn: false, drown: false } };
    for (const cause of HAZARD_CAUSES.fall) {
      expect(decide("member", cause, p)).toEqual({ kind: "immune", why: "fall" });
      expect(decide("visitor", cause, p)).toEqual({ kind: "immune", why: "fall" });
    }
  });

  it("never applies a hazard switch to an operator, whatever their scale", () => {
    const p: Policy = {
      scale: { visitor: 100, member: 100, operator: 50 },
      immune: { fall: true, burn: true, drown: true },
      voidCatch: true,
      announce: false,
    };
    for (const h of HAZARDS)
      for (const cause of HAZARD_CAUSES[h])
        expect(decide("operator", cause, p)).toEqual({ kind: "scale", multiplier: 0.5 });
  });

  it("lets the switch win over the scale for the causes it covers", () => {
    // The specific promise - "never falls to their death" - must not turn into
    // "takes half fall damage" because a dropdown was also set.
    const p: Policy = { ...DEFAULT_POLICY, immune: { fall: true, burn: true, drown: true } };
    for (const h of HAZARDS)
      for (const cause of HAZARD_CAUSES[h])
        expect(decide("member", cause, p)).toEqual({ kind: "immune", why: h });
    expect(decide("member", "entityAttack", p)).toEqual({ kind: "scale", multiplier: 0.5 });
  });

  it("never touches a pass-through cause, for anyone, under any panel", () => {
    const harshest: Policy = {
      scale: { visitor: 0, member: 0, operator: 0 },
      immune: { fall: true, burn: true, drown: true },
      voidCatch: true,
      announce: true,
    };
    for (const role of ROLES)
      for (const cause of PASS_THROUGH)
        expect(decide(role, cause, harshest, { justRescued: true })).toEqual({ kind: "vanilla" });
  });

  it("cancels the landing after a rescue even with the fall switch off", () => {
    expect(decide("member", "fall", vanillaEverywhere, { justRescued: true })).toEqual({
      kind: "immune",
      why: "rescued",
    });
    // ...but only falls, and only for protected roles.
    expect(decide("member", "entityAttack", vanillaEverywhere, { justRescued: true })).toEqual({
      kind: "vanilla",
    });
    expect(decide("operator", "fall", vanillaEverywhere, { justRescued: true })).toEqual({
      kind: "vanilla",
    });
  });

  it("only ever returns a verdict that reduces damage", () => {
    const policies: Policy[] = [vanillaEverywhere, DEFAULT_POLICY];
    for (const s of SCALES)
      policies.push({
        scale: { visitor: s, member: s, operator: s },
        immune: { fall: s < 50, burn: s < 75, drown: s === 0 },
        voidCatch: true,
        announce: false,
      });
    for (const p of policies)
      for (const role of ROLES)
        for (const cause of CAUSES)
          for (const ctx of [{}, { justRescued: true }]) {
            const v = decide(role, cause, p, ctx);
            if (v.kind === "scale") {
              expect(v.multiplier).toBeGreaterThan(0);
              expect(v.multiplier).toBeLessThan(1);
            }
            const out = adjust(7, v);
            expect(out.damage).toBeLessThanOrEqual(7);
            expect(out.damage).toBeGreaterThanOrEqual(0);
          }
  });
});

describe("adjust", () => {
  it("cancels for immune and zeroes the number", () => {
    expect(adjust(9, { kind: "immune", why: "fall" })).toEqual({ cancel: true, damage: 0 });
  });
  it("passes vanilla through untouched, including odd inputs", () => {
    for (const d of [0, 3, 3.5, -1, NaN, Infinity])
      expect(adjust(d, { kind: "vanilla" })).toEqual({ cancel: false, damage: d });
  });
  it("multiplies a positive amount and leaves a non-positive or non-finite one alone", () => {
    const half: Verdict = { kind: "scale", multiplier: 0.5 };
    expect(adjust(6, half)).toEqual({ cancel: false, damage: 3 });
    expect(adjust(0, half)).toEqual({ cancel: false, damage: 0 });
    expect(adjust(-2, half)).toEqual({ cancel: false, damage: -2 });
    expect(adjust(NaN, half).damage).toBeNaN();
  });
});

describe("announcement", () => {
  it("says nothing for an untouched hit", () => {
    expect(announcement({ kind: "vanilla" })).toBeUndefined();
  });
  it("names the percentage for a softened hit", () => {
    expect(announcement({ kind: "scale", multiplier: 0.25 })).toContain("25%");
  });
  it("names the switch for a cancelled hit", () => {
    expect(announcement({ kind: "immune", why: "burn" })).toContain("fire");
    expect(announcement({ kind: "immune", why: "fall" })).toContain("fall");
    expect(announcement({ kind: "immune", why: "scale" })).toBeDefined();
  });
});

describe("describePolicy", () => {
  it("mentions every role and every switch state", () => {
    const s = describePolicy(DEFAULT_POLICY);
    expect(s).toContain("visitors=25%");
    expect(s).toContain("members=50%");
    expect(s).toContain("operators=100%");
    expect(s).toContain("fall+burn");
    expect(s).toContain("void=true");
  });
});
