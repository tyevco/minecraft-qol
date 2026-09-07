# QOL GameTests — dev only

In-game regression tests for every pack in the repo, on Mojang's GameTest
framework. **Never ships**: `@minecraft/server-gametest` has no stable
release, so this pack needs the **Beta APIs** experiment and a throwaway
world. `npm run mcaddon` skips it (`devOnly` in `just.config.ts`).

Unit tests (`npm test`) cover the pure layers with no game. These cover the
other half — *does the dispenser actually fill the cauldron* — and double as
diagnostics: a failing test prints what it saw, which is often the answer to
one of the "to verify in game" items in a pack README.

## Running

1. A flat creative world with **Beta APIs** on. Enable this pack **and** the
   packs under test — every shipped pack has tests here now: QOL Times, Lens,
   Hearthstone, Graves, Guardian, Fluidworks, Bulwark, Hatchling, Villages and
   Builder. `npm run deploy` puts them all in `development_behavior_packs`.
2. `/gametest runset qol` runs everything; `/gametest run qol:<name>` runs one.
   Results appear in chat and the content log (`[QOL GameTests]`).

## Running without the client — and in CI

A dedicated server loads the same packs and puts the content log on stdout, so
the suite runs with no client, no Realm and nobody watching:

```
npm run bds:setup                              once: server, packs, world
npm run bds:test                               the whole suite
npm run bds:test -- funnel_makes_concrete      one test
npm run bds:test -- --list                     what would run
```

`bds:setup` downloads the server, deploys every pack into it, generates a world
and turns the Beta APIs experiment on in that world's `level.dat` — experiments
cannot be set from `server.properties`, but they do not need a client-made world
either. Details and the measurements behind each step are in
[`../../docs/gametest-structure-results.md`](../../docs/gametest-structure-results.md).

`bds:test` runs **what is deployed**, and deploys nothing itself: after editing
a suite, re-run `npm run bds:setup` (it re-deploys every pack and keeps the
world) or the server answers `Could not find test with name` for anything new.

`bds:test` reads the test list out of the suite sources, sends the tests **one at
a time** (`runset` fans them across hundreds of blocks and the far ones land in
unloaded chunks with no player online), and judges the run:

- a test that fails is **re-run alone, up to twice**, before it is believed,
  because sequential tests contaminate each other. `turret_break_returns_arrows`
  does this most runs: 20 arrows in the sequence, 10 alone;
- a test in `known-failures.json` may fail — that file carries the reason. One of
  them **passing** fails the run, since the reason has expired;
