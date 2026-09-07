import { BlockPermutation, BlockVolume, Direction, EntityComponentTypes, GameMode, ItemStack, world, type Vector3 } from "@minecraft/server";
import { registerAsync, type SimulatedPlayer, type Test } from "@minecraft/server-gametest";
import { WARES } from "../../../villages/scripts/core/standing";
import { container, count, floor, put, until } from "./rig";

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
  // A block state lists at most sixteen values, so the index is split across
  // `villages:people` (the low four bits) and `villages:page` (the rest).
  test.setBlockPermutation(BlockPermutation.resolve(POST, { "villages:people": peopleIndex % 16, "villages:page": Math.floor(peopleIndex / 16), "villages:job": job }), AT);
}

registerAsync("qol", "villages_post_spawns_person", async (test) => {
  // People 7, the drow: the highest index, so the property range and the
  // eighth people event are exercised; the trade tests cover the lower ones.
  placePost(test, 7, 1);
  test.succeedWhen(() => {
    const found = people(test);
    test.assert(found.length === 1, `expected exactly 1 person at the post, found ${found.length}`);
    const p = found[0]!;
    const peopleProp = p.getProperty("villages:people");
    const jobProp = p.getProperty("villages:job");
    test.assert(peopleProp === 7, `expected people 7 (drow), got ${String(peopleProp)}`);
    test.assert(jobProp === 1, `expected job 1 (worker), got ${String(jobProp)}`);
  });
}).maxTicks(400).structureName("qol:arena");

// The ninth people: pins that the person's property range, the block's state
// list and the people_8 event all reach index 8, since each is a separate
// hand-written list and a short one spawns a stonefolk in a drover's town.
registerAsync("qol", "villages_post_spawns_drover", async (test) => {
  placePost(test, 8, 0);
  test.succeedWhen(() => {
    const found = people(test);
    test.assert(found.length === 1, `expected exactly 1 person at the post, found ${found.length}`);
    const p = found[0]!;
    const peopleProp = p.getProperty("villages:people");
    const jobProp = p.getProperty("villages:job");
    test.assert(peopleProp === 8, `expected people 8 (drover), got ${String(peopleProp)}`);
    test.assert(jobProp === 0, `expected job 0 (guard), got ${String(jobProp)}`);
  });
}).maxTicks(400).structureName("qol:arena");

