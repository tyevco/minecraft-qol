import { BlockPermutation, ItemStack, StructureRotation, StructureSaveMode, world, type Vector3 } from "@minecraft/server";
import { registerAsync, type Test } from "@minecraft/server-gametest";
import { paletteTable, shapeStates } from "../../../villages/scripts/core/palette";
import { container, count, floor, put, until } from "./rig";

/**
 * Builder: a blueprint goes up block by block from the chest, and comes down
 * into it (docs/design/settlements.md §5; packages/builder).
 *
 * A SimulatedPlayer is no player to the builder pack, so the table's form is
 * not driven here; `villages:place` runs the same checks and starts the same
 * job from a command, and writes its verdict to the `bd:last` world property,
 * which these tests read. The origin passed is the building's minimum
 * corner, its footing layer; the table must stand within sixteen blocks.
 *
 * The well is 5x7x5 and 77 cells (76 blocks and one water). It goes at
 * (1..5, 1..7, 1..5) so the reserved (0,*,0) column is never written; the
 * table and the chest stand at x = 7. Every rig sweeps builders, waypoints
 * and the pack's records first: a structure reload restores blocks, not
 * entities or records, and the tests stack one block apart.
 */

const WELL = "villages:tallfolk_well";
const TABLE: Vector3 = { x: 7, y: 1, z: 1 };
const CHEST: Vector3 = { x: 7, y: 1, z: 2 };
const POST: Vector3 = { x: 7, y: 1, z: 4 };
const PERSON = "villages:person";
/** A tallfolk builder's post (people 3, job 3): a world's post, so it spawns its person on its first tick. Resolved late: the API is not usable at module scope. */
const builderPost = (): BlockPermutation => BlockPermutation.resolve("villages:post", { "villages:people": 3, "villages:page": 0, "villages:job": 3 });
const ORIGIN: Vector3 = { x: 1, y: 1, z: 1 };
const WELL_SIZE = { x: 5, y: 7, z: 5 };
const WELL_CELLS = 77;
const MATERIALS: Record<string, number> = {
  "minecraft:cobblestone": 32,
  "minecraft:dark_oak_stairs": 24,
  "minecraft:dark_oak_planks": 10,
  "minecraft:oak_fence": 8,
  "minecraft:dark_oak_slab": 1,
  "minecraft:lantern": 1,
};

/**
 * The hatch's verdict: the name tag of a `builder:verdict`-tagged waypoint
 * the pack leaves at the spot asked about. A world dynamic property would be
 * simpler, but one pack cannot read another's (measured here: the builder's
 * `bd:last` and `bd:buildings` read as undefined from this pack).
 */
function last(test: Test, at: Vector3 = ORIGIN): string {
  const here = test.worldBlockLocation(at);
  const marker = test.getDimension().getEntities({ type: "villages:waypoint", tags: ["villages:verdict"], location: here, maxDistance: 6 })[0];
  return marker?.nameTag ?? "";
}

/** Persons within reach of the origin: the builder the post spawns. */
const persons = (test: Test, range = 24): number => test.getDimension().getEntities({ type: PERSON, location: test.worldBlockLocation(ORIGIN), maxDistance: range }).length;

async function rig(test: Test, chest: Record<string, number> = MATERIALS): Promise<void> {
  floor(test);
  const dim = test.getDimension();
  const here = test.worldBlockLocation(ORIGIN);
  for (const type of [PERSON, "villages:waypoint"]) for (const e of dim.getEntities({ type, location: here, maxDistance: 24 })) e.remove();
  // Records from an earlier test in this column would make the placement "cut into" a building.
  dim.runCommand(`scriptevent villages:forget ${here.x} ${here.y} ${here.z} 24`);
  test.setBlockType("villages:blueprint_table", TABLE);
  test.setBlockType("minecraft:chest", CHEST);
  test.setBlockPermutation(builderPost(), POST);
  let slot = 0;
  for (const [item, n] of Object.entries(chest)) {
    let left = n;
    while (left > 0) {
      const amount = Math.min(64, left);
      put(test, CHEST, new ItemStack(item, amount), slot++);
      left -= amount;
    }
  }
  test.assert(await until(test, () => persons(test) >= 1, 400, 5), `expected the builder's post to spawn its person, found ${persons(test)}`);
}

function place(test: Test, rotation = 0, ticks = 2, key = "tallfolk_well", free = false, palette = ""): void {
  const o = test.worldBlockLocation(ORIGIN);
  test.getDimension().runCommand(`scriptevent villages:place ${key} ${o.x} ${o.y} ${o.z} ${rotation} ${ticks}${free ? " free" : ""}${palette ? ` ${palette}` : ""}`);
}

/** Every item in the chest. */
function chestTotal(test: Test): number {
  const c = container(test, CHEST);
  let total = 0;
  if (c) for (let i = 0; i < c.size; i++) total += c.getItem(i)?.amount ?? 0;
  return total;
}

/** How many of the well's cells stand in the world as the structure has them, and how many are wrong. */
function compare(test: Test, rotation: StructureRotation = StructureRotation.None): { right: number; wrong: string[]; missing: string[]; placed: number } {
  return compareAt(test, WELL, WELL_SIZE, ORIGIN, rotation);
}

/**
 * The world at `origin` against the game's own placement of `structure` at
 * `rotation`, taken once into memory forty blocks up. A structure saved from
 * the world holds air as a block; the shipped one holds it as nothing.
 */
