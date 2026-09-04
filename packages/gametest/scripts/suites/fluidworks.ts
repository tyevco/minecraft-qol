import {
  BlockPermutation,
  Direction,
  GameMode,
  WeatherType,
} from "@minecraft/server";
import { registerAsync, type Test } from "@minecraft/server-gametest";
import {
  cauldron,
  cauldronLevel,
  count,
  floor,
  item,
  put,
  STRUCTURE,
} from "./rig";

/**
 * Fluidworks funnels.
 *
 * Funnels placed by a test do not fire playerPlaceBlock, so each test asks the
 * pack to rescan - the same escape hatch a player uses after /fill or a piston,
 * given the rig's coordinates rather than run by a player.
 */
function funnel(
  test: Test,
  pos: { x: number; y: number; z: number },
  facing: string,
): void {
  test.setBlockPermutation(
    BlockPermutation.resolve("fluidworks:funnel", {
      "minecraft:facing_direction": facing,
    }),
    pos,
  );
}

/**
 * Ask the pack to index the rig this test just built.
 *
 * The rescan is told where to look rather than being run by a simulated
 * player: a command run by a SimulatedPlayer arrives at the script event with
 * sourceType Entity and no sourceEntity, so the pack has no position to scan
 * from and the rig is never indexed. Measured; see
 * docs/gametest-structure-results.md.
 */
async function rescan(test: Test): Promise<void> {
  const o = test.worldBlockLocation({ x: 3, y: 1, z: 3 });
  test
    .getDimension()
    .runCommand(`scriptevent fluidworks:rescan 8 ${o.x} ${o.y} ${o.z}`);
  await test.idle(2);
}

/**
 * The flagship: powder in a chest behind the funnel, water in the tank in
 * front of it, a chest under the tank. Concrete comes out of the bottom.
 *
 * This settled the orientation question docs/design/fluidworks.md was waiting
 * on: the funnel is set to state "east" and the tank sits east of it, and the
 * concrete arrives. So the state names the **spout's** direction, not the
 * mouth's. Had it been the mouth, nothing would have happened.
 */
registerAsync("qol", "funnel_makes_concrete", async (test) => {
  floor(test);
  const source = { x: 2, y: 1, z: 3 };
  const spout = { x: 3, y: 1, z: 3 };
  const tank = { x: 4, y: 1, z: 3 };
  const out = { x: 4, y: 0, z: 3 };
  test.setBlockType("minecraft:chest", source);
  funnel(test, spout, "east");
  cauldron(test, tank, 6);
  test.setBlockType("minecraft:chest", out);
  put(test, source, item("minecraft:white_concrete_powder", 4));
  await rescan(test);

  test.succeedWhen(() => {
    const made = count(test, out, "minecraft:white_concrete");
    test.assert(
      made === 4,
      `concrete in the output chest: ${made}, want 4 (state "east" assumed to be the spout)`,
    );
    test.assert(
      count(test, source, "minecraft:white_concrete_powder") === 0,
      "powder left in the source",
    );
  });
})
  .structureName(STRUCTURE)
  .maxTicks(600);

/** A water source block behind a funnel fills the tank one level per cycle. */
registerAsync("qol", "funnel_fills_from_source", async (test) => {
  floor(test);
  test.setBlockType("minecraft:water", { x: 2, y: 1, z: 3 });
  funnel(test, { x: 3, y: 1, z: 3 }, "east");
  const tank = { x: 4, y: 1, z: 3 };
  cauldron(test, tank, 0);
  await rescan(test);

  test.succeedWhen(() => {
    test.assert(
      cauldronLevel(test, tank) >= 2,
      `tank level ${cauldronLevel(test, tank)}, want >= 2`,
    );
  });
})
  .structureName(STRUCTURE)
  .maxTicks(400);

/** A funnel facing down under open sky collects rain into the tank below it. */
registerAsync("qol", "rain_collector", async (test) => {
  floor(test);
  const tank = { x: 3, y: 1, z: 3 };
  cauldron(test, tank, 0);
  funnel(test, { x: 3, y: 2, z: 3 }, "down");
  await rescan(test);
  const dim = test.getDimension();
  dim.setWeather(WeatherType.Rain, 20 * 60);
  test.runOnFinish(() => dim.setWeather(WeatherType.Clear));

  test.succeedWhen(() => {
    test.assert(
      cauldronLevel(test, tank) >= 1,
      `tank level ${cauldronLevel(test, tank)}, want >= 1 in rain`,
    );
  });
})
  .structureName(STRUCTURE)
  .maxTicks(600);

