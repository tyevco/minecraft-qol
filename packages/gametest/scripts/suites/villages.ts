import { BlockPermutation, GameMode, ItemStack, type Vector3 } from "@minecraft/server";
import { registerAsync, type Test } from "@minecraft/server-gametest";
import { count, floor, put } from "./rig";

/**
 * Villages: a job post keeps one person.
 *
 * The post is set with setBlockPermutation, which is how a generated village's
 * posts arrive (a structure load, not a player), and the block component's
 * onPlace fires for both. What is pinned: a placed post spawns exactly one
 * person with the post's people and job, and breaking the post takes the
 * person with it.
 */

const POST = "villages:post";
const PERSON = "villages:person";
const AT: Vector3 = { x: 4, y: 1, z: 3 };

function people(test: Test) {
  return test.getDimension().getEntities({ type: PERSON, location: test.worldBlockLocation(AT), maxDistance: 4 });
}

function placePost(test: Test, peopleIndex: number, job: number): void {
  floor(test);
  // A structure reload restores blocks, not entities: a person left by an
  // earlier test (or an earlier run, since persons persist) would be counted
  // here. Sweep the spot first.
  for (const e of test.getDimension().getEntities({ type: PERSON, location: test.worldBlockLocation(AT), maxDistance: 8 })) e.remove();
  test.setBlockPermutation(BlockPermutation.resolve(POST, { "villages:people": peopleIndex, "villages:job": job }), AT);
}

registerAsync("qol", "villages_post_spawns_person", async (test) => {
  placePost(test, 3, 1);
  test.succeedWhen(() => {
    const found = people(test);
    test.assert(found.length === 1, `expected exactly 1 person at the post, found ${found.length}`);
    const p = found[0]!;
    const peopleProp = p.getProperty("villages:people");
    const jobProp = p.getProperty("villages:job");
    test.assert(peopleProp === 3, `expected people 3 (tallfolk), got ${String(peopleProp)}`);
    test.assert(jobProp === 1, `expected job 1 (worker), got ${String(jobProp)}`);
  });
}).maxTicks(400).structureName("qol:arena");

// The fifth people: pins that the person's property range, the block's state
// list and the people_4 event all reach index 4, since each is a separate
// hand-written list and a short one spawns a stonefolk in a drover's town.
registerAsync("qol", "villages_post_spawns_drover", async (test) => {
  placePost(test, 4, 0);
  test.succeedWhen(() => {
    const found = people(test);
    test.assert(found.length === 1, `expected exactly 1 person at the post, found ${found.length}`);
    const p = found[0]!;
    const peopleProp = p.getProperty("villages:people");
    const jobProp = p.getProperty("villages:job");
    test.assert(peopleProp === 4, `expected people 4 (drover), got ${String(peopleProp)}`);
    test.assert(jobProp === 0, `expected job 0 (guard), got ${String(jobProp)}`);
  });
}).maxTicks(400).structureName("qol:arena");

registerAsync("qol", "villages_post_break_removes_person", async (test) => {
  placePost(test, 0, 0);
  for (let t = 0; t < 300 && people(test).length === 0; t += 5) await test.idle(5);
  test.assert(people(test).length === 1, `expected a person before the break, found ${people(test).length}`);
  const player = test.spawnSimulatedPlayer({ x: 2, y: 1, z: 2 }, "vl_tester", GameMode.Survival);
  player.lookAtBlock(AT);
  player.breakBlock(AT);
  test.succeedWhen(() => {
    test.assertBlockPresent(POST, AT, false);
    const n = people(test).length;
    test.assert(n === 0, `expected the person gone with the post, found ${n}`);
  });
}).maxTicks(600).structureName("qol:arena");

/**
 * Trades (docs/design/villages.md §5.1). A worker's post surveys its
 * surroundings on the first tick its person is present; the first cycle is
 * due at once, so a test sees a whole cycle inside its budget. Both rigs
 * put the chest at (5,1,5) and the post at AT.
 */
const CHEST: Vector3 = { x: 5, y: 1, z: 5 };

