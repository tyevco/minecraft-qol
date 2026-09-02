import { describe, expect, it } from "vitest";
import {
  canChangeOwnMode,
  keepsItems,
  MODES,
  parseMode,
} from "../scripts/core/prefs";

describe("parseMode", () => {
  it("accepts every mode", () => {
    for (const m of MODES) expect(parseMode(m)).toBe(m);
  });
  it("falls back to off for anything else", () => {
    expect(parseMode(undefined)).toBe("off");
    expect(parseMode("KEEP")).toBe("off");
    expect(parseMode(3)).toBe("off");
  });
});

describe("keepsItems", () => {
  it("is false only for vanilla", () => {
    expect(keepsItems("off")).toBe(false);
    expect(keepsItems("grave")).toBe(true);
    expect(keepsItems("keep")).toBe(true);
  });
});

describe("canChangeOwnMode", () => {
  it("lets anyone change when unlocked", () => {
    expect(canChangeOwnMode(false, false)).toBe(true);
  });
  it("locks out non-operators only", () => {
    expect(canChangeOwnMode(true, false)).toBe(false);
    expect(canChangeOwnMode(true, true)).toBe(true);
  });
});