/** Fluid reaches a tank at the far end of a run of pipes. */
registerAsync("qol", "funnel_through_pipes", async (test) => {
  floor(test);
  test.setBlockType("minecraft:water", { x: 1, y: 1, z: 3 });
  funnel(test, { x: 2, y: 1, z: 3 }, "east");
  test.setBlockType("fluidworks:pipe", { x: 3, y: 1, z: 3 });
  test.setBlockType("fluidworks:pipe", { x: 4, y: 1, z: 3 });
  test.setBlockType("fluidworks:pipe", { x: 4, y: 2, z: 3 });
  const tank = { x: 5, y: 2, z: 3 };
  cauldron(test, tank, 0);
  await rescan(test);

  test.succeedWhen(() => {
    test.assert(
      cauldronLevel(test, tank) >= 1,
      `tank at the end of the pipes is at ${cauldronLevel(test, tank)}`,
    );
  });
})
  .structureName(STRUCTURE)
  .maxTicks(400);

/**
 * A mature crop at the mouth is harvested into the container at the spout
 * and replanted. Wheat needs farmland under it, so the rig is laid out
 * sideways: farmland and wheat, then the funnel, then the chest.
 */
registerAsync("qol", "harvester_funnel", async (test) => {
  floor(test);
  test.setBlockType("minecraft:farmland", { x: 2, y: 0, z: 3 });
  const crop = { x: 2, y: 1, z: 3 };
  test.setBlockPermutation(
    BlockPermutation.resolve("minecraft:wheat", { growth: 7 }),
    crop,
  );
  funnel(test, { x: 3, y: 1, z: 3 }, "east");
  const out = { x: 4, y: 1, z: 3 };
  test.setBlockType("minecraft:chest", out);
  await rescan(test);

  test.succeedWhen(() => {
    test.assert(
      count(test, out, "minecraft:wheat") >= 1,
      "no wheat in the chest",
    );
    const b = test.getBlock(crop);
    test.assert(
      b.typeId === "minecraft:wheat",
      `crop tile is ${b.typeId}; expected it replanted`,
    );
    test.assert(
      (b.permutation.getState("growth") as number) === 0,
      "replanted wheat is not at growth 0",
    );
  });
})
  .structureName(STRUCTURE)
  .maxTicks(400);

/** Items dropped near an open mouth end up in the container at the spout. */
registerAsync("qol", "collector_funnel", async (test) => {
  floor(test);
  funnel(test, { x: 3, y: 1, z: 3 }, "east");
  const out = { x: 4, y: 1, z: 3 };
  test.setBlockType("minecraft:chest", out);
  await rescan(test);
  test.spawnItem(item("minecraft:cobblestone", 5), { x: 2.5, y: 1.5, z: 3.5 });

  test.succeedWhen(() => {
    test.assert(
      count(test, out, "minecraft:cobblestone") === 5,
      `cobblestone in the chest: ${count(test, out, "minecraft:cobblestone")}, want 5`,
    );
    test.assertItemEntityCountIs(
      "minecraft:cobblestone",
      { x: 2, y: 1, z: 3 },
      2,
      0,
    );
  });
})
  .structureName(STRUCTURE)
  .maxTicks(300);

/** The funnel's spout direction at `pos`, or "none" when the block is not a funnel. */
function spoutOf(test: Test, pos: { x: number; y: number; z: number }): string {
  const b = test.getBlock(pos);
  if (!b.isValid || b.typeId !== "fluidworks:funnel") return `none (${b.typeId})`;
  return String(b.permutation.getState("minecraft:facing_direction"));
}

/**
 * Hopper-style placement: a funnel placed against a tank points its spout
 * into the tank. The player stands west of an empty cell, the cauldron is
 * east of that cell, and the funnel item is used on the cauldron's west face.
 *
 * This is the in-game check of the one assumption placement rests on: that
 * the face handed to `beforeOnPlayerPlace` is the clicked block's face, so
 * the clicked block lies opposite it from the new funnel. If the spout comes
 * out "west", the sign is the other way and `placementFacing` gets it
 * inverted, not the model.
 */
