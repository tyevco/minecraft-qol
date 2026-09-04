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
   packs under test (QOL Times, Fluidworks, Graves, Guardian, Hearthstone, Bulwark). `npm run
   deploy` puts them all in `development_behavior_packs`.
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

`bds:test` reads the test list out of the suite sources, sends the tests **one at
a time** (`runset` fans them across hundreds of blocks and the far ones land in
unloaded chunks with no player online), and judges the run:

- a test that fails is **re-run alone, up to twice**, before it is believed,
  because sequential tests contaminate each other. `turret_break_returns_arrows`
  does this most runs: 20 arrows in the sequence, 10 alone;
- a test in `known-failures.json` may fail — that file carries the reason. One of
  them **passing** fails the run, since the reason has expired;
- a test that reports nothing at all fails the run;
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

## Two tests measure nothing, in opposite directions

`guardian_void_catch` and `anchor_sets_spawn` **do not measure their packs in a
normal run, and neither result is a regression.** Read both as "not measured",
never as "the pack is broken": both packs are proven correct in
[`../../docs/gametest-structure-results.md`](../../docs/gametest-structure-results.md).

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

## Adding a test

`registerAsync("qol", "<name>", async (test) => { ... }).structureName(STRUCTURE).maxTicks(n)`
in a file under `scripts/suites/`, imported from `main.ts`. Prefer
`succeedWhen` with `assert`s carrying the observed value in the message, so a
failure is a measurement rather than a shrug.
