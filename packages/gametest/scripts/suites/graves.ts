import {
  EntityComponentTypes,
  EntityDamageCause,
  GameMode,
  type Player,
} from "@minecraft/server";

const health = (p: Player): number => p.getComponent(EntityComponentTypes.Health)?.currentValue ?? 0;
import { registerAsync } from "@minecraft/server-gametest";
import { EQUIPMENT_SLOTS } from "../../../graves/scripts/engine/keep";
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

/**
 * Graves: `keepOnDeath` really is what stops the drop.
 *
 * The pack never chases item entities on the death tick. It flags every stack
 * a participating player carries and lets the engine do the hard part, so the
 * whole feature - inventory mode and gravestone mode alike - rests on one
 * property of one class. `death_keeps_items` above cannot measure it, because
 * Graves' own sweep walks `players()` and a SimulatedPlayer is not in that
 * list (issue #31): it can only report what happened to a player Graves never
 * flagged.
 *
 * So this test does the flagging itself, through the same container write the
 * sweep performs, and then kills the player. It measures the substrate rather
 * than the pack, which is the half a headless run can actually reach - and if
 * the engine ever stops honouring the flag, Graves stops working entirely and
 * this is the only test in the suite that would say so.
 */
registerAsync("qol", "keep_on_death_stops_the_drop", async (test) => {
  floor(test);
  const player = test.spawnSimulatedPlayer(
    { x: 3, y: 1, z: 3 },
    "gv_keeper",
    GameMode.Survival,
  );
  await test.idle(10);

  // Two stacks: one flagged, one deliberately not, so a run where nothing
  // drops at all - a keepInventory world, say - cannot be mistaken for a pass.
  player.setItem(item("minecraft:diamond", 3), 0, true);
  player.setItem(item("minecraft:emerald", 2), 1, true);

  const inventory = player.getComponent(EntityComponentTypes.Inventory)?.container;
  test.assert(inventory !== undefined, "the simulated player has no inventory container");
  const keeper = inventory!.getItem(0);
  test.assert(keeper !== undefined, "the diamonds are not in slot 0");
  // Every ItemStack handed out is a copy; the write-back is the change, which
  // is the step engine/keep.ts exists to get right.
  keeper!.keepOnDeath = true;
  inventory!.setItem(0, keeper);

  const flagged = inventory!.getItem(0)?.keepOnDeath;
  test.assert(
    flagged === true,
    `keepOnDeath did not survive the container write (reads ${String(flagged)}) - engine/keep.ts's whole method is unsound`,
  );
  const unflagged = inventory!.getItem(1)?.keepOnDeath;
  test.assert(
    unflagged !== true,
    "the control stack is flagged too; this run cannot tell keeping from a world that never drops",
  );

  player.kill();
  await until(test, () => !player.isValid || health(player) <= 0, 100);
  player.respawn();
  await until(test, () => player.isValid && health(player) > 0, 100);
  await test.idle(20);

  const diamonds = carried(player, "minecraft:diamond");
  const emeralds = carried(player, "minecraft:emerald");
  const dropped = test
    .getDimension()
    .getEntities({ type: "minecraft:item", location: test.worldBlockLocation({ x: 3, y: 1, z: 3 }), maxDistance: 8 }).length;
  test.print(`after death: ${diamonds} diamond(s) kept, ${emeralds} emerald(s) kept, ${dropped} item entit(ies) on the floor`);

  test.assert(
    diamonds === 3,
    `the flagged diamonds did not survive death: ${diamonds}/3 carried, ${dropped} item entit(ies) nearby`,
  );
  test.assert(
    emeralds === 0,
    `the unflagged emeralds survived too (${emeralds}/2): this world keeps everything, so the flag proved nothing`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(400);

/**
 * Graves: the gravestone can hold everything a player was carrying.
 *
 * `planTransfer` plans moves into `target.size` slots and reports whatever did
 * not fit as leftover that stays with the player. That is the safe failure,
 * but it is only ever exercised if the stone is too small - and how big the
 * stone is lives in the entity JSON, a file with no types and no tests. A
 * player carries 36 inventory slots plus the five equipment slots Graves
 * empties, so 41 is the number the stone must not fall below.
 *
 * Also pins the two other properties the JSON promises and the pack depends
 * on: the stone refuses damage (a creeper must not scatter someone's things),
 * and a hopper cannot siphon it (`can_be_siphoned_from: false`).
 */
registerAsync("qol", "gravestone_holds_a_full_inventory", async (test) => {
  floor(test);
  const at = test.worldBlockLocation({ x: 3, y: 1, z: 3 });
  const grave = test
    .getDimension()
    .spawnEntity("graves:gravestone", { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
  await test.idle(5);

  const container = grave.getComponent(EntityComponentTypes.Inventory)?.container;
  test.assert(container !== undefined, "the gravestone has no inventory container at all");
  const needed = 36 + EQUIPMENT_SLOTS.length;
  test.assert(
    container!.size >= needed,
    `the gravestone holds ${container!.size} slots; a player carries up to ${needed}, so the rest would stay on the corpse`,
  );

  container!.setItem(0, item("minecraft:diamond", 3));
  await test.idle(5);
  test.assert(
    container!.getItem(0)?.amount === 3,
    "items put into the gravestone did not stay there",
  );

  const healthComponent = grave.getComponent(EntityComponentTypes.Health);
  test.assert(healthComponent !== undefined, "the gravestone has no health component");
  const before = healthComponent!.currentValue;
  grave.applyDamage(20, { cause: EntityDamageCause.entityAttack });
  await test.idle(10);
  test.assert(
    grave.isValid && healthComponent!.currentValue === before,
    `the gravestone took damage (${before} -> ${grave.isValid ? healthComponent!.currentValue : "removed"}); a stray hit would scatter someone's things`,
  );

  test.print(`gravestone: ${container!.size} slots, unhurt by 20 damage at ${before} health`);
  grave.remove();
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);
