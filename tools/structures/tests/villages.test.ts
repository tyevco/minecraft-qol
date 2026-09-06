import { describe, expect, it } from "vitest";
import { expand } from "../jigsaw";
import { PEOPLE_PER_PAGE, PEOPLES, postStates, villageSet, villageWorldgen } from "../villages";

// Every people's village, all nineteen, grows from its own pools with the
// offline expander the same way the game would,
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

      it("bridges every joint at deck height for a people on a deck (a marker sits at ground level)", () => {
        if (!p.deck) return;
        for (const piece of set.pieces.values())
          for (const m of piece.markers()) {
            if (piece.key === `${p.key}_lamp`) continue; // a lamp post ends a walkway on its own column
            const at = piece.at(m.x, p.deck.height, m.z);
            expect(at, `${piece.key} at ${m.x},${p.deck.height},${m.z} (the ${m.jigsaw.name} joint) has nothing to stand on`).not.toBeUndefined();
            expect(at, `${piece.key} at ${m.x},${p.deck.height},${m.z}`).not.toBe("minecraft:air");
          }
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
            else if (b.name === "villages:post") {
              const page = (b.states["villages:page"] as number | undefined) ?? 0;
              expect(page * PEOPLE_PER_PAGE + (b.states["villages:people"] as number), `${piece.key} at ${b.x},${b.y},${b.z}`).toBe(index);
              expect(b.states["villages:people"] as number, `${piece.key}: a state lists at most 16 values`).toBeLessThan(PEOPLE_PER_PAGE);
            }
          }
      });
    });
  }

  it("splits a people index across the two post states, the page only when set", () => {
    expect(postStates(3)).toEqual({ "villages:people": 3 });
    expect(postStates(15)).toEqual({ "villages:people": 15 });
    expect(postStates(16)).toEqual({ "villages:people": 0, "villages:page": 1 });
    expect(postStates(18)).toEqual({ "villages:people": 2, "villages:page": 1 });
  });

  it("names biome tags that exist on the server's own biomes, and rules out the overlaps it measured", () => {
    // From dist/bds/server/behavior_packs/vanilla*/biomes (docs/villages-jigsaw-results.md): a tag on no biome generates nowhere.
    const known = new Set(["extreme_hills", "swamp", "mangrove_swamp", "river", "savanna", "plateau", "mesa", "plains", "flower_forest", "hills", "forest", "birch", "taiga", "cherry_grove", "meadow", "roofed", "pale_garden", "desert", "cold", "frozen", "mooshroom_island", "jungle", "beach", "ocean", "mountains"]);
    for (const p of PEOPLES) for (const tag of [...p.biomes, ...(p.avoid ?? [])]) expect(known.has(tag), `${p.key}: ${tag}`).toBe(true);
    const by = (k: string) => PEOPLES.find((p) => p.key === k)!;
    expect(by("wolffolk").biomes).toEqual(["frozen"]); // `cold` is on forest and plains
    expect(by("mousefolk").biomes).toEqual(["mooshroom_island"]);
    expect(by("deerfolk").avoid).toContain("taiga");
    const files = villageWorldgen(villageSet(by("wolffolk")));
    const structure = files["worldgen/structures/villages/wolffolk_village.json"] as { "minecraft:jigsaw": { biome_filters: unknown[] } };
    expect(structure["minecraft:jigsaw"].biome_filters).toHaveLength(2);
  });

  it("gives every people its own structure-set salt", () => {
    const salts = PEOPLES.map((p) => p.salt);
    expect(new Set(salts).size).toBe(salts.length);
  });
});
