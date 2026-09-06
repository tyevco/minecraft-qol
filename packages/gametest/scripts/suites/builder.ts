import { ItemStack, StructureRotation, StructureSaveMode, world, type Vector3 } from "@minecraft/server";
import { registerAsync, type Test } from "@minecraft/server-gametest";
import { container, count, floor, put } from "./rig";

/**
 * Builder: a blueprint goes up block by block from the chest, and comes down
 * into it (docs/design/settlements.md §5; packages/builder).
 *
 * A SimulatedPlayer is no player to the builder pack, so the table's form is
 * not driven here; `builder:place` runs the same checks and starts the same
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

const WELL = "builder:tallfolk_well";
const TABLE: Vector3 = { x: 7, y: 1, z: 1 };
const CHEST: Vector3 = { x: 7, y: 1, z: 2 };
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
  const marker = test.getDimension().getEntities({ type: "builder:waypoint", tags: ["builder:verdict"], location: here, maxDistance: 6 })[0];
  return marker?.nameTag ?? "";
}

function rig(test: Test, chest: Record<string, number> = MATERIALS): void {
  floor(test);
  const dim = test.getDimension();
  const here = test.worldBlockLocation(ORIGIN);
  for (const type of ["builder:builder", "builder:waypoint"]) for (const e of dim.getEntities({ type, location: here, maxDistance: 24 })) e.remove();
  // Records from an earlier test in this column would make the placement "cut into" a building.
  dim.runCommand(`scriptevent builder:forget ${here.x} ${here.y} ${here.z} 24`);
  test.setBlockType("builder:blueprint_table", TABLE);
  test.setBlockType("minecraft:chest", CHEST);
  let slot = 0;
  for (const [item, n] of Object.entries(chest)) {
    let left = n;
    while (left > 0) {
      const amount = Math.min(64, left);
      put(test, CHEST, new ItemStack(item, amount), slot++);
      left -= amount;
    }
  }
}

function place(test: Test, rotation = 0, ticks = 2, key = "tallfolk_well"): void {
  const o = test.worldBlockLocation(ORIGIN);
  test.getDimension().runCommand(`scriptevent builder:place ${key} ${o.x} ${o.y} ${o.z} ${rotation} ${ticks}`);
}

/** How many of the well's cells stand in the world as the structure has them, and how many are wrong. */
function compare(test: Test, rotation: StructureRotation = StructureRotation.None): { right: number; wrong: string[]; placed: number } {
  const s = world.structureManager.get(WELL);
  test.assert(s !== undefined, `the structure ${WELL} is not in the world's packs`);
  const dim = test.getDimension();
  const o = test.worldBlockLocation(ORIGIN);
  // Compare against the game's own placement of the same rotation, taken once into memory.
  const id = `qoltest:well_${rotation}`;
  let ref = world.structureManager.get(id);
  if (!ref) {
    const far = { x: o.x, y: o.y + 40, z: o.z };
    world.structureManager.place(s!, dim, far, { rotation });
    const size = rotation === StructureRotation.None || rotation === StructureRotation.Rotate180 ? WELL_SIZE : { x: WELL_SIZE.z, y: WELL_SIZE.y, z: WELL_SIZE.x };
    ref = world.structureManager.createFromWorld(id, dim, far, { x: far.x + size.x - 1, y: far.y + size.y - 1, z: far.z + size.z - 1 }, { includeEntities: false, saveMode: StructureSaveMode.Memory });
    for (let x = 0; x < size.x; x++) for (let y = 0; y < size.y; y++) for (let z = 0; z < size.z; z++) dim.setBlockType({ x: far.x + x, y: far.y + y, z: far.z + z }, "minecraft:air");
  }
  let right = 0, placed = 0;
  const wrong: string[] = [];
  for (let x = 0; x < ref.size.x; x++)
    for (let y = 0; y < ref.size.y; y++)
      for (let z = 0; z < ref.size.z; z++) {
        // A structure saved from the world holds air as a block; the shipped one holds it as nothing.
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
      }
  return { right, wrong, placed };
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
  rig(test);
  place(test, 0, 2);
  await test.idle(10);
  test.assert(last(test).startsWith("builder:place ok"), `expected the hatch to accept the well, got "${last(test)}"`);
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
  rig(test);
  test.setBlockType("minecraft:stone", { x: 3, y: 3, z: 3 });
  place(test, 0, 2);
  await test.idle(10);
  const w = test.worldBlockLocation({ x: 3, y: 3, z: 3 });
  test.assert(last(test).startsWith("builder:place refused"), `expected a refusal, got "${last(test)}"`);
  test.assert(last(test).includes("stone") && last(test).includes(`${w.x},${w.y},${w.z}`), `expected the refusal to name the stone at ${w.x},${w.y},${w.z}, got "${last(test)}"`);
  await test.idle(20);
  const r = compare(test);
  test.assert(r.placed === 1, `expected nothing placed but the stone, found ${r.placed} block(s) in the box`);
  test.assert(count(test, CHEST, "minecraft:cobblestone") === 32, `expected the chest untouched, cobblestone is ${count(test, CHEST, "minecraft:cobblestone")}`);
  test.succeed();
}).maxTicks(200).structureName("qol:arena");

