import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY,
  keepsItems,
  MODES,
  parseMode,
  parsePolicy,
  samePolicy,
  SETTING,
} from "../scripts/core/prefs";

describe("parseMode", () => {
  it("accepts every mode", () => {
    for (const m of MODES) expect(parseMode(m)).toBe(m);
  });
  it("falls back for anything else", () => {
    expect(parseMode(undefined)).toBe("off");
    expect(parseMode("KEEP", "grave")).toBe("grave");
    expect(parseMode(3)).toBe("off");
  });
});

describe("parsePolicy", () => {
  it("reads the panel", () => {
    const p = parsePolicy({
      [SETTING.visitor]: "off",
      [SETTING.member]: "keep",
      [SETTING.operator]: "grave",
      [SETTING.announce]: false,
      [SETTING.publicGraves]: true,
    });
    expect(p).toEqual({
      modes: { visitor: "off", member: "keep", operator: "grave" },
      announce: false,
      publicGraves: true,
    });
  });

  it("is the default policy for an empty blob", () => {
    expect(parsePolicy({})).toEqual(DEFAULT_POLICY);
  });

  it("falls back per field, to the default rather than to vanilla", () => {
    const p = parsePolicy({
      [SETTING.member]: "banana",
      [SETTING.announce]: "yes",
    });
    expect(p.modes.member).toBe(DEFAULT_POLICY.modes.member);
    expect(p.announce).toBe(DEFAULT_POLICY.announce);
  });
});

describe("samePolicy", () => {
  it("compares every field", () => {
    const a = parsePolicy({});
    expect(samePolicy(a, parsePolicy({}))).toBe(true);
    expect(samePolicy(a, parsePolicy({ [SETTING.operator]: "keep" }))).toBe(
      false,
    );
    expect(samePolicy(a, parsePolicy({ [SETTING.publicGraves]: true }))).toBe(
      false,
    );
  });
});

describe("keepsItems", () => {
  it("is false only for vanilla", () => {
    expect(keepsItems("off")).toBe(false);
    expect(keepsItems("grave")).toBe(true);
    expect(keepsItems("keep")).toBe(true);
  });
});
