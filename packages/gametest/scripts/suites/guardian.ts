import {
  EntityComponentTypes,
  EntityDamageCause,
  GameMode,
  PlayerPermissionLevel,
  world,
} from "@minecraft/server";
import { registerAsync } from "@minecraft/server-gametest";
import { CAUSES, HAZARD_CAUSES, PASS_THROUGH } from "../../../guardian/scripts/core/rules";
import { floor, STRUCTURE, until } from "./rig";

/**
 * Guardian: a hit on a player lands as at most what the engine proposed, and
 * a protected player who falls out of the world is put back.
 *
 * What the panel says and which role a simulated player has cannot be read
 * from here, so both tests print what they measured and assert only the
 * invariants that hold under every panel: never MORE damage, and never a void
 * death for a protected role with a known last footing.
 */

const health = (p: { getComponent: (id: string) => unknown }): number =>
  (p.getComponent(EntityComponentTypes.Health) as { currentValue: number } | undefined)
    ?.currentValue ?? NaN;

registerAsync("qol", "guardian_never_adds_damage", async (test) => {
  floor(test);
  const player = test.spawnSimulatedPlayer(
    { x: 3, y: 1, z: 3 },
    "gd_tester",
    GameMode.Survival,
  );
  await test.idle(10);
  test.print(`permission level ${player.playerPermissionLevel}; health ${health(player)}`);

  const hits: { cause: EntityDamageCause; amount: number }[] = [
    { cause: EntityDamageCause.entityAttack, amount: 4 },
    { cause: EntityDamageCause.fall, amount: 4 },
    { cause: EntityDamageCause.lava, amount: 4 },
  ];
  const seen: string[] = [];
  for (const hit of hits) {
    const before = health(player);
    const applied = player.applyDamage(hit.amount, { cause: hit.cause });
    // The hit lands within a tick or two; wait for it rather than guess (issue #29).
    await until(test, () => health(player) < before, 20);
    const lost = before - health(player);
    seen.push(`${hit.cause}: proposed ${hit.amount}, lost ${lost.toFixed(2)}${applied ? "" : " (applyDamage returned false)"}`);
    test.assert(
      lost <= hit.amount + 0.01,
      `${hit.cause}: lost ${lost} from a ${hit.amount} hit - Guardian ADDED damage`,
    );
    // Give natural regeneration no time to confuse the next reading.
    await test.idle(5);
  }
  for (const line of seen) test.print(line);
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * Guardian: a player who falls into the void is caught and put back.
 *
 * EXPECTED TO FAIL IN A NORMAL RUN. Read the failure as "not measured", never
 * as "Guardian is broken" - the void catch is proven to work
 * (docs/gametest-structure-results.md). Guardian's sweep walks
 * getAllPlayers(), and a SimulatedPlayer marshals as undefined into every pack
 * that does not itself bind @minecraft/server-gametest, so this player is not
 * in the list Guardian is looking at.
 *
 * It is kept because it is a real full-path test - track the ground sample,
 * notice the fall, teleport back - and it is worth running deliberately when
 * changing that path. To do so, temporarily add @minecraft/server-gametest to
 * the Guardian pack in all THREE places (the manifest's dependencies, its
 * `external` list in just.config.ts, and a side-effect import in its main.ts -
 * the declaration alone does nothing), run it, then REVERT ALL THREE. That
 * module is a Beta API: it flags the pack experimental and the Realm keeps its
 * achievements, so it must never ship.
 */
registerAsync("qol", "guardian_void_catch", async (test) => {
  floor(test);
  const player = test.spawnSimulatedPlayer(
    { x: 3, y: 1, z: 3 },
    "gd_faller",
    GameMode.Survival,
  );
  // Two sweeps' worth, so the tracker has seen them on the ground.
  await test.idle(30);

  if (player.playerPermissionLevel === PlayerPermissionLevel.Operator) {
    test.print("simulated player is an operator: switches do not apply, nothing to measure");
    test.succeed();
    return;
  }

  const stood = player.location;
  const floorY = test.getDimension().heightRange.min;
  test.print(`standing at y=${stood.y.toFixed(1)}; dimension floor y=${floorY}; dropping below it`);
  player.teleport({ x: stood.x, y: floorY - 6, z: stood.z });

  test.succeedWhen(() => {
    const y = player.location.y;
    test.assert(
      y >= floorY,
      `still at y=${y.toFixed(1)}, below the floor - not caught (void catch off, or no ground sample)`,
    );
    test.assert(
      health(player) > 0,
      "caught but dead: the landing or the void killed them",
    );
    test.print(`caught: back at y=${y.toFixed(1)}, health ${health(player)}`);
  });
})
  .structureName(STRUCTURE)
  .maxTicks(200);

/**
 * Guardian: the damage table names every cause the engine has.
 *
 * `core/rules.ts` lists all thirty-five `EntityDamageCause` members by hand,
 * because listing them keeps the table pure - importing the enum would put
 * `@minecraft/server` under `core/` and end the no-game unit tests. The cost
 * of that choice is drift: a cause the engine adds is a cause the table has
 * never been asked about, and a cause it renames is a hazard switch that
 * quietly stops covering anything. Nothing else in the repo would notice, so
 * this test walks the enum itself.
 *
 * No world, no player and no damage: this is the pure table read against the
 * engine's own enum, which is exactly the comparison a unit test cannot make.
 */
registerAsync("qol", "guardian_causes_match_the_engine", async (test) => {
  const engine = Object.values(EntityDamageCause).map(String).sort();
  const table = [...CAUSES].map(String).sort();

  const missing = engine.filter((c) => !table.includes(c));
  const extra = table.filter((c) => !engine.includes(c));

  test.print(`engine ${engine.length} cause(s), table ${table.length}`);
  test.assert(
    missing.length === 0,
    `the engine has cause(s) the table has never been asked about: ${missing.join(", ")} - a hit with one of these takes the panel's scale but no hazard switch covers it`,
  );
  test.assert(
    extra.length === 0,
    `the table names cause(s) the engine no longer has: ${extra.join(", ")} - a hazard switch listing one covers nothing`,
  );

  // The hazard switches are the part a rename breaks silently, so check their
  // members against the engine too rather than only against the table.
  for (const [hazard, causes] of Object.entries(HAZARD_CAUSES)) {
    for (const cause of causes) {
      test.assert(
        engine.includes(cause),
        `the "${hazard}" switch covers "${cause}", which the engine does not have`,
      );
    }
  }
  // The void is the reason this test exists. The published 2.9.0 typings have
  // no `void` member, the design notes said so, and the runtime has one - found
  // here, on BDS 1.26.45.1. While the table did not name it, a void hit fell
  // through `decide` to the role's scale, so a role at 0% was made immune to
  // the void while still falling through it. It must always be vanilla, and
  // the void catch stays a teleport on its own switch.
  test.assert(
    engine.includes("void"),
    "the engine no longer reports a `void` damage cause: it was measured here on 1.26.45.1, and PASS_THROUGH still lists it (harmlessly) if it has gone",
  );
  test.assert(
    (PASS_THROUGH as readonly string[]).includes("void"),
    "the void cause is not in PASS_THROUGH: a void hit would take the role's scale, and a role at 0% would be cancelled out of a fall it cannot land from",
  );
  test.succeed();
})
  .structureName(STRUCTURE)
  .maxTicks(100);

/**
 * Guardian: a before-event really can soften and cancel a hit.
 *
 * The whole pack is one `beforeEvents.entityHurt` handler writing `ev.damage`
 * and `ev.cancel`, and neither write has ever been measured here - the two
 * tests above cannot do it, because Guardian's handler checks
 * `hurtEntity instanceof Player` and a SimulatedPlayer marshals as undefined
 * into the pack (issue #31), so it returns before touching anything.
 *
 * This test subscribes its own handler, on a cow, so what it measures is the
 * engine's contract rather than the pack's table: is a reduced `damage`
 * honoured, and does `cancel` stop the hit entirely? If either answer changed,
 * every scale on the panel would be decoration.
 *
 * A cow, deliberately: Guardian's own subscription filters to players, so this
 * handler cannot collide with it, and the engine keeps every non-player hit
 * out of the pack's script altogether.
 */
registerAsync("qol", "guardian_hurt_event_softens_and_cancels", async (test) => {
  floor(test);
  const at = test.worldBlockLocation({ x: 3, y: 1, z: 3 });
  const cow = test
    .getDimension()
    .spawnEntity("minecraft:cow", { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
  await test.idle(10);

  let mode: "halve" | "cancel" = "halve";
  let seen = 0;
  let lastProposed = 0;

  const handler = world.beforeEvents.entityHurt.subscribe(
    (ev) => {
      if (ev.hurtEntity?.id !== cow.id) return;
      seen++;
      lastProposed = ev.damage;
      if (mode === "cancel") ev.cancel = true;
      else ev.damage = ev.damage / 2;
    },
    { entityFilter: { type: "minecraft:cow" } },
  );

  try {
    const hp = () => cow.getComponent(EntityComponentTypes.Health)!.currentValue;
    const start = hp();

    cow.applyDamage(4, { cause: EntityDamageCause.entityAttack });
    await until(test, () => hp() < start, 40);
    const afterHalved = hp();
    const lost = start - afterHalved;
    test.assert(seen === 1, `the handler saw ${seen} hit(s), expected 1 - the before-event did not fire`);
    test.assert(
      Math.abs(lost - 2) < 0.01,
      `a 4 damage hit halved in the handler cost ${lost.toFixed(2)} health (proposed ${lastProposed}), expected 2 - ev.damage is not honoured, so every scale on the panel is decoration`,
    );

    // Past the engine's post-hit invulnerability window, so the next hit is a
    // hit and not a cooldown - which would look exactly like a cancel.
    await test.idle(25);
    mode = "cancel";
    const before = hp();
    cow.applyDamage(4, { cause: EntityDamageCause.entityAttack });
    await test.idle(25);

    test.assert(
      seen === 2,
      `the handler saw ${seen} hit(s) in total, expected 2: the second hit never reached script, so the cancel below proves nothing`,
    );
    test.assert(
      Math.abs(hp() - before) < 0.01,
      `a cancelled hit still cost ${(before - hp()).toFixed(2)} health`,
    );
    test.print(
      `halved: ${start} -> ${afterHalved} (lost ${lost.toFixed(2)} of a proposed 4); cancelled: ${before} -> ${hp()}`,
    );
    test.succeed();
  } finally {
    world.beforeEvents.entityHurt.unsubscribe(handler);
    if (cow.isValid) cow.remove();
  }
})
  .structureName(STRUCTURE)
  .maxTicks(300);