function compareAt(test: Test, structure: string, size0: { x: number; y: number; z: number }, origin: Vector3, rotation: StructureRotation): { right: number; wrong: string[]; missing: string[]; placed: number } {
  const s = world.structureManager.get(structure);
  test.assert(s !== undefined, `the structure ${structure} is not in the world's packs`);
  const dim = test.getDimension();
  const o = test.worldBlockLocation(origin);
  const id = `qoltest:${structure.replace(/^[^:]+:/, "")}_${rotation}`;
  let ref = world.structureManager.get(id);
  if (!ref) {
    const far = { x: o.x, y: o.y + 40, z: o.z };
    world.structureManager.place(s!, dim, far, { rotation });
    const size = rotation === StructureRotation.None || rotation === StructureRotation.Rotate180 ? size0 : { x: size0.z, y: size0.y, z: size0.x };
    ref = world.structureManager.createFromWorld(id, dim, far, { x: far.x + size.x - 1, y: far.y + size.y - 1, z: far.z + size.z - 1 }, { includeEntities: false, saveMode: StructureSaveMode.Memory });
    for (let x = 0; x < size.x; x++) for (let y = 0; y < size.y; y++) for (let z = 0; z < size.z; z++) dim.setBlockType({ x: far.x + x, y: far.y + y, z: far.z + z }, "minecraft:air");
  }
  let right = 0, placed = 0;
  const wrong: string[] = [];
  const missing: string[] = [];
  for (let x = 0; x < ref.size.x; x++)
    for (let y = 0; y < ref.size.y; y++)
      for (let z = 0; z < ref.size.z; z++) {
        const saved = ref.getBlockPermutation({ x, y, z });
        const want = saved && saved.type.id !== "minecraft:air" ? saved : undefined;
        const b = dim.getBlock({ x: o.x + x, y: o.y + y, z: o.z + z });
        if (!b) continue;
        if (!b.isAir) placed++;
        if (!want) {
          if (!b.isAir) wrong.push(`${x},${y},${z} should be air, is ${b.typeId}`);
          continue;
        }
        if (b.typeId === want.type.id && JSON.stringify(b.permutation.getAllStates()) === JSON.stringify(want.getAllStates())) right++;
        else if (!b.isAir) wrong.push(`${x},${y},${z} wants ${want.type.id} ${JSON.stringify(want.getAllStates())}, is ${b.typeId} ${JSON.stringify(b.permutation.getAllStates())}`);
        else missing.push(`${x},${y},${z} wants ${want.type.id} ${JSON.stringify(want.getAllStates())}, is air`);
      }
  return { right, wrong, missing, placed };
}

function highestPlacedLayer(test: Test): { top: number; lowestGap: number } {
  const dim = test.getDimension();
  const o = test.worldBlockLocation(ORIGIN);
  const s = world.structureManager.get(WELL)!;
  let top = -1, lowestGap = Infinity;
  for (let y = 0; y < WELL_SIZE.y; y++)
    for (let x = 0; x < WELL_SIZE.x; x++)
      for (let z = 0; z < WELL_SIZE.z; z++) {
        const want = s.getBlockPermutation({ x, y, z });
        if (!want) continue;
        const b = dim.getBlock({ x: o.x + x, y: o.y + y, z: o.z + z });
        if (b && !b.isAir) top = Math.max(top, y);
        else lowestGap = Math.min(lowestGap, y);
      }
  return { top, lowestGap };
}

registerAsync("qol", "builder_well_goes_up_block_by_block", async (test) => {
  await rig(test);
  place(test, 0, 2);
  await test.idle(10);
  test.assert(last(test).startsWith("villages:place ok"), `expected the hatch to accept the well, got "${last(test)}"`);
  // Part way through: some blocks stand, not all, and nothing stands more than one layer above the lowest gap.
  await test.idle(60);
  const mid = compare(test);
  test.assert(mid.placed > 0 && mid.placed < WELL_CELLS, `expected the well part built after 70 ticks at 2 ticks a block, found ${mid.placed} of ${WELL_CELLS} cells`);
  const layers = highestPlacedLayer(test);
  test.assert(layers.top <= layers.lowestGap, `expected the well to go up layer by layer; the highest block is on layer ${layers.top} while layer ${layers.lowestGap} has a gap`);
  test.succeedWhen(() => {
    const r = compare(test);
    test.assert(r.wrong.length === 0, `${r.wrong.length} cell(s) differ from the structure: ${r.wrong.slice(0, 3).join("; ")}`);
    test.assert(r.right === WELL_CELLS, `expected all ${WELL_CELLS} cells as the structure has them, found ${r.right}`);
    for (const [item, n] of Object.entries(MATERIALS)) {
      const left = count(test, CHEST, item);
      test.assert(left === 0, `expected every ${item} taken from the chest (${n}), ${left} left`);
    }
  });
}).maxTicks(1400).structureName("qol:arena");

registerAsync("qol", "builder_refuses_a_block_in_the_way", async (test) => {
  await rig(test);
  test.setBlockType("minecraft:stone", { x: 3, y: 3, z: 3 });
  place(test, 0, 2);
  await test.idle(10);
  const w = test.worldBlockLocation({ x: 3, y: 3, z: 3 });
  test.assert(last(test).startsWith("villages:place refused"), `expected a refusal, got "${last(test)}"`);
  test.assert(last(test).includes("stone") && last(test).includes(`${w.x},${w.y},${w.z}`), `expected the refusal to name the stone at ${w.x},${w.y},${w.z}, got "${last(test)}"`);
  await test.idle(20);
  const r = compare(test);
  test.assert(r.placed === 1, `expected nothing placed but the stone, found ${r.placed} block(s) in the box`);
  test.assert(count(test, CHEST, "minecraft:cobblestone") === 32, `expected the chest untouched, cobblestone is ${count(test, CHEST, "minecraft:cobblestone")}`);
  test.succeed();
}).maxTicks(200).structureName("qol:arena");

