import {
  BlockComponentTypes,
  BlockPermutation,
  Direction,
  EntityComponentTypes,
  GameMode,
  ItemComponentTypes,
  ItemStack,
  ItemTypes,
  type RGBA,
  type Vector3,
} from "@minecraft/server";
import { registerAsync, type Test } from "@minecraft/server-gametest";
import { BOTTLE_LEVELS, WASH_LEVELS } from "@qol/shared/core/fluids";
import {
  cauldron,
  cauldronLevel,
  container,
  count,
  floor,
  item,
  put,
  STRUCTURE,
  until,
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

// ---------------------------------------------------------------------------
// The other three machines
//
// QOL Times ships four cauldron rules - buckets, bottles, dye and washing -
// and only the bucket had a test. All four run through the same interception:
// the dispenser ejects an item, the pack proves which slot it came from, and
// the transition is applied to the cauldron with the residue written back into
// that slot. Every one of them is testable with no player at all, which makes
// this the cheapest coverage in the repo.
//
// Every rig pays the documented registration cost - the first pulse at a rig
// the pack has never seen is handed to vanilla - so each test loads two copies
// of its input and pulses twice. `dispenser_first_pulse_is_vanilla` below is
// that cost, asserted rather than assumed.
// ---------------------------------------------------------------------------

/** A dispenser facing east into a cauldron, both on the floor layer. */
function machine(
  test: Test,
  dispenser: Vector3,
  level: number,
  liquid = "water",
): { tank: Vector3; lever: Vector3 } {
  // facing_direction 5 = east, measured (docs/phase0-results.md).
  test.setBlockPermutation(
    BlockPermutation.resolve("minecraft:dispenser", {
      facing_direction: 5,
      triggered_bit: false,
    }),
    dispenser,
  );
  const tank = { x: dispenser.x + 1, y: dispenser.y, z: dispenser.z };
  cauldron(test, tank, level, liquid);
  return { tank, lever: { x: dispenser.x, y: dispenser.y + 1, z: dispenser.z } };
}

/** The cauldron's water colour, which is where a dye lands. */
function fluidColor(test: Test, pos: Vector3): RGBA | undefined {
  return test
    .getBlock(pos)
    .getComponent(BlockComponentTypes.FluidContainer)?.fluidColor;
}

const sameColor = (a: RGBA | undefined, b: RGBA | undefined): boolean =>
  a !== undefined &&
  b !== undefined &&
  a.red === b.red &&
  a.green === b.green &&
  a.blue === b.blue;

const colorText = (c: RGBA | undefined): string =>
  c ? `${c.red},${c.green},${c.blue}` : "none";

/** The first item of `typeId` in a container, whatever slot it sits in. */
function find(test: Test, pos: Vector3, typeId: string): ItemStack | undefined {
  const c = container(test, pos);
  if (!c) return undefined;
  for (let i = 0; i < c.size; i++) {
    const stack = c.getItem(i);
    if (stack?.typeId === typeId) return stack;
  }
  return undefined;
}

/**
 * The registration pulse, asserted.
 *
 * Tier 3 of the interceptor proves an item came out of a specific dispenser
 * slot by diffing that dispenser's container against a snapshot, and it has no
 * snapshot the first time it sees a rig. Rather than guess, it registers the
 * rig and lets vanilla have that activation - one missed fill per dispenser,
 * ever, in exchange for closing the free-mint hole. That trade is the reason
 * every other test here pulses twice, so it is worth one test of its own: if
 * the pack ever starts acting on a first sighting, this fails and the mint is
 * open again.
 */
registerAsync("qol", "dispenser_first_pulse_is_vanilla", async (test) => {
  floor(test);
  const dispenser = { x: 3, y: 1, z: 3 };
  const { tank, lever } = machine(test, dispenser, 0);
  put(test, dispenser, item("minecraft:water_bucket"), 0);

  test.pulseRedstone(lever, 4);
  await test.idle(40);

  const level = cauldronLevel(test, tank);
  test.assert(
    level === 0,
    `the first pulse at a fresh rig filled the cauldron to ${level}; the anti-mint proof is not being paid for`,
  );
  test.assert(
    count(test, dispenser, "minecraft:water_bucket") === 0,
    "the water bucket is still in the dispenser: nothing was dispensed at all, so this test measured nothing",
  );
  test.print(`first pulse: cauldron ${level}, bucket ejected to the floor as vanilla does`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * A water bottle adds two levels and leaves a glass bottle behind.
 *
 * Two, not one: Bedrock's rate, where Java's is one. The rule identifies a
 * water bottle by its potion component rather than its id, because every
 * potion in the game shares the id `minecraft:potion` - so this also pins that
 * a plain bottle built with `new ItemStack("minecraft:potion")` really does
 * carry the `minecraft:water` effect the rule matches on.
 */
registerAsync("qol", "dispenser_fills_from_water_bottle", async (test) => {
  floor(test);
  const dispenser = { x: 3, y: 1, z: 3 };
  const { tank, lever } = machine(test, dispenser, 0);
  const bottle = item("minecraft:potion");
  // Every potion shares the id minecraft:potion, so the rule matches on the
  // effect instead. Read it here rather than at the far end of two redstone
  // pulses: if a script-built bottle is not the water variant, that is what
  // this test is really reporting.
  const effect = bottle.getComponent(ItemComponentTypes.Potion)?.potionEffectType?.id;
  test.assert(
    effect === "minecraft:water",
    `new ItemStack("minecraft:potion") carries potion effect ${String(effect)}, not minecraft:water - the bottle rule matches on that id and would never fire`,
  );
  put(test, dispenser, bottle, 0);
  put(test, dispenser, item("minecraft:potion"), 1);

  test.pulseRedstone(lever, 4);
  await test.idle(40);
  test.print(`after the registration pulse: level ${cauldronLevel(test, tank)}`);
  test.pulseRedstone(lever, 4);

  test.succeedWhen(() => {
    const level = cauldronLevel(test, tank);
    test.assert(
      level === BOTTLE_LEVELS,
      `an empty cauldron given one water bottle reads level ${level}, want ${BOTTLE_LEVELS}`,
    );
    test.assert(
      count(test, dispenser, "minecraft:glass_bottle") >= 1,
      "no empty glass bottle came back to the dispenser",
    );
  });
})
  .structureName(STRUCTURE)
  .maxTicks(300);

/**
 * A glass bottle takes two levels back out and comes back as a water bottle.
 *
 * The reverse of the rule above, and the half that can mint: a bottle drawn
 * from a cauldron with too little water in it would be free water. The rule
 * refuses below two levels; here there are six, so it must succeed and leave
 * four.
 */
registerAsync("qol", "dispenser_bottles_water_from_cauldron", async (test) => {
  floor(test);
  const dispenser = { x: 3, y: 1, z: 3 };
  const { tank, lever } = machine(test, dispenser, 6);
  put(test, dispenser, item("minecraft:glass_bottle"), 0);
  put(test, dispenser, item("minecraft:glass_bottle"), 1);

  test.pulseRedstone(lever, 4);
  await test.idle(40);
  test.print(`after the registration pulse: level ${cauldronLevel(test, tank)}`);
  test.pulseRedstone(lever, 4);

  test.succeedWhen(() => {
    const level = cauldronLevel(test, tank);
    test.assert(
      level === 6 - BOTTLE_LEVELS,
      `a full cauldron drawn from with one glass bottle reads level ${level}, want ${6 - BOTTLE_LEVELS}`,
    );
    const potion = find(test, dispenser, "minecraft:potion");
    test.assert(potion !== undefined, "no water bottle came back to the dispenser");
  });
})
  .structureName(STRUCTURE)
  .maxTicks(300);

/**
 * A dye colours the water, is consumed, and costs no level.
 *
 * Dyed cauldron water is a Bedrock exclusive and the one effect the rules
 * layer cannot express as a state change: the colour blend is handed to
 * `BlockFluidContainerComponent.addDye` so multi-dye mixing matches vanilla
 * exactly. That makes the observable "the colour moved", which is what this
 * reads - and the level not moving with it is the other half of the rule.
 */
registerAsync("qol", "dispenser_dyes_the_water", async (test) => {
  floor(test);
  const dispenser = { x: 3, y: 1, z: 3 };
  const { tank, lever } = machine(test, dispenser, 6);
  put(test, dispenser, item("minecraft:red_dye"), 0);
  put(test, dispenser, item("minecraft:red_dye"), 1);
  const plain = fluidColor(test, tank);

  test.pulseRedstone(lever, 4);
  await test.idle(40);
  test.print(`after the registration pulse: colour ${colorText(fluidColor(test, tank))}`);
  test.pulseRedstone(lever, 4);

  test.succeedWhen(() => {
    const dyed = fluidColor(test, tank);
    test.assert(
      dyed !== undefined,
      "the cauldron has no fluid_container component, so a dye can never be applied",
    );
    test.assert(
      !sameColor(plain, dyed),
      `the water is still ${colorText(dyed)} (was ${colorText(plain)}): the dye did not reach addDye`,
    );
    const level = cauldronLevel(test, tank);
    test.assert(level === 6, `dyeing changed the level to ${level}; it must cost nothing`);
    test.assert(
      count(test, dispenser, "minecraft:red_dye") === 0,
      "the dye came back to the dispenser; it is meant to be consumed",
    );
    test.print(`water ${colorText(plain)} -> ${colorText(dyed)}, level ${level}`);
  });
})
  .structureName(STRUCTURE)
  .maxTicks(300);

/**
 * Washing leather clears the dye in place, keeping the rest of the stack.
 *
 * `transform` rather than `new` is the whole point of this rule: rebuilding
 * the stack would clear the dye and quietly take the enchantments and the
 * durability with it. `ItemStack.typeId` is readonly, which is exactly why
 * anything that changes the id must go through `new` and carry no other state.
 *
 * The dyed helmet has to be dyed **in the world**, by a simulated player using
 * one on a cauldron of coloured water, because a leather helmet built by
 * script has no `minecraft:dyeable` component at all - measured, and the same
 * shape as the food components that are only present on data-driven items
 * (docs/README.md corrections). `readItemColor` reads that component, so a
 * script-built helmet always looks undyed to the rule and the wash path could
 * not otherwise be reached from here at all.
 */
registerAsync("qol", "dispenser_washes_leather", async (test) => {
  floor(test);
  const dispenser = { x: 3, y: 1, z: 3 };
  const { tank, lever } = machine(test, dispenser, 6);

  // A second cauldron, dyed, purely to colour the helmet. Doing it in the
  // machine's own tank would leave the wash reading a dyed cauldron.
  const vat = { x: 3, y: 1, z: 6 };
  cauldron(test, vat, 6);
  const fc = test.getBlock(vat).getComponent(BlockComponentTypes.FluidContainer);
  test.assert(fc !== undefined, "the dyeing cauldron has no fluid_container component");
  const red = ItemTypes.get("minecraft:red_dye");
  test.assert(red !== undefined, "minecraft:red_dye is not a known item type");
  fc!.addDye(red!);

  const player = test.spawnSimulatedPlayer({ x: 2, y: 1, z: 5 }, "wash_tester", GameMode.Creative);
  await test.idle(10);
  player.setItem(new ItemStack("minecraft:leather_helmet"), 0, true);
  await test.idle(5);

  const worn = () => player.getComponent(EntityComponentTypes.Inventory)?.container?.getItem(0);
  test.assert(
    worn()?.getComponent(ItemComponentTypes.Dyeable)?.color === undefined,
    "a script-built leather helmet already carries a colour, so this test cannot tell dyeing from doing nothing",
  );

  // Two interactions on purpose: the engine refuses a second one too soon
  // after the first, and one alone sometimes does not land.
  const vatAt = test.worldBlockLocation(vat);
  let dyed = false;
  for (let i = 0; i < 4 && !dyed; i++) {
    player.lookAtBlock(vatAt);
    await test.idle(5);
    player.useItemInSlotOnBlock(0, vatAt, Direction.Up);
    await until(test, () => worn()?.getComponent(ItemComponentTypes.Dyeable)?.color !== undefined, 30);
    dyed = worn()?.getComponent(ItemComponentTypes.Dyeable)?.color !== undefined;
  }
  test.assert(
    dyed,
    `four uses of a leather helmet on a cauldron of dyed water left it undyed (component ${String(
      worn()?.getComponent(ItemComponentTypes.Dyeable),
    )}); the wash rule has nothing to wash off, so this run cannot measure it`,
  );

  const cap = worn()!;
  cap.nameTag = "Cap";
  // A name tag is the cheapest thing a rebuilt stack would lose; the rule
  // promises to keep it, along with the enchantments and durability nobody
  // wants silently stripped.
  put(test, dispenser, cap.clone(), 0);
  put(test, dispenser, cap.clone(), 1);

  test.pulseRedstone(lever, 4);
  await test.idle(40);
  test.print(`after the registration pulse: level ${cauldronLevel(test, tank)}`);
  test.pulseRedstone(lever, 4);

  test.succeedWhen(() => {
    const level = cauldronLevel(test, tank);
    test.assert(
      level === 6 - WASH_LEVELS,
      `washing left the cauldron at ${level}, want ${6 - WASH_LEVELS}`,
    );
    const back = find(test, dispenser, "minecraft:leather_helmet");
    test.assert(back !== undefined, "the helmet did not come back to the dispenser");
    const color = back!.getComponent(ItemComponentTypes.Dyeable)?.color;
    test.assert(
      color === undefined,
      `the helmet came back still dyed (${colorText(color as RGBA | undefined)})`,
    );
    test.assert(
      back!.nameTag === "Cap",
      `the helmet came back named ${String(back!.nameTag)}: the stack was rebuilt, so enchantments and durability would be gone`,
    );
    test.print(`washed: level ${level}, colour ${String(color)}, name ${String(back!.nameTag)}`);
  });
})
  .structureName(STRUCTURE)
  .maxTicks(600);

/**
 * An undyed leather helmet is left alone, and costs no water.
 *
 * The rule refuses when there is nothing to wash off rather than consuming a
 * level for a no-op - the same instinct as `dispenser_refuses_to_overfill`,
 * on the other machine. This is also the one wash case that can be built from
 * script with certainty, since a leather helmet made by `new ItemStack` has no
 * `minecraft:dyeable` component to colour.
 */
registerAsync("qol", "dispenser_leaves_undyed_leather_alone", async (test) => {
  floor(test);
  const dispenser = { x: 3, y: 1, z: 3 };
  const { tank, lever } = machine(test, dispenser, 6);
  const plain = new ItemStack("minecraft:leather_helmet");
  test.print(
    `a script-built leather helmet's dyeable component: ${String(
      plain.getComponent(ItemComponentTypes.Dyeable),
    )}`,
  );
  put(test, dispenser, plain, 0);
  put(test, dispenser, new ItemStack("minecraft:leather_helmet"), 1);

  test.pulseRedstone(lever, 4);
  await test.idle(40);
  test.pulseRedstone(lever, 4);
  await test.idle(40);

  const level = cauldronLevel(test, tank);
  test.assert(
    level === 6,
    `an undyed helmet took the cauldron from 6 to ${level}: a level was spent washing nothing off`,
  );
  test.print(`level ${level} after two pulses with nothing to wash: refused`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(300);

/**
 * A cauldron with no room refuses the bottle rather than wasting it.
 *
 * Rule 4, at the smallest scale in the repo: five levels plus a bottle's two
 * would overflow, so the rule declines and vanilla ejects the bottle, which
 * the player can pick up. Silently swallowing the bottle to fill the last
 * level would be the tidy-looking version of losing someone's item.
 */
registerAsync("qol", "dispenser_refuses_to_overfill", async (test) => {
  floor(test);
  const dispenser = { x: 3, y: 1, z: 3 };
  const { tank, lever } = machine(test, dispenser, 5);
  put(test, dispenser, item("minecraft:potion"), 0);
  put(test, dispenser, item("minecraft:potion"), 1);

  test.pulseRedstone(lever, 4);
  await test.idle(40);
  test.pulseRedstone(lever, 4);
  await test.idle(40);

  const level = cauldronLevel(test, tank);
  test.assert(
    level === 5,
    `a cauldron at 5 took a two-level bottle and reads ${level}: the rule overfilled or clamped instead of refusing`,
  );
  test.assert(
    count(test, dispenser, "minecraft:glass_bottle") === 0,
    "an empty glass bottle appeared in the dispenser, so the bottle was consumed for nothing",
  );
  test.print(`level ${level} after two pulses at a cauldron with no room: refused, bottle ejected`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(300);
