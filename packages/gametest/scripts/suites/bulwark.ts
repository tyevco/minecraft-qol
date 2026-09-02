import {
  BlockPermutation,
  Direction,
  EntityComponentTypes,
  GameMode,
  type Vector3,
} from "@minecraft/server";
import { registerAsync, type Test } from "@minecraft/server-gametest";
import { count, floor, item, put, STRUCTURE } from "./rig";

/**
 * Bulwark: the block/entity pairing, in an arena.
 *
 * These pin the parts of docs/bulwark-turret-probe.md that fit in eight
 * blocks: a placed turret grows exactly one head (P0), a killed head is
 * replaced and never doubled (P5), a hopper pointing into the turret is
 * drained into its buffer, and breaking the turret gives the arrows back.
 * Persistence across unload and restart (P1) and mob caps (P4) cannot be
 * tested here and stay with the probe pack.
 *
 * The turret is placed by the simulated player so the pack sees it the way a
 * player's placement is seen; the block component's onPlace would also fire
 * for setBlockType, but the point is to exercise the real path.
 */

const BLOCK = "bulwark:turret";
const HEAD = "bulwark:turret_head";
const ARROW = "minecraft:arrow";
const TURRET: Vector3 = { x: 5, y: 1, z: 5 };
const UNDER: Vector3 = { x: 5, y: 0, z: 5 };

function heads(test: Test): number {
  return test
    .getDimension()
    .getEntities({ type: HEAD, location: test.worldBlockLocation(TURRET), maxDistance: 2 })
    .length;
}

function placeTurret(test: Test): void {
  floor(test);
  const player = test.spawnSimulatedPlayer({ x: 2, y: 1, z: 2 }, "bw_tester", GameMode.Survival);
  player.lookAtBlock(UNDER);
  const ok = player.useItemOnBlock(item(BLOCK), UNDER, Direction.Up);
  test.assert(ok, "useItemOnBlock refused the turret");
}

async function waitFor(test: Test, cond: () => boolean, ticks: number): Promise<boolean> {
  for (let t = 0; t < ticks; t += 5) {
    if (cond()) return true;
    await test.idle(5);
  }
  return cond();
}

registerAsync("qol", "turret_grows_head", async (test) => {
  placeTurret(test);
  test.succeedWhen(() => {
    test.assertBlockPresent(BLOCK, TURRET, true);
    const n = heads(test);
    test.assert(n === 1, `expected exactly 1 head at the turret, found ${n}`);
  });
})
  .structureName(STRUCTURE)
  .maxTicks(200);

registerAsync("qol", "turret_replaces_killed_head", async (test) => {
  placeTurret(test);
  const grew = await waitFor(test, () => heads(test) === 1, 100);
  test.assert(grew, `head never appeared (found ${heads(test)})`);

  // Remove, not kill: kill() would fire entityDie, which is not the case
  // under test. The block remembers its head, so it waits two block ticks
  // (up to ~80 ticks) before spawning another.
  for (const head of test
    .getDimension()
    .getEntities({ type: HEAD, location: test.worldBlockLocation(TURRET), maxDistance: 2 })) {
    head.remove();
  }
  test.assert(heads(test) === 0, `head still present after remove: ${heads(test)}`);

  test.succeedWhen(() => {
    const n = heads(test);
    test.assert(n === 1, `expected the block to regrow exactly 1 head, found ${n}`);
  });
})
  .structureName(STRUCTURE)
  .maxTicks(400);

registerAsync("qol", "turret_drains_feeding_hopper", async (test) => {
  placeTurret(test);
  // A hopper to the east, facing west (4) into the turret.
  const hopper: Vector3 = { x: 6, y: 1, z: 5 };
  test.setBlockPermutation(
    BlockPermutation.resolve("minecraft:hopper", { facing_direction: 4 }),
    hopper,
  );
  put(test, hopper, item(ARROW, 10));
  test.assert(count(test, hopper, ARROW) === 10, "hopper did not take the arrows");

  test.succeedWhen(() => {
    const left = count(test, hopper, ARROW);
    test.assert(left === 0, `hopper still holds ${left} arrow(s); turret did not pull`);
  });
})
  .structureName(STRUCTURE)
  .maxTicks(200);

registerAsync("qol", "turret_break_returns_arrows", async (test) => {
  placeTurret(test);
  const hopper: Vector3 = { x: 6, y: 1, z: 5 };
  test.setBlockPermutation(
    BlockPermutation.resolve("minecraft:hopper", { facing_direction: 4 }),
    hopper,
  );
  put(test, hopper, item(ARROW, 10));
  const drained = await waitFor(test, () => count(test, hopper, ARROW) === 0, 150);
  test.assert(drained, `hopper still holds ${count(test, hopper, ARROW)} arrow(s)`);

  // Break the base. destroyBlock does not go through a player, so this also
  // measures whether onBreak fires for it; if it does not, the sweep retires
  // the record within 200 ticks and the arrows drop then.
  test.destroyBlock(TURRET, false);

  test.succeedWhen(() => {
    const n = heads(test);
    test.assert(n === 0, `head still present after the base was broken: ${n}`);
    let arrows = 0;
    for (const e of test
      .getDimension()
      .getEntities({ type: "minecraft:item", location: test.worldBlockLocation(TURRET), maxDistance: 3 })) {
      const stack = e.getComponent(EntityComponentTypes.Item)?.itemStack;
      if (stack?.typeId === ARROW) arrows += stack.amount;
    }
    test.assert(arrows === 10, `expected 10 arrows dropped, found ${arrows}`);
  });
})
  .structureName(STRUCTURE)
  .maxTicks(500);
