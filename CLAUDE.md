# CLAUDE.md

Guidance for agents working in this repo. Read `docs/README.md` next: it says
which documents to trust, and lists the design-doc claims that turned out to
be false.

## What this is

A monorepo of Minecraft Bedrock add-ons for a family Realm, built on the
**stable** scripting API only (`@minecraft/server` 2.9.0, `@minecraft/server-ui`
2.1.0, `min_engine_version` 1.26.40). No experimental toggles in anything that
ships, ever: the Realm keeps achievements and is never flagged experimental.
The one exception is `packages/gametest`, which needs the Beta APIs experiment
and is marked `devOnly` so it can never be packaged.

Packs: `qol-times` (dispensers use cauldrons), `lens` (spawn-proofing overlay),
`hearthstone` (respawn anchors), `graves` (item preservation on death),
`guardian` (per-role damage scaling and safety switches),
`fluidworks` (funnels and tanks), `bulwark` (turret: block, head, hopper ammo),
`hatchling` (a pet dragon: egg, warming, hatching, feeding, growth),
`probe` (throwaway diagnostics), `gametest` (in-game tests). Shared code is
under `packages/shared`.

## Hard rules

1. **Verify every API claim against the installed typings** before building
   on it: `node_modules/@minecraft/server/index.d.ts`. Several design docs
   were written from preview builds; the corrections table in `docs/README.md`
   exists because of that. If a thing is not in the stable `index.d.ts`, it
   does not exist for us. Beta-only things we have hit: `Dimension.getWeather`,
   `Player.persistentId`, block entities and block containers, the
   `minecraft:connection` trait, `PackSettingChangeAfterEvent`,
   `CustomForm.image`.
2. **`core/` is pure.** Nothing under any `scripts/core/` or
   `packages/shared/core/` may import `@minecraft/*`. That is what makes it
   testable under Vitest with no game and no mocks. Engine-facing code goes in
   `engine/`. Put the decision in `core/` and the mutation in `engine/`.
3. **Configure from the settings panel, not commands.** Format-version-3
   manifests carry a `settings` section (label, toggle, slider, dropdown);
   script reads it with `world.getPackSettings()` through
   `packages/shared/engine/packSettings.ts` (poll and diff; the change event is
   beta). Behaviour-pack settings are per world, so "per player" means **per
   permission role** (visitor / member / operator). The only script events
   are `<pack>:debug` diagnostics and explicit escape hatches like
   `fluidworks:rescan`.
4. **Fail towards the player keeping their things.** Plan every mutation
   before performing any; consume inputs before producing outputs; drop as
   the last resort rather than lose. Read Graves' `placeGrave` and Fluidworks'
   `execute` for the shape.
5. **Generated assets are never hand-edited.** Textures, geometry,
   animation sets and GameTest structures come from `tools/` via
   `npm run assets`, and are committed. A changed PNG, `.geo.json` or
   `.animation.json` in a diff must correspond to a change under `tools/`.
   (The two particle-only idle animations in Bulwark and Graves predate the
   animation generator and are still hand-written.)
6. **Per-block state lives in a world dynamic property keyed by position**
   (`packages/shared/engine/positionIndex.ts`), registered on
   `playerPlaceBlock` and removed on `playerBreakBlock`, with a schema version.
   Evict a row on type mismatch; skip, never evict, an unloaded chunk.

## Commands

```
npm test              vitest over every pure layer; no game needed
npx tsc --noEmit      typecheck, including tools/
npm run build         typecheck + esbuild bundle per pack into dist/<pack>/
npm run assets        regenerate textures, models, animations and GameTest structures
npm run deploy        build, then copy packs into development_behavior_packs
npm run mcaddon       .mcaddon per shipped pack (dev-only packs excluded)
```

`npm run lint` fails on every branch: the repo has no ESLint config. Not yours
to fix in passing. The repo is **not** Prettier-formatted at Prettier's
defaults either, so do not run `prettier --write` over existing files; it
reflows them and buries your change.

## Adding or changing a pack

- One entry in the `PACKS` array in `just.config.ts`. Its `external` list and
  the manifest's `dependencies` must stay in lockstep; a mismatch fails at
  runtime with no build error. `hasResourcePack` if it ships one; `devOnly`
  if it must never be packaged.
- Fresh UUIDs for every pack and module. Reusing one makes packs mutually
  exclusive in game.
- Format versions in use: manifests 2, or 3 when a settings panel is needed
  (SemVer strings throughout and `metadata.authors` set); blocks and items
  `1.26.30`; entities `1.26.40` (validation is strict from there: invalid JSON
  fails to load rather than being ignored); geometry `1.16.0`; recipes
  `1.20.10`. `menu_category.group` is namespaced (`minecraft:itemGroup.name.*`).
- Block models are centred on x/z and stand on y = 0. A directional block's
  front is authored on +z, the default placement-direction value; entity
  models face −z. Both are stated in `tools/models/generate.ts`.
- Custom block states are not in the typed superset: cast the name (see
  `packages/fluidworks/scripts/engine/pipes.ts`).

## The verification loop

Design docs are aspirational. The pattern that has caught every wrong
assumption so far:

1. **Probe** the engine before building on a claim: add a `qolprobe:<name>`
   script event to `packages/probe/scripts/main.js` (plain JS, log-only
   unless a mutation is explicitly armed, `/reload`-safe). Record what you
   measured in a `docs/*-results.md` findings document.
2. **Build** against the measurement, with the pure decision under test.
3. **Pin it** with a GameTest in `packages/gametest/scripts/suites/` so it
   keeps working. Rigs are built in code on the all-air `qol:arena`
   structure; a test that needs the pack to notice a block either has a
   simulated player place it or asks the pack to rescan. Write assertions
   whose message carries the observed value, so a failure is a measurement.
4. Anything you could not verify goes in the pack README under "To confirm
   in game", with the one-line fix for each outcome.

In game: `/reload` re-runs scripts but not `startup` (so not command
registration) and never resources; a new pack folder or manifest change needs
a full restart. `console.warn` reaches the content log; `console.log` does
not by default.

## Where the work is tracked

`TASKS.md` is the queue: what is next, what is later, what is blocked, what
merged. Start there; move items as you go.

## Documentation

- `docs/design/*.md` — intent, written before implementation; proposals for
  unbuilt packs live there too, each with a "must prototype" list.
- `docs/*-results.md` — measured engine behaviour. Authoritative.
- `docs/README.md` — the index and the corrections table. Add a row whenever
  a doc claim proves false.
- `docs/backlog.md` — deferred work, with enough context to pick up cold.
- Each pack's `README.md` — what is built, how it works, what to confirm.

Update these in the same change as the code. Commit messages explain why,
in prose, and name what was measured versus assumed.

## Git

The default branch is `main`. Work on the branch you were given; never force
push or rewrite history on it — if it falls behind a merged base, merge the
base in. Open pull requests as drafts. `.gitattributes` normalises line
endings so generated files do not churn between platforms.
