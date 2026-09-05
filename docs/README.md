# Documentation

Three kinds of document live here, and they carry very different authority.

| | What it is | Trust it? |
| --- | --- | --- |
| `design/` | Original design intent, written before implementation | **Aspirational.** Contains claims since disproven — see below |
| *findings* | Engine behaviour measured in game | **Authoritative.** These are observations |
| `plans/` | Approved implementation plans | Historical; reflects what was known at approval time |

## Findings — measured, and the most reliable thing here

- [`phase0-results.md`](phase0-results.md) — dispenser/cauldron behaviour for QOL
  Times. No dispenser event exists; `entitySpawn` and container-diff timing.
- [`lens-light-results.md`](lens-light-results.md) — light and standability.
  `total = max(blockLight, effectiveSky)`, and why `total − sky` is not block
  light.
- [`hearthstone-spawn-results.md`](hearthstone-spawn-results.md) — spawn-point
  behaviour, including that anchors work in the Nether.
- [`block-geometry-results.md`](block-geometry-results.md) — custom block
  geometry renders with x mirrored: +x is the world's west. Found with the
  pipe's arms.
- [`gametest-structure-results.md`](gametest-structure-results.md) — test-relative
  `(0,0,0)` is the test's own structure block; writing it kills the test. Also
  how to run the suite headlessly on a dedicated server.
- [`villages-jigsaw-results.md`](villages-jigsaw-results.md) — a behavior
  pack's jigsaw structure loads, places and generates in a world with **no
  experiments** (25 wells in 400 fresh chunks, one per cell). The files live
  under `worldgen/structures`, `worldgen/template_pools` and
  `worldgen/structure_sets`, root key `minecraft:jigsaw`, which the schemas
  do not say. Markers join pieces; custom blocks survive; a generated
  village's job posts people it (15 persons at 16 posts). Also: the
  per-world structure template cache, and how a plain-world server is set
  up beside the test one.

**Awaiting measurement:**

- [`bulwark-turret-probe.md`](bulwark-turret-probe.md) — the protocol for the
  turret's block-to-entity pairing: entity persistence, stationary ranged AI,
  head rotation, mob caps, and reconciliation under fire. Built as
  `/scriptevent qolprobe:turret-*` in the probe pack, with `bulwark:debug` for
  the counters. Not a findings document until it has been run; it says so at
  the top.

## Design docs — read with the corrections below

`design/` predates implementation. Several load-bearing claims turned out to be
wrong, usually because a feature was documented from a **preview** build that has
not reached retail, or because a Java capability does not exist on Bedrock.

**Corrections that apply across all three:**