registerAsync("qol", "builder_refuses_a_short_chest", async (test) => {
  await rig(test, { ...MATERIALS, "minecraft:cobblestone": 31 });
  place(test, 0, 2);
  await test.idle(10);
  test.assert(last(test).startsWith("villages:place refused"), `expected a refusal, got "${last(test)}"`);
  test.assert(last(test).includes("1 cobblestone"), `expected the refusal to name the one cobblestone short, got "${last(test)}"`);
  await test.idle(20);
  const r = compare(test);
  test.assert(r.placed === 0, `expected nothing placed, found ${r.placed} block(s) in the box`);
  test.succeed();
}).maxTicks(200).structureName("qol:arena");

registerAsync("qol", "builder_remove_puts_every_block_back", async (test) => {
  await rig(test);
  place(test, 0, 1);
  const o = test.worldBlockLocation(ORIGIN);
  for (let t = 0; t < 600 && compare(test).right < WELL_CELLS; t += 10) await test.idle(10);
  test.assert(compare(test).right === WELL_CELLS, `expected the well finished before taking it down, ${compare(test).right} of ${WELL_CELLS} cells stand`);
  test.getDimension().runCommand(`scriptevent villages:remove ${o.x + 2} ${o.y + 2} ${o.z + 2} 1`);
  await test.idle(5);
  test.assert(last(test).startsWith("villages:remove ok"), `expected the removal to start, got "${last(test)}"`);
  test.succeedWhen(() => {
    const r = compare(test);
    test.assert(r.placed === 0, `expected the well gone, ${r.placed} block(s) still stand`);
    for (const [item, n] of Object.entries(MATERIALS)) {
      const back = count(test, CHEST, item);
      test.assert(back === n, `expected ${n} ${item} back in the chest, found ${back}`);
    }
    const total = chestTotal(test);
    const want = Object.values(MATERIALS).reduce((a, b) => a + b, 0);
    test.assert(total === want, `expected exactly ${want} items in the chest, found ${total}`);
  });
}).maxTicks(1600).structureName("qol:arena");

// The free-build mode (the panel's toggle; the hatch's `free`): the well goes
// up from an empty chest, and comes down without putting anything in it, so
// the mode can never mint materials.
registerAsync("qol", "builder_free_mode_moves_nothing", async (test) => {
  await rig(test, {});
  place(test, 0, 1, "tallfolk_well", true);
  await test.idle(10);
  test.assert(last(test).startsWith("villages:place ok") && last(test).endsWith("free"), `expected the hatch to accept a free well, got "${last(test)}"`);
  for (let t = 0; t < 600 && compare(test).right < WELL_CELLS; t += 10) await test.idle(10);
  test.assert(compare(test).right === WELL_CELLS, `expected the free well finished, ${compare(test).right} of ${WELL_CELLS} cells stand`);
  test.assert(chestTotal(test) === 0, `expected the chest still empty after a free build, found ${chestTotal(test)} item(s)`);
  const o = test.worldBlockLocation(ORIGIN);
  test.getDimension().runCommand(`scriptevent villages:remove ${o.x + 2} ${o.y + 2} ${o.z + 2} 1`);
  test.succeedWhen(() => {
    const r = compare(test);
    test.assert(r.placed === 0, `expected the free well gone, ${r.placed} block(s) still stand`);
    test.assert(chestTotal(test) === 0, `expected nothing back in the chest from a free building, found ${chestTotal(test)} item(s)`);
  });
}).maxTicks(1600).structureName("qol:arena");

registerAsync("qol", "builder_turned_well_matches_the_games_rotation", async (test) => {
  // The builder's own rotation table against structureManager.place with
  // Rotate90: every stair, the hanging lantern and the water, cell for cell.
  await rig(test);
  place(test, 1, 1);
  await test.idle(10);
  test.assert(last(test).startsWith("villages:place ok"), `expected the hatch to accept the turned well, got "${last(test)}"`);
  test.succeedWhen(() => {
    const r = compare(test, StructureRotation.Rotate90);
    test.assert(r.wrong.length === 0, `${r.wrong.length} cell(s) differ from the game's Rotate90 placement: ${r.wrong.slice(0, 3).join("; ")}`);
    test.assert(r.right === WELL_CELLS, `expected all ${WELL_CELLS} cells as the game turns them, found ${r.right}`);
  });
}).maxTicks(800).structureName("qol:arena");

// Palette swaps (settlements.md §4): the tallfolk well raised "as the
// stonefolk build it". The chest holds only the stonefolk materials, so the
// placement is refused unless the materials list is the swapped one; every
// cell is checked against the shipped structure through the pack's own swap
// table, its stairs keeping their direction; and taking it down puts the
// stonefolk blocks back, never the tallfolk ones.
const STONEFOLK_WELL: Record<string, number> = {
  "minecraft:stone_bricks": 32,
  "minecraft:deepslate_tile_stairs": 24,
  "minecraft:deepslate_tiles": 10,
  "minecraft:oak_fence": 8,
  "minecraft:deepslate_tile_slab": 1,
  "minecraft:lantern": 1,
};