registerAsync("qol", "builder_refuses_a_short_chest", async (test) => {
  rig(test, { ...MATERIALS, "minecraft:cobblestone": 31 });
  place(test, 0, 2);
  await test.idle(10);
  test.assert(last(test).startsWith("builder:place refused"), `expected a refusal, got "${last(test)}"`);
  test.assert(last(test).includes("1 cobblestone"), `expected the refusal to name the one cobblestone short, got "${last(test)}"`);
  await test.idle(20);
  const r = compare(test);
  test.assert(r.placed === 0, `expected nothing placed, found ${r.placed} block(s) in the box`);
  test.succeed();
}).maxTicks(200).structureName("qol:arena");

registerAsync("qol", "builder_remove_puts_every_block_back", async (test) => {
  rig(test);
  place(test, 0, 1);
  const o = test.worldBlockLocation(ORIGIN);
  for (let t = 0; t < 600 && compare(test).right < WELL_CELLS; t += 10) await test.idle(10);
  test.assert(compare(test).right === WELL_CELLS, `expected the well finished before taking it down, ${compare(test).right} of ${WELL_CELLS} cells stand`);
  test.getDimension().runCommand(`scriptevent builder:remove ${o.x + 2} ${o.y + 2} ${o.z + 2} 1`);
  await test.idle(5);
  test.assert(last(test).startsWith("builder:remove ok"), `expected the removal to start, got "${last(test)}"`);
  test.succeedWhen(() => {
    const r = compare(test);
    test.assert(r.placed === 0, `expected the well gone, ${r.placed} block(s) still stand`);
    for (const [item, n] of Object.entries(MATERIALS)) {
      const back = count(test, CHEST, item);
      test.assert(back === n, `expected ${n} ${item} back in the chest, found ${back}`);
    }
    const c = container(test, CHEST);
    let total = 0;
    if (c) for (let i = 0; i < c.size; i++) total += c.getItem(i)?.amount ?? 0;
    const want = Object.values(MATERIALS).reduce((a, b) => a + b, 0);
    test.assert(total === want, `expected exactly ${want} items in the chest, found ${total}`);
  });
}).maxTicks(1600).structureName("qol:arena");

registerAsync("qol", "builder_turned_well_matches_the_games_rotation", async (test) => {
  // The builder's own rotation table against structureManager.place with
  // Rotate90: every stair, the hanging lantern and the water, cell for cell.
  rig(test);
  place(test, 1, 1);
  await test.idle(10);
  test.assert(last(test).startsWith("builder:place ok"), `expected the hatch to accept the turned well, got "${last(test)}"`);
  test.succeedWhen(() => {
    const r = compare(test, StructureRotation.Rotate90);
    test.assert(r.wrong.length === 0, `${r.wrong.length} cell(s) differ from the game's Rotate90 placement: ${r.wrong.slice(0, 3).join("; ")}`);
    test.assert(r.right === WELL_CELLS, `expected all ${WELL_CELLS} cells as the game turns them, found ${r.right}`);
  });
}).maxTicks(800).structureName("qol:arena");
