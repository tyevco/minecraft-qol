import { describe, expect, it } from "vitest";
import {
  adjust,
  announcement,
  CAUSES,
  DEFAULT_POLICY,
  decide,
  decidePet,
  describePolicy,
  HAZARD_CAUSES,
  HAZARDS,
  hazardOf,
  isProtectedRole,
  parsePolicy,
  parseScale,
  PASS_THROUGH,
  PET_CAUSES,
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
  pets: { hazards: false, fromPlayers: false },
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
      [SETTING.petHazards]: false,
      [SETTING.petFromPlayers]: false,
    });
    expect(p).toEqual({
      scale: { visitor: 0, member: 75, operator: 50 },
      immune: { fall: false, burn: false, drown: true },
      voidCatch: false,
      announce: true,
      pets: { hazards: false, fromPlayers: false },
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
    for (const key of [
      SETTING.fall,
      SETTING.burn,
      SETTING.drown,
      SETTING.voidCatch,
      SETTING.announce,
      SETTING.petHazards,
      SETTING.petFromPlayers,
    ])
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
    case SETTING.petHazards:
      return p.pets.hazards;
    case SETTING.petFromPlayers:
      return p.pets.fromPlayers;
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

  it("names the void cause and never touches it", () => {
    // The published 2.9.0 typings have no `void` member; the 2.9.0 RUNTIME
    // does, which the GameTest `guardian_causes_match_the_engine` measured on
    // BDS 1.26.45.1. Before it was listed, a void hit fell through decide() to
    // the role's scale - so a role at 0% was made immune to the void while
    // still falling through it. It must always be vanilla.
    expect(CAUSES).toContain("void");
    expect(PASS_THROUGH).toContain("void");
    for (const role of ROLES)
      expect(decide(role, "void", DEFAULT_POLICY)).toEqual({ kind: "vanilla" });
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
      pets: DEFAULT_POLICY.pets,
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
      pets: { hazards: true, fromPlayers: true },
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
        pets: { hazards: s < 100, fromPlayers: s < 100 },
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
    expect(s).toContain("pets=hazards+players");
  });
});

// ---------------------------------------------------------------------------
// The pet shield
// ---------------------------------------------------------------------------

describe("decidePet", () => {
  const both = DEFAULT_POLICY;
  const off: Policy = { ...DEFAULT_POLICY, pets: { hazards: false, fromPlayers: false } };
  const hazardsOnly: Policy = { ...DEFAULT_POLICY, pets: { hazards: true, fromPlayers: false } };
  const playersOnly: Policy = { ...DEFAULT_POLICY, pets: { hazards: false, fromPlayers: true } };

  it("takes every hazard cause off a pet when that switch is on", () => {
    for (const hazard of HAZARDS)
      for (const cause of HAZARD_CAUSES[hazard]) {
        expect(decidePet(cause, false, both)).toEqual({ kind: "immune", why: hazard });
        expect(decidePet(cause, false, hazardsOnly)).toEqual({ kind: "immune", why: hazard });
      }
  });

  it("covers drowning, unlike the player table", () => {
    // A pet has no dropdown of its own and follows its player underwater; the
    // player switch for drowning starts off, this one does not.
    expect(DEFAULT_POLICY.immune.drown).toBe(false);
    expect(decidePet("drowning", false, DEFAULT_POLICY)).toEqual({ kind: "immune", why: "drown" });
  });

  it("takes a player's hit off a pet when that switch is on", () => {
    for (const cause of ["entityAttack", "projectile"]) {
      expect(decidePet(cause, true, both)).toEqual({ kind: "immune", why: "player" });
      expect(decidePet(cause, true, playersOnly)).toEqual({ kind: "immune", why: "player" });
      // The same blow from a zombie still lands: a pet that cannot lose a
      // fight is not a pet anyone has to look after.
      expect(decidePet(cause, false, both)).toEqual({ kind: "vanilla" });
    }
  });

  it("leaves a pet entirely alone with both switches off", () => {
    for (const cause of CAUSES) {
      expect(decidePet(cause, false, off)).toEqual({ kind: "vanilla" });
      expect(decidePet(cause, true, off)).toEqual({ kind: "vanilla" });
    }
  });

  it("never touches a command, so /kill still works on a pet", () => {
    for (const cause of PASS_THROUGH) {
      expect(decidePet(cause, false, both)).toEqual({ kind: "vanilla" });
      expect(decidePet(cause, true, both)).toEqual({ kind: "vanilla" });
    }
  });

  it("only ever cancels or passes - a pet has no percentage", () => {
    for (const cause of CAUSES)
      for (const byPlayer of [true, false])
        for (const policy of [both, off, hazardsOnly, playersOnly])
          expect(["vanilla", "immune"]).toContain(decidePet(cause, byPlayer, policy).kind);
  });

  it("leaves every cause it cannot act on to the engine", () => {
    // Whatever is not in PET_CAUSES never reaches script, so nothing outside
    // that list may have a verdict other than vanilla.
    for (const cause of CAUSES)
      if (!(PET_CAUSES as readonly string[]).includes(cause))
        expect(decidePet(cause, false, both)).toEqual({ kind: "vanilla" });
  });
});

describe("PET_CAUSES", () => {
  it("is the exact set of causes the pet rules can act on", () => {
    for (const cause of PET_CAUSES) expect(CAUSES).toContain(cause);
    for (const hazard of HAZARDS)
      for (const cause of HAZARD_CAUSES[hazard]) expect(PET_CAUSES).toContain(cause);
    // A hit a player lands arrives as one of these two.
    expect(PET_CAUSES).toContain("entityAttack");
    expect(PET_CAUSES).toContain("projectile");
  });
});
