# Bulwark — probe protocol for the turret core

**Status: built, not yet measured.** This document is the protocol, not the
results. When it has been run, replace this preamble with the readings, in the
style of [`hearthstone-spawn-results.md`](hearthstone-spawn-results.md), and
move the file's entry in [`README.md`](README.md) up to the findings list.

The design's own words (§10): *"Entity reconciliation reliability. The
block-entity pairing is the load-bearing assumption. If entities go missing in
ways reconciliation can't catch, the whole architecture needs rethinking."*
The roadmap agrees it is the riskiest unproven assumption in any of the docs.
So it gets probed before anything is built on it.

The probes live inside the Bulwark pack (`/scriptevent bulwark:…`) rather than
in `packages/probe`, because every question needs the real entity and block
definitions. They follow the probe pack's rules: `/scriptevent`-driven so they
survive `/reload`, log-only unless the name says it mutates, and everything
they create is tagged `bulwark:probe` so `bulwark:probe-cleanup` can find it.

Watch the content log (Settings → Creator → Content Log GUI); everything is
`console.warn`.

## P0 — does it load at all?

Before anything else, on world entry the log must show:

```
[Bulwark] registered block component bulwark:turret
[Bulwark] ready at tick N: 0 turret(s) known; block component registered
```

Then place a turret from the creative menu or craft it (iron, dispenser,
stone, redstone). Expect a head to appear on top within a tick. If the block
places but no head appears, the entity definition failed strict validation:
the content log will name the offending field. `bulwark:debug` shows the
nearest record and whether its head ever spawned.

## P1 — entity persistence

*Does a persistent custom entity with no spawn rules, and its dynamic
properties, survive everything a world does?*

```
/scriptevent bulwark:probe-persist    spawn an UNLINKED head where you stand
/scriptevent bulwark:probe-check      look every remembered head up by id
```

The probe head is unlinked, so reconciliation never touches it; this measures
the engine alone. After `probe-persist`, run `probe-check` after each of:

| Step | Expect | If not |
| --- | --- | --- |
| Walk 200+ blocks away, come back | FOUND, stamp intact | The entity despawned despite `minecraft:persistent` — `initialPersistence` is not enough; investigate `minecraft:despawn` interaction |
| `/reload` | FOUND, same id, stamp intact | Ids or properties do not survive script reload; the record's `entityId` link is worthless and the design must fall back to adoption-by-position every load |
| Leave the world and re-enter | FOUND | Same as above, at world scope |
| Go to the Nether and back | FOUND | Entities in the Overworld unload while you are away; it should be found once you return within simulation distance — NOT FOUND *while you are in the Nether* is expected and says nothing |
| Full game restart | FOUND | The entity is not being saved with the chunk |

Two readings that are **not** failures: NOT FOUND while the chunk is not
loaded, and NOT FOUND immediately on re-entry before the chunk's entities have
ticked in. Stand still for a few seconds and re-run.

**What it decides.** If ids and properties survive, the block→entity link by
id is real and the fast path (`world.getEntity(id)`) is correct. If they do
not, `reconcileBlock` already handles it — it adopts by position — but the
spawn-grace logic should then be reconsidered, since a remembered id that is
never valid again would delay every respawn by two ticks for nothing.

## P2 — acquisition and firing from a stationary shooter

*Does `ranged_attack` with `hold_position`, zero movement and no gravity
actually fire? At what distances? Straight down?*

```
/scriptevent bulwark:probe-target     MUTATES: spawns one zombie 8 blocks
                                      ahead of you, then watches the nearest
                                      head for 10 seconds
/scriptevent bulwark:probe-watch      log-only: the same watch, no spawn
```

Prerequisites: a placed turret with ammo (`bulwark:debug` shows it; use arrows
on it to load), you within 24 blocks, daytime or a lit area so nothing else
wanders in.

