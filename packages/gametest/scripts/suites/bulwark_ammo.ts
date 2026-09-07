import {
  BlockPermutation,
  EntityComponentTypes,
  Potions,
  world,
  type Entity,
  type Vector3,
} from "@minecraft/server";
import { registerAsync, type Test } from "@minecraft/server-gametest";
import { count, floor, item, put, STRUCTURE, until } from "./rig";

/**
 * Bulwark Phase 3 prototypes: the "must prototype" list of
 * docs/design/bulwark-ammo-and-upgrades.md §8, measured before any pack code
 * is written on it.
 *
 * None of these touch the shipped turret. The shooter is `qol:shooter_rig`,
 * an entity this pack ships with one component group per thing under test
 * (a tint, a rate, a shooter power, a custom projectile, the witch's
 * per-target list), swapped by `triggerEvent` the way the turret head swaps
 * `bulwark:arm`. The target is a husk four blocks in front, as in
 * `turret_shot_origin`; the server runs on peaceful, so each test raises the
 * difficulty for the husk and puts it back.
 *
 * Every assertion message carries the observed value, so a failure is a
 * measurement. The results are written up in docs/bulwark-ammo-results.md.
 */

const RIG = "qol:shooter_rig";
const BOLT = "qol:bolt";
const HUSK = "minecraft:husk";
const ARROW = "minecraft:arrow";
const RIG_POS: Vector3 = { x: 5, y: 1, z: 5 };
const HUSK_POS: Vector3 = { x: 5, y: 1, z: 1 };

/** Lay the floor, spawn the rig, fire its events, let them land. */
async function arm(test: Test, ...events: string[]): Promise<Entity> {
  floor(test);
  const rig = test.spawn(RIG, RIG_POS);
  for (const e of events) rig.triggerEvent(e);
  // An entity event lands on the next tick (docs/README.md corrections).
  await test.idle(2);
  return rig;
}

/** Run `body` with a husk spawned on easy, and peaceful put back after. */
async function withHusk(test: Test, body: (husk: Entity) => Promise<void>): Promise<void> {
  const dim = test.getDimension();
  dim.runCommand("difficulty easy");
  try {
    const husk = test.spawn(HUSK, HUSK_POS);
    await body(husk);
  } finally {
    dim.runCommand("difficulty peaceful");
  }
}

function effects(e: Entity): string[] {
  try {
    return e.getEffects().map((x) => x.typeId);
  } catch {
    return [];
  }
}

const hasEffect = (e: Entity, name: string): boolean =>
  effects(e).some((t) => t === name || t === `minecraft:${name}`);

function ownerId(projectile: Entity): string | undefined {
  try {
    return projectile.getComponent(EntityComponentTypes.Projectile)?.owner?.id;
  } catch {
    return undefined;
  }
}

/** Count projectiles of `typeId` the rig fires, by owner at spawn. */
function countShots(rig: Entity, typeId: string): { shots: () => number; unsub: () => void } {
  let shots = 0;
  const sub = world.afterEvents.entitySpawn.subscribe((ev) => {
    try {
      if (ev.entity.typeId !== typeId) return;
      if (ownerId(ev.entity) !== rig.id) return;
    } catch {
      return;
    }
    shots++;
  });
  return {
    shots: () => shots,
    unsub: () => world.afterEvents.entitySpawn.unsubscribe(sub),
  };
}

/** Count projectiles of `typeId` that hit `target`. */
function countHits(target: Entity, typeId: string): { hits: () => number; unsub: () => void } {
  let hits = 0;
  const sub = world.afterEvents.projectileHitEntity.subscribe((ev) => {
    try {
      if (ev.projectile.typeId !== typeId) return;
      if (ev.getEntityHit().entity?.id !== target.id) return;
    } catch {
      return;
    }
    hits++;
  });
  return { hits: () => hits, unsub: () => world.afterEvents.projectileHitEntity.unsubscribe(sub) };
}

