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

registerAsync("qol", "villages_miner_works_vein", async (test) => {
  placePost(test, 0, 1);
  // A coal vein in the floor's corner, bread for the wage. The vein is a fixture: it must survive the cycle.
  const VEIN: Vector3 = { x: 2, y: 1, z: 2 };
  test.setBlockPermutation(BlockPermutation.resolve("villages:vein", { "villages:ore": "coal" }), VEIN);
  test.setBlockType("minecraft:chest", CHEST);
  put(test, CHEST, new ItemStack("minecraft:bread", 4));
  test.succeedWhen(() => {
    const coal = count(test, CHEST, "minecraft:coal");
    test.assert(coal >= 6, `expected a cycle's 6 coal in the chest, found ${coal}`);
    test.assertBlockPresent("villages:vein", VEIN, true);
    const bread = count(test, CHEST, "minecraft:bread");
    test.assert(bread === 3, `expected one bread taken as the wage (3 left), found ${bread}`);
  });
}).maxTicks(600).structureName("qol:arena");

registerAsync("qol", "villages_fisher_catches_fish", async (test) => {
  placePost(test, 1, 1);
  // A pond of eight water blocks let into the floor, with stone banks, and
  // one bread: raw fish is food too, and without the bread the fisher eats
  // one of its own catch as the wage (measured: 3 fish left of 4).
  for (let x = 1; x <= 2; x++) for (let z = 1; z <= 4; z++) test.setBlockType("minecraft:water", { x, y: 0, z });
  test.setBlockType("minecraft:chest", CHEST);
  put(test, CHEST, new ItemStack("minecraft:bread", 1));
  test.succeedWhen(() => {
    const fish = count(test, CHEST, "minecraft:cod") + count(test, CHEST, "minecraft:salmon");
    test.assert(fish >= 4, `expected a cycle's 4 fish in the chest, found ${fish}`);
    const bread = count(test, CHEST, "minecraft:bread");
    test.assert(bread === 0, `expected the bread eaten as the wage, found ${bread}`);
    for (let x = 1; x <= 2; x++) for (let z = 1; z <= 4; z++) test.assertBlockPresent("minecraft:water", { x, y: 0, z }, true);
  });
}).maxTicks(600).structureName("qol:arena");
