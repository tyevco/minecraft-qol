import {
  EntityComponentTypes,
  EntityDamageCause,
  GameMode,
  PlayerPermissionLevel,
} from "@minecraft/server";
import { registerAsync } from "@minecraft/server-gametest";
import { floor, STRUCTURE } from "./rig";

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
  await floor(test);
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
    await test.idle(5);
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

registerAsync("qol", "guardian_void_catch", async (test) => {
  await floor(test);
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
