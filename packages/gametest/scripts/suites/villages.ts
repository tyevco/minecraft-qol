import { BlockPermutation, Direction, GameMode, ItemStack, type Vector3 } from "@minecraft/server";
import { registerAsync, type SimulatedPlayer, type Test } from "@minecraft/server-gametest";
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