| Reading | Meaning |
| --- | --- |
| `P3 done: N turret shot(s) attributed` with N > 0, and ammo dropped by N in `bulwark:debug` | Acquisition, firing and shot attribution all work; `Projectile.owner` is populated |
| shots fired (arrows visible, bow sound) but N = 0 and `unattributed` climbed | The arrow's owner is not set even one tick after spawn. Ammo is then never consumed. Fix: attribute geometrically — arrows spawning within a block of a head's muzzle — the same shape as the dispenser interceptor in QOL Times |
| no arrows at all, head yaw changes | Targeting works, firing does not: `ranged_attack` needs a component the head lacks, or `attack_radius` is being read as a *minimum* — try `attack_range: {min: 0, max: 16}` |
| no arrows, yaw never changes, zombie walks straight past | Acquisition failed: check `must_see` (line of sight from the head's eye height at the top of a full block), and that the zombie is loaded — the `P4` census will show it |
| head fires at the zombie's feet / over its head | Aim leading assumes a normal mob's eye height; adjust `collision_box.height` |

Then repeat with the zombie **directly below** the turret (dig a pit) and at
the edge of range: the design specifically flags "fast targets and targets
directly below" as the cases vanilla skeleton tuning was never meant for.

## P3 — head rotation

*Does a stationary entity turn to face its target, and does the head bone
track visually?*

This is read off the same watch. `P3 t+N yaw=… pitch=…` lines print whenever
the rotation changes.

| Reading | Meaning |
| --- | --- |
| yaw changes as the zombie moves; model turns in game | Body rotation follows the target; the `look_at_target` animation on the head bone adds pitch. Done |
| yaw flat; model's head turns | Only the head bone rotates (`query.target_y_rotation` is relative). Fine for a turret — the barrel is on the head bone for exactly this reason |
| yaw flat; model frozen; shots still land | The entity aims internally without exposing rotation. Add `minecraft:behavior.look_at_entity` or drive the head from script with `lookAt()` on the shot event |
| model faces the wrong way relative to the barrel | The barrel sits on the model's −Z face by convention; flip its origin to +Z in `turret.geo.json` |

## P4 — mob cap

*Do custom entities without spawn rules count toward hostile mob caps?* A
perimeter that silently suppresses spawns would be a confusing bug to chase
later.

```
/scriptevent bulwark:probe-census     monsters, heads and total entities
                                      within 64 blocks
```

Not a one-reading question. Protocol: pick a dark test area away from your
base. Night 1, no turrets: run the census every few minutes and note the
monster count. Night 2, thirty to fifty turret **heads** (probe heads are
fine — `probe-persist` repeatedly; they are inert) in the same area: repeat.
Night 3, cleaned up: repeat as a control. A clear drop on night 2 means heads
are counted against the cap and the design needs `minecraft:type_family`
without `mob`, or a density cap far lower than planned.

`bulwark:probe-cleanup` removes every tagged probe entity in loaded chunks.

## P5 — reconciliation under fire

*The real test: break the pairing every way the world can and confirm it
heals with exactly one head.* All with `bulwark:debug` before and after; the
counters (`spawned`, `adopted`, `reseated`, `dupes`, `orphans`) say which path
ran.

| Do | Expect |
| --- | --- |
| `/kill @e[type=bulwark:turret]` next to a turret | Within 4 s a new head, `spawned` +1 |
| `/tp @e[type=bulwark:turret] ~ ~3 ~` | Within 2 s it is back on the block, `reseated` +1 |
| `/setblock` the turret block to air (not a break) | No break hook fires for this. Within 10 s the sweep finds the record's block loaded and not a turret: record gone, head gone, arrows dropped, `stale` +1 |
| `/summon bulwark:turret` on top of an existing turret | It stays (unlinked = inert), does nothing, `dupes` unchanged |
| Copy a turret with `/clone` | The clone gets its own record and head on its first tick (`onPlace` fires for clone/fill); its head is linked to the new position |
| Break the block with 20 arrows loaded | 20 arrows drop, head gone, record gone |
| Explode it (TNT) | Same, via `onBreak` |
| Push it with a piston | Unknown. Custom blocks without a `minecraft:block_entity` can be pushed. Expect: the old position is retired by the sweep as above, and if `onPlace` fires at the new position a fresh, empty turret appears there — so the buffered arrows drop at the old spot rather than travelling. Note what actually happens |
| `/reload` with turrets loaded | `ready at tick N: K turret(s) known`, no new spawns after `bulwark:reconcile`, heads still armed |
| Unload the chunk (walk away), come back | No new spawns; if `spawned` climbed, the head loaded later than the block's first tick and the grace period needs to be longer |

## What the answers change

- **P1 fails** → replace the id fast path with adoption-by-position; drop
  the grace period.
- **P2 firing fails** → try `attack_range`; failing that, the design's fallback
  of script-driven `spawnEntity` + `applyImpulse`, which puts every turret on
  the script clock and changes the performance story entirely.
- **P2 attribution fails** → geometric attribution, and accept the same
  first-shot ambiguity QOL Times accepts.
- **P4 counts** → `type_family` without `mob`; verify targeting still works
  without it.
- **P5 finds a path that leaves two heads** → that is a bug in
  `reconcile.ts`, which is pure: write the failing case as a test first.
