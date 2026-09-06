import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, describePolicy, mayBuild, parsePolicy, samePolicy } from "../scripts/core/settings";

describe("settings", () => {
  it("falls back to the defaults for a missing or malformed value", () => {
    expect(parsePolicy({})).toEqual(DEFAULT_POLICY);
    expect(parsePolicy({ "builder:seconds_per_block": "fast", "builder:who_may_build": 3 })).toEqual(DEFAULT_POLICY);
  });
  it("reads and clamps the panel", () => {
    expect(parsePolicy({ "builder:seconds_per_block": 2.6, "builder:who_may_build": "everyone" })).toEqual({ secondsPerBlock: 3, whoMayBuild: "everyone" });
    expect(parsePolicy({ "builder:seconds_per_block": 99 }).secondsPerBlock).toBe(30);
    expect(parsePolicy({ "builder:seconds_per_block": 0 }).secondsPerBlock).toBe(1);
  });
  it("gates the table by role", () => {
    expect(mayBuild("visitor", DEFAULT_POLICY)).toBe(false);
    expect(mayBuild("member", DEFAULT_POLICY)).toBe(true);
    expect(mayBuild("operator", { ...DEFAULT_POLICY, whoMayBuild: "operators" })).toBe(true);
    expect(mayBuild("member", { ...DEFAULT_POLICY, whoMayBuild: "operators" })).toBe(false);
    expect(mayBuild("visitor", { ...DEFAULT_POLICY, whoMayBuild: "everyone" })).toBe(true);
  });
  it("compares and describes", () => {
    expect(samePolicy(DEFAULT_POLICY, { ...DEFAULT_POLICY })).toBe(true);
    expect(samePolicy(DEFAULT_POLICY, { ...DEFAULT_POLICY, secondsPerBlock: 5 })).toBe(false);
    expect(describePolicy(DEFAULT_POLICY)).toBe("a block every 4s, table for members");
  });
});