/** The world at the origin against a shipped building with a palette's swap table applied, unturned. */
function compareSwapped(test: Test, palette: string, key = "tallfolk_well", size = WELL_SIZE): { right: number; swapped: number; wrong: string[]; missing: string[]; placed: number } {
  const s = world.structureManager.get(`villages:${key}`);
  test.assert(s !== undefined, `the structure villages:${key} is not in the world's packs`);
  const table = paletteTable(key, palette);
  const dim = test.getDimension();
  const o = test.worldBlockLocation(ORIGIN);
  let right = 0, swapped = 0, placed = 0;
  const wrong: string[] = [];
  const missing: string[] = [];
  for (let x = 0; x < size.x; x++)
    for (let y = 0; y < size.y; y++)
      for (let z = 0; z < size.z; z++) {
        const want = s!.getBlockPermutation({ x, y, z });
        const b = dim.getBlock({ x: o.x + x, y: o.y + y, z: o.z + z });
        if (!b) continue;
        if (!b.isAir) placed++;
        if (!want) {
          if (!b.isAir) wrong.push(`${x},${y},${z} should be air, is ${b.typeId}`);
          continue;
        }
        const name = table[want.type.id] ?? want.type.id;
        if (b.isAir) {
          missing.push(`${x},${y},${z} wants ${name}, is air`);
          continue;
        }
        if (b.typeId !== name) {
          wrong.push(`${x},${y},${z} wants ${name} (${want.type.id} swapped), is ${b.typeId}`);
          continue;
        }
        if (name !== want.type.id) {
          swapped++;
          const kept = Object.entries(shapeStates(name, want.getAllStates()));
          const states = b.permutation.getAllStates() as Record<string, unknown>;
          const lost = kept.filter(([k, v]) => states[k] !== v);
          if (lost.length) {
            wrong.push(`${x},${y},${z} ${name} lost its shape: wants ${JSON.stringify(Object.fromEntries(kept))}, is ${JSON.stringify(b.permutation.getAllStates())}`);
            continue;
          }
        }
        right++;
      }
  return { right, swapped, wrong, missing, placed };
}

registerAsync("qol", "builder_well_as_the_stonefolk_build_it", async (test) => {
  await rig(test, STONEFOLK_WELL);
  place(test, 0, 1, "tallfolk_well", false, "stonefolk");
  await test.idle(10);
  test.assert(last(test).startsWith("villages:place ok") && last(test).endsWith("as stonefolk"), `expected the hatch to accept the well as the stonefolk build it from a chest of their materials, got "${last(test)}"`);
  for (let t = 0; t < 600 && compareSwapped(test, "stonefolk").right < WELL_CELLS; t += 10) await test.idle(10);
  const r = compareSwapped(test, "stonefolk");
  test.assert(r.wrong.length === 0, `${r.wrong.length} cell(s) differ from the swapped well: ${r.wrong.slice(0, 3).join("; ")}`);
  test.assert(r.right === WELL_CELLS, `expected all ${WELL_CELLS} cells of the swapped well, found ${r.right} (${r.missing.length} missing: ${r.missing.slice(0, 3).join("; ")})`);
  test.assert(r.swapped === 67, `expected 67 cells swapped to stonefolk blocks (32 footing, 24 stairs, 10 roof, 1 slab), found ${r.swapped}`);
  test.assert(chestTotal(test) === 0, `expected the stonefolk materials all taken from the chest, ${chestTotal(test)} item(s) left`);
  const o = test.worldBlockLocation(ORIGIN);
  test.getDimension().runCommand(`scriptevent villages:remove ${o.x + 2} ${o.y + 2} ${o.z + 2} 1`);
  await test.idle(5);
  test.assert(last(test).startsWith("villages:remove ok"), `expected the removal to start, got "${last(test)}"`);
  test.succeedWhen(() => {
    const after = compareSwapped(test, "stonefolk");
    test.assert(after.placed === 0, `expected the swapped well gone, ${after.placed} block(s) still stand`);
    for (const [item, n] of Object.entries(STONEFOLK_WELL)) {
      const back = count(test, CHEST, item);
      test.assert(back === n, `expected ${n} ${item} back in the chest, found ${back}`);
    }
    for (const item of ["minecraft:cobblestone", "minecraft:dark_oak_stairs", "minecraft:dark_oak_planks", "minecraft:dark_oak_slab"]) test.assert(count(test, CHEST, item) === 0, `expected no ${item} back from a stonefolk well, found ${count(test, CHEST, item)}`);
    const want = Object.values(STONEFOLK_WELL).reduce((a, b) => a + b, 0);
    test.assert(chestTotal(test) === want, `expected exactly ${want} items in the chest, found ${chestTotal(test)}`);
  });
}).maxTicks(1600).structureName("qol:arena");

// Repair (settlements.md §5.4): four blocks knocked out of a finished well and
// a stone put where a fifth should be. The gaps are filled from the chest,
// one item each and nothing more; the stone is somebody else's and stays.
registerAsync("qol", "builder_repair_fills_the_gaps", async (test) => {
  await rig(test);
  place(test, 0, 1);
  for (let t = 0; t < 600 && compare(test).right < WELL_CELLS; t += 10) await test.idle(10);
  test.assert(compare(test).right === WELL_CELLS, `expected the well finished before the damage, ${compare(test).right} of ${WELL_CELLS} cells stand`);
  // Two cobblestone of the footing, a fence post and the hanging lantern, then a stone in a third footing cell.
  const gaps: Vector3[] = [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 1, y: 2, z: 1 }, { x: 2, y: 3, z: 2 }];
  for (const g of gaps) test.setBlockType("minecraft:air", { x: ORIGIN.x + g.x, y: ORIGIN.y + g.y, z: ORIGIN.z + g.z });
  const stoneAt = { x: ORIGIN.x + 4, y: ORIGIN.y, z: ORIGIN.z };
  test.setBlockType("minecraft:stone", stoneAt);
  // The chest: what the gaps need, plus one cobblestone that must stay.
  put(test, CHEST, new ItemStack("minecraft:cobblestone", 3), 0);
  put(test, CHEST, new ItemStack("minecraft:oak_fence", 1), 1);
  put(test, CHEST, new ItemStack("minecraft:lantern", 1), 2);
  const o = test.worldBlockLocation(ORIGIN);
  test.getDimension().runCommand(`scriptevent villages:repair ${o.x + 2} ${o.y + 2} ${o.z + 2} 1`);
  await test.idle(5);
  test.assert(last(test).startsWith("villages:repair ok"), `expected the repair to start, got "${last(test)}"`);
  test.succeedWhen(() => {
    const r = compare(test);
    test.assert(r.right === WELL_CELLS - 1, `expected every cell but the stone's back as the structure has it, ${r.right} of ${WELL_CELLS} match`);
    test.assertBlockPresent("minecraft:stone", stoneAt, true);
    test.assert(chestTotal(test) === 1, `expected one cobblestone left in the chest after four gaps were filled, found ${chestTotal(test)} item(s)`);
  });
}).maxTicks(1600).structureName("qol:arena");