// §8.1a — a `shooter.aux_val` tint on a custom entity applies its effect.
// Slowness, not poison: the husk is undead, and the undead are immune to
// poison (measured: 400 ticks of poison arrows left a husk with no effect,
// while slowness landed on the second shot). §3 of the design says why.
registerAsync("qol", "rig_tint_applies", async (test) => {
  const rig = await arm(test, "qol:shoot_slowness");
  await withHusk(test, async (husk) => {
    const shots = countShots(rig, ARROW);
    const hits = countHits(husk, ARROW);
    try {
      const got = await until(test, () => hasEffect(husk, "slowness"), 400);
      const summary = `${shots.shots()} arrows fired, ${hits.hits()} hit the husk, effects [${effects(husk).join(",")}]`;
      console.warn(`[gametest] rig_tint_applies: ${summary}`);
      test.assert(got, `husk never gained slowness: ${summary}`);
    } finally {
      shots.unsub();
      hits.unsub();
    }
  });
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(600);

// §8.1b — swapping the shooter group between shots changes the NEXT shot.
registerAsync("qol", "rig_swap_changes_next_shot", async (test) => {
  const rig = await arm(test, "qol:shoot_slowness");
  await withHusk(test, async (husk) => {
    const shots = countShots(rig, ARROW);
    try {
      const first = await until(test, () => shots.shots() >= 1, 300);
      test.assert(first, "the rig never fired its first arrow");
      rig.triggerEvent("qol:shoot_weakness");
      const before = shots.shots();
      const next = await until(test, () => shots.shots() > before, 300);
      test.assert(next, `no arrow followed the swap (shots ${shots.shots()})`);
      const weakened = await until(test, () => hasEffect(husk, "weakness"), 400);
      test.assert(
        weakened,
        `after swapping slowness->weakness the husk has [${effects(husk).join(",")}] over ${shots.shots()} shots: the swap did not take`,
      );
      console.warn(
        `[gametest] rig_swap_changes_next_shot: weakness after ${shots.shots()} shots; effects [${effects(husk).join(",")}]`,
      );
    } finally {
      shots.unsub();
    }
  });
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(1000);

// §8.2 — swapping the ranged_attack group between shots keeps firing, at the
// new rate. The message carries the tick gap after the swap.
registerAsync("qol", "rig_rate_swap_keeps_firing", async (test) => {
  const rig = await arm(test, "qol:shoot_arrow", "qol:rate_slow");
  await withHusk(test, async () => {
    const shots = countShots(rig, ARROW);
    try {
      const first = await until(test, () => shots.shots() >= 2, 400);
      test.assert(first, `the rig fired ${shots.shots()} arrow(s) on the slow group; wanted two`);
      rig.triggerEvent("qol:rate_fast");
      const before = shots.shots();
      let ticks = 0;
      const next = await until(
        test,
        () => {
          ticks += 2;
          return shots.shots() > before;
        },
        200,
      );
      test.assert(next, `no arrow within 200 ticks of swapping to the fast group (shots ${shots.shots()})`);
      // Slow is 40 ticks; fast is 10. A gap under the slow interval says the
      // new group took over without waiting out the old timer or re-acquiring.
      const burst = await until(test, () => shots.shots() >= before + 4, 120);
      console.warn(
        `[gametest] rig_rate_swap_keeps_firing: first shot ${ticks} ticks after the swap; ${shots.shots() - before} shots in the 120 ticks after`,
      );
      test.assert(burst, `only ${shots.shots() - before} shot(s) in 120 ticks after the swap; the fast interval did not take`);
    } finally {
      shots.unsub();
    }
  });
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(1000);

// §8.3 — `shooter.power` scales an arrow's damage.
registerAsync("qol", "rig_power_scales_damage", async (test) => {
  const rig = await arm(test, "qol:shoot_arrow_power_1");
  const dim = test.getDimension();
  const sample = async (label: string): Promise<number[]> => {
    const hits: number[] = [];
    let target: Entity | undefined;
    const sub = world.afterEvents.entityHurt.subscribe(
      (ev) => {
        if (target && ev.hurtEntity.id === target.id && ev.damageSource.cause === "projectile") hits.push(ev.damage);
      },
      { entityTypes: [HUSK] },
    );
    try {
      await withHusk(test, async (husk) => {
        target = husk;
        const got = await until(test, () => hits.length >= 2, 500);
        test.assert(got, `${label}: only ${hits.length} projectile hit(s) in 500 ticks`);
        try {
          husk.remove();
        } catch {
          // already dead
        }
      });
    } finally {
      world.afterEvents.entityHurt.unsubscribe(sub);
    }
    return hits;
  };
  const low = await sample("power 1.0");
  rig.triggerEvent("qol:shoot_arrow_power_3");
  await test.idle(2);
  // Arrows from the first husk may still be in flight; let them land.
  for (const a of dim.getEntities({ type: ARROW })) a.remove();
  const high = await sample("power 3.0");
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const summary = `power 1.0 hits [${low.join(",")}] mean ${mean(low).toFixed(2)}; power 3.0 hits [${high.join(",")}] mean ${mean(high).toFixed(2)}`;
  console.warn(`[gametest] rig_power_scales_damage: ${summary}`);
  test.assert(mean(high) > mean(low), `power did not raise damage: ${summary}`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(1400);

// §8.4 — a custom projectile fired through `shooter.def` has an owner, and a
// kill by it is attributed to the shooter.
registerAsync("qol", "rig_custom_bolt_has_owner", async (test) => {
  const rig = await arm(test, "qol:shoot_bolt");
  let atSpawn: string | undefined;
  let nextTick: string | undefined;
  let spawned = 0;
  /** Bolt id -> owner id, read at spawn: the map a pack would keep. */
  const ownerOfBolt = new Map<string, string | undefined>();
  const spawnSub = world.afterEvents.entitySpawn.subscribe((ev) => {
    let bolt: Entity;
    try {
      bolt = ev.entity;
      if (bolt.typeId !== BOLT) return;
    } catch {
      return;
    }
    spawned++;
    ownerOfBolt.set(bolt.id, ownerId(bolt));
    if (spawned > 1) return;
    atSpawn = ownerId(bolt);
    // Read again a tick later, as attributeShot does.
    void test.idle(1).then(() => {
      try {
        nextTick = ownerId(bolt);
      } catch {
        nextTick = "invalid";
      }
    });
  });
  let killer: string | undefined;
  let killerProjectile: string | undefined;
  let projectileOwner: string | undefined;
  const dieSub = world.afterEvents.entityDie.subscribe(
    (ev) => {
      killer = ev.damageSource.damagingEntity?.id;
      try {
        const p = ev.damageSource.damagingProjectile;
        killerProjectile = p?.typeId;
        projectileOwner = p ? ownerId(p) : undefined;
      } catch {
        killerProjectile = "invalid";
      }
    },
    { entityTypes: [HUSK] },
  );
  try {
    await withHusk(test, async () => {
      const fired = await until(test, () => spawned >= 1, 300);
      test.assert(fired, "the rig never spawned a qol:bolt: shooter.def with a custom entity does not fire");
      const dead = await until(test, () => killer !== undefined, 600);
      // Measured, three runs each: for a custom projectile `damagingEntity`
      // is the BOLT, not its shooter, and by the time entityDie fires the
      // bolt (remove_on_hit) has no readable owner either. The only route
      // that holds is a map of projectile id -> owner filled at spawn, which
      // is what a pack must keep. The message says which route held.
      const mapped = killer ? ownerOfBolt.get(killer) : undefined;
      const summary = `bolts ${spawned}; owner at spawn ${atSpawn ?? "none"}, next tick ${nextTick ?? "none"}, rig ${rig.id}; killer damagingEntity ${killer ?? "none (husk alive)"} via ${killerProjectile ?? "none"} whose owner reads ${projectileOwner ?? "none"} at death and ${mapped ?? "none"} from the spawn map`;
      console.warn(`[gametest] rig_custom_bolt_has_owner: ${summary}`);
      test.assert(atSpawn === rig.id || nextTick === rig.id, `bolt has no owner: ${summary}`);
      test.assert(dead, `husk not killed by bolts: ${summary}`);
      test.assert(
        killer === rig.id || projectileOwner === rig.id || mapped === rig.id,
        `kill not attributable to the rig by any route: ${summary}`,
      );
    });
  } finally {
    world.afterEvents.entitySpawn.unsubscribe(spawnSub);
    world.afterEvents.entityDie.unsubscribe(dieSub);
  }
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(1200);

// §8.5 — decrementing a hopper's stack from a spawn handler while the hopper
// is itself moving items loses nothing.
registerAsync("qol", "rig_hopper_decrement_survives_transfer", async (test) => {
  const chest: Vector3 = { x: 2, y: 3, z: 5 };
  const hopper: Vector3 = { x: 2, y: 2, z: 5 };
  const rig = await arm(test, "qol:shoot_arrow", "qol:rate_fast");
  // The hopper points down into a stone block at y=1, so what it pulls from
  // the chest above stays in the hopper: a supply line that is moving while
  // the shots decrement it.
  test.setBlockType("minecraft:stone", { x: 2, y: 1, z: 5 });
  test.setBlockPermutation(BlockPermutation.resolve("minecraft:hopper", { facing_direction: 0 }), hopper);
  test.setBlockType("minecraft:chest", chest);
  put(test, chest, item(ARROW, 10));
  const total = () => count(test, chest, ARROW) + count(test, hopper, ARROW);
  let decrements = 0;
  let empties = 0;
  const sub = world.afterEvents.entitySpawn.subscribe((ev) => {
    try {
      if (ev.entity.typeId !== ARROW || ownerId(ev.entity) !== rig.id) return;
    } catch {
      return;
    }
    const c = test.getBlock(hopper).getComponent("minecraft:inventory")?.container;
    if (!c) return;
    for (let i = 0; i < c.size; i++) {
      const s = c.getItem(i);
      if (s?.typeId !== ARROW) continue;
      if (s.amount > 1) {
        s.amount -= 1;
        c.setItem(i, s);
      } else c.setItem(i, undefined);
      decrements++;
      return;
    }
    empties++;
  });
  try {
    await withHusk(test, async () => {
      const done = await until(test, () => decrements + empties >= 6, 400);
      test.assert(done, `only ${decrements} decrement(s) and ${empties} empty shot(s) in 400 ticks`);
    });
    await test.idle(40);
    const left = total();
    const summary = `10 arrows, ${decrements} decremented, ${empties} shots found the hopper empty, ${left} left (chest ${count(test, chest, ARROW)}, hopper ${count(test, hopper, ARROW)})`;
    console.warn(`[gametest] rig_hopper_decrement_survives_transfer: ${summary}`);
    test.assert(left === 10 - decrements, `arrows lost or duplicated: ${summary}`);
  } finally {
    world.afterEvents.entitySpawn.unsubscribe(sub);
  }
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(800);

// §8.6 — the witch's `projectiles[]` on a custom entity picks a tint by target.
registerAsync("qol", "rig_picks_tint_by_target", async (test) => {
  const rig = await arm(test, "qol:shoot_by_target");
  await withHusk(test, async (husk) => {
    // The list says slowness for the undead; the fallback is weakness.
    const shots = countShots(rig, ARROW);
    const hits = countHits(husk, ARROW);
    const hit = await until(test, () => hasEffect(husk, "slowness") || hasEffect(husk, "weakness"), 500);
    shots.unsub();
    hits.unsub();
    const seen = effects(husk).join(",");
    test.assert(hit, `husk gained no effect in 500 ticks: ${shots.shots()} arrows, ${hits.hits()} hits, effects [${seen}]`);
    console.warn(`[gametest] rig_picks_tint_by_target: husk effects [${seen}]`);
    test.assert(hasEffect(husk, "slowness"), `undead husk got the fallback, not the filtered tint: [${seen}]`);
    test.assert(!hasEffect(husk, "weakness"), `undead husk got the fallback as well as the filtered tint: [${seen}]`);
  });
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(800);

// Snowballs from a shooter: no damage, a push.
registerAsync("qol", "rig_snowball_no_damage", async (test) => {
  const rig = await arm(test, "qol:shoot_snowball");
  await withHusk(test, async (husk) => {
    let hits = 0;
    let damage = 0;
    const hitSub = world.afterEvents.projectileHitEntity.subscribe((ev) => {
      try {
        if (ev.projectile.typeId !== "minecraft:snowball") return;
        if (ev.getEntityHit().entity?.id !== husk.id) return;
      } catch {
        return;
      }
      hits++;
    });
    const hurtSub = world.afterEvents.entityHurt.subscribe(
      (ev) => {
        if (ev.hurtEntity.id === husk.id) damage += ev.damage;
      },
      { entityTypes: [HUSK] },
    );
    try {
      const landed = await until(test, () => hits >= 2, 500);
      test.assert(landed, `only ${hits} snowball hit(s) in 500 ticks (rig ${rig.id})`);
      await test.idle(2);
      const hp = husk.getComponent(EntityComponentTypes.Health)?.currentValue ?? -1;
      const start = test.worldBlockLocation(HUSK_POS);
      const moved = Math.hypot(husk.location.x - (start.x + 0.5), husk.location.z - (start.z + 0.5));
      const summary = `${hits} hits, damage ${damage}, health ${hp}/20, moved ${moved.toFixed(2)} blocks`;
      console.warn(`[gametest] rig_snowball_no_damage: ${summary}`);
      test.assert(damage === 0 && hp === 20, `snowballs hurt the husk: ${summary}`);
    } finally {
      world.afterEvents.projectileHitEntity.unsubscribe(hitSub);
      world.afterEvents.entityHurt.unsubscribe(hurtSub);
    }
  });
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(800);

// Splash potions from a shooter apply their effect, and script can make the
// item back (the give-back on break that tipped arrows cannot have).
registerAsync("qol", "rig_splash_potion_applies", async (test) => {
  const rig = await arm(test, "qol:shoot_splash");
  await withHusk(test, async (husk) => {
    const shots = countShots(rig, "minecraft:splash_potion");
    const hit = await until(test, () => hasEffect(husk, "weakness"), 500);
    shots.unsub();
    test.assert(hit, `husk never gained weakness from splash potions: ${shots.shots()} thrown, effects [${effects(husk).join(",")}]`);
  });
  // The registry wants the namespaced id: a bare "weakness" throws
  // InvalidPotionEffectTypeError (measured).
  const made = Potions.resolve("minecraft:weakness", "ThrownSplash");
  const potion = made.getComponent("minecraft:potion");
  const summary = `Potions.resolve gave ${made.typeId} x${made.amount}, effect ${potion?.potionEffectType.id ?? "none"}, delivery ${potion?.potionDeliveryType.id ?? "none"}`;
  console.warn(`[gametest] rig_splash_potion_applies: ${summary}`);
  test.assert(made.typeId === "minecraft:splash_potion", summary);
  test.assert((potion?.potionEffectType.id ?? "").endsWith("weakness"), summary);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(800);

// ---------------------------------------------------------------------------
// #91: targeting priority. Two questions before a per-turret choice can be
// built on `nearest_attackable_target`:
//  - is the order of `entity_types` entries a priority, so an entry filtered
//    on low health placed first makes the turret pick a weak far mob over a
//    healthy near one?
//  - does a second component group's `nearest_attackable_target` replace the
//    first group's (so priority can be an additive group on the head), or
//    does the first keep winning?
// Two husks: a healthy one two blocks out, a wounded one five blocks out.
// ---------------------------------------------------------------------------

const NEAR_POS: Vector3 = { x: 5, y: 1, z: 3 };
const FAR_POS: Vector3 = { x: 2, y: 1, z: 1 };

/** Which of two husks the rig hurts first, by projectile. */
async function firstHurt(test: Test, rig: Entity): Promise<{ first: string; near: number; far: number }> {
  const dim = test.getDimension();
  dim.runCommand("difficulty easy");
  let near: Entity | undefined;
  let far: Entity | undefined;
  const hurt = { near: 0, far: 0 };
  let first = "none";
  const sub = world.afterEvents.entityHurt.subscribe(
    (ev) => {
      if (ev.damageSource.cause !== "projectile") return;
      const id = ev.hurtEntity.id;
      const which = id === near?.id ? "near" : id === far?.id ? "far" : undefined;
      if (!which) return;
      hurt[which]++;
      if (first === "none") first = which;
    },
    { entityTypes: [HUSK] },
  );
  try {
    near = test.spawn(HUSK, NEAR_POS);
    far = test.spawn(HUSK, FAR_POS);
    far.getComponent(EntityComponentTypes.Health)?.setCurrentValue(4);
    const shot = await until(test, () => first !== "none", 400);
    test.assert(shot, `the rig hit neither husk in 400 ticks (rig ${rig.id})`);
  } finally {
    world.afterEvents.entityHurt.unsubscribe(sub);
    dim.runCommand("difficulty peaceful");
  }
  return { first, near: hurt.near, far: hurt.far };
}

// Measured, three runs: entry order is NOT a priority. With the wounded
// entry first and a plain entry second, the nearest healthy husk was shot
// every time. Pinned as the fact it is, so a build that assumes ordering
// fails here rather than in the field.
registerAsync("qol", "rig_target_order_is_not_priority", async (test) => {
  const rig = await arm(test, "qol:shoot_arrow", "qol:target_weak_first");
  const r = await firstHurt(test, rig);
  const summary = `first hurt: ${r.first} (near healthy husk hit ${r.near}, far wounded husk hit ${r.far})`;
  console.warn(`[gametest] rig_target_order_is_not_priority: ${summary}`);
  test.assert(r.first === "near", `entry order has become a priority; the pack could use it: ${summary}`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(800);

registerAsync("qol", "rig_target_nearest_by_default", async (test) => {
  // The control: with the plain selector the near healthy husk is shot first.
  const rig = await arm(test, "qol:shoot_arrow");
  const r = await firstHurt(test, rig);
  const summary = `first hurt: ${r.first} (near ${r.near}, far ${r.far})`;
  console.warn(`[gametest] rig_target_nearest_by_default: ${summary}`);
  test.assert(r.first === "near", `the plain selector did not pick the nearest: ${summary}`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(800);

// Sharper: a selector with ONLY the wounded-filter entry. Alone, it says
// whether the health filter works at all (the far wounded husk is the only
// legal target). On top of the plain selector, it says whether the second
// group's selector replaces the first's (only the far husk is shot) or the
// first keeps winning (the near one is).
registerAsync("qol", "rig_target_filter_only", async (test) => {
  const rig = await arm(test, "qol:shoot_arrow", "qol:target_weak_only");
  const r = await firstHurt(test, rig);
  const summary = `first hurt: ${r.first} (near healthy ${r.near}, far wounded ${r.far})`;
  console.warn(`[gametest] rig_target_filter_only: ${summary}`);
  test.assert(r.first === "far", `the actor_health filter did not hold: ${summary}`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(800);

registerAsync("qol", "rig_target_filter_on_top", async (test) => {
  const rig = await arm(test, "qol:shoot_arrow", "qol:target_weak_only_on_top");
  const r = await firstHurt(test, rig);
  const summary = `first hurt: ${r.first} (near healthy ${r.near}, far wounded ${r.far})`;
  console.warn(`[gametest] rig_target_filter_on_top: ${summary}`);
  test.assert(r.first === "far", `the first group's selector kept winning: ${summary}`);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(800);
