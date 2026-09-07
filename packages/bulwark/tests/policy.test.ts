import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY,
  SETTING,
  describePolicy,
  effectiveRange,
  parsePolicy,
  parseRangeCap,
  samePolicy,
} from "../scripts/core/policy";

describe("parsePolicy", () => {
  it("is the default on an empty panel", () => {
    expect(parsePolicy({})).toEqual(DEFAULT_POLICY);
  });

  it("reads the dropdown's option name and the toggles", () => {
    expect(
      parsePolicy({ [SETTING.rangeCap]: "16", [SETTING.specialAmmo]: false, [SETTING.upgrades]: false }),
    ).toEqual({ rangeCap: 16, specialAmmo: false, upgrades: false });
  });

  it("falls back on junk", () => {
    expect(parseRangeCap("20", 32)).toBe(32);
    expect(parseRangeCap(24, 32)).toBe(24);
    expect(parseRangeCap(undefined, 16)).toBe(16);
    expect(parsePolicy({ [SETTING.specialAmmo]: "no" }).specialAmmo).toBe(true);
  });

  it("compares and describes", () => {
    expect(samePolicy(DEFAULT_POLICY, parsePolicy({}))).toBe(true);
    expect(samePolicy(DEFAULT_POLICY, parsePolicy({ [SETTING.upgrades]: false }))).toBe(false);
    expect(describePolicy(DEFAULT_POLICY)).toBe("range cap 32 special ammo true upgrades true");
  });
});

describe("effectiveRange", () => {
  it("never raises a tier, and lowers one the cap forbids", () => {
    expect(effectiveRange(1, 32)).toBe(1);
    expect(effectiveRange(3, 32)).toBe(3);
    expect(effectiveRange(3, 24)).toBe(2);
    expect(effectiveRange(3, 16)).toBe(1);
    expect(effectiveRange(2, 16)).toBe(1);
    expect(effectiveRange(2, 32)).toBe(2);
  });
});

/** The manifest must declare every setting the policy reads, with the right default. */
describe("the settings panel", () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "..", "behavior_pack", "manifest.json"), "utf8"),
  ) as { format_version: number; settings: { type: string; name?: string; default?: unknown; options?: { name: string }[] }[] };

  it("is a format-3 manifest with the three settings and their defaults", () => {
    expect(manifest.format_version).toBe(3);
    const byName = new Map(manifest.settings.filter((s) => s.name).map((s) => [s.name!, s]));
    const cap = byName.get(SETTING.rangeCap)!;
    expect(cap.type).toBe("dropdown");
    expect(cap.options!.map((o) => o.name)).toEqual(["16", "24", "32"]);
    expect(parseRangeCap(cap.default, 16)).toBe(DEFAULT_POLICY.rangeCap);
    expect(byName.get(SETTING.specialAmmo)!.default).toBe(DEFAULT_POLICY.specialAmmo);
    expect(byName.get(SETTING.upgrades)!.default).toBe(DEFAULT_POLICY.upgrades);
  });
});