// Survey (settlements.md §5.4): a little thing between two stakes is saved as
// a new blueprint and raised again elsewhere, cell for cell, without the
// stakes and without the air a saved structure carries as blocks.
registerAsync("qol", "builder_survey_makes_a_blueprint", async (test) => {
  await rig(test, {});
  const dim = test.getDimension();
  // A 3x2 cobblestone pad at y = 1 with a fence post and a stair on it; the
  // stakes at two opposite corners of the 3x3x3 box, one high and one low.
  for (let x = 1; x <= 3; x++) for (let z = 1; z <= 2; z++) test.setBlockType("minecraft:cobblestone", { x, y: 1, z });
  test.setBlockType("minecraft:oak_fence", { x: 2, y: 2, z: 2 });
  test.setBlockPermutation(BlockPermutation.resolve("minecraft:stone_stairs", { weirdo_direction: 1, upside_down_bit: false }), { x: 3, y: 2, z: 1 });
  test.setBlockType("villages:survey_stake", { x: 1, y: 3, z: 1 });
  test.setBlockType("villages:survey_stake", { x: 3, y: 1, z: 3 });
  const a = test.worldBlockLocation({ x: 1, y: 3, z: 1 });
  const b = test.worldBlockLocation({ x: 3, y: 1, z: 3 });
  dim.runCommand(`scriptevent villages:survey ${a.x} ${a.y} ${a.z} ${b.x} ${b.y} ${b.z}`);
  await test.idle(5);
  const verdict = last(test, { x: 1, y: 3, z: 1 });
  const m = /villages:survey ok: (survey_\d+) (\d+)x(\d+)x(\d+), (\d+) cells/.exec(verdict);
  test.assert(m !== null, `expected the survey to be taken, got "${verdict}"`);
  test.assert(m![2] === "3" && m![3] === "3" && m![4] === "3", `expected a 3x3x3 box, got ${m![2]}x${m![3]}x${m![4]}`);
  test.assert(m![5] === "8", `expected 8 cells (6 cobblestone, a fence, a stair; no stakes, no air), got ${m![5]}`);
  // Raise the copy four blocks south, free, and compare it with the original cell for cell.
  const o = test.worldBlockLocation({ x: 1, y: 1, z: 5 });
  dim.runCommand(`scriptevent villages:place ${m![1]} ${o.x} ${o.y} ${o.z} 0 1 free`);
  await test.idle(5);
  test.assert(last(test, { x: 1, y: 1, z: 5 }).startsWith("villages:place ok"), `expected the copy to start, got "${last(test, { x: 1, y: 1, z: 5 })}"`);
  test.succeedWhen(() => {
    let same = 0;
    const wrong: string[] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++) {
          const src = test.getBlock({ x: 1 + x, y: 1 + y, z: 1 + z });
          const dst = test.getBlock({ x: 1 + x, y: 1 + y, z: 5 + z });
          const want = src.typeId === "villages:survey_stake" ? "minecraft:air" : src.typeId;
          if (dst.typeId === want && (want === "minecraft:air" || JSON.stringify(dst.permutation.getAllStates()) === JSON.stringify(src.permutation.getAllStates()))) same++;
          else wrong.push(`${x},${y},${z} wants ${want}, is ${dst.typeId}`);
        }
    test.assert(wrong.length === 0, `${wrong.length} cell(s) of the copy differ: ${wrong.slice(0, 3).join("; ")}`);
    test.assert(same === 27, `expected all 27 cells of the copy to match (the stakes' cells as air), ${same} do`);
  });
}).maxTicks(600).structureName("qol:arena");

// ---------------------------------------------------------------------------
// Buildings wider than the eight-block arena: the sixteen-block one, its own
// floor (the (0,*,0) column reserved as ever), the table at x = 15.
// ---------------------------------------------------------------------------

const ARENA16 = "qol:arena16";
const TABLE16: Vector3 = { x: 15, y: 1, z: 1 };
const CHEST16: Vector3 = { x: 15, y: 1, z: 2 };

const POST16: Vector3 = { x: 15, y: 1, z: 4 };

async function rig16(test: Test, chest: Record<string, number> = {}): Promise<void> {
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (x !== 0 || z !== 0) test.setBlockType("minecraft:stone", { x, y: 0, z });
  const dim = test.getDimension();
  const here = test.worldBlockLocation(ORIGIN);
  for (const type of [PERSON, "villages:waypoint"]) for (const e of dim.getEntities({ type, location: here, maxDistance: 32 })) e.remove();
  dim.runCommand(`scriptevent villages:forget ${here.x} ${here.y} ${here.z} 32`);
  test.setBlockType("villages:blueprint_table", TABLE16);
  test.setBlockType("minecraft:chest", CHEST16);
  test.setBlockPermutation(builderPost(), POST16);
  let slot = 0;
  for (const [item, n] of Object.entries(chest)) {
    let left = n;
    while (left > 0) {
      const amount = Math.min(64, left);
      put(test, CHEST16, new ItemStack(item, amount), slot++);
      left -= amount;
    }
  }
  test.assert(await until(test, () => persons(test, 32) >= 1, 400, 5), `expected the builder's post to spawn its person, found ${persons(test, 32)}`);
}

