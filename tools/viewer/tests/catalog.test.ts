import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIES, MODELS } from "../catalog";

const ROOT = resolve(__dirname, "../../..");

describe("the catalogue", () => {
  it("has a unique id per entry", () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names only files that exist", () => {
    const missing: string[] = [];
    const check = (file: string | undefined) => {
      if (file && !existsSync(resolve(ROOT, file))) missing.push(file);
    };
    for (const m of MODELS) {
      check(m.geometry);
      check(m.structure);
      for (const t of Object.values(m.textures ?? {})) check(t);
      for (const p of m.particles ?? []) {
        check(p.definition);
        check(p.texture);
      }
      check(m.animations?.file);
      check(m.animations?.controller);
    }
    expect(missing).toEqual([]);
  });
});

describe("the sidebar", () => {
  const ids = new Set(CATEGORIES.map((c) => c.id));
  const inTab = (id: string) => MODELS.filter((m) => m.category === id);

  it("puts every entry in a known tab, and leaves no tab empty", () => {
    for (const m of MODELS) expect(ids.has(m.category), m.id).toBe(true);
    for (const c of CATEGORIES) expect(inTab(c.id).length, c.id).toBeGreaterThan(0);
  });

  it("keeps blocks and entities in the models tab and structures out of it", () => {
    for (const m of inTab("models")) expect(m.kind, m.id).not.toBe("structure");
    for (const m of [...inTab("buildings"), ...inTab("villages")]) expect(m.kind, m.id).toBe("structure");
  });

  it("heads the models tab by pack, with the concepts together", () => {
    const groups = new Set(inTab("models").map((m) => m.group));
    for (const pack of ["Hearthstone", "Fluidworks", "Bulwark", "Graves", "Hatchling", "Villages", "Concepts"])
      expect(groups.has(pack), pack).toBe(true);
    for (const m of inTab("models").filter((x) => x.pack.startsWith("concept"))) expect(m.group).toBe("Concepts");
  });

  it("heads the buildings and villages tabs by people", () => {
    const buildings = new Set(inTab("buildings").map((m) => m.group));
    const villages = new Set(inTab("villages").map((m) => m.group));
    for (const people of ["Stonefolk", "Hobbit", "Wood Elf", "High Elf", "Foxfolk", "Deerfolk"]) {
      expect(buildings.has(people), people).toBe(true);
      expect(villages.has(people), people).toBe(true);
    }
    expect(buildings.has("Shared")).toBe(true);
    expect(villages.has("Whole villages")).toBe(true);
    // The whole villages are listed before any people's pieces.
    expect(inTab("villages")[0]!.group).toBe("Whole villages");
  });
});
