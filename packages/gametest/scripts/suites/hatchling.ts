import {
  EntityComponentTypes,
  EntityDamageCause,
  GameMode,
  ItemStack,
  type Vector3,
} from "@minecraft/server";
import { registerAsync, type Test } from "@minecraft/server-gametest";
import { floor, STRUCTURE, until } from "./rig";

/**
 * Hatchling: the egg and the pet, in an arena.
 *
 * Interaction with the PACK'S OWN SCRIPT cannot be tested here: a
 * SimulatedPlayer marshals as undefined into a pack that does not bind
 * @minecraft/server-gametest (docs/gametest-structure-results.md), so the pack
 * never sees it warm or feed. Anything the ENGINE does is fair game though,
 * which is why taming is pinned below. What else can be pinned is everything
 * downstream of the decision:
 *
 *   - an egg spawned with a variant event carries that variant, and is
 *     invulnerable (the shell does not take damage);
 *   - the hatch event, which is how a warming ends and how the probe pack
 *     hatches an egg by hand, produces exactly one hatchling of the same
 *     variant and removes the egg, in that order;
 *   - the growth events swap the stage groups, so the scale and the stage
 *     property move together.
 */

const EGG = "hatchling:egg";
const PET = "hatchling:hatchling";
const SPOT: Vector3 = { x: 4, y: 1, z: 4 };

function near(test: Test, type: string) {
  return test.getDimension().getEntities({ type, location: test.worldBlockLocation(SPOT), maxDistance: 4 });
}

/**
 * Take away every egg and hatchling around the spot before a test starts
 * (issue #99).
 *
 * `near` searches world space, and sequential tests sit in the same x/z
 * column one block higher each time - so a four-block radius reaches the
 * cells of the tests just below. A structure reload restores blocks but not
 * entities, and `gametest clearall` does not touch them either, so an egg
 * left by the previous hatchling test was still standing in this one's
 * radius: `hatchling_egg_hatches_into_its_variant` failed with "egg still
 * present after the hatch (1)" in the sequence and passed alone. The radius
 * here is wider than `near`'s on purpose - it has to reach every cell that
 * `near` can see, from either side.
 */
function clearSpot(test: Test): void {
  for (const type of [EGG, PET]) {
    for (const e of test.getDimension().getEntities({ type, location: test.worldBlockLocation(SPOT), maxDistance: 12 })) {
      try {
        e.remove();
      } catch {
        // Already gone, or in a chunk that went away: either way, not here.
      }
    }
  }
}

/**
 * Spawn, then set the variant - deliberately NOT via `spawnEvent`.
 *
 * A spawnEvent REPLACES minecraft:entity_spawned rather than running alongside
 * it, so passing one drops every group that event adds: the hatchling loses
 * `hatchling:stage_0` (hence no scale) and `hatchling:wild` (hence no
 * tameable). Measured both ways:
 *
 *   plain spawn:          tameable=true   scale=0.55
 *   spawnEvent variant_1: tameable=false  scale=undefined
 *
 * Triggering the variant event a tick later leaves entity_spawned intact and
 * still sets the variant.
 */