function chestTotal16(test: Test): number {
  const c = container(test, CHEST16);
  let total = 0;
  if (c) for (let i = 0; i < c.size; i++) total += c.getItem(i)?.amount ?? 0;
  return total;
}

// The inn turned once by the pack against the game's Rotate90: the first
// building with beds (direction), a ladder (facing_direction), lying logs
// (pillar_axis) and doors, so the rotation table's unmeasured rows are
// measured here, cell for cell. Free, since 689 items would not fit a chest.
registerAsync("qol", "builder_turned_inn_matches_the_games_rotation", async (test) => {
  await rig16(test);
  const o = test.worldBlockLocation(ORIGIN);
  test.getDimension().runCommand(`scriptevent villages:place shared_inn ${o.x} ${o.y} ${o.z} 1 1 free`);
  await test.idle(10);
  test.assert(last(test).startsWith("villages:place ok"), `expected the hatch to accept the turned inn, got "${last(test)}"`);
  const INN = { x: 11, y: 13, z: 11 };
  test.succeedWhen(() => {
    const r = compareAt(test, "villages:shared_inn", INN, ORIGIN, StructureRotation.Rotate90);
    test.assert(r.wrong.length === 0, `${r.wrong.length} cell(s) differ from the game's Rotate90 inn: ${r.wrong.slice(0, 4).join("; ")}`);
    test.assert(r.right === 689, `expected all 689 cells as the game turns them, found ${r.right}; missing: ${r.missing.slice(0, 4).join("; ")}`);
  });
}).maxTicks(3000).structureName(ARENA16);

// The well as the high elves build it: a people's row taken from the
// generator's cottage record rather than the design's §4 table, and a roof
// whose stairs go by a legacy name (`prismarine_bricks_stairs`, slab
// `prismarine_brick_slab`). The chest is filled by those names, so a wrong
// one fails at the rig; the cells are checked as the stonefolk well's are.
const HIGH_ELF_WELL: Record<string, number> = {
  "minecraft:polished_diorite": 32,
  "minecraft:prismarine_bricks_stairs": 24,
  "minecraft:prismarine_bricks": 10,
  "minecraft:oak_fence": 8,
  "minecraft:prismarine_brick_slab": 1,
  "minecraft:lantern": 1,
};
registerAsync("qol", "builder_well_as_the_high_elves_build_it", async (test) => {
  await rig(test, HIGH_ELF_WELL);
  place(test, 0, 1, "tallfolk_well", false, "high_elf");
  await test.idle(10);
  test.assert(last(test).startsWith("villages:place ok") && last(test).endsWith("as high_elf"), `expected the hatch to accept the well as the high elves build it, got "${last(test)}"`);
  for (let t = 0; t < 600 && compareSwapped(test, "high_elf").right < WELL_CELLS; t += 10) await test.idle(10);
  const r = compareSwapped(test, "high_elf");
  test.assert(r.wrong.length === 0, `${r.wrong.length} cell(s) differ from the swapped well: ${r.wrong.slice(0, 3).join("; ")}`);
  test.assert(r.right === WELL_CELLS, `expected all ${WELL_CELLS} cells of the swapped well, found ${r.right} (${r.missing.length} missing: ${r.missing.slice(0, 3).join("; ")})`);
  test.assert(r.swapped === 67, `expected 67 cells swapped to high elf blocks, found ${r.swapped}`);
  test.assert(chestTotal(test) === 0, `expected the high elf materials all taken from the chest, ${chestTotal(test)} item(s) left`);
  const o = test.worldBlockLocation(ORIGIN);
  test.getDimension().runCommand(`scriptevent villages:remove ${o.x + 2} ${o.y + 2} ${o.z + 2} 1`);
  test.succeedWhen(() => {
    test.assert(compareSwapped(test, "high_elf").placed === 0, `expected the swapped well gone, ${compareSwapped(test, "high_elf").placed} block(s) still stand`);
    for (const [item, n] of Object.entries(HIGH_ELF_WELL)) test.assert(count(test, CHEST, item) === n, `expected ${n} ${item} back in the chest, found ${count(test, CHEST, item)}`);
    const want = Object.values(HIGH_ELF_WELL).reduce((a, b) => a + b, 0);
    test.assert(chestTotal(test) === want, `expected exactly ${want} items in the chest, found ${chestTotal(test)}`);
  });
}).maxTicks(1600).structureName("qol:arena");

