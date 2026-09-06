import { EntityComponentTypes, GameMode, type Player } from "@minecraft/server";

const health = (p: Player): number => p.getComponent(EntityComponentTypes.Health)?.currentValue ?? 0;
import { registerAsync } from "@minecraft/server-gametest";
import { carried, floor, item, STRUCTURE, until } from "./rig";

/**
 * Graves: a player who dies with items either keeps them or finds them in a
 * gravestone - never on the floor.
 *
 * Which of the two depends on the role the settings panel gives simulated
 * players, which this test cannot read, so it accepts either and prints
 * which happened. A failure means the items dropped: the keep-on-death flag
 * did not hold, or the transfer to the stone lost them.
 */
registerAsync("qol", "death_keeps_items", async (test) => {
  floor(test);
  const player = test.spawnSimulatedPlayer(
    { x: 3, y: 1, z: 3 },
    "gv_tester",
    GameMode.Survival,
  );
  player.setItem(item("minecraft:diamond", 3), 0, true);
  test.print(
    `permission level ${player.playerPermissionLevel}; waiting for the keep sweep`,
  );
  // Wait for the keep sweep to flag the stack, not for a number of ticks
  // (issue #29); the flag is readable on the stack itself.
  const flagged = (): boolean => {
    const c = player.getComponent("minecraft:inventory")?.container;
    const stack = c?.getItem(0);
    return stack !== undefined && stack.keepOnDeath;
  };
  const wasFlagged = await until(test, flagged, 200);
  test.print(
    `carrying ${carried(player, "minecraft:diamond")} diamonds, keepOnDeath ${wasFlagged}; dying`,
  );
  player.kill();
  await until(test, () => !player.isValid || health(player) <= 0, 100);
  player.respawn();
  await until(test, () => player.isValid && health(player) > 0, 100);

  test.succeedWhen(() => {
    const kept = carried(player, "minecraft:diamond");
    if (kept === 3) {
      test.print("kept: items survived death in the inventory");
      return;
    }
    let stoneHoldsThem = false;
    for (const e of test
      .getDimension()
      .getEntities({ type: "graves:gravestone" })) {
      const c = e.getComponent("minecraft:inventory")?.container;
      if (!c) continue;
      for (let i = 0; i < c.size; i++)
        if (c.getItem(i)?.typeId === "minecraft:diamond") stoneHoldsThem = true;
    }
    test.assert(
      stoneHoldsThem,
      `carrying ${kept}/3 diamonds and no gravestone holds them - they dropped`,
    );
    test.print("grave: items are waiting in a gravestone");
  });
})
  .structureName(STRUCTURE)
  .maxTicks(400);