function spawn(test: Test, type: string, variant: number) {
  const at = test.worldBlockLocation(SPOT);
  const e = test
    .getDimension()
    .spawnEntity(type, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
  e.triggerEvent(`hatchling:variant_${variant}`);
  return e;
}

registerAsync("qol", "hatchling_egg_keeps_variant_and_shell", async (test) => {
  floor(test);
  clearSpot(test);
  const egg = spawn(test, EGG, 2);
  await test.idle(5);
  const variant = egg.getProperty("hatchling:variant");
  test.assert(variant === 2, `egg spawned with variant_2 reads variant ${String(variant)}`);
  const health = egg.getComponent(EntityComponentTypes.Health);
  test.assert(health !== undefined, "egg has no health component");
  const before = health!.currentValue;
  egg.applyDamage(4);
  await test.idle(5);
  test.assert(egg.isValid, "egg was removed by 4 damage");
  test.assert(
    health!.currentValue === before,
    `egg health went ${before} -> ${health!.currentValue}; the damage sensor should refuse all damage`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(100);

registerAsync("qol", "hatchling_egg_hatches_into_its_variant", async (test) => {
  floor(test);
  clearSpot(test);
  const egg = spawn(test, EGG, 1);
  await test.idle(5);
  egg.triggerEvent("hatchling:hatch");
  // An entity event lands on the next tick, so reading the property in the
  // same tick that triggered it always sees the old value.
  await test.idle(2);
  test.assert(egg.getProperty("hatchling:hatching") === true, "hatch event did not set hatchling:hatching");

  test.succeedWhen(() => {
    const eggs = near(test, EGG).length;
    const pets = near(test, PET);
    test.assert(eggs === 0, `egg still present after the hatch (${eggs})`);
    test.assert(pets.length === 1, `expected exactly 1 hatchling, found ${pets.length}`);
    const v = pets[0]!.getProperty("hatchling:variant");
    test.assert(v === 1, `hatchling variant ${String(v)}, egg was 1`);
    const stage = pets[0]!.getProperty("hatchling:stage");
    test.assert(stage === 0, `new hatchling is stage ${String(stage)}, expected 0`);
  });
})
  .structureName(STRUCTURE)
  .maxTicks(200);

registerAsync("qol", "hatchling_grows_by_stage_event", async (test) => {
  floor(test);
  clearSpot(test);
  const pet = spawn(test, PET, 0);
  await test.idle(5);
  const scale0 = pet.getComponent(EntityComponentTypes.Scale)?.value;
  test.assert(scale0 !== undefined && scale0 < 0.6, `hatchling spawned at scale ${scale0}, expected 0.55`);
  test.assert(pet.getComponent(EntityComponentTypes.Tameable) !== undefined, "new hatchling is not tameable");

  pet.triggerEvent("hatchling:grow_1");
  await test.idle(5);
  const scale1 = pet.getComponent(EntityComponentTypes.Scale)?.value;
  test.assert(pet.getProperty("hatchling:stage") === 1, `stage property ${String(pet.getProperty("hatchling:stage"))} after grow_1`);
  test.assert(scale1 !== undefined && scale1 > scale0!, `scale ${scale0} -> ${scale1} after grow_1; the stage group did not swap`);

  pet.triggerEvent("hatchling:grow_2");
  await test.idle(5);
  const scale2 = pet.getComponent(EntityComponentTypes.Scale)?.value;
  test.assert(scale2 !== undefined && scale2 > scale1!, `scale ${scale1} -> ${scale2} after grow_2`);
  const health = pet.getComponent(EntityComponentTypes.Health);
  test.assert(
    health !== undefined && health.effectiveMax >= 24,
    `grown hatchling max health ${health?.effectiveMax}, expected 24`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(100);

/**
 * Sweet berries from a player's hand tame a wild hatchling.
 *
 * This one CAN use a simulated player, unlike the pack's script paths: taming
 * is vanilla `minecraft:tameable` (tame_items sweet_berries, probability 1.0)
 * and the engine does it, so the pack never needs to see the player at all.
 *
 * Measured when this was written: tameable=true / is_tamed=false before the
 * offer, tameable=false / is_tamed=true after - `hatchling:on_tame` swapping
 * the `hatchling:wild` group for `hatchling:tame`.
 */
registerAsync("qol", "hatchling_tames_with_berries", async (test) => {
  floor(test);
  clearSpot(test);
  const pet = spawn(test, PET, 0);
  await test.idle(10);

  test.assert(
    pet.getComponent(EntityComponentTypes.Tameable) !== undefined,
    "a wild hatchling has no tameable component, so nothing could tame it",
  );

  const player = test.spawnSimulatedPlayer(
    { x: 2, y: 1, z: 4 },
    "berry_tester",
    GameMode.Creative,
  );
  await test.idle(10);
  player.setItem(new ItemStack("minecraft:sweet_berries", 16), 0, true);
  await test.idle(5);

  // Probability is 1.0, but the interaction still has to land on the entity,
  // so offer repeatedly rather than trusting a single reach.
  let tamed = false;
  for (let i = 0; i < 12 && !tamed; i++) {
    player.lookAtEntity(pet);
    await test.idle(3);
    player.interactWithEntity(pet);
    await test.idle(5);
    tamed = pet.getComponent(EntityComponentTypes.IsTamed) !== undefined;
  }

  test.assert(
    tamed,
    `sweet berries did not tame the hatchling after 12 offers; tameable=${
      pet.getComponent(EntityComponentTypes.Tameable) !== undefined
    } is_tamed=${pet.getComponent(EntityComponentTypes.IsTamed) !== undefined}`,
  );
  // Printed on success as well, because this is the measurement the pack's
  // `isBonded` depends on: the tameable component goes with the wild group, so
  // `minecraft:is_tamed` is the only thing left that says "somebody's".
  test.print(
    `after the bond: tameable=${pet.getComponent(EntityComponentTypes.Tameable) !== undefined} is_tamed=${
      pet.getComponent(EntityComponentTypes.IsTamed) !== undefined
    }`,
  );

  // Whose it is - the pack's own record, issue #98 - is the next test's
  // question, and one this harness cannot answer (see it). Print what is
  // there so the run shows it.
  test.print(`owner record after the bond: ${String(pet.getDynamicProperty("hatchling:owner"))}`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(400);

/**
 * A hatchling cannot fall to its death.
 *
 * This is the one thing about the pack that matters most to the person it was
 * written for, and it is deliberately data and not script: the entity carries
 * `minecraft:damage_sensor` refusing `fall` and `fly_into_wall`, so it holds
 * with the script asleep, on a `/reload` mid-fall, and with every panel switch
 * off. Applying the damage directly is the honest test of that - a real drop
 * would also be caught by the glide, and then this would be measuring two
 * things at once.
 */
registerAsync("qol", "hatchling_ignores_fall_damage", async (test) => {
  floor(test);
  clearSpot(test);
  const pet = spawn(test, PET, 1);
  await test.idle(5);
  const health = pet.getComponent(EntityComponentTypes.Health);
  test.assert(health !== undefined, "hatchling has no health component");
  const before = health!.currentValue;

  const applied = pet.applyDamage(20, { cause: EntityDamageCause.fall });
  await test.idle(5);

  test.assert(pet.isValid, "a 20-point fall killed the hatchling outright");
  test.assert(
    health!.currentValue === before,
    `fall damage took the hatchling ${before} -> ${health!.currentValue} (applyDamage returned ${applied}); the damage sensor should refuse it`,
  );
  pet.remove();
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(100);

/**
 * A hatchling has wings, so a drop should look like flight.
 *
 * Dropped from well above the arena, the pack's glide sweep
 * (packages/hatchling/scripts/engine/flight.ts) should hold it near
 * `GLIDE_SPEED` (0.35 blocks/tick) instead of letting it accelerate towards
 * terminal velocity, which is about -3.9. The bound below is loose on purpose:
 * what is being pinned is "drifts rather than plummets", and the assertion
 * message carries the speed actually measured, so a failure is a measurement
 * of how hard `applyImpulse` really pushes a mob.
 */
registerAsync("qol", "hatchling_glides_down_a_drop", async (test) => {
  floor(test);
  clearSpot(test);
  const pet = spawn(test, PET, 1);
  await test.idle(5);
  const health = pet.getComponent(EntityComponentTypes.Health);
  const before = health?.currentValue ?? NaN;

  const at = test.worldBlockLocation(SPOT);
  const from = at.y + 20;
  pet.teleport({ x: at.x + 0.5, y: from, z: at.z + 0.5 });

  // `isOnGround` still reads true for a tick or two after the teleport, so the
  // sampling loop would end before it began if it trusted that straight away.
  await test.idle(4);

  let fastest = 0;
  let gliding = false;
  let samples = 0;
  for (let t = 0; t < 300 && !pet.isOnGround; t++) {
    fastest = Math.min(fastest, pet.getVelocity().y);
    gliding ||= pet.getProperty("hatchling:gliding") === true;
    samples++;
    await test.idle(1);
  }

  // test.print goes to chat, which nobody reads on a headless server: every
  // measurement below is in an assertion message instead.
  const measured = `fell from y=${from.toFixed(1)} to y=${pet.location.y.toFixed(1)} over ${samples} sample(s), fastest ${fastest.toFixed(2)} blocks/tick, gliding seen: ${gliding}`;
  // Take it away BEFORE the assertions, which throw. This one starts its fall
  // above the structure, and GameTest only cleans up inside it: a hatchling
  // left drifting outside the test volume is persistent, survives the run, and
  // moves where later tests get placed. That is not hypothetical - it is what
  // made villages_visitor_settles fail three runs in a row.
  const after = health?.currentValue ?? NaN;
  const alive = pet.isValid && after === before;
  pet.remove();
  test.assert(samples > 0, `the hatchling never left the ground: ${measured}`);
  test.assert(alive, `hatchling took damage falling 20 blocks (${before} -> ${after}); ${measured}`);
  test.assert(
    gliding,
    `hatchling:gliding was never set, so the wings never came out; ${measured}`,
  );
  test.assert(
    fastest > -1.5,
    `that is a plummet, not a glide - free fall reaches about -3.9; ${measured}`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(400);

/**
 * The shell cracks as the egg is warmed, and a crack is not a hatch.
 *
 * Warming is the pack's longest-running state: three warmings ten minutes
 * apart by default, with the shell showing how far along it is. Script drives
 * that entirely through `hatchling:crack_N`, and a player watching an egg for
 * half an hour has nothing but the shell to tell them it is working - so a
 * crack event that silently did nothing, or that hatched the egg early, would
 * be a bad way to find out.
 *
 * The variant is re-read after each crack because the two are separate
 * properties set by separate events, and a crack event that reset the variant
 * would hand the player the wrong dragon at the end of it.
 */
registerAsync("qol", "hatchling_shell_cracks_while_warming", async (test) => {
  floor(test);
  clearSpot(test);
  const egg = spawn(test, EGG, 2);
  await test.idle(5);

  test.assert(
    egg.getProperty("hatchling:cracks") === 0,
    `a fresh egg starts at ${String(egg.getProperty("hatchling:cracks"))} crack(s), expected 0`,
  );

  for (const cracks of [1, 2]) {
    egg.triggerEvent(`hatchling:crack_${cracks}`);
    // An entity event lands on the next tick, never in this one.
    await test.idle(5);
    test.assert(
      egg.getProperty("hatchling:cracks") === cracks,
      `after hatchling:crack_${cracks} the shell reads ${String(egg.getProperty("hatchling:cracks"))} crack(s)`,
    );
    test.assert(
      egg.isValid,
      `the egg was removed by hatchling:crack_${cracks}; a warming must not hatch it`,
    );
    test.assert(
      egg.getProperty("hatchling:hatching") === false,
      `hatchling:crack_${cracks} set hatching, so the egg would hatch a warming early`,
    );
    test.assert(
      egg.getProperty("hatchling:variant") === 2,
      `the egg's variant is ${String(egg.getProperty("hatchling:variant"))} after crack_${cracks}, was 2`,
    );
  }

  test.assert(
    near(test, PET).length === 0,
    "a cracked egg has already produced a hatchling",
  );
  test.print("cracks 0 -> 1 -> 2 with the variant intact and no hatchling yet");
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * The pack records who bonded a hatchling (issue #98): `hatchling:owner` is
 * the offerer's id, written on the ticks after the berry offer once
 * `minecraft:is_tamed` has appeared, because the tameable component - and its
 * `tamedToPlayerId` - leaves with the wild group at the bond.
 *
 * Fails on a headless server, and is listed in known-failures.json for it:
 * a SimulatedPlayer's `interactWithEntity` bonds the hatchling through the
 * engine's tameable, but raises NO `playerInteractWithEntity` before-event
 * in the pack - measured with a log line at the top of the pack's handler,
 * which printed nothing across the offers of four runs while `is_tamed`
 * appeared every time (docs/README.md corrections). So there is no moment at
 * which the pack could see the offerer, and the record stays unwritten. The
 * assertion carries the measurement, and the test starts passing the day
 * the engine delivers the event for a simulated player.
 */
registerAsync("qol", "hatchling_records_its_owner", async (test) => {
  floor(test);
  clearSpot(test);
  const pet = spawn(test, PET, 0);
  await test.idle(10);
  const player = test.spawnSimulatedPlayer({ x: 2, y: 1, z: 4 }, "owner_tester", GameMode.Creative);
  await test.idle(10);
  player.setItem(new ItemStack("minecraft:sweet_berries", 16), 0, true);
  await test.idle(5);
  let tamed = false;
  for (let i = 0; i < 12 && !tamed; i++) {
    player.lookAtEntity(pet);
    await test.idle(3);
    player.interactWithEntity(pet);
    await test.idle(5);
    tamed = pet.getComponent(EntityComponentTypes.IsTamed) !== undefined;
  }
  test.assert(tamed, "sweet berries did not tame the hatchling after 12 offers, so there was no bond to record");

  const owner = () => pet.getDynamicProperty("hatchling:owner");
  await until(test, () => owner() !== undefined, 40, 2);
  test.assert(
    owner() === player.id,
    `expected hatchling:owner to be the offerer's id ${player.id}, read ${String(owner())} ` +
      `(owner_name ${String(pet.getDynamicProperty("hatchling:owner_name"))}): the bond happened but the pack ` +
      `saw no playerInteractWithEntity before-event for the simulated player's offer`,
  );
  test.succeed();
}).maxTicks(400).structureName(STRUCTURE);