// The market stall as the reedfolk build it (settlements.md §2.5, §4): the
// awning row of the palette table. Authored under tinker in brick with red
// and white stripes, it goes up from a chest of mangrove logs and green and
// white wool, stripe for stripe, the counters and posts as authored.
const STALL_SIZE = { x: 7, y: 5, z: 7 };
const STALL_CELLS = 118;
const REEDFOLK_STALL: Record<string, number> = {
  "minecraft:mangrove_log": 49,
  "minecraft:green_wool": 28,
  "minecraft:white_wool": 21,
  "minecraft:spruce_fence": 10,
  "minecraft:barrel": 7,
  "minecraft:chest": 1,
  "minecraft:lantern": 1,
  "villages:post": 1,
};
registerAsync("qol", "builder_stall_as_the_reedfolk_build_it", async (test) => {
  await rig16(test, REEDFOLK_STALL);
  const o = test.worldBlockLocation(ORIGIN);
  test.getDimension().runCommand(`scriptevent villages:place tinker_stall ${o.x} ${o.y} ${o.z} 0 1 reedfolk`);
  await test.idle(10);
  test.assert(last(test).startsWith("villages:place ok") && last(test).endsWith("as reedfolk"), `expected the hatch to accept the stall as the reedfolk build it from a chest of their materials, got "${last(test)}"`);
  for (let t = 0; t < 1000 && compareSwapped(test, "reedfolk", "tinker_stall", STALL_SIZE).right < STALL_CELLS; t += 10) await test.idle(10);
  const r = compareSwapped(test, "reedfolk", "tinker_stall", STALL_SIZE);
  test.assert(r.wrong.length === 0, `${r.wrong.length} cell(s) differ from the swapped stall: ${r.wrong.slice(0, 3).join("; ")}`);
  test.assert(r.right === STALL_CELLS, `expected all ${STALL_CELLS} cells of the swapped stall, found ${r.right} (${r.missing.length} missing: ${r.missing.slice(0, 3).join("; ")})`);
  test.assert(r.swapped === 77, `expected 77 cells swapped to reedfolk blocks (49 footing, 28 green stripes), found ${r.swapped}`);
  const dim = test.getDimension();
  let green = 0, white = 0, red = 0;
  for (let x = 0; x < STALL_SIZE.x; x++)
    for (let z = 0; z < STALL_SIZE.z; z++) {
      const id = dim.getBlock({ x: o.x + x, y: o.y + 4, z: o.z + z })?.typeId;
      if (id === "minecraft:green_wool") green++;
      else if (id === "minecraft:white_wool") white++;
      else if (id === "minecraft:red_wool") red++;
    }
  test.assert(green === 28 && white === 21 && red === 0, `expected an awning of 28 green and 21 white wool, found ${green} green, ${white} white, ${red} red`);
  test.assert(chestTotal16(test) === 0, `expected the reedfolk materials all taken from the chest, ${chestTotal16(test)} item(s) left`);
  test.getDimension().runCommand(`scriptevent villages:remove ${o.x + 3} ${o.y + 1} ${o.z + 3} 1`);
  await test.idle(5);
  test.assert(last(test).startsWith("villages:remove ok"), `expected the removal to start, got "${last(test)}"`);
  test.succeedWhen(() => {
    const after = compareSwapped(test, "reedfolk", "tinker_stall", STALL_SIZE);
    test.assert(after.placed === 0, `expected the swapped stall gone, ${after.placed} block(s) still stand`);
    for (const [item, n] of Object.entries(REEDFOLK_STALL)) {
      const back = count(test, CHEST16, item);
      test.assert(back === n, `expected ${n} ${item} back in the chest, found ${back}`);
    }
    test.assert(count(test, CHEST16, "minecraft:red_wool") === 0 && count(test, CHEST16, "minecraft:brick_block") === 0, `expected no tinker blocks back from a reedfolk stall`);
    const want = Object.values(REEDFOLK_STALL).reduce((a, b) => a + b, 0);
    test.assert(chestTotal16(test) === want, `expected exactly ${want} items in the chest, found ${chestTotal16(test)}`);
  });
}).maxTicks(3000).structureName(ARENA16);

// The larder comes down whole: its door is two cells and one item, and its
// five chests stand in rows that pair into double chests. Everything that
// went in comes back and nothing more, so a popped door half or a merged
// chest would show as a count. Its job post (a builder's) goes up as the
// kids' own, so nobody spawns at it, and comes down with its record.
const LARDER_MATERIALS: Record<string, number> = {
  "minecraft:spruce_planks": 69,
  "minecraft:spruce_stairs": 48,
  "minecraft:stone_bricks": 25,
  "minecraft:spruce_log": 12,
  "minecraft:chest": 5,
  "minecraft:spruce_door": 1,
  "minecraft:lantern": 1,
  "minecraft:spruce_slab": 1,
  "villages:post": 1,
};
registerAsync("qol", "builder_larder_comes_down_whole", async (test) => {
  await rig16(test, LARDER_MATERIALS);
  const o = test.worldBlockLocation(ORIGIN);
  const dim = test.getDimension();
  dim.runCommand(`scriptevent villages:place shared_larder ${o.x} ${o.y} ${o.z} 0 1`);
  await test.idle(10);
  test.assert(last(test).startsWith("villages:place ok"), `expected the hatch to accept the larder, got "${last(test)}"`);
  const LARDER = { x: 7, y: 8, z: 7 };
  for (let t = 0; t < 1200 && compareAt(test, "villages:shared_larder", LARDER, ORIGIN, StructureRotation.None).right < 164; t += 10) await test.idle(10);
  const built = compareAt(test, "villages:shared_larder", LARDER, ORIGIN, StructureRotation.None);
  test.assert(built.right === 164, `expected the larder finished before taking it down, ${built.right} of 164 cells stand: ${built.wrong.slice(0, 3).join("; ")}`);
  test.assert(chestTotal16(test) === 0, `expected the chest emptied by the build, ${chestTotal16(test)} item(s) left`);
  test.assert(persons(test, 32) === 1, `expected only the builder about: the larder's own post is the kids' and spawns nobody, found ${persons(test, 32)} person(s)`);
  dim.runCommand(`scriptevent villages:remove ${o.x + 3} ${o.y + 1} ${o.z + 3} 1`);
  await test.idle(5);
  test.assert(last(test).startsWith("villages:remove ok"), `expected the removal to start, got "${last(test)}"`);
  test.succeedWhen(() => {
    const r = compareAt(test, "villages:shared_larder", LARDER, ORIGIN, StructureRotation.None);
    test.assert(r.placed === 0, `expected the larder gone, ${r.placed} block(s) still stand`);
    for (const [item, n] of Object.entries(LARDER_MATERIALS)) {
      const back = count(test, CHEST16, item);
      test.assert(back === n, `expected ${n} ${item} back in the chest, found ${back}`);
    }
    const drops = dim.getEntities({ type: "minecraft:item", location: o, maxDistance: 16 }).length;
    test.assert(drops === 0, `expected nothing on the ground, found ${drops} dropped item(s)`);
  });
}).maxTicks(3000).structureName(ARENA16);

