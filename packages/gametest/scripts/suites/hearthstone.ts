import {
  Direction,
  EntityComponentTypes,
  GameMode,
  LiquidType,
  type Player,
  type Vector3,
} from "@minecraft/server";
import { registerAsync } from "@minecraft/server-gametest";
import { chooseRespawn, RESPAWN_OFFSETS } from "../../../hearthstone/scripts/core/anchors";
import { floor, item, STRUCTURE, until } from "./rig";

const health = (p: Player): number =>
  p.getComponent(EntityComponentTypes.Health)?.currentValue ?? 0;

/**
 * Hearthstone: placing an anchor near a player with no spawn point gives them
 * one beside it.
 *
 * The anchor is placed by the simulated player, not by the test, because the
 * pack registers anchors on playerPlaceBlock.
 *
 * EXPECTED TO FAIL IN A NORMAL RUN. Read the failure as "not measured", never
 * as "Hearthstone is broken" - the pack is proven correct
 * (docs/gametest-structure-results.md). A SimulatedPlayer marshals as undefined
 * into every pack that does not itself bind @minecraft/server-gametest, so
 * Hearthstone never sees this player and assigns nothing; the failure reads
 * "spawn point still unset".
 *
 * It is kept because it is a real full-path test - place the block, index the
 * anchor, choose a standing spot, assign the spawn - and it is worth running
 * deliberately when changing that path. To do so, temporarily add
 * @minecraft/server-gametest to the Hearthstone pack in all THREE places (the
 * manifest's dependencies, its `external` list in just.config.ts, and a
 * side-effect import in its main.ts - the declaration alone does nothing), run
 * it, then REVERT ALL THREE. That module is a Beta API: it flags the pack
 * experimental and the Realm keeps its achievements, so it must never ship.
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

/**
 * Hearthstone: a spawn point set from script is where the player wakes up.
 *
 * The pack's entire mechanic is "assign a spawn point pre-emptively and let
 * vanilla respawn do the work", so this one engine behaviour is the feature.
 * It was measured once by hand with a real player
 * (docs/hearthstone-spawn-results.md) and has never been in the suite:
 * `anchor_sets_spawn` is a known failure that measures the harness, not this.
 *
 * A SimulatedPlayer cannot be driven through the pack, but it can be killed
 * and respawned, and `setSpawnPoint` is not a pack call - it is the engine's.
 * So this drives the mechanism directly: set a spawn point away from where
 * they died, kill them, and see where they come back.
 */