| Design-doc claim | Reality on 1.26.45 retail |
| --- | --- |
| `minecraft:block_entity` no longer needs the experimental toggle | **Still experimental.** That note comes from a 26.50 *preview*; 26.50 has not shipped. So does `carry_over_block_entity_data`, which means "config survives the pickaxe" cannot ship at all. Per-block config uses world dynamic properties keyed by position instead. |
| `floodSearch` with `directionMask` | **Does not exist** — not in stable, RC or beta, and absent from the experimental docs. Implement flood fill with `system.runJob`. |
| `onPlayerDestroy` custom-component callback | Wrong name. It is `onPlayerBreak`. |
| `minecraft:custom_components: [...]` array | That is Custom Components **V1**. V2 lists them inline in `components`. |
| `Player.persistentId` for ownership | **Beta-only.** Mint an id into a player dynamic property instead. |
| `PackSettingsChangeAfterEvent` | Beta-only, and misnamed (`PackSettingChangeAfterEventSignal`). `world.getPackSettings()` itself is stable — poll and diff. |
| `CustomForm.image` grids | server-ui **2.2.0**, which has no stable release. `CustomForm` itself *is* stable in 2.1.0. |
| `minecraft:connection` trait is de-experimented (roadmap) | Learn's block-traits page, as of June 2026, says it **still requires the "Upcoming Creator Features" toggle**. The Fluidworks pipe uses its own boolean states instead. |
| Potion Bottling Line (Fluidworks §4.4) | **Cannot be built on 2.9.0.** Beyond the missing `getPotion`, there is no `ItemStack.createPotion` and `ItemPotionComponent` is read-only, so script cannot produce a potion of a chosen effect at all. |
| Read the weather from script (Fluidworks Rain Collector) | **No stable read exists.** `Dimension.getWeather` is beta-only; `setWeather` shipped without it. Track the stable `weatherChange` after-event; weather is unknown until it first changes. |
| Block geometry axes match world axes (implicit in the model generator and the pipe) | **x is mirrored.** Geometry +x renders on the world's west side; -z is still north. The pipe's arm bones are named for the world face they reach, so the east arm is authored on -x. See `block-geometry-results.md`. |
| `weatherChange` fires for a scripted `setWeather`, so the rain collector is testable headlessly | **It never fires on a headless server at all** — not for `setWeather`, not for the console's `weather rain`, and not with a SimulatedPlayer present. Measured with a module-scope subscription in the probe pack (`qolprobe` W1), which logs every event and needs no player. So `rain_collector` cannot pass headless and is a known failure; whether the collector works in a real session, where real weather cycles do fire the event, is still unconfirmed. The competing theory — that `ev.dimension`'s string did not match `Dimension.id` — is **wrong**, and editing `weather.ts` for it would have changed a shipped pack for nothing. |
| A SimulatedPlayer can place a block against any block a real player could (implicit in the Fluidworks placement tests) | **Not against one with a use action.** Clicking a cauldron's side with a funnel returns `useItemOnBlock` **true** and places nothing anywhere; sneaking is refused outright. Test against a non-interactive placement target instead — a pipe, by the pack's own `isPlacementTarget`. Whether a *real* player can place against a cauldron is still unconfirmed and is in the Fluidworks README. |
| A SimulatedPlayer can place blocks back to back | **No** — a second `useItemOnBlock` too soon after the first is refused. It was always the *second* placement failing, whichever block. Leave ~20 ticks between interactions. Also call `lookAtBlock` first and assert the return value, or a refusal surfaces later as a wrong-looking block state. |
| A `spawnEvent` runs *in addition to* `minecraft:entity_spawned` (implicit in the Hatchling tests' `spawnEntity(..., { spawnEvent })`) | **It replaces it.** Every group `entity_spawned` would add is silently dropped, so a hatchling spawned with a variant event had no `stage_0` (no scale) and no `wild` (no tameable). Measured side by side: plain spawn `tameable=true scale=0.55`, spawnEvent `tameable=false scale=undefined`. Spawn plainly, then `triggerEvent` the variant. |
| An entity event's effect is readable in the tick that triggered it | **No** — it lands on the next tick, so a same-tick `getProperty` sees the old value. Cost one Hatchling test a false failure. |
| `minecraft:pushable` controls whether a custom entity can be shoved | **Not in the entity schema.** Its presence makes the whole definition fail to load, so the entity simply does not exist. Removed from `turret_head`, `gravestone`, and again from both Hatchling entities — it keeps coming back, so check for it in any new entity. Use `minecraft:knockback_resistance` for the shoving. |
| A recipe needs only `pattern`, `key` and `result` | **1.20+ recipes require `unlock` data** or the engine rejects them outright. An item list is enough: `"unlock": [{ "item": "minecraft:egg" }]`. Hit on five recipes, then again on all three Hatchling egg recipes. |
| `minecraft:leashable` takes `soft_distance` / `hard_distance` / `max_distance` | **Those live inside a `presets` array now**, not at the top level. BDS ships `behavior_packs/vanilla`, so the current shape of any vanilla component is readable locally — `entities/horse.json` for this one. Better than a design doc. |
| A GameTest may build its rig anywhere in the structure volume (implicit in the all-air arena and `rig.floor()`) | **Test-relative `(0,0,0)` holds the test's structure block.** Writing it makes every later `Test` call throw "Could not find StructureBlockActor". `floor()` skips it; treat the `(0, *, 0)` column as reserved. See `gametest-structure-results.md`. |
| A script event knows who sent it (implicit in `fluidworks:rescan`'s `instanceof Player` guard) | **Only for a real player.** A command run by a `SimulatedPlayer` — or a server console — arrives with `sourceType` `Entity` and **no** `sourceEntity`, so the guard drops it. `fluidworks:rescan` now takes an optional `x y z` origin and logs its result. See `gametest-structure-results.md`. |
| The funnel's facing state might name the mouth rather than the spout (Fluidworks §3) | **It names the spout.** `funnel_makes_concrete` passes with the funnel set to "east" and the tank east of it. |
| A SimulatedPlayer is a player as far as other packs are concerned (implicit in every GameTest that drives a pack through one) | **No.** On headless BDS it marshals as `undefined` into any pack that does not itself bind `@minecraft/server-gametest` — every `getAllPlayers()` entry and every after-event `.player`. Graves, Hearthstone and Lens all throw `cannot read property 'id' of undefined` from the first simulated spawn onward. So `anchor_sets_spawn` fails for this reason, not a Hearthstone bug. See `gametest-structure-results.md`. |
| `getSpawnPoint()` is undefined for a player who has not slept (`hearthstone-spawn-results.md`, measured with a real player) | **True for a real player, false for a SimulatedPlayer** — it spawns with its own spawn cell already set. Hearthstone then correctly treats it as "foreign" and never touches it, so the test, not the pack, was wrong. `setSpawnPoint()` with no argument clears it. |
| A GameTest starts from a clean area (implicit in the all-air arena) | **Only for blocks.** Sequential tests stack one block apart and a structure reload restores blocks but not entities, item drops, or packs' position-keyed records. Both Bulwark "failures" were this. The harness now does `clearall` + a settle gap + `kill @e[type=item]`; a failing test is not evidence about a pack until it has also been run alone. |
| GameTest needs the interactive client (assumed while debugging by restart) | **No.** A dedicated server runs the same packs and puts the content log on stdout; `tools/bds/run.mjs` drives it. |
| A headless run needs a world someone toggled experiments on in the client (written here after finding `server.properties` cannot set them — **too strong a conclusion**) | **No.** `server.properties` still cannot, but `level.dat` is uncompressed little-endian NBT and a BDS-generated world already carries an `experiments` compound; writing `gametest: 1b` into it is enough (`tools/bds/enable-experiments.mjs`). The suite runs on a world no client has ever touched, which is what makes CI possible. See `gametest-structure-results.md`. |
| Experiments therefore need a world a person toggled in the client (implicit in the first headless setup) | **No.** The `experiments` compound in a world's `level.dat` can be written directly — `tools/bds/enable-experiments.mjs` adds `gametest: 1b` to the world BDS generates itself, and the next boot logs `Experiment(s) active: gtst`. That is what lets CI run the suite on `ubuntu-latest` with no world to copy. |
| A `SimulatedPlayer` is an ordinary player as far as permissions go (implicit in `guardian_void_catch`, which skips itself for an operator) | **No.** On a dedicated server it is an **operator**, so that test skips itself and reports a pass that measured nothing. `default-player-permission-level=member` does not change it. A green line from a test with a skip branch is not evidence. |
| `EntityTameableComponent.tame` / `tameToPlayer` to bond a pet from script (entities concept sheet §2) | **Not in 2.9.0.** The tameable component is read-only (`isTamed`, `tamedToPlayerId`, `getTameItems`); `tame()` and `tameToPlayer()` exist only on `EntityTameMountComponent`, for rideables. A pet is bonded the vanilla way: `minecraft:tameable` with `tame_items` and `probability` in the entity JSON, and script reads the owner back. |
| Jigsaw definitions live in `jigsaw_structures/`, `template_pools/`, `structure_sets/` with root key `minecraft:jigsaw_structure` (villages design v0.1, read off the JSON schemas) | **Wrong folders and key; loads nothing, silently.** The vanilla pack the server ships puts them under `worldgen/structures` (root key `minecraft:jigsaw`), `worldgen/template_pools`, `worldgen/structure_sets`, `worldgen/processors`, and a pool element's `location` is a path under `structures/`. Measured in `villages-jigsaw-results.md`; with the wrong key `place structure` says only `Invalid structure name`. |
| A structure file changed in the pack is what the world places next time (implicit everywhere a structure is iterated on) | **Not in a world that has already loaded it.** A structure template is cached per world at first use: after the village pieces had once been loaded without job posts, every later load of the same identifier returned the post-less template across restarts and pack changes, while the same bytes under a new identifier loaded correctly. Measured in `villages-jigsaw-results.md`. Iterate on a fresh world or a new identifier; what a Realm world first saw is what it keeps. |
| Block identifiers `minecraft:bricks`, `grass_block`, `cobblestone_stairs`, `oak_door`, `oak_fence_gate` (first drafts of the settlement blueprints) | **Java names.** Bedrock's are `brick_block`, `grass`, `stone_stairs`, `wooden_door` and `fence_gate`; a structure palette naming the Java ones would not load. Every blueprint block is checked against the vanilla `blocks.json`, and every state against Mojang's block metadata, when the viewer builds (`tools/viewer/vanilla.ts`); that is how these were caught. Doors take `minecraft:cardinal_direction`, not `direction`. |
| A food item can be recognised by `ItemStack.getComponent(ItemComponentTypes.Food)` (the Villages wage, first draft) | **Only data-driven foods carry it.** On BDS 1.26.45 bread has only `minecraft:compostable` and cooked beef has no components at all; an apple has `minecraft:food`. Every food has the `minecraft:is_food` item tag (`ItemStack.hasTag`), which is what the wage checks. Measured in `villages-jigsaw-results.md`. |
| "Whether `entityHurt` fires for void damage at all" (Guardian §6) | Answered at the typings: **there is no `void` in `EntityDamageCause` 2.9.0**, so the void cannot be matched by cause however the event behaves. The void catch is a teleport on its own switch, and `none` is left untouched so an unattributed source can never be cancelled into an endless fall. |

**[`design/bulwark-turret.md`](design/bulwark-turret.md)** — **Phase 2 built**
(block, paired entity, reconciliation, vanilla ranged AI, hopper ammo), not yet
measured in game; see `bulwark-turret-probe.md`. Additional corrections: the doc
treats the `on_kill` fix as good news for a turret, but that fix covers **melee
goals only**; `ranged_attack` is not in the list, so kills come from `entityDie`
in script. And `ranged_attack.attack_interval` did not replace the min/max pair
so much as join it — both load. What the doc misses and a turret needs is
`in_range_movement_mode: hold_position` and raising the default 30° head-rotation
caps. The lens half of that design shipped separately as `packages/lens`.

**[`design/fluidworks.md`](design/fluidworks.md)** — **Phases 1 and 3 built**
(funnel, Concrete Mixer, Rain Collector, fluid transfer, the four QOL Times
machines through the shared rules; pipes, Harvester, Collector, tank labels).
Phase 2, potions, is blocked - see the table. Its two open
questions are now answered: cauldron `fill_level` is **0–6** (not Java's 0–3), and
dyed water is fully round-trippable via `BlockFluidContainerComponent.fluidColor`.
But **potions are not** — there is `setPotion` and no `getPotion`, so you can set
a cauldron's potion and detect that one is present, never read back *which*.
Note also that QOL Times already implements four of its machines at the rules
layer (`packages/qol-times/scripts/core/rules/`).

**[`design/hatchling.md`](design/hatchling.md)** — **built** (Phase 1: egg,
warming, hatching, bonding, feeding, growth; the panel), written alongside the
implementation. One correction, in the table above: script cannot tame, so
bonding is the vanilla `minecraft:tameable` component with a tame item. Its
"to confirm in game" list is in the pack README; the probe pack has
`qolprobe:egg` and `qolprobe:pet`.

**[`design/graves.md`](design/graves.md)** — **built**, written alongside the
implementation rather than before it, so it carries no corrections. Its §5
lists what to measure in game; the probe pack has `qolprobe:death` for it.

**[`design/guardian.md`](design/guardian.md)** — **built** (Phases 1 and 2:
the damage table and the void catch; pets are Phase 3). Updated alongside the
implementation. One correction, in the table above: there is no `void` damage
cause. Its remaining "must prototype" items are measured by `qolprobe:hurt`
and listed in the pack README under "To confirm in game".

**[`design/hearthstone.md`](design/hearthstone.md)** — **built** (Phase 1). Its
"must prototype" list is resolved in `hearthstone-spawn-results.md`:
`getSpawnPoint()` really does return `undefined` for a player who never slept,
and non-Overworld anchors work — verified by dying in the Nether.

**[`design/waypoints.md`](design/waypoints.md)** — **built** (Phase 1 plus the
bed marker from Phase 2): `packages/shared/engine/waypoints.ts`, used by
Hearthstone for the bed and hearth markers and by Graves for the gravestone.
Nothing in it has been measured yet; its §4 "must prototype" list maps onto
`qolprobe:waypoint` in the probe pack, and each pack README says what to look
for. One deliberate divergence: the hearth marker stays while Hearthstone still
owns the player's spawn point, rather than clearing when they leave the anchor's
radius, because that is still where they will wake up.

## Proposals — not yet built

Written against the installed 2.9.0 typings, each with its own “must
prototype” list. In suggested order:

- [`design/waystones.md`](design/waystones.md) — placed teleport points; the
  other half of Hearthstone's tagline. A full design, verified against the
  installed typings, with the list of what moves into `packages/shared`
  first (its §8.3).
- [`design/harvest.md`](design/harvest.md) — interact a mature crop to harvest
  and replant.
- [`design/tidy.md`](design/tidy.md) — chest sort, deposit-all, item magnet.
- [`design/npcs.md`](design/npcs.md) — a concept sheet with models: four
  peoples (stonefolk, reedfolk, tinker, tallfolk) as one biped rig with
  different proportions, four job outfits each as texture variants with
  accessory bones, and the blueprint scheme that makes builders viable on the
  stable structure API. Sixteen atlases and four rigs under
  `concepts/entities/`; nothing run in game.
- [`design/settlements.md`](design/settlements.md) — where the peoples
  live: four settlement shapes, a catalogue of twenty blueprints (sizes,
  materials, roles), palette swaps, and how a builder raises one from a
  blueprint table on the stable structure API. Every blueprint is generated
  under `concepts/structures/` as a `.mcstructure` plus a preview the viewer
  draws in the game's block textures; nothing placed in a world.
- [`design/villages.md`](design/villages.md) — found villages of the four
  peoples, generated by Bedrock's data-driven jigsaw system from the
  settlement blueprints (checked against Mojang's published schemas), peopled
  by job blocks that tick, and a per-player standing system that ends in
  inviting a villager to the kids' own settlement. Revises the "no world
  generation" stance in `settlements.md`. Built so far in `packages/villages`:
  the generated villages, the posts that people them, and the four trades
  (§5.1: lumberjack, farmer, miner at a vein, fisher); measurements in
  `villages-jigsaw-results.md`.
- [`design/entities.md`](design/entities.md) — a concept sheet, not a design:
  custom entities (decoy dummy, patrol golem, runner, messenger, pack mule)
  with generated models under `concepts/entities/`, each with its own "must
  prototype" list. Becomes a design doc per entity when one is picked up, as
  the hatchling and its egg were (`design/hatchling.md`, `packages/hatchling`).

## Plans

Plans are records of intent at the time, like design docs; they are not
queues, and neither of these is current work.

- [`plans/program-roadmap.md`](plans/program-roadmap.md) — sequencing across all
  packs, and the monorepo/shared-library decision. Executed: four of its five
  milestones shipped, the fifth is #54.
- [`plans/lens-item-tiers-and-solver.md`](plans/lens-item-tiers-and-solver.md) —
  the Lens custom item, tiers, and the lighting solver. Built, apart from the
  consumable phase (#62).

## The pattern worth keeping

Every one of the findings documents exists because a design assumption was tested
before code was built on it. The probe pack (`packages/probe/`) is the tool: it is
`/scriptevent`-driven so it survives `/reload`, log-only unless a mutation is
explicitly armed, and it builds and restores its own test rigs.

That loop — question, probe, results doc, build against measurements — caught the
`total − sky` formula being wrong, the Nether roof reading as a dimension failure,
and `minecraft:block_entity` being a preview-only feature. Each would have been a
plausible-looking implementation that was quietly incorrect.

The GameTest pack (`packages/gametest/`) is the other half of the loop: once
behaviour is built, an in-game test pins it. It runs on Mojang's GameTest
framework, which needs the Beta APIs experiment, so it lives in a throwaway
world and is never packaged. Probe first to learn what the engine does; test
afterwards so it keeps doing it. `/gametest runset qol` runs every test.