- a test that reports nothing at all fails the run;
- script errors are counted, and the count should sit near zero: the packs
  skip the `undefined` a simulated player marshals as (issue #31), so a line
  in the count is a real error somewhere.

A test that needs a simulated player's action to have landed waits on the
world with `until(test, ready)` from `rig.ts`, not on a fixed number of ticks
(issue #29): `funnel_places_into_clicked_tank` and `pipes_join_when_placed`
failed four times each in a slow container on a fixed `idle` and passed on CI.
The engine's own gap between two of a simulated player's interactions (about
twenty ticks; a second one too soon is refused) is the one fixed wait left,
since nothing in the world says when it has passed.
- script errors are printed but do not fail the run on their own: a simulated
  player makes Graves, Lens, Guardian and Hearthstone throw on every spawn, which
  is the harness, not those packs.

`.github/workflows/gametest.yml` runs exactly that on every pull request that
touches a pack, and uploads the content log as an artifact either way.

| Test | Pack | What it settles |
| --- | --- | --- |
| `dispenser_fills_cauldron` | QOL Times | The interceptor end to end, including the documented "first dispense registers" cost. |
| `funnel_makes_concrete` | Fluidworks | The flagship rig, and **whether `facing_direction` is the spout's direction** — a failure here answers the orientation question. |
| `funnel_fills_from_source` | Fluidworks | Water source → tank, one level per cycle. |
| `rain_collector` | Fluidworks | Down-facing funnel under open sky in rain; also `getTopmostBlock`. |
| `funnel_through_pipes` | Fluidworks | A source, a funnel, three pipes with a corner, a tank at the far end. |
| `harvester_funnel` | Fluidworks | Mature wheat at the mouth is harvested into a chest and replanted at growth 0; also the `growth` state name and the loot manager. |
| `collector_funnel` | Fluidworks | Cobblestone dropped by an open mouth ends up in the chest, and the item entity is gone. |
| `death_keeps_items` | Graves | Items survive death in the inventory or in a gravestone — accepts either, since the panel decides, and prints which. Fails only if they dropped. |
| `guardian_never_adds_damage` | Guardian | Three `applyDamage` hits (attack, fall, lava) on a simulated player; prints what each cost against what was proposed, and fails only if a hit cost **more**. The printed numbers are the role × cause table measured. |
| `guardian_void_catch` | Guardian | **Expected to fail normally — see below.** A simulated player with a known footing is dropped below the dimension floor and must come back alive. Skips itself if the simulated player is an operator, whom the switches never touch. |
| `anchor_sets_spawn` | Hearthstone | **Expected to fail normally — see below.** A placed anchor gives a spawn-less player a spawn point beside it. |
| `turret_grows_head` | Bulwark | A placed turret grows exactly one head entity in its socket. |
| `turret_replaces_killed_head` | Bulwark | Removing the head regrows exactly one, after the block's grace period; never two. |
| `turret_drains_feeding_hopper` | Bulwark | A hopper facing into the turret is emptied into its ammo buffer. |
| `turret_break_returns_arrows` | Bulwark | Breaking the base removes the head and drops the buffered arrows; also whether `destroyBlock` reaches `onBreak`, or the sweep has to catch it. |
| `dispenser_first_pulse_is_vanilla` | QOL Times | The anti-mint proof's price, asserted: the first pulse at a rig the pack has never seen changes nothing. Every other dispenser test pulses twice because of this. |
| `dispenser_fills_from_water_bottle` | QOL Times | A water bottle adds Bedrock's **two** levels and leaves a glass bottle; also that a script-built `minecraft:potion` really carries the `minecraft:water` effect the rule matches on. |
| `dispenser_bottles_water_from_cauldron` | QOL Times | The reverse, and the half that could mint: a glass bottle takes two levels out and comes back a water bottle. |
| `dispenser_dyes_the_water` | QOL Times | A dye reaches `addDye`, the colour moves, the level does not, and the dye is consumed. |
| `dispenser_washes_leather` | QOL Times | **Expected to fail — a known failure with the reason.** Washing costs one level and clears the dye **in place**. Unreachable headlessly: script cannot build a dyed leather item (no `minecraft:dyeable` component) and a simulated player cannot dye one on a cauldron either. |
| `dispenser_leaves_undyed_leather_alone` | QOL Times | The half that is reachable, and the rule's instinct: nothing to wash off costs no water. |
| `dispenser_refuses_to_overfill` | QOL Times | Rule 4 at its smallest: a cauldron with room for one level refuses a two-level bottle instead of swallowing it. |
| `lens_sealed_dark_cell_is_spawnable` | Lens | The reading the whole overlay reduces to: sky 0 and total 0 in a sealed box, so `blockLight` is exact and `classify` says spawnable. |
| `lens_a_torch_makes_a_cell_safe` | Lens | One step from a torch reads 13, and the same position flips to safe. |
| `lens_torch_light_falls_one_per_step` | Lens | Light down a sealed corridor is `EMISSION - d` at every step — the flood-fill model every tier 2 torch suggestion is placed by, rather than a radius. |
| `lens_surface_flags_match_the_engine` | Lens | `isLiquidBlocking(Water)` for dirt, a bottom slab, glass, a torch and water, against the three predicates in `core/surface` — the table in its header, asserted. |
| `lens_dark_glass_floor_is_not_spawnable` | Lens | The deny list end to end: an unlit position on glass is safe because nothing can stand there. |
| `lens_tier_survives_a_container_round_trip` | Lens | An item dynamic property and its lore survive a chest and an equipment slot, which is the write-back the upgrade ritual depends on. |
| `keep_on_death_stops_the_drop` | Graves | **Expected to fail — a known failure with the reason.** The substrate: a flagged stack survives death while an unflagged control does not. On a server **both** survive, so the control is what fails — which is also why `death_keeps_items` is green for a reason that is not Graves working. |
| `gravestone_holds_a_full_inventory` | Graves | The stone has at least the 36 + 5 slots `planTransfer` may need, keeps what is put in it, and refuses damage. |
| `guardian_causes_match_the_engine` | Guardian | The hand-written `CAUSES` table against `EntityDamageCause` itself, both ways, plus every hazard switch's members — the drift a pure table cannot notice. Also that there is still no `void` cause. |
| `guardian_hurt_event_softens_and_cancels` | Guardian | On a cow, so the pack's own player filter cannot interfere: a reduced `ev.damage` is honoured and `ev.cancel` stops the hit. Without those two writes every scale on the panel is decoration. |
| `hearthstone_spawn_point_is_honoured` | Hearthstone | The mechanic itself, at last: a spawn point set from script is where vanilla respawn puts the player. `anchor_sets_spawn` measures the harness; this measures the engine. |
| `hearthstone_spawn_point_out_of_the_world_throws` | Hearthstone | `setSpawnPoint` below the dimension floor throws, so the pack's catch is not dead code. |
| `hearthstone_anchor_places_a_player_beside_it` | Hearthstone | The anchor block loads at all (a custom block whose JSON fails is silently air), and `chooseRespawn` against real blocks picks a standable neighbour, never the anchor's own cell — and refuses when walled in. |
| `hatchling_shell_cracks_while_warming` | Hatchling | Each `crack_N` moves the shell, keeps the variant, and does not hatch the egg early — the only feedback a player gets during a half-hour warming. |

## Three tests measure nothing, in three different directions

`guardian_void_catch`, `anchor_sets_spawn` and `death_keeps_items` **do not
measure their packs in a normal run, and none of the three results is a
regression.** Read them as "not measured", never as "the pack is broken":
Guardian and Hearthstone are proven correct in
[`../../docs/gametest-structure-results.md`](../../docs/gametest-structure-results.md),
and Graves' substrate is on the in-game list.

The third is the newest and the most quietly misleading, because it is green.
`death_keeps_items` asks whether a dead simulated player's items survived —
and on a headless server **a simulated player's items always survive**, flagged
or not, with `keepinventory` reading 0 in the world's `level.dat`. That is what
`keep_on_death_stops_the_drop` established, by carrying an unflagged control
stack beside the flagged one and watching both come back; it is a known failure
for that reason, and its failure is the honest version of the other test's
pass.

A `SimulatedPlayer` marshals as `undefined` into every pack that does not itself
bind `@minecraft/server-gametest`, so Guardian's `getAllPlayers()` sweep never
sees the faller and Hearthstone never sees the anchor's placer.

`anchor_sets_spawn` therefore **fails**, and is listed in `known-failures.json`
with that reason.

`guardian_void_catch` **passes, vacuously**, which is worse. On a dedicated
server a `SimulatedPlayer` is an operator, and the test's own first branch skips
itself for an operator — whom the switches never touch — so it prints
"nothing to measure" and succeeds. Measured on BDS 1.26.45.1: it passes in
seconds, while Guardian's sweep is still throwing `cannot read property 'name' of
undefined` in the same log. A green line here is not evidence.

They are kept because each is a genuine full-path test, and they are worth
running deliberately when changing those paths. To run one: temporarily add
`@minecraft/server-gametest` to that pack in **all three** places — the
manifest's `dependencies`, its `external` list in `just.config.ts`, and a
side-effect `import` in its `main.ts` (the declaration alone does nothing; the
bundle must actually reference the module) — then **revert all three**. That
module is a Beta API. It flags the pack experimental, and the Realm keeps its
achievements, so it must never ship.

Under that binding both pass, which is how the packs were cleared.

The binding is not a cure-all, and it is worth trying before assuming it is one:
`funnel_places_into_clicked_tank` and `pipes_join_when_placed` failed the same
way with Fluidworks bound as without it. What they were actually finding was the
**host**: both pass on a CI runner and fail in a slow container, along with
`harvester_funnel`. All three give a simulated player five ticks to act. Before
reading a failure from one of them as a fact about a pack, run it somewhere
faster.

## How the rigs work

Every test uses the same all-air structure (`structures/qol/arena.mcstructure`,
8×8×8, generated by `npm run structures` from `tools/structures`) and builds
its rig with `setBlockType` / `setBlockPermutation`, so the rig is readable in
the suite file. Blocks a test places do not fire `playerPlaceBlock`, so a test
that needs the pack to notice a block either has a simulated player place it
(Hearthstone) or asks the pack to rescan (`/scriptevent fluidworks:rescan`,
which is also the escape hatch after `/fill` or a piston).

Two entities ship in this pack's `behavior_pack/entities/` for the Bulwark
Phase 3 prototypes (`suites/bulwark_ammo.ts`): `qol:shooter_rig`, a
stationary shooter with one component group per thing under test (a tint, a
fire rate, a `shooter.power`, the witch's per-target list, a custom
projectile), and `qol:bolt`, that projectile. They exist so the engine's
`minecraft:shooter` can be measured without touching the shipped turret
head; a `rig_*` test swaps groups with `triggerEvent` the way the turret
swaps `bulwark:arm`.

## Adding a test

`registerAsync("qol", "<name>", async (test) => { ... }).structureName(STRUCTURE).maxTicks(n)`
in a file under `scripts/suites/`, imported from `main.ts`. Prefer
`succeedWhen` with `assert`s carrying the observed value in the message, so a
failure is a measurement rather than a shrug.
