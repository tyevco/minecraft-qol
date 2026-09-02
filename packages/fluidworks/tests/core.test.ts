import { describe, expect, it } from "vitest";
import { inputOf, outputOf, parseFacing } from "../scripts/core/facing";
import { connections } from "../scripts/core/pipes";
import {
  DEFAULT_SETTINGS,
  parseSettings,
  sameSettings,
  SETTING,
} from "../scripts/core/policy";

describe("facing", () => {
  const at = { x: 10, y: 64, z: -5 };
  it("puts the spout along the facing and the mouth opposite", () => {
    expect(outputOf(at, "south")).toEqual({ x: 10, y: 64, z: -4 });
    expect(inputOf(at, "south")).toEqual({ x: 10, y: 64, z: -6 });
    expect(outputOf(at, "down")).toEqual({ x: 10, y: 63, z: -5 });
    expect(inputOf(at, "down")).toEqual({ x: 10, y: 65, z: -5 });
  });
  it("parses only the six values", () => {
    expect(parseFacing("east")).toBe("east");
    expect(parseFacing("sideways")).toBeUndefined();
    expect(parseFacing(3)).toBeUndefined();
  });
});

describe("pipe connections", () => {
  it("joins pipes, funnels and cauldrons and nothing else", () => {
    const c = connections({
      north: "fluidworks:pipe",
      south: "fluidworks:funnel",
      up: "minecraft:cauldron",
      down: "minecraft:stone",
      east: "minecraft:oak_fence",
      west: undefined,
    });
    expect(c).toEqual({
      north: true,
      south: true,
      up: true,
      down: false,
      east: false,
      west: false,
    });
  });
});

describe("settings", () => {
  it("is the default for an empty panel", () => {
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
  });
  it("reads toggles, clamps sliders and converts seconds to ticks", () => {
    const s = parseSettings({
      [SETTING.concrete]: false,
      [SETTING.rain]: false,
      [SETTING.cycleSeconds]: 99,
      [SETTING.concretePerLevel]: 0,
    });
    expect(s.policy.rules.cauldron_concrete).toBe(false);
    expect(s.policy.rules.cauldron_dye).toBe(true);
    expect(s.policy.rain).toBe(false);
    expect(s.cycleTicks).toBe(200);
    expect(s.policy.concretePerLevel).toBe(1);
  });
  it("falls back per field on garbage", () => {
    const s = parseSettings({
      [SETTING.transfer]: "yes",
      [SETTING.cycleSeconds]: "fast",
    });
    expect(s.policy.transfer).toBe(true);
    expect(s.cycleTicks).toBe(DEFAULT_SETTINGS.cycleTicks);
  });
  it("compares every field", () => {
    expect(sameSettings(parseSettings({}), parseSettings({}))).toBe(true);
    expect(
      sameSettings(parseSettings({}), parseSettings({ [SETTING.wash]: false })),
    ).toBe(false);
    expect(
      sameSettings(
        parseSettings({}),
        parseSettings({ [SETTING.cycleSeconds]: 3 }),
      ),
    ).toBe(false);
  });
});
