import {
  EntityComponentTypes,
  EquipmentSlot,
  GameMode,
  ItemStack,
  LiquidType,
  type Vector3,
} from "@minecraft/server";
import { registerAsync, type Test } from "@minecraft/server-gametest";
import { TORCH_EMISSION, TORCH_REACH } from "../../../lens/scripts/core/lighting";
import { blockLight, classify } from "../../../lens/scripts/core/spawn";
import {
  isClearSpace,
  isStandableFloor,
  passesLight,
  supportsTorch,
  type BlockFlags,
} from "../../../lens/scripts/core/surface";
import { loreForTier } from "../../../lens/scripts/core/tier";
import { hasTier, readTier, stampTier } from "../../../lens/scripts/engine/itemTier";
import { container, floor, item, put, STRUCTURE } from "./rig";

/**
 * Lens: the engine facts the overlay is built on.
 *
 * The pack itself cannot be driven from here. Everything Lens does hangs off a
 * player - the scan is centred on one, the item is read out of one's equipment
 * slots - and a SimulatedPlayer marshals as undefined into any pack that does
 * not bind @minecraft/server-gametest (docs/README.md corrections), so Lens
 * never sees the player these tests could spawn. A test driving it that way
 * would measure the harness, the way `anchor_sets_spawn` does.
 *
 * What is worth pinning is the layer underneath: Lens is one pure decision
 * (`core/`) applied to four engine readings (`getLightLevel`,
 * `getSkyLightLevel`, `isLiquidBlocking`, and an item's dynamic property).
 * The pure half is exhaustively unit-tested with no game; these tests measure
 * the readings against the same core functions the pack calls, so a change in
 * what the engine reports fails here rather than showing up as a wrong colour
 * on somebody's screen.
 *
 * Every reading came from a hand session with the probe pack
 * (docs/lens-light-results.md). This is that session, automated.
 */

/** Read the four flags `engine/scan.ts` reads, through the same calls. */
function flagsAt(test: Test, pos: Vector3): BlockFlags {
  const b = test.getBlock(pos);
  return {
    typeId: b.typeId,
    isAir: b.isAir,
    isLiquid: b.isLiquid,
    blocksWater: b.isLiquidBlocking(LiquidType.Water),
  };
}

/** Both light numbers at a position, read the way the scan reads them. */
function lightAt(test: Test, pos: Vector3): { total: number; sky: number } {
  const dim = test.getDimension();
  const world = test.worldBlockLocation(pos);
  return { total: dim.getLightLevel(world), sky: dim.getSkyLightLevel(world) };
}

/**
 * Seal a 1x1 space at `pos` inside stone: floor, four walls, roof.
 *
 * The arena is open to whatever is above the test structure, and how much sky
 * reaches a given cell of it is a property of the world the suite happens to
 * run in - so a test that needs "no sky here" builds it rather than assuming
 * it. `sky === 0` is asserted, not hoped for: it is the condition that makes
 * `total` block light exactly (core/spawn's second exact case).
 */
function seal(test: Test, pos: Vector3, height = 2): void {
  const { x, y, z } = pos;
  for (let dy = 0; dy < height; dy++) {
    test.setBlockType("minecraft:stone", { x: x - 1, y: y + dy, z });
    test.setBlockType("minecraft:stone", { x: x + 1, y: y + dy, z });
    test.setBlockType("minecraft:stone", { x, y: y + dy, z: z - 1 });
    test.setBlockType("minecraft:stone", { x, y: y + dy, z: z + 1 });
  }
  test.setBlockType("minecraft:stone", { x, y: y + height, z });
}

/**
 * An enclosed, unlit standing position reads as spawnable.
 *
 * The whole overlay reduces to this: sky 0 (nothing to mask block light),
 * total 0 (nothing emitting), so `blockLight` is exact at 0 and `classify`
 * says a hostile mob can spawn. If the engine ever stops reporting 0 in a
 * sealed box, every red marker Lens draws is wrong, and this is where that
 * shows up.
 */
