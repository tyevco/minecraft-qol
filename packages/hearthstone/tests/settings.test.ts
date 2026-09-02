import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  describeSettings,
  parseSettings,
  sameSettings,
  SETTING,
} from "../scripts/core/settings";

describe("parseSettings", () => {
  it("reads the panel", () => {
    expect(parseSettings({ [SETTING.showBed]: false, [SETTING.showHearth]: true })).toEqual({
      showBed: false,
      showHearth: true,
    });
  });

  it("is the default for an empty blob", () => {
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({ showBed: true, showHearth: true });
  });

  it("falls back per field, to the default rather than to off", () => {
    const s = parseSettings({ [SETTING.showBed]: "no", [SETTING.showHearth]: false });
    expect(s.showBed).toBe(DEFAULT_SETTINGS.showBed);
    expect(s.showHearth).toBe(false);
  });
});

describe("sameSettings", () => {
  it("compares every field", () => {
    const a = parseSettings({});
    expect(sameSettings(a, parseSettings({}))).toBe(true);
    expect(sameSettings(a, parseSettings({ [SETTING.showBed]: false }))).toBe(false);
    expect(sameSettings(a, parseSettings({ [SETTING.showHearth]: false }))).toBe(false);
  });
});

describe("describeSettings", () => {
  it("names both toggles", () => {
    expect(describeSettings(DEFAULT_SETTINGS)).toBe("show_bed=true show_hearth=true");
  });
});
