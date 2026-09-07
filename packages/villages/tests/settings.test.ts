import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, describePolicy, mayBuild, parsePolicy, samePolicy } from "../scripts/core/settings";

describe("settings", () => {
  it("falls back to the defaults for a missing or malformed value, never to off", () => {
    expect(parsePolicy({})).toEqual(DEFAULT_POLICY);
    expect(parsePolicy({ "villages:cycle_minutes": "ten", "villages:wages": "no", "villages:seconds_per_block": "4", "villages:who_may_build": "nobody", "villages:free_build": 1 })).toEqual(DEFAULT_POLICY);
  });
  it("clamps the sliders and reads the toggles and the dropdown", () => {
    const p = parsePolicy({ "villages:cycle_minutes": 90, "villages:wages": false, "villages:seconds_per_block": 0.4, "villages:who_may_build": "everyone", "villages:free_build": true });
    expect(p).toEqual({ cycleMinutes: 60, wages: false, secondsPerBlock: 1, whoMayBuild: "everyone", freeBuild: true });
    expect(parsePolicy({ "villages:seconds_per_block": 99 }).secondsPerBlock).toBe(30);
    expect(samePolicy(p, { ...p })).toBe(true);
    expect(samePolicy(p, { ...p, freeBuild: false })).toBe(false);
    expect(describePolicy(p)).toBe("a cycle every 60 min, wages off; a block every 1s, table for everyone, buildings free");
  });
  it("who may build is by role: operators only, members and operators, or everyone", () => {
    expect(mayBuild("visitor", DEFAULT_POLICY)).toBe(false);
    expect(mayBuild("member", DEFAULT_POLICY)).toBe(true);
    expect(mayBuild("operator", { ...DEFAULT_POLICY, whoMayBuild: "operators" })).toBe(true);
    expect(mayBuild("member", { ...DEFAULT_POLICY, whoMayBuild: "operators" })).toBe(false);
    expect(mayBuild("visitor", { ...DEFAULT_POLICY, whoMayBuild: "everyone" })).toBe(true);
  });
});