registerAsync("qol", "lens_sealed_dark_cell_is_spawnable", async (test) => {
  floor(test);
  const feet: Vector3 = { x: 3, y: 1, z: 3 };
  seal(test, feet);
  // Light updates are not instant after a block write.
  await test.idle(10);

  const light = lightAt(test, feet);
  test.assert(
    light.sky === 0,
    `sealed cell reports sky light ${light.sky}, not 0 - the box is not sealed, or sky light no longer stops at a roof`,
  );
  test.assert(
    light.total === 0,
    `sealed unlit cell reports total light ${light.total}, not 0`,
  );

  const recovered = blockLight(light);
  test.assert(
    recovered === 0,
    `blockLight({total:${light.total},sky:${light.sky}}) = ${String(recovered)}, expected an exact 0`,
  );

  const below = flagsAt(test, { x: 3, y: 0, z: 3 });
  test.assert(
    isStandableFloor(below),
    `the stone floor under the cell does not read as standable: ${JSON.stringify(below)}`,
  );

  const verdict = classify({ light, standable: true });
  test.assert(
    verdict === "spawnable",
    `an enclosed unlit position classifies as "${verdict}", not "spawnable"`,
  );
  test.print(`sealed cell: total ${light.total}, sky ${light.sky} -> ${verdict}`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * A torch in that cell makes it safe.
 *
 * The other half of the same claim, and the one a player acts on: light the
 * spot and the marker must go away. Asserts the verdict flips, and that the
 * torch reads as light 14 - the emission `core/lighting` computes reach from.
 */
registerAsync("qol", "lens_a_torch_makes_a_cell_safe", async (test) => {
  floor(test);
  // Two sealed cells side by side: the torch stands in one, the position under
  // test is the other. Measuring the torch's own cell would prove the light
  // and nothing about a place a mob could actually stand.
  const feet: Vector3 = { x: 3, y: 1, z: 3 };
  const lamp: Vector3 = { x: 4, y: 1, z: 3 };
  for (const dy of [0, 1]) {
    test.setBlockType("minecraft:stone", { x: 2, y: 1 + dy, z: 3 });
    test.setBlockType("minecraft:stone", { x: 5, y: 1 + dy, z: 3 });
    for (const x of [3, 4]) {
      test.setBlockType("minecraft:stone", { x, y: 1 + dy, z: 2 });
      test.setBlockType("minecraft:stone", { x, y: 1 + dy, z: 4 });
    }
  }
  for (const x of [3, 4]) test.setBlockType("minecraft:stone", { x, y: 3, z: 3 });
  await test.idle(10);
  const dark = lightAt(test, feet);
  test.assert(dark.total === 0 && dark.sky === 0, `the pair of cells is not dark to begin with: ${JSON.stringify(dark)}`);

  test.setBlockType("minecraft:torch", lamp);
  await test.idle(10);
  const lit = lightAt(test, feet);

  test.assert(
    lit.total === TORCH_EMISSION - 1,
    `one step from a torch reads light ${lit.total}, not the ${TORCH_EMISSION - 1} an emission of ${TORCH_EMISSION} gives`,
  );
  const verdict = classify({ light: lit, standable: true });
  test.assert(
    verdict === "safe",
    `a lit position classifies as "${verdict}", not "safe" (dark was ${dark.total}, lit is ${lit.total})`,
  );
  test.print(`unlit ${dark.total} -> torch ${lit.total}: ${verdict}`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * Block light falls by exactly one per step through open cells.
 *
 * This is the model the tier 2 solver is built on: `Flooder` is a 6-connected
 * breadth-first fill and every torch suggestion assumes light at flood
 * distance d is EMISSION - d, hence TORCH_REACH. It is not a Euclidean radius
 * and it is not a squared falloff, and if it were either, every suggestion
 * would be placed wrong. Measured down a sealed corridor so the only path from
 * the torch is along x, which makes flood distance and block distance the same
 * number.
 */
registerAsync("qol", "lens_torch_light_falls_one_per_step", async (test) => {
  floor(test);
  const y = 1;
  const z = 3;
  const torchX = 2;
  const lastX = 6;

  // A sealed tunnel: walls either side, a roof over it, both ends closed.
  for (let x = torchX; x <= lastX; x++) {
    test.setBlockType("minecraft:stone", { x, y, z: z - 1 });
    test.setBlockType("minecraft:stone", { x, y, z: z + 1 });
    test.setBlockType("minecraft:stone", { x, y: y + 1, z });
  }
  test.setBlockType("minecraft:stone", { x: torchX - 1, y, z });
  test.setBlockType("minecraft:stone", { x: lastX + 1, y, z });
  test.setBlockType("minecraft:torch", { x: torchX, y, z });
  await test.idle(20);

  const seen: string[] = [];
  for (let d = 0; d <= lastX - torchX; d++) {
    const at = { x: torchX + d, y, z };
    const light = lightAt(test, at);
    seen.push(`d=${d}: total ${light.total} sky ${light.sky}`);
    test.assert(
      light.sky === 0,
      `the corridor leaks sky light at d=${d} (sky ${light.sky}); the measurement below would not be block light`,
    );
    test.assert(
      light.total === TORCH_EMISSION - d,
      `block light at ${d} step(s) from a torch is ${light.total}, not ${TORCH_EMISSION - d}: ` +
        `falloff is not 1 per step, so every torch suggestion is placed wrong. Series: ${seen.join(", ")}`,
    );
  }
  test.print(`torch falloff: ${seen.join(", ")}`);
  test.print(
    `emission ${TORCH_EMISSION} => reach ${TORCH_REACH} steps still lit, which is what the solver claims to cover`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(300);

/**
 * The four flags `core/surface` was written against still read that way.
 *
 * `Block` has no `isSolid`, so standability is inferred from
 * `isLiquidBlocking(Water)` plus a deny list, and light propagation from a
 * third predicate that deliberately disagrees with both on glass. That whole
 * structure rests on the table in `core/surface`'s header, which was measured
 * by hand with `/scriptevent qolprobe:solid`. This is that table, asserted.
 */
registerAsync("qol", "lens_surface_flags_match_the_engine", async (test) => {
  floor(test);
  const y = 1;
  const at = (x: number): Vector3 => ({ x, y, z: 5 });

  test.setBlockType("minecraft:dirt", at(1));
  // A slab's default placement is the bottom half, which is the case that
  // matters: it is a floor a mob spawns on and not a full cube.
  test.setBlockType("minecraft:smooth_stone_slab", at(2));
  test.setBlockType("minecraft:glass", at(3));
  test.setBlockType("minecraft:torch", at(4));
  // Water goes in a walled pocket well away from the row: a source block set
  // in the open flows for several blocks within a tick or two and washes the
  // torch out, which would read as "a torch is not a torch".
  const pool: Vector3 = { x: 6, y: 1, z: 7 };
  for (const side of [
    { x: pool.x - 1, y: pool.y, z: pool.z },
    { x: pool.x + 1, y: pool.y, z: pool.z },
    { x: pool.x, y: pool.y, z: pool.z - 1 },
  ]) {
    test.setBlockType("minecraft:stone", side);
  }
  test.setBlockType("minecraft:water", pool);
  await test.idle(10);

  const expectations: {
    pos: Vector3;
    what: string;
    /** Undefined where the predicates key off isLiquid instead, as for water. */
    blocksWater?: boolean;
    floorOk: boolean;
    light: boolean;
    torch: boolean;
  }[] = [
    // A plain floor: mobs stand on it, light stops at it, torches sit on it.
    { pos: at(1), what: "dirt", blocksWater: true, floorOk: true, light: false, torch: true },
    // A bottom slab is the case `isLiquidBlocking` gets right and a naive
    // "full cube" test would not.
    { pos: at(2), what: "a bottom slab", blocksWater: true, floorOk: true, light: false, torch: true },
    // Glass is the one common block where the three predicates disagree: it
    // blocks water, mobs will not spawn on it, and light goes straight through.
    { pos: at(3), what: "glass", blocksWater: true, floorOk: false, light: true, torch: true },
    // An attachment: not a floor, and no obstacle to light.
    { pos: at(4), what: "a torch", blocksWater: false, floorOk: false, light: true, torch: false },
    // Water is treated as light-blocking on purpose: the per-step dampening is
    // unconfirmed, and over-claiming darkness is the safe direction.
    { pos: pool, what: "water", floorOk: false, light: false, torch: false },
  ];

  for (const e of expectations) {
    const f = flagsAt(test, e.pos);
    if (e.blocksWater !== undefined) {
      test.assert(
        f.blocksWater === e.blocksWater,
        `${e.what} (${f.typeId}) reports isLiquidBlocking(Water) ${f.blocksWater}, expected ${e.blocksWater} - the surface predicates are built on this flag`,
      );
    }
    test.assert(
      isStandableFloor(f) === e.floorOk,
      `${e.what} reads as a mob floor: ${isStandableFloor(f)}, expected ${e.floorOk} (${JSON.stringify(f)})`,
    );
    test.assert(
      passesLight(f) === e.light,
      `${e.what} passes light: ${passesLight(f)}, expected ${e.light} (${JSON.stringify(f)})`,
    );
    test.assert(
      supportsTorch(f) === e.torch,
      `${e.what} supports a torch: ${supportsTorch(f)}, expected ${e.torch} (${JSON.stringify(f)})`,
    );
    test.print(`${e.what}: ${JSON.stringify(f)}`);
  }

  const water = flagsAt(test, pool);
  test.assert(
    water.isLiquid,
    `the pocket at ${pool.x},${pool.y},${pool.z} holds ${water.typeId}, which does not read as a liquid - the water flowed away before it was read`,
  );

  const air = flagsAt(test, { x: 1, y: 3, z: 5 });
  test.assert(air.isAir && isClearSpace(air), `air at head height does not read as clear: ${JSON.stringify(air)}`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * A mob will not spawn on glass, and Lens must not mark it.
 *
 * The deny list is a game rule the pack infers rather than reads from an API,
 * so it is worth one end-to-end assertion rather than only a flag comparison:
 * an unlit position over glass, which every light reading calls dark, must
 * still come out "safe" because nothing can stand there.
 */
registerAsync("qol", "lens_dark_glass_floor_is_not_spawnable", async (test) => {
  floor(test);
  const feet: Vector3 = { x: 3, y: 2, z: 3 };
  test.setBlockType("minecraft:glass", { x: 3, y: 1, z: 3 });
  seal(test, feet);
  await test.idle(10);

  const light = lightAt(test, feet);
  const below = flagsAt(test, { x: 3, y: 1, z: 3 });
  const standable = isStandableFloor(below);
  test.assert(
    !standable,
    `glass reads as a mob floor (${JSON.stringify(below)}); Lens would mark the block above it`,
  );
  const verdict = classify({ light, standable });
  test.assert(
    verdict === "safe",
    `an unlit position on glass classifies as "${verdict}" (light ${light.total}/${light.sky}), not "safe"`,
  );
  test.print(`glass floor, total ${light.total} sky ${light.sky} -> ${verdict}`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * A stamped tier survives a container round trip.
 *
 * The upgrade ritual writes the tier to a dynamic property on the item
 * instance and writes the stack back with setEquipment; every read afterwards
 * - the equipment sweep, the next upgrade - depends on that property still
 * being on the stack the engine hands back. Every ItemStack a pack receives is
 * a copy, so this is exactly the step where a tier could silently be lost.
 * A chest stands in for the equipment slot: both are Container writes.
 */
registerAsync("qol", "lens_tier_survives_a_container_round_trip", async (test) => {
  floor(test);
  const chest: Vector3 = { x: 3, y: 1, z: 3 };
  test.setBlockType("minecraft:chest", chest);

  const fresh = item("lens:spawn_lens");
  test.assert(
    !hasTier(fresh),
    "a freshly built Spawn Lens already carries a tier; the first-sight stamp would never run",
  );
  test.assert(
    readTier(fresh) === 1,
    `an unstamped Lens reads tier ${readTier(fresh)}, not the tier 1 default`,
  );

  stampTier(fresh, 2);
  put(test, chest, fresh);
  await test.idle(5);

  const back = container(test, chest)?.getItem(0);
  test.assert(back !== undefined, "the Lens is not in the chest at all");
  test.assert(
    hasTier(back!),
    "the tier property did not survive the container write - the upgrade would be forgotten",
  );
  test.assert(
    readTier(back!) === 2,
    `the Lens reads back as tier ${readTier(back!)}, not the 2 it was stamped with`,
  );
  const lore = back!.getLore();
  const wanted = loreForTier(2);
  test.assert(
    lore.length === wanted.length && lore.every((line, i) => line === wanted[i]),
    `lore came back as ${JSON.stringify(lore)}, expected ${JSON.stringify(wanted)}`,
  );

  // A tier 1 stamp must be readable too - clampTier turning everything into 1
  // would make this test pass on the tier 2 line alone.
  const plain = new ItemStack("lens:spawn_lens");
  stampTier(plain, 1);
  put(test, chest, plain, 1);
  await test.idle(5);
  const plainBack = container(test, chest)?.getItem(1);
  test.assert(
    plainBack !== undefined && readTier(plainBack) === 1 && hasTier(plainBack),
    `a tier 1 stamp read back as ${String(plainBack && readTier(plainBack))}`,
  );

  // The ritual itself writes through an equipment slot, not a chest, so that
  // path gets its own leg. The gametest pack binds @minecraft/server-gametest,
  // so a SimulatedPlayer is an ordinary Player to this test even though it is
  // invisible to Lens.
  const player = test.spawnSimulatedPlayer({ x: 5, y: 1, z: 5 }, "lens_carrier", GameMode.Creative);
  await test.idle(10);
  const equippable = player.getComponent(EntityComponentTypes.Equippable);
  test.assert(equippable !== undefined, "the simulated player has no equippable component");

  const held = new ItemStack("lens:spawn_lens");
  stampTier(held, 2);
  equippable!.setEquipment(EquipmentSlot.Mainhand, held);
  await test.idle(5);

  const inHand = equippable!.getEquipment(EquipmentSlot.Mainhand);
  test.assert(
    inHand !== undefined && readTier(inHand) === 2 && hasTier(inHand),
    `a Lens stamped tier 2 and put in the hand reads back as ${String(inHand && readTier(inHand))} - the upgrade ritual's write-back loses the tier`,
  );

  test.print(
    `tier 2 round trip: chest ${JSON.stringify(back!.getLore())}, hand tier ${String(inHand && readTier(inHand))}`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);
