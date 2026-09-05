import { describe, expect, it } from "vitest";
import { expand } from "../jigsaw";
import { PEOPLES, villageSet, villageWorldgen } from "../villages";

// Every people's village, the four shipped and the furfolk concepts, grows
// from its own pools with the offline expander the same way the game would,
// and every pool a socket names exists. A people whose square never grows a
// street, or whose houses never fit a socket, fails here before the viewer.
describe("villages", () => {
  for (const p of PEOPLES) {
    describe(p.key, () => {
      const set = villageSet(p);

      it("grows a village of at least a dozen pieces from seed 1", () => {
        const e = expand(set.pools, set.startPool, set.maxDepth, 1, { startTurns: 0 });
        expect(e.placements.length, `${p.key}: ${e.placements.length} pieces`).toBeGreaterThanOrEqual(12);
        const kinds = new Set(e.placements.map((pl) => pl.piece.key));
        expect(kinds.size, `${p.key}: only ${[...kinds].join(", ")}`).toBeGreaterThanOrEqual(5);
      });

      it("names only pools that exist", () => {
        for (const piece of set.pieces.values())
          for (const m of piece.markers()) {
            if (m.jigsaw.pool === "minecraft:empty") continue;
            expect(set.pools.has(m.jigsaw.pool), `${piece.key} asks for ${m.jigsaw.pool}`).toBe(true);
          }
        for (const pool of set.pools.values()) if (pool.fallback) expect(set.pools.has(pool.fallback)).toBe(true);
      });

      it("emits a jigsaw structure, a structure set and one file per pool", () => {
        const files = Object.keys(villageWorldgen(set));
        expect(files).toContain(`worldgen/structures/villages/${p.key}_village.json`);
        expect(files).toContain(`worldgen/structure_sets/villages/${p.key}_villages.json`);
        expect(files.filter((f) => f.includes("template_pools")).length).toBe(set.pools.size);
      });

      it(p.concept ? "writes its job posts as lodestones until the pack knows it" : "stamps its job posts with its own people", () => {
        const index = PEOPLES.indexOf(p);
        for (const piece of set.pieces.values())
          for (const b of piece.blocks()) {
            if (p.concept) expect(b.name, `${piece.key} at ${b.x},${b.y},${b.z}`).not.toBe("villages:post");
            else if (b.name === "villages:post") expect(b.states["villages:people"], `${piece.key} at ${b.x},${b.y},${b.z}`).toBe(index);
          }
      });
    });
  }

  it("gives every people its own structure-set salt", () => {
    const salts = PEOPLES.map((p) => p.salt);
    expect(new Set(salts).size).toBe(salts.length);
  });
});
