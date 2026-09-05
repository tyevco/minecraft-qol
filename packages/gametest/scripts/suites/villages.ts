import { BlockPermutation, GameMode, type Vector3 } from "@minecraft/server";
import { registerAsync, type Test } from "@minecraft/server-gametest";
import { floor } from "./rig";

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
