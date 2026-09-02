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
- [`backlog.md`](backlog.md) — deferred work with enough context to pick up cold.

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

**[`design/bulwark-turret.md`](design/bulwark-turret.md)** — not yet built.
Additional correction: the doc treats the `on_kill` fix as good news for a turret,
but that fix covers **melee goals only**; `ranged_attack` is not in the list, so a
ranged turret needs a script-side kill hook.

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

**[`design/graves.md`](design/graves.md)** — **built**, written alongside the
implementation rather than before it, so it carries no corrections. Its §5
lists what to measure in game; the probe pack has `qolprobe:death` for it.

**[`design/hearthstone.md`](design/hearthstone.md)** — **built** (Phase 1). Its
"must prototype" list is resolved in `hearthstone-spawn-results.md`:
`getSpawnPoint()` really does return `undefined` for a player who never slept,
and non-Overworld anchors work — verified by dying in the Nether.

## Proposals — not yet built

Written against the installed 2.9.0 typings, each with its own “must
prototype” list. In suggested order:

- [`design/guardian.md`](design/guardian.md) — per-role damage scaling and
  safety switches, on the stable `entityHurt` before-event. Pets in phase 3.
- [`design/waypoints.md`](design/waypoints.md) — locator-bar markers for your
  bed, gravestone and Hearthstone; a shared module, not a pack.
- [`design/waystones.md`](design/waystones.md) — placed teleport points; the
  other half of Hearthstone's tagline. A full design, verified against the
  installed typings, with the list of what moves into `packages/shared`
  first (its §8.3).
- [`design/harvest.md`](design/harvest.md) — interact a mature crop to harvest
  and replant.
- [`design/tidy.md`](design/tidy.md) — chest sort, deposit-all, item magnet.

## Plans

- [`plans/program-roadmap.md`](plans/program-roadmap.md) — sequencing across all
  packs, and the monorepo/shared-library decision.
- [`plans/lens-item-tiers-and-solver.md`](plans/lens-item-tiers-and-solver.md) —
  the Lens custom item, tiers, and the lighting solver.

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