// The rancher: two grown sheep beside a drover worker's post make it a
// rancher; its first cycle shears both (the sheep's own on_sheared event) and
// the wool lands in the chest, one bread fewer for the wage.
registerAsync("qol", "villages_rancher_shears_sheep", async (test) => {
  placePost(test, 4, 1);
  for (const e of test.getDimension().getEntities({ type: "minecraft:sheep", location: test.worldBlockLocation(AT), maxDistance: 20 })) e.remove();
  const pen = [{ x: 2, y: 1, z: 5 }, { x: 6, y: 1, z: 2 }];
  // Red sheep (the wololo event), so the wool's colour is asserted too.
  for (const at of pen) test.spawn("minecraft:sheep<spawn_adult>", at).triggerEvent("wololo");
  test.setBlockType("minecraft:chest", CHEST);
  put(test, CHEST, new ItemStack("minecraft:bread", 4));
  test.succeedWhen(() => {
    const flock = test.getDimension().getEntities({ type: "minecraft:sheep", location: test.worldBlockLocation(AT), maxDistance: 20 });
    test.assert(flock.length === 2, `expected the 2 sheep still in the pen, found ${flock.length}`);
    const shorn = flock.filter((s) => s.getComponent("minecraft:is_sheared") !== undefined).length;
    test.assert(shorn === 2, `expected both sheep shorn, ${shorn} are`);
    const wool = count(test, CHEST, "minecraft:red_wool");
    test.assert(wool >= 2 && wool <= 6, `expected 2 to 6 red wool in the chest, found ${wool}`);
    const bread = count(test, CHEST, "minecraft:bread");
    test.assert(bread === 3, `expected 3 bread after the wage, found ${bread}`);
  });
}).maxTicks(800).structureName("qol:arena");

registerAsync("qol", "villages_lumberjack_fells_tree", async (test) => {
  placePost(test, 0, 1);
  // An oak: four logs on dirt, a crown round the top two, and bread for the wage.
  test.setBlockType("minecraft:dirt", { x: 2, y: 0, z: 2 });
  for (let y = 1; y <= 4; y++) test.setBlockType("minecraft:oak_log", { x: 2, y, z: 2 });
  for (let y = 4; y <= 5; y++)
    for (let i = -1; i <= 1; i++)
      for (let k = -1; k <= 1; k++) if (i !== 0 || k !== 0 || y === 5) test.setBlockType("minecraft:oak_leaves", { x: 2 + i, y, z: 2 + k });
  test.setBlockType("minecraft:chest", CHEST);
  put(test, CHEST, new ItemStack("minecraft:bread", 4));
  test.succeedWhen(() => {
    for (let y = 1; y <= 4; y++) test.assertBlockPresent("minecraft:oak_log", { x: 2, y, z: 2 }, false);
    test.assertBlockPresent("minecraft:oak_sapling", { x: 2, y: 1, z: 2 }, true);
    const logs = count(test, CHEST, "minecraft:oak_log");
    test.assert(logs >= 4, `expected the 4 logs in the chest, found ${logs}`);
    const bread = count(test, CHEST, "minecraft:bread");
    test.assert(bread === 3, `expected one bread taken as the wage (3 left), found ${bread}`);
  });
}).maxTicks(600).structureName("qol:arena");

registerAsync("qol", "villages_farmer_harvests_wheat", async (test) => {
  placePost(test, 3, 1);
  // Nine ripe wheat on wet farmland, and an empty chest for the harvest.
  for (let x = 1; x <= 3; x++)
    for (let z = 1; z <= 3; z++) {
      test.setBlockPermutation(BlockPermutation.resolve("minecraft:farmland", { moisturized_amount: 7 }), { x, y: 0, z });
      test.setBlockPermutation(BlockPermutation.resolve("minecraft:wheat", { growth: 7 }), { x, y: 1, z });
    }
  test.setBlockType("minecraft:chest", CHEST);
  test.succeedWhen(() => {
    const wheat = count(test, CHEST, "minecraft:wheat");
    test.assert(wheat >= 8, `expected a cycle's 8 wheat in the chest, found ${wheat}`);
    let ripe = 0, tiles = 0;
    for (let x = 1; x <= 3; x++)
      for (let z = 1; z <= 3; z++) {
        const b = test.getBlock({ x, y: 1, z });
        if (b.typeId !== "minecraft:wheat") continue;
        tiles++;
        if (b.permutation.getState("growth") === 7) ripe++;
      }
    test.assert(ripe <= 1, `expected at most 1 ripe tile left after a cycle of 8, found ${ripe}`);
    test.assert(tiles >= 6, `expected the field replanted (9 tiles, seeds from the drops), found ${tiles} wheat blocks`);
  });
}).maxTicks(600).structureName("qol:arena");
