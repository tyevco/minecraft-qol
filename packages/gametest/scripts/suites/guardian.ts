import {
  EntityComponentTypes,
  EntityDamageCause,
  GameMode,
  ItemStack,
  PlayerPermissionLevel,
} from "@minecraft/server";
import { registerAsync } from "@minecraft/server-gametest";
import { floor, STRUCTURE, until } from "./rig";

/**
 * Guardian: a hit on a player lands as at most what the engine proposed, and
 * a protected player who falls out of the world is put back.
 *
 * What the panel says and which role a simulated player has cannot be read
 * from here, so both tests print what they measured and assert only the
 * invariants that hold under every panel: never MORE damage, and never a void
 * death for a protected role with a known last footing.
 */

const health = (p: { getComponent: (id: string) => unknown }): number =>
  (p.getComponent(EntityComponentTypes.Health) as { currentValue: number } | undefined)
    ?.currentValue ?? NaN;

registerAsync("qol", "guardian_never_adds_damage", async (test) => {
  floor(test);
  const player = test.spawnSimulatedPlayer(
    { x: 3, y: 1, z: 3 },
    "gd_tester",
    GameMode.Survival,
  );
  await test.idle(10);
  test.print(`permission level ${player.playerPermissionLevel}; health ${health(player)}`);

  const hits: { cause: EntityDamageCause; amount: number }[] = [
    { cause: EntityDamageCause.entityAttack, amount: 4 },
    { cause: EntityDamageCause.fall, amount: 4 },
    { cause: EntityDamageCause.lava, amount: 4 },
  ];
  const seen: string[] = [];
  for (const hit of hits) {
    const before = health(player);
    const applied = player.applyDamage(hit.amount, { cause: hit.cause });
    // The hit lands within a tick or two; wait for it rather than guess (issue #29).
    await until(test, () => health(player) < before, 20);
    const lost = before - health(player);
    seen.push(`${hit.cause}: proposed ${hit.amount}, lost ${lost.toFixed(2)}${applied ? "" : " (applyDamage returned false)"}`);
    test.assert(
      lost <= hit.amount + 0.01,
      `${hit.cause}: lost ${lost} from a ${hit.amount} hit - Guardian ADDED damage`,
    );
    // Give natural regeneration no time to confuse the next reading.
    await test.idle(5);
  }
  for (const line of seen) test.print(line);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * Guardian: a player who falls into the void is caught and put back.
 *
 * EXPECTED TO FAIL IN A NORMAL RUN. Read the failure as "not measured", never
 * as "Guardian is broken" - the void catch is proven to work
 * (docs/gametest-structure-results.md). Guardian's sweep walks
 * getAllPlayers(), and a SimulatedPlayer marshals as undefined into every pack
 * that does not itself bind @minecraft/server-gametest, so this player is not
 * in the list Guardian is looking at.
 *
 * It is kept because it is a real full-path test - track the ground sample,
 * notice the fall, teleport back - and it is worth running deliberately when
 * changing that path. To do so, temporarily add @minecraft/server-gametest to
 * the Guardian pack in all THREE places (the manifest's dependencies, its
 * `external` list in just.config.ts, and a side-effect import in its main.ts -
 * the declaration alone does nothing), run it, then REVERT ALL THREE. That
 * module is a Beta API: it flags the pack experimental and the Realm keeps its
 * achievements, so it must never ship.
 */
registerAsync("qol", "guardian_void_catch", async (test) => {
  floor(test);
  const player = test.spawnSimulatedPlayer(
    { x: 3, y: 1, z: 3 },
    "gd_faller",
    GameMode.Survival,
  );
  // Two sweeps' worth, so the tracker has seen them on the ground.
  await test.idle(30);

  if (player.playerPermissionLevel === PlayerPermissionLevel.Operator) {
    test.print("simulated player is an operator: switches do not apply, nothing to measure");
    test.succeed();
    return;
  }

  const stood = player.location;
  const floorY = test.getDimension().heightRange.min;
  test.print(`standing at y=${stood.y.toFixed(1)}; dimension floor y=${floorY}; dropping below it`);
  player.teleport({ x: stood.x, y: floorY - 6, z: stood.z });

  test.succeedWhen(() => {
    const y = player.location.y;
    test.assert(
      y >= floorY,
      `still at y=${y.toFixed(1)}, below the floor - not caught (void catch off, or no ground sample)`,
    );
    test.assert(
      health(player) > 0,
      "caught but dead: the landing or the void killed them",
    );
    test.print(`caught: back at y=${y.toFixed(1)}, health ${health(player)}`);
  });
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * Guardian: a hazard that would kill somebody's pet does not land, and a wild
 * animal is left exactly as vanilla left it.
 *
 * The pet used is a moss hatchling, tamed the way a player tames one (berries;
 * probability 1.0, the engine does the taming), because that is the one bonded
 * pet this suite can make reliably. Lava is the cause, not a fall: a hatchling
 * refuses fall damage itself, so a fall would prove nothing about Guardian.
 * Moss, not ember: the ember variant is fire-immune.
 *
 * The other half of the shield - that a PLAYER cannot hurt a pet - cannot be
 * measured here. A SimulatedPlayer marshals as undefined into every pack that
 * does not bind @minecraft/server-gametest, so `damagingEntity instanceof
 * Player` is false inside Guardian however the blow was struck. It is in the
 * pack README's confirm list instead.
 *
 * Reads against the panel defaults (pets protected). With
 * "Pets never take fall, fire or drowning damage" turned off, this test is
 * expected to fail, and says so.
 */
registerAsync("qol", "guardian_shields_a_tamed_pet", async (test) => {
  floor(test);
  const at = test.worldBlockLocation({ x: 4, y: 1, z: 4 });
  const pet = test
    .getDimension()
    .spawnEntity("hatchling:hatchling", { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
  pet.triggerEvent("hatchling:variant_1");
  await test.idle(10);

  const wolf = test
    .getDimension()
    .spawnEntity("minecraft:wolf", { x: at.x + 2.5, y: at.y, z: at.z + 0.5 });
  await test.idle(5);

  // A wild animal is nobody's pet: Guardian must leave it alone.
  const wolfHealth = wolf.getComponent(EntityComponentTypes.Health)!;
  const wolfBefore = wolfHealth.currentValue;
  wolf.applyDamage(4, { cause: EntityDamageCause.fall });
  await until(test, () => wolfHealth.currentValue < wolfBefore, 20);
  const wolfAfter = wolfHealth.currentValue;
  if (!(wolfAfter < wolfBefore)) {
    pet.remove();
    wolf.remove();
    test.assert(
      false,
      `a WILD wolf took no fall damage (${wolfBefore} -> ${wolfAfter}); Guardian is shielding animals nobody has tamed`,
    );
  }

  // Bond the hatchling: berries from a player's hand, as a child would.
  const player = test.spawnSimulatedPlayer(
    { x: 2, y: 1, z: 4 },
    "pet_tester",
    GameMode.Creative,
  );
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
  test.assert(tamed, "could not bond the hatchling with berries, so there is no pet to shield");

  const petHealth = pet.getComponent(EntityComponentTypes.Health)!;
  const before = petHealth.currentValue;
  const applied = pet.applyDamage(4, { cause: EntityDamageCause.lava });
  await test.idle(10);

  // Both animals go before the assertions, which throw: a pet left behind is
  // persistent, outlives the run, and moves where later tests are placed.
  const after = petHealth.currentValue;
  pet.remove();
  wolf.remove();
  test.print(`tamed hatchling in lava: ${before} -> ${after} (applyDamage returned ${applied})`);
  test.assert(
    after === before,
    `a tamed pet lost ${(before - after).toFixed(2)} health to lava; with the panel default ("Pets never take fall, fire or drowning damage") Guardian should have cancelled it`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(600);
