import { describe, expect, it } from "vitest";
import { findEntities, findVariants, title } from "../catalog";
import { isPosable } from "../pose";

const { models, skipped } = findEntities();

describe("findEntities", () => {
  it("covers every entity model in the repo exactly once", () => {
    const ids = [...models.map((m) => m.id), ...skipped.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(25);
  });

  it("takes every model that has limbs and no other", () => {
    for (const model of models) expect(isPosable(model.geometry), model.id).toBe(true);
    for (const entry of skipped)
      expect(entry.reason, entry.id).toMatch(/no limb bones to pose|no texture found/);
  });

  it("finds the nineteen peoples and the hatchling", () => {
    const ids = new Set(models.map((m) => m.id));
    for (const people of ["stonefolk", "reedfolk", "tinker", "tallfolk", "hobbit", "wood_elf", "high_elf", "drow", "drover", "foxfolk", "catfolk", "wolffolk", "rabbitfolk", "bearfolk", "fennecfolk", "mousefolk", "squirrelfolk", "otterfolk", "deerfolk"])
      expect(ids.has(`villages_${people}`), people).toBe(true);
    // The builder is one of the peoples now (issue #80): no entity of its own.
    expect(ids.has("builder_builder")).toBe(false);
    expect(ids.has("hatchling_hatchling")).toBe(true);
  });

  it("skips the props, which have nothing to pose", () => {
    const ids = new Set(skipped.map((s) => s.id));
    for (const prop of ["graves_gravestone", "hatchling_egg", "villages_waypoint", "bulwark_turret_head"])
      expect(ids.has(prop), prop).toBe(true);
  });

  it("gives every model at least one texture", () => {
    for (const model of models) {
      expect(model.variants.length, model.id).toBeGreaterThan(0);
      for (const variant of model.variants) expect(variant.path).toMatch(/\.png$/);
    }
  });

  it("reads a person's four job textures as variants", () => {
    const stonefolk = models.find((m) => m.id === "villages_stonefolk")!;
    expect(stonefolk.variants.map((v) => v.name).sort()).toEqual(["builder", "guard", "trader", "worker"]);
  });
});

describe("findVariants", () => {
  it("does not let one model's name swallow another's textures", () => {
    // "drow" is a prefix of nothing, but "drover" would match a loose test.
    const villages = "packages/villages/resource_pack/textures/entity";
    for (const variant of findVariants(villages, "drow"))
      expect(variant.path).toMatch(/\/drow_/);
    expect(findVariants(villages, "drow")).toHaveLength(4);
  });

  it("returns nothing for a directory that is not there", () => {
    expect(findVariants("packages/nowhere/textures", "ghost")).toEqual([]);
  });
});

describe("title", () => {
  it("turns a file stem into a label", () => {
    expect(title("wood_elf")).toBe("Wood Elf");
    expect(title("patrol_golem")).toBe("Patrol Golem");
  });
});