registerAsync("qol", "hearthstone_spawn_point_is_honoured", async (test) => {
  floor(test);
  const player = test.spawnSimulatedPlayer(
    { x: 2, y: 1, z: 2 },
    "hs_sleeper",
    GameMode.Survival,
  );
  await test.idle(10);

  // A validated standing spot the way chooseRespawn picks one: solid floor,
  // two clear blocks. Far enough from the death spot that "they simply did not
  // move" cannot pass this test.
  const bed = test.worldBlockLocation({ x: 6, y: 1, z: 6 });
  player.setSpawnPoint({ ...bed, dimension: test.getDimension() });
  await test.idle(5);

  const set = player.getSpawnPoint();
  test.assert(
    set !== undefined,
    "getSpawnPoint reads back undefined right after setSpawnPoint - the pack's own ownership record would never match",
  );
  test.assert(
    Math.abs(set!.x - bed.x) <= 1 && Math.abs(set!.z - bed.z) <= 1,
    `spawn point read back as ${set!.x},${set!.y},${set!.z}, not the ${bed.x},${bed.y},${bed.z} that was set`,
  );

  player.kill();
  await until(test, () => !player.isValid || health(player) <= 0, 100);
  player.respawn();
  await until(test, () => player.isValid && health(player) > 0, 100);
  await test.idle(10);

  const woke = player.location;
  const dx = Math.abs(woke.x - (bed.x + 0.5));
  const dz = Math.abs(woke.z - (bed.z + 0.5));
  test.print(
    `died at 2,1,2; spawn point ${bed.x},${bed.y},${bed.z}; woke at ${woke.x.toFixed(1)},${woke.y.toFixed(1)},${woke.z.toFixed(1)}`,
  );
  test.assert(
    dx <= 2 && dz <= 2,
    `woke ${dx.toFixed(1)},${dz.toFixed(1)} away from the assigned spawn point: vanilla respawn did not honour it, and the whole pack is inert`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(400);

/**
 * Hearthstone: a spawn point outside the world throws rather than sticking.
 *
 * `assignSpawn` wraps `setSpawnPoint` in a try/catch and logs the failure,
 * which only matters because the call really does throw - an anchor near
 * bedrock or the world ceiling produces exactly this. If it ever started
 * failing silently instead, a player would be assigned a spawn point that
 * cannot exist, and the pack would go on believing it owned their respawn.
 */
registerAsync("qol", "hearthstone_spawn_point_out_of_the_world_throws", async (test) => {
  floor(test);
  const player = test.spawnSimulatedPlayer(
    { x: 3, y: 1, z: 3 },
    "hs_faller",
    GameMode.Survival,
  );
  await test.idle(10);

  const dim = test.getDimension();
  const below = dim.heightRange.min - 10;
  let threw: string | undefined;
  try {
    player.setSpawnPoint({ x: 0, y: below, z: 0, dimension: dim });
  } catch (e) {
    threw = String(e);
  }
  test.print(`setSpawnPoint at y=${below} (floor ${dim.heightRange.min}): ${threw ?? "no error"}`);
  test.assert(
    threw !== undefined,
    `setSpawnPoint below the dimension floor (y=${below}) was accepted; the pack's catch is dead code and an obstructed anchor would look like a working one`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * Hearthstone: the anchor block loads, and a player is placed beside it.
 *
 * Two things at once, both of which have only ever been checked by eye. A
 * custom block whose JSON fails to load is simply air, with no error to say
 * so, and every anchor in the world would then be a block nobody can place.
 * And `chooseRespawn` is pure, so its unit tests supply their own `isClear` -
 * this runs it against real blocks, through the same "two clear, one solid"
 * reading the pack uses, and checks it never picks the anchor's own cell.
 */
registerAsync("qol", "hearthstone_anchor_places_a_player_beside_it", async (test) => {
  floor(test);
  const anchor = { x: 3, y: 1, z: 3 };
  test.setBlockType("hearthstone:hearthstone", anchor);
  await test.idle(5);

  const placed = test.getBlock(anchor);
  test.assert(
    placed.typeId === "hearthstone:hearthstone",
    `the anchor block reads as ${placed.typeId}: the block definition did not load, so the pack has no anchor to place`,
  );

  // The pack's isStandingSpot, in test-relative coordinates: two clear cells
  // with something solid beneath.
  const isClear = (x: number, y: number, z: number): boolean => {
    const clear = (pos: Vector3) => {
      const b = test.getBlock(pos);
      return b.isValid && (b.isAir || !b.isLiquidBlocking(LiquidType.Water));
    };
    const solid = (pos: Vector3) => {
      const b = test.getBlock(pos);
      return b.isValid && !b.isAir && !b.isLiquid && b.isLiquidBlocking(LiquidType.Water);
    };
    return clear({ x, y, z }) && clear({ x, y: y + 1, z }) && solid({ x, y: y - 1, z });
  };

  const spot = chooseRespawn({ dimId: test.getDimension().id, ...anchor }, isClear);
  test.assert(spot !== undefined, "an anchor standing in the open found nowhere to put a player");
  test.assert(
    !(spot!.x === anchor.x && spot!.z === anchor.z),
    `the chosen spot ${spot!.x},${spot!.z} is the anchor's own cell; the player would materialise inside the block`,
  );
  test.assert(
    isClear(spot!.x, spot!.y, spot!.z),
    `the chosen spot ${spot!.x},${spot!.y},${spot!.z} is not somewhere a player can stand`,
  );
  test.print(`anchor at ${anchor.x},${anchor.z} -> stand at ${spot!.x},${spot!.z}`);

  // Wall it in on all four sides and it must refuse rather than pick a wall.
  for (const { dx, dz } of RESPAWN_OFFSETS) {
    test.setBlockType("minecraft:stone", { x: anchor.x + dx, y: anchor.y, z: anchor.z + dz });
  }
  await test.idle(5);
  const boxed = chooseRespawn({ dimId: test.getDimension().id, ...anchor }, isClear);
  test.assert(
    boxed === undefined,
    `a walled-in anchor still chose ${JSON.stringify(boxed)}; the player would be placed inside stone`,
  );
  test.print("walled in: no spot chosen, which the pack surfaces as obstructed");
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);