// The nineteenth people, the deerfolk: the property range, the block's state
// list and the people_18 event all reach index 18, the last of the furfolk.
registerAsync("qol", "villages_post_spawns_deerfolk", async (test) => {
  placePost(test, 18, 1);
  test.succeedWhen(() => {
    const found = people(test);
    test.assert(found.length === 1, `expected exactly 1 person at the post, found ${found.length}`);
    const p = found[0]!;
    const peopleProp = p.getProperty("villages:people");
    test.assert(peopleProp === 18, `expected people 18 (deerfolk), got ${String(peopleProp)}`);
    test.assert(p.nameTag === "Deerfolk", `expected the person named for its people, got "${p.nameTag}"`);
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
  placePost(test, 8, 1);
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

const VEIN: Vector3 = { x: 2, y: 1, z: 2 };

/** A coal vein in the floor's corner; with `roof`, a stone slab of ceiling over it and the block the miner stands on, three up. */
function placeVein(test: Test, roof: boolean): void {
  test.setBlockPermutation(BlockPermutation.resolve("villages:vein", { "villages:ore": "coal" }), VEIN);
  if (roof) for (let x = 1; x <= 4; x++) for (let z = 1; z <= 4; z++) test.setBlockType("minecraft:stone", { x, y: 4, z });
  test.setBlockType("minecraft:chest", CHEST);
  put(test, CHEST, new ItemStack("minecraft:bread", 4));
}

registerAsync("qol", "villages_miner_works_vein", async (test) => {
  placePost(test, 0, 1);
  // The vein is a fixture: it must survive the cycle. It is roofed, as a mine is.
  placeVein(test, true);
  test.succeedWhen(() => {
    const coal = count(test, CHEST, "minecraft:coal");
    test.assert(coal >= 6, `expected a cycle's 6 coal in the chest, found ${coal}`);
    test.assertBlockPresent("villages:vein", VEIN, true);
    const bread = count(test, CHEST, "minecraft:bread");
    test.assert(bread === 3, `expected one bread taken as the wage (3 left), found ${bread}`);
  });
}).maxTicks(600).structureName("qol:arena");

registerAsync("qol", "villages_vein_in_the_open_is_ignored", async (test) => {
  placePost(test, 0, 1);
  // The same vein under the open sky: no miner, so nothing is mined and the bread is not eaten.
  placeVein(test, false);
  await test.idle(400);
  const coal = count(test, CHEST, "minecraft:coal");
  test.assert(coal === 0, `expected no coal from a vein out in the open, found ${coal}`);
  const bread = count(test, CHEST, "minecraft:bread");
  test.assert(bread === 4, `expected no wage taken, found ${bread} bread`);
  test.succeed();
}).maxTicks(500).structureName("qol:arena");

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

// ---------------------------------------------------------------------------
// The furfolk's trades (docs/design/furfolk.md §5). Each rig is the fixture
// its village piece carries, a chest, and the post; the assertions are the
// design table's "to measure first" column, so a failure is a measurement.
// ---------------------------------------------------------------------------

/** Loose items of a type near the post: what a mutation must never drop. */
function dropped(test: Test, typeId: string): number {
  return test.getDimension().getEntities({ type: "minecraft:item", location: test.worldBlockLocation(AT), maxDistance: 12 })
    .filter((e) => e.getComponent("minecraft:item")?.itemStack.typeId === typeId).length;
}

// The forager: eight ripe bushes on grass. Each is picked back to growth 1
// and stays standing; the berries are in the chest and none on the ground.
registerAsync("qol", "villages_forager_picks_berries", async (test) => {
  placePost(test, 9, 1);
  const bushes: Vector3[] = [...Array.from({ length: 7 }, (_, i) => ({ x: i + 1, y: 1, z: 1 })), { x: 7, y: 1, z: 2 }];
  for (const b of bushes) {
    test.setBlockType("minecraft:grass", { x: b.x, y: 0, z: b.z });
    test.setBlockPermutation(BlockPermutation.resolve("minecraft:sweet_berry_bush", { growth: 3 }), b);
  }
  test.setBlockType("minecraft:chest", CHEST);
  test.succeedWhen(() => {
    const berries = count(test, CHEST, "minecraft:sweet_berries");
    test.assert(berries >= 16, `expected at least 16 berries from 8 bushes in the chest, found ${berries}`);
    let standing = 0, picked = 0;
    for (const b of bushes) {
      const block = test.getBlock(b);
      if (block.typeId !== "minecraft:sweet_berry_bush") continue;
      standing++;
      if (block.permutation.getState("growth") === 1) picked++;
    }
    test.assert(standing === 8, `expected all 8 bushes still standing, found ${standing}`);
    test.assert(picked === 8, `expected all 8 bushes at growth 1, found ${picked}`);
    const loose = dropped(test, "minecraft:sweet_berries");
    test.assert(loose === 0, `expected no berries dropped as items, found ${loose}`);
  });
}).maxTicks(800).structureName("qol:arena");

// The baker: a furnace and nine wheat. Three loaves, the wheat gone, and the
// furnace back to its unlit block facing the way it did, with nothing ejected.
const OVEN: Vector3 = { x: 2, y: 1, z: 2 };
registerAsync("qol", "villages_baker_bakes_bread", async (test) => {
  placePost(test, 12, 1);
  test.setBlockPermutation(BlockPermutation.resolve("minecraft:furnace", { "minecraft:cardinal_direction": "south" }), OVEN);
  test.setBlockType("minecraft:chest", CHEST);
  put(test, CHEST, new ItemStack("minecraft:wheat", 9));
  let lit = false;
  test.succeedWhen(() => {
    if (test.getBlock(OVEN).typeId === "minecraft:lit_furnace") lit = true;
    const bread = count(test, CHEST, "minecraft:bread");
    test.assert(bread === 3, `expected 3 loaves from 9 wheat, found ${bread}`);
    const wheat = count(test, CHEST, "minecraft:wheat");
    test.assert(wheat === 0, `expected the wheat used up, found ${wheat}`);
    const oven = test.getBlock(OVEN);
    test.assert(oven.typeId === "minecraft:furnace", `expected the furnace unlit again after the bake, found ${oven.typeId}`);
    test.assert(oven.permutation.getState("minecraft:cardinal_direction") === "south", `expected the furnace still facing south, got ${String(oven.permutation.getState("minecraft:cardinal_direction"))}`);
    test.assert(lit, "expected to see the furnace lit while the loaves baked");
  });
}).maxTicks(800).structureName("qol:arena");

// The beekeeper: a full hive on a fence and two bottles. One bottle becomes
// honey, the hive reads empty, and the hive is still a hive.
const HIVE: Vector3 = { x: 2, y: 2, z: 2 };
registerAsync("qol", "villages_beekeeper_bottles_honey", async (test) => {
  placePost(test, 13, 1);
  test.setBlockType("minecraft:oak_fence", { x: 2, y: 1, z: 2 });
  test.setBlockPermutation(BlockPermutation.resolve("minecraft:beehive", { direction: 0, honey_level: 5 }), HIVE);
  test.setBlockType("minecraft:chest", CHEST);
  put(test, CHEST, new ItemStack("minecraft:glass_bottle", 2));
  test.succeedWhen(() => {
    const honey = count(test, CHEST, "minecraft:honey_bottle");
    test.assert(honey === 1, `expected 1 honey bottle, found ${honey}`);
    const bottles = count(test, CHEST, "minecraft:glass_bottle");
    test.assert(bottles === 1, `expected 1 glass bottle left, found ${bottles}`);
    const hive = test.getBlock(HIVE);
    test.assert(hive.typeId === "minecraft:beehive", `expected the hive still there, found ${hive.typeId}`);
    test.assert(hive.permutation.getState("honey_level") === 0, `expected the hive emptied to honey_level 0, got ${String(hive.permutation.getState("honey_level"))}`);
  });
}).maxTicks(800).structureName("qol:arena");

// The cactus cutter: four columns of three on sand, nothing beside them.
// The eight blocks above the bases go to the chest as cactus, the bases
// stand, nothing lands on the ground, and one bread is the wage.
registerAsync("qol", "villages_cutter_cuts_cactus", async (test) => {
  placePost(test, 14, 1);
  const bases: Vector3[] = [{ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 5 }, { x: 6, y: 1, z: 1 }, { x: 6, y: 1, z: 6 }];
  for (const b of bases) {
    test.setBlockType("minecraft:sand", { x: b.x, y: 0, z: b.z });
    for (let y = 1; y <= 3; y++) test.setBlockPermutation(BlockPermutation.resolve("minecraft:cactus", { age: 0 }), { x: b.x, y, z: b.z });
  }
  test.setBlockType("minecraft:chest", CHEST);
  put(test, CHEST, new ItemStack("minecraft:bread", 4));
  test.succeedWhen(() => {
    const cactus = count(test, CHEST, "minecraft:cactus");
    test.assert(cactus >= 8, `expected the 8 blocks above the bases in the chest, found ${cactus}`);
    for (const b of bases) {
      test.assertBlockPresent("minecraft:cactus", b, true);
      test.assertBlockPresent("minecraft:cactus", { x: b.x, y: 3, z: b.z }, false);
    }
    const loose = dropped(test, "minecraft:cactus");
    test.assert(loose === 0, `expected no cactus dropped as items, found ${loose}`);
    const bread = count(test, CHEST, "minecraft:bread");
    test.assert(bread === 3, `expected one bread taken as the wage (3 left), found ${bread}`);
  });
}).maxTicks(800).structureName("qol:arena");

// The mushroom picker: ten mushrooms on a mycelium bed. Six go to the chest
// and four are left standing to spread from.
registerAsync("qol", "villages_picker_gathers_mushrooms", async (test) => {
  placePost(test, 15, 1);
  const bed: Vector3[] = [];
  for (let x = 1; x <= 5; x++) for (const z of [1, 2]) bed.push({ x, y: 1, z });
  for (const [i, m] of bed.entries()) {
    test.setBlockType("minecraft:mycelium", { x: m.x, y: 0, z: m.z });
    test.setBlockType(i % 2 ? "minecraft:red_mushroom" : "minecraft:brown_mushroom", m);
  }
  test.setBlockType("minecraft:chest", CHEST);
  test.succeedWhen(() => {
    const picked = count(test, CHEST, "minecraft:brown_mushroom") + count(test, CHEST, "minecraft:red_mushroom");
    test.assert(picked === 6, `expected 6 of 10 mushrooms in the chest, found ${picked}`);
    const standing = bed.filter((m) => /mushroom$/.test(test.getBlock(m).typeId)).length;
    test.assert(standing === 4, `expected 4 mushrooms left standing, found ${standing}`);
  });
}).maxTicks(800).structureName("qol:arena");

// The cocoa picker: eight ripe pods on two jungle logs (`direction` is the
// face the pod hangs from, as the squirrels' grove writes it). Two beans per
// pod reach the chest and every pod is back on its log at age 0. Beans are
// not food, so this is a paid trade: four bread in, three out.
registerAsync("qol", "villages_cocoa_picker_picks_pods", async (test) => {
  placePost(test, 16, 1);
  const pods: Vector3[] = [];
  for (const lx of [2, 6]) {
    for (let y = 1; y <= 3; y++) test.setBlockType("minecraft:jungle_log", { x: lx, y, z: 2 });
    for (const [dx, dz, dir] of [[0, 1, 0], [-1, 0, 1], [0, -1, 2], [1, 0, 3]] as const) {
      const at = { x: lx + dx, y: 2, z: 2 + dz };
      test.setBlockPermutation(BlockPermutation.resolve("minecraft:cocoa", { age: 2, direction: dir }), at);
      pods.push(at);
    }
  }
  test.setBlockType("minecraft:chest", CHEST);
  put(test, CHEST, new ItemStack("minecraft:bread", 4));
  test.succeedWhen(() => {
    const beans = count(test, CHEST, "minecraft:cocoa_beans");
    test.assert(beans >= 16, `expected 2 beans from each of 8 pods in the chest, found ${beans}`);
    let onLog = 0, reset = 0;
    for (const p of pods) {
      const b = test.getBlock(p);
      if (b.typeId !== "minecraft:cocoa") continue;
      onLog++;
      if (b.permutation.getState("age") === 0) reset++;
    }
    test.assert(onLog === 8, `expected all 8 pods still on their logs, found ${onLog}`);
    test.assert(reset === 8, `expected all 8 pods back at age 0, found ${reset}`);
    const bread = count(test, CHEST, "minecraft:bread");
    test.assert(bread === 3, `expected one bread taken as the wage (3 left), found ${bread}`);
  });
}).maxTicks(800).structureName("qol:arena");

// The gleaner: a hedge of sixteen persistent oak leaves beside a small oak
// (four logs, a crown that is not persistent). The hedge wins over the tree,
// two apples (one per eight hedge leaves) appear in the chest, and every
// leaf and log stays.
registerAsync("qol", "villages_gleaner_gathers_apples", async (test) => {
  placePost(test, 18, 1);
  const hedge: Vector3[] = [];
  for (let x = 1; x <= 7; x++) for (const y of [1, 2]) hedge.push({ x, y, z: 1 });
  hedge.push({ x: 7, y: 1, z: 2 }, { x: 7, y: 2, z: 2 });
  for (const l of hedge) test.setBlockPermutation(BlockPermutation.resolve("minecraft:oak_leaves", { persistent_bit: true, update_bit: false }), l);
  for (let y = 1; y <= 4; y++) test.setBlockType("minecraft:oak_log", { x: 2, y, z: 5 });
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) if (i !== 0 || k !== 0) test.setBlockPermutation(BlockPermutation.resolve("minecraft:oak_leaves", { persistent_bit: false, update_bit: false }), { x: 2 + i, y: 4, z: 5 + k });
  test.setBlockType("minecraft:chest", CHEST);
  test.succeedWhen(() => {
    const apples = count(test, CHEST, "minecraft:apple");
    test.assert(apples === 2, `expected 2 apples from 16 hedge leaves, found ${apples}`);
    const leaves = hedge.filter((l) => test.getBlock(l).typeId === "minecraft:oak_leaves").length;
    test.assert(leaves === 16, `expected the hedge untouched (16 leaves), found ${leaves}`);
    for (let y = 1; y <= 4; y++) test.assertBlockPresent("minecraft:oak_log", { x: 2, y, z: 5 }, true);
  });
}).maxTicks(800).structureName("qol:arena");

// ---------------------------------------------------------------------------
// The kids' posts and the visitors (docs/design/villages.md §6.1). A post a
// player places is told from a village's by `playerPlaceBlock`; a
// SimulatedPlayer marshals as undefined into the villages pack, so whether
// the event fires for one at all is what the first test measures.
// ---------------------------------------------------------------------------

const VISITOR = "villages:visitor";
const KIN = "villages:kin";
const POST_ITEM = "villages:post";

/** A SimulatedPlayer places a post on the floor block `on`; the post stands one above it. */
async function placeByHand(test: Test, player: SimulatedPlayer, on: Vector3): Promise<Vector3> {
  player.lookAtBlock(on);
  await test.idle(5);
  const ok = player.useItemOnBlock(new ItemStack(POST_ITEM, 1), on, Direction.Up);
  test.assert(ok, `useItemOnBlock refused a post on ${on.x},${on.y},${on.z}`);
  await test.idle(25); // two placements too close together are refused (docs/README.md corrections)
  const at = { x: on.x, y: on.y + 1, z: on.z };
  test.assertBlockPresent(POST, at, true);
  return at;
}

const tagged = (test: Test, tag: string, near: Vector3, r: number) =>
  test.getDimension().getEntities({ type: PERSON, tags: [tag], location: test.worldBlockLocation(near), maxDistance: r });

// A post the kids placed spawns nobody: it waits for a settler. The control
// is every other test here, whose structure-style posts spawn at once.
registerAsync("qol", "villages_player_post_waits_for_settler", async (test) => {
  floor(test);
  for (const e of test.getDimension().getEntities({ type: PERSON, location: test.worldBlockLocation(AT), maxDistance: 8 })) e.remove();
  const player = test.spawnSimulatedPlayer({ x: 2, y: 1, z: 2 }, "vl_placer", GameMode.Survival);
  const at = await placeByHand(test, player, { x: AT.x, y: 0, z: AT.z });
  await test.idle(300);
  test.assertBlockPresent(POST, at, true);
  const n = people(test).length;
  test.assert(n === 0, `expected no person at a post the player placed, found ${n}`);
  test.succeed();
}).maxTicks(600).structureName("qol:arena");

// Two posts by hand make a settlement; the hatch brings the next visitor
// now, and settles it: the visitor is gone and a settler with the kids' tag
// stands at one of the posts, of the visitor's people.
registerAsync("qol", "villages_visitor_settles", async (test) => {
  floor(test);
  for (const e of test.getDimension().getEntities({ type: PERSON, location: test.worldBlockLocation(AT), maxDistance: 48 })) e.remove();
  const player = test.spawnSimulatedPlayer({ x: 6, y: 1, z: 6 }, "vl_host", GameMode.Survival);
  const a = await placeByHand(test, player, { x: 4, y: 0, z: 3 });
  const b = await placeByHand(test, player, { x: 2, y: 0, z: 5 });
  test.getDimension().runCommand("scriptevent villages:visitor arrive");
  for (let t = 0; t < 200 && tagged(test, VISITOR, AT, 40).length === 0; t += 5) await test.idle(5);
  const visitors = tagged(test, VISITOR, AT, 40);
  test.assert(visitors.length === 1, `expected one visitor at the settlement's edge, found ${visitors.length}`);
  const visitor = visitors[0]!;
  const people = visitor.getProperty("villages:people");
  test.assert(typeof people === "number", `expected the visitor to have a people, got ${String(people)}`);
  test.assert(visitor.nameTag.includes(" the "), `expected the visitor named "<name> the <People>", got "${visitor.nameTag}"`);
  test.getDimension().runCommand("scriptevent villages:visitor settle");
  // The walk from the edge may fail (the arena stands above the flat world's surface) and end in a teleport after its timeout.
  test.succeedWhen(() => {
    const left = tagged(test, VISITOR, AT, 48).length;
    test.assert(left === 0, `expected the visitor gone once settled, found ${left}`);
    const kin = [...tagged(test, KIN, a, 3), ...tagged(test, KIN, b, 3)];
    test.assert(kin.length === 1, `expected one settler at a post, found ${kin.length}`);
    const settled = kin[0]!.getProperty("villages:people");
    test.assert(settled === people, `expected the settler to be the visitor's people ${String(people)}, got ${String(settled)}`);
  });
}).maxTicks(1800).structureName("qol:arena");

// A visitor stays a day: at the next dawn (the clock pushed across midnight) it is gone.
registerAsync("qol", "villages_visitor_leaves_at_dawn", async (test) => {
  floor(test);
  for (const e of test.getDimension().getEntities({ type: PERSON, location: test.worldBlockLocation(AT), maxDistance: 48 })) e.remove();
  const player = test.spawnSimulatedPlayer({ x: 6, y: 1, z: 6 }, "vl_host2", GameMode.Survival);
  await placeByHand(test, player, { x: 4, y: 0, z: 3 });
  await placeByHand(test, player, { x: 2, y: 0, z: 5 });
  test.getDimension().runCommand("time set 6000");
  await test.idle(40);
  test.getDimension().runCommand("scriptevent villages:visitor arrive");
  for (let t = 0; t < 200 && tagged(test, VISITOR, AT, 40).length === 0; t += 5) await test.idle(5);
  test.assert(tagged(test, VISITOR, AT, 40).length === 1, "expected a visitor before dawn");
  test.getDimension().runCommand("time add 18000"); // 6000 + 18000 = the next day's 0: dawn
  test.succeedWhen(() => {
    const n = tagged(test, VISITOR, AT, 48).length;
    test.assert(n === 0, `expected the visitor gone at dawn, found ${n}`);
  });
}).maxTicks(600).structureName("qol:arena");

// ---------------------------------------------------------------------------
// Invite (docs/design/villages.md §6). A village worker is invited by the
// hatch, follows a spot the hatch names, and settles when the player taps a
// post the kids placed once its plaque shows the worker's job: the post
// item places a guard's post, so the first tap turns the plaque and the
// second settles the follower.
// ---------------------------------------------------------------------------

const INVITED = "villages:invited";

registerAsync("qol", "villages_invited_person_follows_and_settles", async (test) => {
  placePost(test, 9, 1); // a foxfolk worker's post, a village's
  for (let t = 0; t < 300 && people(test).length === 0; t += 5) await test.idle(5);
  test.assert(people(test).length === 1, `expected the village post's person, found ${people(test).length}`);
  const dim = test.getDimension();
  const w = test.worldBlockLocation(AT);
  dim.runCommand(`scriptevent villages:invite ${w.x} ${w.y} ${w.z}`);
  for (let t = 0; t < 100 && tagged(test, INVITED, AT, 8).length === 0; t += 5) await test.idle(5);
  const invited = tagged(test, INVITED, AT, 8);
  test.assert(invited.length === 1, `expected one invited person, found ${invited.length}`);
  test.assert(!invited[0]!.hasTag(`villages:post:${w.x},${w.y},${w.z}`), "expected the invited person freed of its post tag");
  // Follow: a spot across the arena, named by the hatch since a SimulatedPlayer is no player to the pack.
  const spot: Vector3 = { x: 1, y: 1, z: 6 };
  const ws = test.worldBlockLocation(spot);
  dim.runCommand(`scriptevent villages:follow ${ws.x} ${ws.y} ${ws.z}`);
  let close = false;
  for (let t = 0; t < 400 && !close; t += 10) {
    await test.idle(10);
    const e = tagged(test, INVITED, AT, 16)[0];
    if (e) {
      const l = test.relativeLocation(e.location);
      close = Math.hypot(l.x - (spot.x + 0.5), l.z - (spot.z + 0.5)) <= 3;
    }
  }
  test.assert(close, "expected the invited person to follow to the spot within 400 ticks");
  // The kids' post by hand beside the spot: a guard's until the plaque is turned.
  const player = test.spawnSimulatedPlayer({ x: 3, y: 1, z: 6 }, "vl_inviter", GameMode.Survival);
  const kid = await placeByHand(test, player, { x: 1, y: 0, z: 4 });
  test.assert(test.getBlock(kid).permutation.getState("villages:job" as never) === 0, "expected a hand-placed post to be a guard's");
  player.lookAtBlock(kid);
  await test.idle(5);
  test.assert(player.interactWithBlock(kid), "interactWithBlock refused the post");
  await test.idle(20);
  const job = test.getBlock(kid).permutation.getState("villages:job" as never);
  test.assert(job === 1, `expected the first tap to turn the plaque to the worker's job (1), got ${String(job)}`);
  test.assert(test.getBlock(kid).typeId === POST, "expected the post still there after the turn");
  test.assert(player.interactWithBlock(kid), "interactWithBlock refused the post a second time");
  test.succeedWhen(() => {
    const kin = tagged(test, KIN, kid, 3);
    test.assert(kin.length === 1, `expected the follower settled at the kids' post, found ${kin.length}`);
    test.assert(kin[0]!.getProperty("villages:people") === 9, `expected a foxfolk settler, got ${String(kin[0]!.getProperty("villages:people"))}`);
    const stray = tagged(test, INVITED, AT, 24).length;
    test.assert(stray === 0, `expected no invited person left, found ${stray}`);
    const atVillagePost = dim.getEntities({ type: PERSON, location: test.worldLocation({ x: 4.5, y: 1, z: 4.5 }), maxDistance: 1.5 }).length;
    test.assert(atVillagePost === 0, `expected the village post empty until its day is up, found ${atVillagePost}`);
  });
}).maxTicks(1400).structureName("qol:arena");

// Every ware a trader sells (the villages' own table, imported since it is
// pure) is an item the server knows, at an amount a stack can hold: an
// ItemStack of each, so a mistyped identifier fails here and not in a
// kid's hand.
registerAsync("qol", "villages_wares_are_items", async (test) => {
  const bad: string[] = [];
  for (const list of WARES) {
    for (const w of list) {
      try {
        const s = new ItemStack(w.item, w.amount);
        if (s.typeId !== w.item) bad.push(`${w.item} became ${s.typeId}`);
        else if (s.amount !== w.amount) bad.push(`${w.item} x${w.amount} held ${s.amount}`);
      } catch (e) {
        bad.push(`${w.item} x${w.amount}: ${e}`);
      }
    }
  }
  test.assert(bad.length === 0, `wares that are not items: ${bad.join("; ")}`);
  test.succeed();
}).maxTicks(20).structureName("qol:arena");

// A locked daylight cycle is what the visitors' fallback keys on: the
// gamerule is readable from script on the stable API, and the time of day
// and the absolute time stand still while it is off, so nothing on the
// world's clock would ever bring a dawn. Measured, and the rule put back.
registerAsync("qol", "villages_locked_clock_is_readable", async (test) => {
  const dim = test.getDimension();
  try {
    dim.runCommand("gamerule dodaylightcycle false");
    await test.idle(2);
    test.assert(world.gameRules.doDayLightCycle === false, `expected world.gameRules.doDayLightCycle false after the command, got ${String(world.gameRules.doDayLightCycle)}`);
    const t0 = world.getTimeOfDay();
    const a0 = world.getAbsoluteTime();
    await test.idle(40);
    const t1 = world.getTimeOfDay();
    const a1 = world.getAbsoluteTime();
    test.assert(t1 === t0, `expected the time of day to stand still with the cycle locked, went ${t0} -> ${t1}`);
    test.assert(a1 === a0, `expected the absolute time to stand still with the cycle locked, went ${a0} -> ${a1}`);
  } finally {
    dim.runCommand("gamerule dodaylightcycle true");
  }
  await test.idle(2);
  test.assert(world.gameRules.doDayLightCycle === true, "expected the cycle back on after the test");
  test.succeed();
}).maxTicks(200).structureName("qol:arena");

// A guard hired at friend (by the hatch here) keeps its post while it
// follows, and when sent home walks back to its post: the tag gone, the
// guard at its spot, and no second guard spawned in its absence.
registerAsync("qol", "villages_guard_escorts_and_goes_home", async (test) => {
  placePost(test, 9, 0); // a foxfolk guard's post, a village's
  for (let t = 0; t < 300 && people(test).length === 0; t += 5) await test.idle(5);
  test.assert(people(test).length === 1, `expected the village post's guard, found ${people(test).length}`);
  const dim = test.getDimension();
  const w = test.worldBlockLocation(AT);
  const ESCORT = "villages:escort";
  dim.runCommand(`scriptevent villages:escort ${w.x} ${w.y} ${w.z}`);
  for (let t = 0; t < 100 && tagged(test, ESCORT, AT, 8).length === 0; t += 5) await test.idle(5);
  const escorts = tagged(test, ESCORT, AT, 8);
  test.assert(escorts.length === 1, `expected one escort, found ${escorts.length}`);
  test.assert(escorts[0]!.hasTag(`villages:post:${w.x},${w.y},${w.z}`), "expected the escort to keep its post tag");
  const spot: Vector3 = { x: 1, y: 1, z: 6 };
  const ws = test.worldBlockLocation(spot);
  dim.runCommand(`scriptevent villages:follow ${ws.x} ${ws.y} ${ws.z}`);
  let close = false;
  for (let t = 0; t < 400 && !close; t += 10) {
    await test.idle(10);
    const e = tagged(test, ESCORT, AT, 16)[0];
    if (e) {
      const l = test.relativeLocation(e.location);
      close = Math.hypot(l.x - (spot.x + 0.5), l.z - (spot.z + 0.5)) <= 3;
    }
  }
  test.assert(close, "expected the escort to follow to the spot within 400 ticks");
  dim.runCommand("scriptevent villages:escort home");
  test.succeedWhen(() => {
    const left = tagged(test, ESCORT, AT, 24).length;
    test.assert(left === 0, `expected the escort tag gone once sent home, found ${left}`);
    const home = people(test);
    test.assert(home.length === 1, `expected the one guard back at its post, found ${home.length} person(s) within four of it`);
    test.assert(home[0]!.hasTag(`villages:post:${w.x},${w.y},${w.z}`), "expected the guard home to be the post's own");
  });
}).maxTicks(1400).structureName("qol:arena");

// The trader sells from the storehouse: the chests of its village's worker
// posts. A worker post with a chest of wheat beside it and a trader post
// of the same people within range; the hatch takes one sale's worth of
// wheat out of that chest and drops it at the trader's post.
registerAsync("qol", "villages_trader_sells_from_the_storehouse", async (test) => {
  placePost(test, 9, 2); // a foxfolk trader's post, a village's
  const W: Vector3 = { x: 1, y: 1, z: 6 };
  const C: Vector3 = { x: 1, y: 1, z: 7 };
  test.setBlockPermutation(BlockPermutation.resolve(POST, { "villages:people": 9, "villages:page": 0, "villages:job": 1 }), W);
  test.setBlockType("minecraft:chest", C);
  await test.idle(5);
  put(test, C, new ItemStack("minecraft:wheat", 20));
  put(test, C, new ItemStack("minecraft:iron_pickaxe", 1), 1);
  // The worker's post keeps a person too, a few blocks off; only the trader's is waited on.
  const traders = () => people(test).filter((p) => p.getProperty("villages:job") === 2);
  for (let t = 0; t < 300 && traders().length === 0; t += 5) await test.idle(5);
  test.assert(traders().length === 1, `expected the trader post's person, found ${traders().length}`);
  const dim = test.getDimension();
  const w = test.worldBlockLocation(AT);
  dim.runCommand(`scriptevent villages:stock ${w.x} ${w.y} ${w.z} minecraft:wheat`);
  test.succeedWhen(() => {
    const left = count(test, C, "minecraft:wheat");
    test.assert(left === 4, `expected 4 wheat left in the storehouse after a sale of 16, found ${left}`);
    test.assert(count(test, C, "minecraft:iron_pickaxe") === 1, "expected the pickaxe, which is not produce, left alone");
    const dropped = dim
      .getEntities({ type: "minecraft:item", location: test.worldLocation({ x: 4.5, y: 1, z: 4.5 }), maxDistance: 4 })
      .map((e) => e.getComponent(EntityComponentTypes.Item)?.itemStack)
      .reduce((n, s) => n + (s?.typeId === "minecraft:wheat" ? s.amount : 0), 0);
    test.assert(dropped === 16, `expected the 16 wheat dropped at the trader's post, found ${dropped}`);
  });
}).maxTicks(600).structureName("qol:arena");

/**
 * The showcase (tools/structures/showcase.ts): every people in one field,
 * placed whole by `/place structure villages:showcase`. Pinned: the posts
 * people every plot on their own, a person of every people in every job,
 * each inside its own ring. The structure is far too big for the arena, so
 * it is placed forty blocks up, as the builder's comparisons are, under a
 * ticking area of its own so every plot's chunk ticks, and taken down
 * after, persons and all: a structure reload restores the arena, nothing
 * else.
 */
registerAsync("qol", "villages_showcase_peoples_every_plot", async (test) => {
  const s = world.structureManager.get("villages:showcase");
  test.assert(s !== undefined, "villages:showcase is not in the world's packs");
  const size = s!.size;
  const dim = test.getDimension();
  const o = test.worldBlockLocation({ x: 0, y: 1, z: 0 });
  const far = { x: o.x, y: o.y + 40, z: o.z };
  const end = { x: far.x + size.x - 1, y: far.y + size.y - 1, z: far.z + size.z - 1 };
  const middle = { x: far.x + size.x / 2, y: far.y, z: far.z + size.z / 2 };
  const persons = () => dim.getEntities({ type: PERSON, location: middle, maxDistance: 64 });
  // The field's layout (tools/structures/showcase.ts): plots of PLOT with GAP between, MARGIN round, on a base G deep.
  const PLOT = 9, GAP = 3, MARGIN = 1, COLS = 4, JOBS = 4, G = 1;
  const PEOPLES = 19;
  const sweep = () => { for (const e of persons()) e.remove(); };
  // Plot-local cells of the posts, in job order (showcase.ts POST_CELLS).
  const POST_CELLS = [[3, 3], [5, 3], [3, 5], [5, 5]] as const;
  const plotOrigin = (people: number) => ({ x: far.x + MARGIN + (people % COLS) * (PLOT + GAP), z: far.z + MARGIN + Math.floor(people / COLS) * (PLOT + GAP) });
  const postAt = (people: number, job: number): Vector3 => {
    const o = plotOrigin(people);
    return { x: o.x + POST_CELLS[job]![0], y: far.y + G + 1, z: o.z + POST_CELLS[job]![1] };
  };
  const corners = [far, { x: end.x, y: far.y, z: far.z }, { x: far.x, y: far.y, z: end.z }, { x: end.x, y: far.y, z: end.z }];
  try {
    dim.runCommand(`tickingarea add ${far.x} ${far.y} ${far.z} ${end.x} ${end.y} ${end.z} qolshowcase`);
    // A ticking area loads its chunks lazily, and a structure placed into a
    // chunk that is not loaded loses that part silently (measured: placed
    // at once, two plots of the field never came up): wait for every corner.
    const loaded = await until(test, () => corners.every((c) => dim.getBlock(c) !== undefined), 600, 10);
    test.assert(loaded, `the field's chunks did not load: ${corners.map((c) => `${c.x},${c.z} ${dim.getBlock(c) ? "loaded" : "not"}`).join("; ")}`);
    sweep();
    world.structureManager.place(s!, dim, far);
    const missingPosts: string[] = [];
    for (let people = 0; people < PEOPLES; people++)
      for (let job = 0; job < JOBS; job++) {
        const b = dim.getBlock(postAt(people, job));
        if (b?.typeId !== POST) missingPosts.push(`${people}/${job}: ${b ? b.typeId : "unloaded"}`);
      }
    test.assert(missingPosts.length === 0, `posts not placed: ${missingPosts.join("; ")}`);
    await until(test, () => persons().length >= PEOPLES * JOBS, 1600, 10);
    const found = persons();
    const seen = new Set<string>();
    const outside: string[] = [];
    for (const e of found) {
      const people = e.getProperty("villages:people") as number;
      const job = e.getProperty("villages:job") as number;
      seen.add(`${people}/${job}`);
      const { x: px, z: pz } = plotOrigin(people);
      const x = Math.floor(e.location.x), z = Math.floor(e.location.z);
      if (x <= px || x >= px + PLOT - 1 || z <= pz || z >= pz + PLOT - 1) outside.push(`${e.nameTag} ${job} at ${x},${z} (plot ${px}..${px + PLOT - 1},${pz}..${pz + PLOT - 1})`);
    }
    const missing: string[] = [];
    for (let people = 0; people < PEOPLES; people++) for (let job = 0; job < JOBS; job++) if (!seen.has(`${people}/${job}`)) missing.push(`${people}/${job}`);
    test.assert(found.length === PEOPLES * JOBS && missing.length === 0, `expected ${PEOPLES * JOBS} persons, one per people per job, found ${found.length}; missing ${missing.join(", ") || "none"}`);
    test.assert(outside.length === 0, `persons outside their plot: ${outside.join("; ")}`);
  } finally {
    sweep();
    dim.fillBlocks(new BlockVolume(far, end), "minecraft:air");
    dim.runCommand("tickingarea remove qolshowcase");
  }
  test.succeed();
}).maxTicks(2400).structureName("qol:arena");

/**
 * Two chests side by side in a placed structure are one double chest.
 * The blueprints write the pairing as block-entity data (blueprint.ts
 * chestPairs); a village's larder placed by the world came up as single
 * chests in game. Six rigs of two chests, read by the container the game
 * gives each (54 slots for a half of a double chest, 27 for a single).
 * Measured: `structureManager.place` pairs two chests on its own (the
 * rig with no data), the pairing data is read all the same (the swapped
 * rig comes out otherwise), and a pair led by its west half comes apart,
 * whichever way it faces; the lead is the east or south half.
 */
registerAsync("qol", "villages_chest_pair_is_a_double_chest", async (test) => {
  floor(test);
  const dim = test.getDimension();
  const rigs: [string, Vector3, "x" | "z", string, number[] | undefined][] = [
    ["qol:chestpair", { x: 0, y: 1, z: 0 }, "x", "south", [54, 54]],
    ["qol:chestpair_north", { x: 4, y: 1, z: 0 }, "x", "north", [54, 54]],
    ["qol:chestpair_east", { x: 8, y: 1, z: 0 }, "z", "east", [54, 54]],
    ["qol:chestpair_west", { x: 12, y: 1, z: 0 }, "z", "west", [54, 54]],
    ["qol:chestpair_none", { x: 0, y: 1, z: 4 }, "x", "south", [54, 54]],
    ["qol:chestpair_swapped", { x: 4, y: 1, z: 4 }, "x", "south", undefined],
  ];
  for (const [id, at] of rigs) world.structureManager.place(id, dim, test.worldBlockLocation(at));
  await test.idle(10);
  const report: string[] = [];
  const wrong: string[] = [];
  for (const [id, at, along, facing, want] of rigs) {
    const cells = [0, 1].map((i) => (along === "x" ? { x: at.x + i, y: at.y + 1, z: at.z + 1 } : { x: at.x + 1, y: at.y + 1, z: at.z + i }));
    const sizes = cells.map((c) => container(test, c)?.size ?? -1);
    const facings = cells.map((c) => String(test.getBlock(c).permutation.getState("minecraft:cardinal_direction" as never)));
    report.push(`${id.replace("qol:", "")}: ${sizes.join(",")} (${facings.join(",")})`);
    if (want && sizes.join() !== want.join()) wrong.push(id);
    if (facings.some((f) => f !== facing)) wrong.push(`${id} facing`);
  }
  test.assert(wrong.length === 0, `slots per chest, then facings: ${report.join("; ")}`);
  test.succeed();
}).maxTicks(100).structureName("qol:arena16");

/**
 * A person goes through a closed door. Same rig as the doorway, with a
 * door in the gap. The high elves stood inside their houses in game, and
 * this failed about one run in two: the elf stood at the door, opened or
 * not, and did not go through. `minecraft:scale` scales the collision box
 * with the model (1.15 makes a 0.6 box 0.69 wide, too wide to fit the gap
 * an open door leaves without lining up exactly), so the peoples scaled
 * past 1 carry a collision box that scales back to 0.6 by 1.9; with it
 * the elf went through every run, with the door opened by the navigation's
 * own `can_open_doors` (no door behaviour or annotation was needed:
 * measured with and without). Opening the door from script did not help
 * before the box was fixed, which is what told the width from the door.
 */
registerAsync("qol", "villages_person_opens_a_door", async (test) => {
  floor(test);
  for (let x = 0; x < 8; x++) for (let y = 1; y <= 3; y++) if (!(x === 4 && y <= 2)) test.setBlockType("minecraft:stone_bricks", { x, y, z: 4 });
  const door = { "minecraft:cardinal_direction": "south", door_hinge_bit: false, open_bit: false };
  test.setBlockPermutation(BlockPermutation.resolve("minecraft:wooden_door", { ...door, upper_block_bit: false }), { x: 4, y: 1, z: 4 });
  test.setBlockPermutation(BlockPermutation.resolve("minecraft:wooden_door", { ...door, upper_block_bit: true }), { x: 4, y: 2, z: 4 });
  const at: Vector3 = { x: 4, y: 1, z: 1 };
  for (const e of test.getDimension().getEntities({ type: PERSON, location: test.worldBlockLocation(at), maxDistance: 12 })) e.remove();
  test.setBlockPermutation(BlockPermutation.resolve(POST, { "villages:people": 6, "villages:page": 0, "villages:job": 0 }), at); // a high elf guard
  const near = () => test.getDimension().getEntities({ type: PERSON, location: test.worldBlockLocation(at), maxDistance: 4 });
  test.assert(await until(test, () => near().length === 1, 300, 5), `expected the post's high elf, found ${near().length}`);
  const dim = test.getDimension();
  const w = test.worldBlockLocation(at);
  dim.runCommand(`scriptevent villages:invite ${w.x} ${w.y} ${w.z}`);
  test.assert(await until(test, () => tagged(test, INVITED, at, 8).length === 1, 100, 5), `expected one invited person, found ${tagged(test, INVITED, at, 8).length}`);
  const spot: Vector3 = { x: 4, y: 1, z: 6 };
  const ws = test.worldBlockLocation(spot);
  dim.runCommand(`scriptevent villages:follow ${ws.x} ${ws.y} ${ws.z}`);
  const where = () => {
    const e = tagged(test, INVITED, at, 16)[0];
    return e ? test.relativeLocation(e.location) : undefined;
  };
  const through = await until(test, () => (where()?.z ?? 0) > 4.5, 600, 10);
  const l = where();
  const open = test.getBlock({ x: 4, y: 1, z: 4 }).permutation.getState("open_bit" as never);
  test.assert(through, `expected the high elf through the door to z > 4.5 within 600 ticks; it stands at ${l ? `${l.x.toFixed(1)},${l.z.toFixed(1)}` : "nowhere (gone)"}, the door open=${String(open)}`);
  test.succeed();
}).maxTicks(1200).structureName("qol:arena");

/**
 * A tall people fits through a doorway: a high elf is invited and sent
 * across a wall with a two-high, one-wide gap in it. This passed before
 * the fix below as well (a scaled box 2.19 tall still walked a two-high
 * gap), so height was not what kept the high elves in their houses in
 * game; the next test, with a door in the gap, is what found it.
 */
registerAsync("qol", "villages_tall_person_passes_a_doorway", async (test) => {
  floor(test);
  for (let x = 0; x < 8; x++) for (let y = 1; y <= 3; y++) if (!(x === 4 && y <= 2)) test.setBlockType("minecraft:stone_bricks", { x, y, z: 4 });
  const at: Vector3 = { x: 4, y: 1, z: 1 };
  for (const e of test.getDimension().getEntities({ type: PERSON, location: test.worldBlockLocation(at), maxDistance: 12 })) e.remove();
  test.setBlockPermutation(BlockPermutation.resolve(POST, { "villages:people": 6, "villages:page": 0, "villages:job": 0 }), at); // a high elf guard
  const near = () => test.getDimension().getEntities({ type: PERSON, location: test.worldBlockLocation(at), maxDistance: 4 });
  test.assert(await until(test, () => near().length === 1, 300, 5), `expected the post's high elf, found ${near().length}`);
  const dim = test.getDimension();
  const w = test.worldBlockLocation(at);
  dim.runCommand(`scriptevent villages:invite ${w.x} ${w.y} ${w.z}`);
  test.assert(await until(test, () => tagged(test, INVITED, at, 8).length === 1, 100, 5), `expected one invited person, found ${tagged(test, INVITED, at, 8).length}`);
  const spot: Vector3 = { x: 4, y: 1, z: 6 };
  const ws = test.worldBlockLocation(spot);
  dim.runCommand(`scriptevent villages:follow ${ws.x} ${ws.y} ${ws.z}`);
  const where = () => {
    const e = tagged(test, INVITED, at, 16)[0];
    return e ? test.relativeLocation(e.location) : undefined;
  };
  const through = await until(test, () => (where()?.z ?? 0) > 4.5, 600, 10);
  const l = where();
  test.assert(through, `expected the high elf through the doorway to z > 4.5 within 600 ticks; it stands at ${l ? `${l.x.toFixed(1)},${l.z.toFixed(1)}` : "nowhere (gone)"}`);
  test.succeed();
}).maxTicks(1200).structureName("qol:arena");
