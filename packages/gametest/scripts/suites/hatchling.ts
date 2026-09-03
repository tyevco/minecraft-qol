import {
  EntityComponentTypes,
  GameMode,
  ItemStack,
  type Vector3,
} from "@minecraft/server";
import { registerAsync, type Test } from "@minecraft/server-gametest";
import { floor, STRUCTURE } from "./rig";

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
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(400);
