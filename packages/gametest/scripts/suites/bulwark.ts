import {
  BlockPermutation,
  Direction,
  EntityComponentTypes,
  GameMode,
  world,
  type Entity,
  type Vector3,
} from "@minecraft/server";
import { registerAsync, type Test } from "@minecraft/server-gametest";
import { container, count, floor, item, put, STRUCTURE } from "./rig";

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

function headList(test: Test): Entity[] {
  return test
    .getDimension()
    .getEntities({ type: HEAD, location: test.worldBlockLocation(TURRET), maxDistance: 2 });
}

function heads(test: Test): number {
  return headList(test).length;
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

/**
 * Where a shot leaves the head, relative to the head's origin.
 *
 * The engine picks the spawn point: `ranged_attack` puts `minecraft:arrow` at
 * the shooter's eye (the arrow's `minecraft:projectile` says `anchor: 1`,
 * `offset: [0, -0.1, 0]`) and the eye is derived from the collision box. The
 * barrel is drawn 5.5/16 above the origin, so a head whose eye sits higher
 * than that fires from above its own barrel. This pins the two together; the
 * failure message is the measurement.
 */
const BARREL_Y = 5.5 / 16;
const SHOT_TOLERANCE = 2 / 16;

registerAsync("qol", "turret_shot_origin", async (test) => {
  placeTurret(test);
  const hopper: Vector3 = { x: 6, y: 1, z: 5 };
  test.setBlockPermutation(
    BlockPermutation.resolve("minecraft:hopper", { facing_direction: 4 }),
    hopper,
  );
  put(test, hopper, item(ARROW, 10));
  const drained = await waitFor(test, () => count(test, hopper, ARROW) === 0, 150);
  test.assert(drained, `hopper still holds ${count(test, hopper, ARROW)} arrow(s)`);
  test.assert(heads(test) === 1, `expected 1 head, found ${heads(test)}`);

  // The test server runs on peaceful, where a hostile cannot be spawned at
  // all, so raise the difficulty for the shot and put it back afterwards. A
  // husk: family monster, and it does not burn in the arena's daylight.
  const dim = test.getDimension();
  dim.runCommand("difficulty easy");
  try {
    test.spawn("minecraft:husk", { x: 5, y: 1, z: 1 });
  } catch (e) {
    dim.runCommand("difficulty peaceful");
    throw e;
  }

  let shot: { arrow: Vector3; velocity: Vector3; head: Vector3; eye: Vector3 } | undefined;
  const sub = world.afterEvents.entitySpawn.subscribe((ev) => {
    if (shot) return;
    let arrow: Entity;
    try {
      arrow = ev.entity;
      if (arrow.typeId !== ARROW) return;
    } catch {
      return;
    }
    const head = headList(test)[0];
    if (!head) return;
    shot = {
      arrow: arrow.location,
      velocity: arrow.getVelocity(),
      head: head.location,
      eye: head.getHeadLocation(),
    };
  });
  try {
    const fired = await waitFor(test, () => shot !== undefined, 300);
    test.assert(fired, "the turret never fired at the husk");
  } finally {
    world.afterEvents.entitySpawn.unsubscribe(sub);
    dim.runCommand("difficulty peaceful");
  }
  if (!shot) return;

  const f = (v: Vector3) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
  const dx = shot.arrow.x - shot.head.x;
  const dy = shot.arrow.y - shot.head.y;
  const dz = shot.arrow.z - shot.head.z;
  const eyeDy = shot.eye.y - shot.head.y;
  const summary =
    `arrow spawned at ${f(shot.arrow)}, head origin ${f(shot.head)}, ` +
    `offset (${dx.toFixed(3)}, ${dy.toFixed(3)}, ${dz.toFixed(3)}), ` +
    `eye at +${eyeDy.toFixed(3)}, velocity ${f(shot.velocity)}, barrel at +${BARREL_Y.toFixed(3)}`;
  console.warn(`[gametest] turret_shot_origin: ${summary}`);
  test.assert(
    Math.abs(dy - BARREL_Y) <= SHOT_TOLERANCE,
    `arrow left ${(dy - BARREL_Y).toFixed(3)} above the barrel axis: ${summary}`,
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(600);

// ---------------------------------------------------------------------------
// Phase 3a: ammo kinds from the hopper (docs/design/bulwark-ammo-and-upgrades.md).
//
// Tipped arrows cannot be constructed by script, so a test that needs them
// puts them in the hopper with the console's /replaceitem, the way the probe
// measured them. Everything is read back off the world: the hopper's
// contents, the husk's effects and health, what the head fires. Not the
// pack's own state: a dynamic property one pack writes reads as undefined
// from another (measured here - `bw:link`, `bw:armed`, `bw:kind` and the
// world's `bw:turrets` all came back undefined from this pack while the
// turret plainly acted on them), so the record and the head's flags are
// invisible to a test and are inferred from what the hopper loses.
// ---------------------------------------------------------------------------

const HOPPER_POS: Vector3 = { x: 6, y: 1, z: 5 };
const HUSK_POS: Vector3 = { x: 5, y: 1, z: 1 };

function feedingHopper(test: Test): void {
  test.setBlockPermutation(
    BlockPermutation.resolve("minecraft:hopper", { facing_direction: 4 }),
    HOPPER_POS,
  );
}

/** Fill a hopper slot through the console, so a tipped arrow can be asked for by aux. */
function fillHopper(test: Test, slot: number, item: string, amount: number, aux = 0): void {
  const w = test.worldBlockLocation(HOPPER_POS);
  test.getDimension().runCommand(`replaceitem block ${w.x} ${w.y} ${w.z} slot.container ${slot} ${item} ${amount} ${aux}`);
}

async function headReady(test: Test): Promise<Entity> {
  const grew = await waitFor(test, () => heads(test) === 1, 150);
  test.assert(grew, `head never appeared (found ${heads(test)})`);
  const head = headList(test)[0];
  if (!head) throw new Error("head vanished between the wait and the read");
  return head;
}

/** Run `body` with a husk in front of the turret on easy; peaceful is put back after. */
async function withHusk(test: Test, body: (husk: Entity) => Promise<void>): Promise<void> {
  const dim = test.getDimension();
  dim.runCommand("difficulty easy");
  try {
    const husk = test.spawn("minecraft:husk", HUSK_POS);
    await body(husk);
  } finally {
    dim.runCommand("difficulty peaceful");
  }
}

function hasEffect(e: Entity, name: string): boolean {
  try {
    return e.getEffects().some((x) => x.typeId === name || x.typeId === `minecraft:${name}`);
  } catch {
    return false;
  }
}

/** Arrows in the hopper by tint: plain (`item.arrow.name`) against everything else. */
function arrowsByTint(test: Test): { plain: number; tipped: number } {
  const c = container(test, HOPPER_POS);
  const out = { plain: 0, tipped: 0 };
  if (!c) return out;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it?.typeId !== ARROW) continue;
    if (it.localizationKey === "item.arrow.name") out.plain += it.amount;
    else out.tipped += it.amount;
  }
  return out;
}

/** Count projectiles of `typeId` spawned with the head as owner. */
function shotCounter(head: Entity, typeId: string): { shots: () => number; unsub: () => void } {
  let shots = 0;
  const sub = world.afterEvents.entitySpawn.subscribe((ev) => {
    try {
      if (ev.entity.typeId !== typeId) return;
      if (ev.entity.getComponent(EntityComponentTypes.Projectile)?.owner?.id !== head.id) return;
    } catch {
      return;
    }
    shots++;
  });
  return { shots: () => shots, unsub: () => world.afterEvents.entitySpawn.unsubscribe(sub) };
}

registerAsync("qol", "turret_fires_tipped_from_hopper", async (test) => {
  placeTurret(test);
  feedingHopper(test);
  fillHopper(test, 0, "arrow", 8, 18); // slowness
  const head = await headReady(test);
  const shots = shotCounter(head, ARROW);
  try {
    await withHusk(test, async (husk) => {
      const slowed = await waitFor(test, () => hasEffect(husk, "slowness"), 400);
      test.assert(slowed, `husk never slowed: ${shots.shots()} arrows fired, hopper holds ${count(test, HOPPER_POS, ARROW)}`);
    });
    await test.idle(10);
    const left = arrowsByTint(test);
    const summary = `${shots.shots()} shots, hopper holds ${left.tipped} tipped of 8 (plain ${left.plain}); head bw:link reads ${String(head.getDynamicProperty("bw:link"))} from this pack`;
    console.warn(`[gametest] turret_fires_tipped_from_hopper: ${summary}`);
    // A pull into the buffer would take up to sixteen at once; one per shot
    // is the hopper-direct path.
    test.assert(left.tipped === 8 - shots.shots(), `hopper not charged one per shot: ${summary}`);
  } finally {
    shots.unsub();
  }
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(800);

registerAsync("qol", "turret_leaves_healing_tint_alone", async (test) => {
  placeTurret(test);
  feedingHopper(test);
  fillHopper(test, 0, "arrow", 4, 22); // healing: heals everything but the undead
  const head = await headReady(test);
  const shots = shotCounter(head, ARROW);
  try {
    await withHusk(test, async () => {
      await test.idle(120);
    });
    const summary = `${shots.shots()} shots, hopper holds ${count(test, HOPPER_POS, ARROW)} of 4`;
    console.warn(`[gametest] turret_leaves_healing_tint_alone: ${summary}`);
    test.assert(shots.shots() === 0, `the turret fired a tint it should refuse: ${summary}`);
    test.assert(count(test, HOPPER_POS, ARROW) === 4, `the hopper was touched: ${summary}`);
  } finally {
    shots.unsub();
  }
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(600);

registerAsync("qol", "turret_throws_snowballs_from_hopper", async (test) => {
  placeTurret(test);
  feedingHopper(test);
  put(test, HOPPER_POS, item("minecraft:snowball", 8));
  const head = await headReady(test);
  const shots = shotCounter(head, "minecraft:snowball");
  try {
    await withHusk(test, async (husk) => {
      let hits = 0;
      const sub = world.afterEvents.projectileHitEntity.subscribe((ev) => {
        try {
          if (ev.projectile.typeId === "minecraft:snowball" && ev.getEntityHit().entity?.id === husk.id) hits++;
        } catch {
          // gone
        }
      });
      try {
        const landed = await waitFor(test, () => hits >= 2, 400);
        const hp = husk.getComponent(EntityComponentTypes.Health)?.currentValue ?? -1;
        const summary = `${shots.shots()} thrown, ${hits} hit, husk health ${hp}/20, hopper holds ${count(test, HOPPER_POS, "minecraft:snowball")} of 8`;
        console.warn(`[gametest] turret_throws_snowballs_from_hopper: ${summary}`);
        test.assert(landed, `snowballs did not land: ${summary}`);
        test.assert(hp === 20, `snowballs hurt the husk: ${summary}`);
      } finally {
        world.afterEvents.projectileHitEntity.unsubscribe(sub);
      }
    });
    await test.idle(10);
    const left = count(test, HOPPER_POS, "minecraft:snowball");
    test.assert(left === 8 - shots.shots(), `hopper not charged one per throw: ${shots.shots()} thrown, ${left} left`);
  } finally {
    shots.unsub();
  }
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(800);

registerAsync("qol", "turret_throws_splash_from_hopper", async (test) => {
  placeTurret(test);
  feedingHopper(test);
  // Splash potions do not stack: one per slot.
  for (let slot = 0; slot < 4; slot++) fillHopper(test, slot, "splash_potion", 1, 34); // weakness
  const head = await headReady(test);
  const shots = shotCounter(head, "minecraft:splash_potion");
  try {
    await withHusk(test, async (husk) => {
      const weak = await waitFor(test, () => hasEffect(husk, "weakness"), 400);
      test.assert(weak, `husk never weakened: ${shots.shots()} thrown, hopper holds ${count(test, HOPPER_POS, "minecraft:splash_potion")}`);
    });
    await test.idle(10);
    const left = count(test, HOPPER_POS, "minecraft:splash_potion");
    const summary = `${shots.shots()} thrown, hopper holds ${left} of 4`;
    console.warn(`[gametest] turret_throws_splash_from_hopper: ${summary}`);
    test.assert(left === 4 - shots.shots(), `hopper not charged one per throw: ${summary}`);
  } finally {
    shots.unsub();
  }
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(800);

registerAsync("qol", "turret_prefers_special_over_buffer", async (test) => {
  placeTurret(test);
  feedingHopper(test);
  put(test, HOPPER_POS, item(ARROW, 8), 0);
  fillHopper(test, 1, "arrow", 4, 18);
  const head = await headReady(test);
  // The plain arrows leave for the buffer; the tipped ones stay.
  const buffered = await waitFor(test, () => arrowsByTint(test).plain === 0, 150);
  const before = arrowsByTint(test);
  test.assert(buffered, `plain arrows were not buffered: hopper holds ${before.plain} plain, ${before.tipped} tipped`);
  test.assert(before.tipped === 4, `the tipped arrows did not stay in the hopper: ${before.tipped} of 4`);
  // With both on offer, the first shot is the tint, not the buffer.
  const shots = shotCounter(head, ARROW);
  try {
    await withHusk(test, async (husk) => {
      const slowed = await waitFor(test, () => hasEffect(husk, "slowness"), 400);
      const after = arrowsByTint(test);
      const summary = `${shots.shots()} shots, husk slowed=${slowed}, hopper tipped ${after.tipped} of 4`;
      console.warn(`[gametest] turret_prefers_special_over_buffer: ${summary}`);
      test.assert(slowed, `the turret fired from its buffer instead of the hopper's tint: ${summary}`);
      test.assert(after.tipped === 4 - shots.shots(), `shots were not charged to the tipped stack: ${summary}`);
    });
  } finally {
    shots.unsub();
  }
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(500);
