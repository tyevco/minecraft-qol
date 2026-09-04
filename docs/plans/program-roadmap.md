# Bedrock addon program — monorepo, then the spawn-proofing Lens

> **Executed; kept as the record of why the repo is shaped this way.** Written
> before the monorepo existed. Milestones 1, 3, 4 and 5 shipped as
> `packages/lens`, `hearthstone`, `fluidworks` and `bulwark`; milestone 2 is
> issue #54. The corrections table below was folded into `docs/README.md`,
> which is the live copy. Nothing in this document is a queue: open work is
> in the GitHub issues.

## Context

Three design docs propose three new products beyond the existing QOL Times pack:
**Fluidworks** (fluid logistics), **Bulwark** (turrets + a spawn-proofing lens),
and **Hearthstone** (respawn anchors). All three assume a shared substrate:
custom blocks with per-block persistent config, a chunk-keyed world index, and
`CustomForm` config UI.

We verified every load-bearing API claim against the typings installed in the
repo (`@minecraft/server` 2.9.0, `@minecraft/server-ui` 2.1.0) plus the RC and
beta packages, and against Mojang's update notes. **Most of the docs check out.
One claim does not, and it reshapes two of the three designs.**

Decisions taken: one monorepo with a shared library; build the **Lens first as
its own pack**; store per-block config in **stable world properties behind a
narrow interface designed to migrate**; configure via **pack settings**.

---

## The finding that changes the plan

**`minecraft:block_entity` with `dynamic_properties` is still EXPERIMENTAL in
26.45 retail.** The docs' line — *"no longer requires the experimental toggle
from format version 1.26.20 onward, as of the 26.50 preview line"* — is literally
true and practically misleading: **26.50 has not shipped to retail.** 26.44/45
was a hotfix on the 1.26.40 line. Confirmed three ways: the 1.26.30 note that
introduced it as experimental, the 1.26.40 notes still discussing it only under
*Experimental Technical Updates*, and `BlockDynamicPropertiesComponent` existing
**only** under the `minecraft-bedrock-experimental` doc moniker.

Consequences:

- **`carry_over_block_entity_data` is experimental and was never released**, not
  even in the 26.50 preview line. So Fluidworks' design principle §2.6 —
  *"Config survives the pickaxe"* — **cannot ship in 26.45 at all.**
- Per-block config for the funnel, turret and anchor must use **world dynamic
  properties keyed by dimension+location**. QOL Times already proves this pattern
  in `scripts/dispenser/rigRegistry.ts`. We own invalidation on break, piston,
  explosion and `/fill`, and config cannot ride along on the dropped item.
- Custom block **containers** (`block_entity.container`) are experimental in
  Preview 26.50.26 only. Block-entity **ticking** has not shipped anywhere.

Also corrected, and worth fixing in the docs themselves:

| Doc claim | Reality |
| --- | --- |
| `floodSearch` with `directionMask` (Fluidworks §6.4) | **Does not exist.** Zero hits in stable, RC *and* beta, and absent from the experimental docs. Not beta-gated — never existed. Implement flood fill in a `system.runJob` generator. |
| `onPlayerDestroy` custom-component callback | Wrong name — it is **`onPlayerBreak`** in v2. |
| `minecraft:custom_components: ["ns:foo"]` array | That is Custom Components **V1**, now deprecated. V2 registers as `"components": { "ns:foo": {} }`. |
| `Player.persistentId` for ownership | **Beta-only.** Mint our own id into a player dynamic property on `playerSpawn` where `initialSpawn === true`. |
| `PackSettingsChangeAfterEvent` | Beta-only, and misnamed — it is `PackSettingChangeAfterEventSignal`. **Poll `world.getPackSettings()` and diff.** |
| `CustomForm.image` grids (both docs' upgrade/filter UIs) | server-ui **2.2.0**, which has no stable release at all. Use `ActionFormData` button icons, or glyphs. |
| `on_kill` now fires correctly (Bulwark §3.1) | True for melee goals, but **`ranged_attack` is not in the fixed list**. A ranged turret needs a script-side kill hook. |
| Cauldron potion identity | `setPotion()` exists but **there is no `getPotion`**. You can set a potion and detect that one is present, never read back *which*. Must shadow it ourselves. |

**Confirmed stable and safe to build on:** `CustomForm` / `MessageBox` /
`Observable*` / `uiManager` (the whole DDUI surface minus `image`), `TextPrimitive`
+ `PrimitiveShapesManager`, `LocationWaypoint` + `LocatorBar` + the
`playerWaypoints` game rule, `clientSystemInfo` / `GraphicsMode` / `MemoryTier`,
`LootTableManager.generateLootFromBlock`, `getSpawnPoint` / `setSpawnPoint`
(takes a `DimensionLocation`, returns `undefined` when unset),
`playerSpawn.initialSpawn`, the entire custom-block-component pipeline, the whole
turret entity stack, `world.getPackSettings()`, and the `minecraft:connection`
trait (de-experimented in 1.26.0 — the pipe visual is real and shippable).

---

## Program roadmap

Sequenced so each milestone ships something complete and de-risks the next.

| # | Milestone | Why here |
| --- | --- | --- |
| **1** | **Monorepo + Lens pack** | Lens needs only `getLightLevel`, which is stable. No custom block, so it dodges every block-entity question. Ships standalone and proves the multi-pack build. |
| 2 | Finish QOL Times | Small. Bottles/dye/wash are built and unit-tested but unverified in game; the two parity features need a handler refactor. |
| 3 | Hearthstone | Smallest custom-block product. Validates the storage interface and block pipeline on something whose core (`setSpawnPoint`) is fully stable. |
| 4 | Fluidworks phase 1 | Funnel + Concrete Mixer. Largest surface; wants the storage interface proven first. Reuses QOL Times' cauldron rules (see overlap below). |
| 5 | Bulwark turret | Depends on entity/block reconciliation, the riskiest unproven assumption in any of the docs. |

**Overlap worth knowing now:** QOL Times already implements four of Fluidworks'
machines at the rules layer — Snow Harvester fully, Wash Station for leather and
wolf armour, Bottling Line for water only, and the *charging* half of the Dye Vat.
`scripts/core/rules/*.ts` contain no dispenser references and transfer nearly
verbatim; the coupling is entirely in `types.ts` (`Residue` models return-to-source
rather than emit-to-destination, and `addDye?: string` leaks an engine call name
into a pure type). Generalising that is type surgery, not a rewrite — schedule it
in milestone 4, not now.

---

## Milestone 1 — in depth

### 1a. Monorepo restructure

```
packages/
  shared/
    core/        pure logic, no @minecraft imports  <- the vitest target
    engine/      safeBlock, blockIndex, storage, settings, commands
  qol-times/     behavior_pack/ + scripts/ + tests/   (moved, unchanged)
  lens/          behavior_pack/ + scripts/
  probe/         the throwaway diagnostic pack, finally with a home
dist/<pack>/     per-pack output
```

**The one real blocker.** `copyTask` from `@minecraft/core-build-tasks` reads
`PROJECT_NAME` from `process.env` *inside* the returned closure, so the deploy
destination is a process global — you cannot deploy two packs from one
`just-scripts` process. `cleanCollateralTask(STANDARD_CLEAN_PATHS)` has the same
problem, and `cleanTask(DEFAULT_CLEAN_DIRECTORIES)` wipes all of `dist/`, so a
per-pack build would destroy its siblings' output.

Fix: replace both with a local `deployPack(name, sources)` built on `copyFiles`
and `getGameDeploymentRootPaths`, both already exported by the package. ~15 lines,
no env dependency. Then `just.config.ts` becomes a loop over a `PACKS` array
registering `bundle:<pack>`, `deploy:<pack>` and `mcaddon:<pack>` tasks.

Also: point `dist/` per pack; widen `tsconfig` `include` to `packages/**/*` and
vitest to `packages/**/tests/**/*.test.ts`; wire `@qol/shared` via esbuild's
`alias` option (already available, currently unused) plus a tsconfig path; and
**generate fresh UUIDs per pack** — reusing QOL Times' would make the packs
mutually exclusive in game.

Keep `external: ["@minecraft/server", "@minecraft/server-ui"]` per pack and in
lockstep with each manifest's `dependencies`; a mismatch fails at runtime with no
build error. Keep `dropLabels: ["DEBUG"]` — currently unused and worth adopting.

### 1b. Shared library — extract only what is proven

Move to `packages/shared/engine/`, generalising as we go:

- **`safeBlock.ts`** — from `scripts/dispenser/geometry.ts`. Extract the whole
  three-layer pattern as `withBlock(dim, loc, fn)`, not just the getter: every
  real call site does `safeGetBlock` → `isValid` → a *separate* try/catch around
  permutation access, because the chunk can vanish mid-scan.
- **`blockIndex.ts`** — generalised from `rigRegistry.ts`. Roughly 40 of its 193
  lines are generic. Three additions the docs require and it lacks: **chunk
  keying** (it currently stores every rig in one property, which will hit the
  per-property cap), a **schema version field**, and a **tick budget** (it polls
  every tick, unyielded). Keep its eviction policy verbatim — *skip* unloaded
  chunks but *evict* only on type mismatch is subtle and easy to get backwards.
- **`storage.ts`** — new. The narrow per-block-config interface:
  `get(dim, pos)` / `set(dim, pos, data)` / `remove(dim, pos)`, backed today by
  location-keyed world properties. This is the seam that swaps to real block
  entities when 26.50 lands; nothing else should know how config is stored.
- **`settings.ts`** — keep `store.ts`'s facade (`isEnabled(id)`), re-backed by
  `world.getPackSettings()` with a low-frequency poll-and-diff. Its call site in
  QOL Times is one line, so the swap touches nothing else.
- **`commands.ts`** — parameterise `registerCommands(namespace, specs, log)`.
  Carry over all four hard-won behaviours: namespaced name or `NamespaceNameError`;
  `cheatsRequired: false` explicitly; defer `form.show()` via `system.run` since
  callbacks are read-only; log registration success *and* failure.

**Do not** move the container-diff machinery (`proveDispense`, `snapshotContainer`,
`MAX_SNAPSHOT_AGE`, `wasTriggered`). It exists because `entitySpawn` gives only
circumstantial evidence, and it has no analogue in a funnel- or block-driven
design. Leave it in QOL Times.

### 1c. The Lens

**Mechanic.** Toggle an overlay that marks nearby positions where hostile mobs
can spawn. Two modes: **danger** (mark spawnable) for base-proofing, **safe**
(mark non-spawnable) for farm building.

**v1 deliberately ships no custom item.** A custom item needs a resource pack for
its texture and name, and this repo has never built one — `copyToResourcePacks` is
omitted from `just.config.ts`. Instead: `/lens:toggle` via the stable custom
command registry, plus an optional `world.afterEvents.itemUse` hook on a vanilla
spyglass. Zero resource pack, ships immediately. Promote to a real custom item in
a later phase, where `ItemCustomComponent.onUse` is stable and waiting.

**Sampling.** `dimension.getLightLevel(location)` and `getSkyLightLevel(location)`
take a `Vector3` directly — no need to materialise a `Block` per position, which
matters a lot at this volume. Candidate test per position:

1. the position and the one above are non-solid (2 blocks of headroom), and
2. the block below has a solid full top face, then
3. the light test.

Walk the volume inside a `system.runJob` generator, yielding every N positions so
a 16-radius scan spreads across frames instead of spiking the watchdog.

**Rendering: particles, not `TextPrimitive`.** `PrimitiveShapesManager` has a
`maxShapes` cap, and a 16-radius scan produces thousands of marks. Use
`dimension.spawnParticle`. Re-scan on a debounce — when the player moves more than
N blocks, or every N ticks, whichever is later.

**Scale down on weak devices** via `clientSystemInfo.memoryTier` and
`Player.graphicsMode` (both stable): smaller radius and sparser marks on mobile.

**Pack settings** (manifest `format_version` 3, plus a `metadata.authors` value —
there is a known temporary requirement that v3 manifests set one): radius default
and maximum, marker density, and a mode default. Four control types are stable:
`label`, `toggle`, `slider`, `dropdown`. **Not** `multiselect` — that is preview-only.

### 1d. Probe first — the one real unknown

`getLightLevel()` returns **total brightness**; `getSkyLightLevel()` returns the
**sky** component. Hostile spawning keys off **block** light, and sky light does
not prevent night spawns. Whether block light is recoverable as
`total − sky`, or whether total is already the effective `max(block, sky·darken)`,
is not documented and determines whether the Lens is correct or merely plausible.

Extend `probe_pack` (it already has the `/scriptevent` + log-only + armed-mutation
shape) with `qolprobe:light`, dumping both values at the player's position. Measure
four known configurations — enclosed dark, enclosed torch-lit, open sky at noon,
open sky at midnight — then verify the derived predicate against where mobs
actually spawn overnight in a test pen. Fifteen minutes, and it is the difference
between a tool players trust and one they don't.

---

## Verification

**Unit (no game).** Vitest over `packages/shared/core`. The Lens's spawn predicate
is pure — `(lightTotal, lightSky, blockBelowSolid, headroom) → spawnable` — so it
tests exhaustively with no mocks. Reuse the property-based style already in
`tests/rules.test.ts`, which brute-forces every rule × state × item triple.

**Build.** `npm test`, then `npx tsc --noEmit`, then build and deploy **both**
packs and confirm each lands in its own folder under
`%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang\development_behavior_packs`
— and that building one no longer wipes the other's `dist/`. Then `npm run mcaddon`
per pack.

**In game.** A new pack folder needs a **full game restart** to be seen (not
`/reload`, not even re-entering the world) — expect to enable one pack at a time
while iterating. Verify QOL Times still works unchanged after the move, then run
the light probe, then check the Lens against a real dark cave and a lit base.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Block-light semantics make the Lens subtly wrong | Probe before building; the predicate is pure and cheap to correct |
| Monorepo refactor breaks working QOL Times | Move it first with no behaviour change, re-verify in game, commit; only then add Lens |
| `copyTask` env workaround depends on library internals | Replace it outright with `copyFiles` rather than mutating `process.env` between tasks |
| 26.50 reaches retail and block entities become available | The `storage.ts` seam is exactly one adapter file plus a migration; version the schema from the first commit — a format change already destroyed saved block properties once |
| Particle volume tanks frame rate on weak devices | Scale radius and density from `memoryTier` / `graphicsMode` from day one |
| Shared code drifts onto a beta API and drags every pack along | Keep beta-dependent code inside the pack that needs it, never in `packages/shared` |
