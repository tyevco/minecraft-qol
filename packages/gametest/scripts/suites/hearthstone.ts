import { Direction, GameMode } from "@minecraft/server";
import { registerAsync } from "@minecraft/server-gametest";
import { floor, item, STRUCTURE } from "./rig";

/**
 * Hearthstone: placing an anchor near a player with no spawn point gives them
 * one beside it.
 *
 * The anchor is placed by the simulated player, not by the test, because the
 * pack registers anchors on playerPlaceBlock.
 */
registerAsync("qol", "anchor_sets_spawn", async (test) => {
  floor(test);
  const player = test.spawnSimulatedPlayer(
    { x: 2, y: 1, z: 2 },
    "hs_tester",
    GameMode.Survival,
  );
  // A SimulatedPlayer is spawned WITH a spawn point - its own spawn cell -
  // unlike a real player who has never slept (docs/hearthstone-spawn-results.md).
  // Hearthstone treats any spawn point it did not assign as "foreign" and
  // deliberately never touches it, so without this the test asks the pack to do
  // the one thing it is designed to refuse. setSpawnPoint() with no argument
  // clears it (the parameter is optional in 2.9.0).
  player.setSpawnPoint();
  const before = player.getSpawnPoint();
  // console.warn, not test.print: print goes to chat, and running headless
  // there is no player to receive it, so the diagnostic vanishes.
  console.warn(
    `[GameTest] anchor_sets_spawn: spawn point after clearing = ${
      before ? `${before.x},${before.y},${before.z}` : "UNSET"
    }`,
  );

  await test.idle(5);
  const placedOn = { x: 5, y: 0, z: 5 };
  const anchor = test.worldBlockLocation({ x: 5, y: 1, z: 5 });
  player.lookAtBlock(placedOn);
  const ok = player.useItemOnBlock(
    item("hearthstone:hearthstone"),
    placedOn,
    Direction.Up,
  );
  test.assert(ok, "useItemOnBlock refused the hearthstone");

  test.succeedWhen(() => {
    test.assertBlockPresent(
      "hearthstone:hearthstone",
      { x: 5, y: 1, z: 5 },
      true,
    );
    const sp = player.getSpawnPoint();
    test.assert(sp !== undefined, "spawn point still unset");
    const d = Math.abs(sp!.x - anchor.x) + Math.abs(sp!.z - anchor.z);
    test.assert(
      d <= 2 && sp!.y === anchor.y,
      `spawn point ${sp!.x},${sp!.y},${sp!.z} is not beside the anchor at ${anchor.x},${anchor.y},${anchor.z}`,
    );
  });
})
  .structureName(STRUCTURE)
  .maxTicks(300);
