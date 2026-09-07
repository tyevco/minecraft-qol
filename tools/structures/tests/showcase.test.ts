import { describe, expect, it } from "vitest";
import { COLS, G, GAP, INNER, MARGIN, PLOT, POST_CELLS, ROWS, SHOWCASE_JOBS, WALK, plotOrigin, ring, showcase } from "../showcase";
import { PEOPLE_PER_PAGE, PEOPLES } from "../villages";

// The showcase is what a person places to see every people at once, so what
// matters is that every people is in it exactly once per job, that each
// plot holds its people (a closed ring a person cannot jump, one gate), and
// that nothing in it starts a trade the plot has no chest for.
describe("showcase", () => {
  const bp = showcase();
  const blocks = bp.blocks();
  const posts = blocks.filter((b) => b.name === "villages:post");
  const peopleOf = (states: Record<string, unknown>) => ((states["villages:page"] as number | undefined) ?? 0) * PEOPLE_PER_PAGE + (states["villages:people"] as number);

  it("has a plot for every people and one to spare for the lookout", () => {
    expect(COLS * ROWS).toBe(PEOPLES.length + 1);
  });

  it("fits a structure block's box, so it can be saved and loaded by hand too", () => {
    expect(bp.sx, `${bp.size.join("x")}`).toBeLessThanOrEqual(64);
    expect(bp.sz, `${bp.size.join("x")}`).toBeLessThanOrEqual(64);
    expect(bp.size).toEqual([MARGIN * 2 + COLS * PLOT + (COLS - 1) * GAP, bp.sy, MARGIN * 2 + ROWS * PLOT + (ROWS - 1) * GAP]);
  });

  it("stands on a complete floor over a solid base, so no sand or gravel has air under it", () => {
    for (let x = 0; x < bp.sx; x++)
      for (let z = 0; z < bp.sz; z++) {
        for (let y = 0; y < G; y++) expect(bp.at(x, y, z), `base at ${x},${y},${z}`).toBe(`minecraft:${WALK}`);
        expect(bp.at(x, G, z), `nothing at ground level ${x},${G},${z}`).toBeDefined();
      }
    for (const b of blocks)
      if (/sand$|gravel|concrete_powder/.test(b.name)) expect(bp.at(b.x, b.y - 1, b.z), `${b.name} at ${b.x},${b.y},${b.z} would fall`).toBeDefined();
  });

  it("has exactly one post per people per job, in the people's own plot", () => {
    expect(posts.length).toBe(PEOPLES.length * SHOWCASE_JOBS.length);
    const seen = new Set<string>();
    for (const b of posts) {
      const people = peopleOf(b.states);
      const job = b.states["villages:job"] as number;
      expect(b.states["villages:people"] as number, "a state lists at most 16 values").toBeLessThan(PEOPLE_PER_PAGE);
      const key = `${people}/${job}`;
      expect(seen.has(key), `two posts for ${PEOPLES[people]?.key} ${SHOWCASE_JOBS[job]}`).toBe(false);
      seen.add(key);
      const [px, pz] = plotOrigin(people);
      expect([b.x - px, b.z - pz], `${PEOPLES[people]?.key} ${SHOWCASE_JOBS[job]} at ${b.x},${b.z} is outside its plot`).toEqual(POST_CELLS[job]);
    }
    expect(seen.size).toBe(PEOPLES.length * SHOWCASE_JOBS.length);
  });

  for (const [i, p] of PEOPLES.entries()) {
    it(`${p.key}: a closed ring of ${ring(p).fence} with one gate, on its own ground`, () => {
      const [px, pz] = plotOrigin(i);
      const { fence } = ring(p);
      expect(/fence$|_wall$/.test(fence), `${fence} is a block a person steps over`).toBe(true);
      let gates = 0;
      for (let x = 0; x < PLOT; x++)
        for (let z = 0; z < PLOT; z++) {
          const edge = x === 0 || z === 0 || x === PLOT - 1 || z === PLOT - 1;
          const at = bp.at(px + x, G + 1, pz + z);
          if (!edge) continue;
          if (at !== undefined && /fence_gate$/.test(at)) gates++;
          else expect(at, `${p.key}: the ring is open at ${x},${z}`).toBe(`minecraft:${fence}`);
        }
      expect(gates, `${p.key}: gates`).toBe(1);
      // The inside is the people's verge with its paving through the middle.
      for (let x = 1; x <= INNER; x++)
        for (let z = 1; z <= INNER; z++) {
          const want = x === 4 || z === 4 ? p.paving : p.verge;
          expect(bp.at(px + x, G, pz + z), `${p.key}: floor at ${x},${z}`).toBe(`minecraft:${want}`);
        }
      // Its lamp.
      expect(bp.at(px + 1, G + 1, pz + 1)).toBe(`minecraft:${p.post}`);
      expect(bp.at(px + 1, G + 2, pz + 1)).toBe(`minecraft:${p.lamp ?? "lantern"}`);
    });
  }

  it("leaves the cell south of every post free, where its person is spawned", () => {
    for (const b of posts) {
      const at = bp.at(b.x, b.y, b.z + 1);
      expect(at, `${PEOPLES[peopleOf(b.states)]?.key} ${SHOWCASE_JOBS[b.states["villages:job"] as number]}: ${at} stands where its person spawns`).toBeUndefined();
      expect(bp.at(b.x, b.y + 1, b.z + 1)).toBeUndefined();
    }
  });

  it("starts no trade: no leaves, no water, no crops, no cactus, no vein", () => {
    const names = new Set(blocks.map((b) => b.name));
    for (const n of names) expect(/leaves|water|farmland|cactus|sweet_berry|villages:vein|beehive|bee_nest|cocoa|sapling/.test(n), `${n} would give a worker a trade`).toBe(false);
  });
});
