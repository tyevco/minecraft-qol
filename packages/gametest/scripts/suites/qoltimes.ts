import { BlockPermutation } from "@minecraft/server";
import { registerAsync } from "@minecraft/server-gametest";
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
 * QOL Times: a dispenser facing a cauldron fills it from a water bucket and
 * keeps the empty bucket.
 *
 * Two pulses on purpose. The first dispense at any new rig registers it and
 * defers to vanilla - the documented cost of the anti-mint proof - so the
 * bucket lands on the floor. The second is the one that must work.
 */
registerAsync("qol", "dispenser_fills_cauldron", async (test) => {
  floor(test);
  const dispenser = { x: 3, y: 1, z: 3 };
  const tank = { x: 4, y: 1, z: 3 };
  // facing_direction 5 = east, measured (docs/phase0-results.md).
  test.setBlockPermutation(
    BlockPermutation.resolve("minecraft:dispenser", {
      facing_direction: 5,
      triggered_bit: false,
    }),
    dispenser,
  );
  cauldron(test, tank, 0);
  put(test, dispenser, item("minecraft:water_bucket"), 0);
  put(test, dispenser, item("minecraft:water_bucket"), 1);

  const above = { x: 3, y: 2, z: 3 };
  test.pulseRedstone(above, 4);
  await test.idle(40);
  test.print(
    `after first pulse: level ${cauldronLevel(test, tank)} (registration pulse; vanilla ejects)`,
  );
  test.pulseRedstone(above, 4);

  test.succeedWhen(() => {
    test.assert(
      cauldronLevel(test, tank) === 6,
      `cauldron level is ${cauldronLevel(test, tank)}, want 6`,
    );
    test.assert(
      count(test, dispenser, "minecraft:bucket") >= 1,
      "no empty bucket back in the dispenser",
    );
  });
})
  .structureName(STRUCTURE)
  .maxTicks(300);