registerAsync("qol", "funnel_places_into_clicked_tank", async (test) => {
  floor(test);
  // A water source, not a cauldron, and the reason matters: a cauldron has its
  // own use action, which swallows the click. Measured - clicking a cauldron's
  // side with a funnel returns used=true and places nothing anywhere, and
  // sneaking is refused outright. A water source is a placement target by the
  // same isPlacementTarget rule and has no use action, so it exercises the one
  // assumption this test exists for - that `ev.face` is the CLICKED block's
  // face, so the clicked block lies opposite it from the new funnel - without
  // the interaction being stolen. Whether a real player can place against a
  // cauldron is a separate question, and is in the README to confirm in game.
  const tank = { x: 4, y: 1, z: 3 };
  test.setBlockType("fluidworks:pipe", tank);
  const player = test.spawnSimulatedPlayer(
    { x: 2, y: 1, z: 3 },
    "fw_placer",
    GameMode.Survival,
  );
  await test.idle(5);
  player.lookAtBlock(tank);
  await test.idle(2);
  const used = player.useItemOnBlock(item("fluidworks:funnel"), tank, Direction.West);
  test.assert(used, "useItemOnBlock refused the funnel against the source");
  await test.idle(5);

  const at = { x: 3, y: 1, z: 3 };
  test.assert(
    spoutOf(test, at) === "east",
    `funnel placed on the tank's west face has spout ${spoutOf(test, at)}, expected east`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * The fallback: placed on the floor, a funnel keeps the horizontal direction
 * the placement trait chose rather than pointing its spout at the ground.
 */
registerAsync("qol", "funnel_placed_on_floor_stays_level", async (test) => {
  floor(test);
  const player = test.spawnSimulatedPlayer(
    { x: 2, y: 1, z: 3 },
    "fw_placer2",
    GameMode.Survival,
  );
  await test.idle(5);
  player.useItemOnBlock(item("fluidworks:funnel"), { x: 4, y: 0, z: 3 }, Direction.Up);
  await test.idle(5);

  const at = { x: 4, y: 1, z: 3 };
  const spout = spoutOf(test, at);
  test.assert(
    spout !== "down" && spout !== "up" && !spout.startsWith("none"),
    `funnel placed on the floor has spout ${spout}, expected a horizontal direction`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * Two pipes placed side by side by a player join up: each gets the arm state
 * facing the other and no others. Pins the state half of the pipe-joining
 * bug; the model half (which bone each state shows) is only visible in game.
 */
registerAsync("qol", "pipes_join_when_placed", async (test) => {
  floor(test);
  const player = test.spawnSimulatedPlayer(
    { x: 2, y: 1, z: 5 },
    "fw_piper",
    GameMode.Survival,
  );
  await test.idle(5);
  // Walk to each spot before clicking it. A SimulatedPlayer's useItemOnBlock is
  // a real interaction: it is refused when the player is not facing the block,
  // and the second pipe was refused outright from a fixed standing spot.
  const place = async (on: { x: number; y: number; z: number }) => {
    player.teleport({ x: on.x + 0.5, y: on.y + 1, z: on.z + 1.6 });
    // The teleport needs a tick to settle before aiming from the new spot.
    await test.idle(2);
    player.lookAtBlock(on);
    await test.idle(3);
    const ok = player.useItemOnBlock(item("fluidworks:pipe"), on, Direction.Up);
    test.assert(ok, `useItemOnBlock refused a pipe on ${on.x},${on.y},${on.z}`);
    // A second interaction too soon after the first is refused.
    await test.idle(20);
  };
  // East first: placing west first puts a pipe between the player and the
  // second target, and the interaction is then refused for want of line of
  // sight.
  await place({ x: 4, y: 0, z: 3 });
  await place({ x: 3, y: 0, z: 3 });
  await test.idle(5);

  const arms = (pos: { x: number; y: number; z: number }) => {
    const b = test.getBlock(pos);
    if (!b.isValid || b.typeId !== "fluidworks:pipe") return `none (${b.typeId})`;
    return ["north", "south", "east", "west", "up", "down"]
      .filter((f) => b.permutation.getState(`fluidworks:${f}` as never) === true)
      .join(",");
  };
  test.assert(
    arms({ x: 3, y: 1, z: 3 }) === "east",
    `west pipe shows arms [${arms({ x: 3, y: 1, z: 3 })}], expected [east]`,
  );
  test.assert(
    arms({ x: 4, y: 1, z: 3 }) === "west",
    `east pipe shows arms [${arms({ x: 4, y: 1, z: 3 })}], expected [west]`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);