// A bed and a door, the two-block things, surveyed and then placed and taken
// down: one item each into the chest, none on the ground.
registerAsync("qol", "builder_bed_and_door_come_down_whole", async (test) => {
  await rig(test, { "minecraft:bed": 1, "minecraft:spruce_door": 1 });
  const dim = test.getDimension();
  // On the floor at z = 1..3: a bed lying north-south (head north) and a door facing south; stakes at the box's far corners.
  test.setBlockPermutation(BlockPermutation.resolve("minecraft:bed", { direction: 2, head_piece_bit: true, occupied_bit: false }), { x: 1, y: 1, z: 1 });
  test.setBlockPermutation(BlockPermutation.resolve("minecraft:bed", { direction: 2, head_piece_bit: false, occupied_bit: false }), { x: 1, y: 1, z: 2 });
  test.setBlockPermutation(BlockPermutation.resolve("minecraft:spruce_door", { "minecraft:cardinal_direction": "south", door_hinge_bit: false, open_bit: false, upper_block_bit: false }), { x: 3, y: 1, z: 3 });
  test.setBlockPermutation(BlockPermutation.resolve("minecraft:spruce_door", { "minecraft:cardinal_direction": "south", door_hinge_bit: false, open_bit: false, upper_block_bit: true }), { x: 3, y: 2, z: 3 });
  test.setBlockType("villages:survey_stake", { x: 1, y: 3, z: 3 });
  test.setBlockType("villages:survey_stake", { x: 3, y: 3, z: 1 });
  const a = test.worldBlockLocation({ x: 1, y: 1, z: 1 });
  const b = test.worldBlockLocation({ x: 3, y: 3, z: 3 });
  dim.runCommand(`scriptevent villages:survey ${a.x} ${a.y} ${a.z} ${b.x} ${b.y} ${b.z}`);
  await test.idle(5);
  const m = /villages:survey ok: (survey_\d+) 3x3x3, (\d+) cells/.exec(last(test, { x: 1, y: 1, z: 1 }));
  test.assert(m !== null, `expected the survey to be taken, got "${last(test, { x: 1, y: 1, z: 1 })}"`);
  test.assert(m![2] === "4", `expected 4 cells (two bed halves, two door halves), got ${m![2]}`);
  // Raise the copy beside the original, paid from the chest, then take it down.
  const o = test.worldBlockLocation({ x: 1, y: 1, z: 5 });
  dim.runCommand(`scriptevent villages:place ${m![1]} ${o.x} ${o.y} ${o.z} 0 1`);
  await test.idle(5);
  test.assert(last(test, { x: 1, y: 1, z: 5 }).startsWith("villages:place ok"), `expected the copy to start, got "${last(test, { x: 1, y: 1, z: 5 })}"`);
  for (let t = 0; t < 200 && !(test.getBlock({ x: 3, y: 2, z: 7 }).typeId === "minecraft:spruce_door" && test.getBlock({ x: 1, y: 1, z: 6 }).typeId === "minecraft:bed"); t += 5) await test.idle(5);
  test.assert(test.getBlock({ x: 1, y: 1, z: 5 }).typeId === "minecraft:bed" && test.getBlock({ x: 1, y: 1, z: 6 }).typeId === "minecraft:bed", `expected both bed halves placed, found ${test.getBlock({ x: 1, y: 1, z: 5 }).typeId} and ${test.getBlock({ x: 1, y: 1, z: 6 }).typeId}`);
  test.assert(test.getBlock({ x: 3, y: 1, z: 7 }).typeId === "minecraft:spruce_door" && test.getBlock({ x: 3, y: 2, z: 7 }).typeId === "minecraft:spruce_door", `expected both door halves placed, found ${test.getBlock({ x: 3, y: 1, z: 7 }).typeId} and ${test.getBlock({ x: 3, y: 2, z: 7 }).typeId}`);
  test.assert(chestTotal(test) === 0, `expected the bed and the door taken from the chest, ${chestTotal(test)} item(s) left`);
  dim.runCommand(`scriptevent villages:remove ${o.x} ${o.y} ${o.z} 1`);
  await test.idle(5);
  test.assert(last(test, { x: 1, y: 1, z: 5 }).startsWith("villages:remove ok"), `expected the removal to start, got "${last(test, { x: 1, y: 1, z: 5 })}"`);
  test.succeedWhen(() => {
    for (const p of [{ x: 1, y: 1, z: 5 }, { x: 1, y: 1, z: 6 }, { x: 3, y: 1, z: 7 }, { x: 3, y: 2, z: 7 }]) test.assertBlockPresent("minecraft:air", p, true);
    const bed = count(test, CHEST, "minecraft:bed");
    const door = count(test, CHEST, "minecraft:spruce_door");
    test.assert(bed === 1 && door === 1, `expected one bed and one door back in the chest, found ${bed} bed(s) and ${door} door(s)`);
    const drops = dim.getEntities({ type: "minecraft:item", location: o, maxDistance: 12 }).length;
    test.assert(drops === 0, `expected nothing on the ground, found ${drops} dropped item(s)`);
  });
}).maxTicks(800).structureName("qol:arena");
