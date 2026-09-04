# Tasks

The working list. Pick from the top unless the user says otherwise; move an
item to **Done** with the PR number when it merges. Design detail lives in
`docs/design/`, deferred rationale in `docs/backlog.md`; this file is only
the queue.

## Now

- [ ] **Three tests the headless suite fails.** Found by the first full runs on
      a dedicated server; each fails alone as well as in a sequence, so none is
      contamination, and the two Fluidworks ones fail the same way with
      `@minecraft/server-gametest` bound into the pack, so none is the
      simulated-player marshalling hole either. Evidence in
      `docs/gametest-structure-results.md`.
      - `rain_collector` — tank stays empty in rain. Ruled out: the `rain`
        policy default, and the weather map's key. Left: a roofed reading of the
        column, or `weatherChange` not arriving on a server. Needs a probe that
        does not go through `fluidworks:debug`, which drops a console event.
      - `funnel_places_into_clicked_tank` — the funnel is never placed at all
        when used on a cauldron's side, though the same call places one on the
        floor.
      - `pipes_join_when_placed` — both pipes place; neither gets an arm state.
      - and `harvester_funnel` is genuinely flaky, not merely contaminated: it
        has failed an isolated run too. The harness retries alone twice, which
        hides it; the crop-replant path still deserves a look.
- [ ] **In-game verification pass.** The suite itself now runs in CI, so this is
      what is left: each pack README's "to confirm in game" list, and the paths
      no simulated player can exercise (`guardian_void_catch`,
      `anchor_sets_spawn`). Paste the content log into the next session.

## Next

- [ ] **Guardian** — per-role damage scaling and the fall / fire / drowning /
      void switches on the stable `entityHurt` before-event. Proposal:
      `docs/design/guardian.md`. Phase 1 is the damage table; pets later.
- [ ] **Waypoints** — locator-bar markers for your bed, gravestone and the
      Hearthstone you will respawn at. Shared module used by Graves and
      Hearthstone. `docs/design/waypoints.md`.
- [ ] **Waystones** — placed teleport points, visited-only. `docs/design/waystones.md`.
- [ ] **Harvest** (by hand) and **Tidy** — `docs/design/harvest.md`,
      `docs/design/tidy.md`. Harvest reuses `packages/shared/core/crops.ts`.

## Later

- [ ] **Bulwark Phase 2: measure it.** The core is built — block, head,
      reconciliation, hopper ammo — but nothing has been observed. Run
      `docs/bulwark-turret-probe.md` (P0–P5) and the `turret_*` GameTests,
      write the results doc, fix what they find.
- [ ] **Hearthstone Phase 2** — labels, config, respawn notification
      (`docs/design/hearthstone.md` §8).
- [ ] **Lens** — compute block light by BFS so outdoor readings are exact;
      an attachable so the worn Lens renders (`docs/backlog.md`).
- [ ] **Fluidworks Filter Funnel** — needs a per-block config surface; an item
      frame on the funnel as its filter is the obvious in-world idiom.
- [ ] **Graves XP** — only if XP loss turns out to be the real frustration.
- [ ] **Hatchling: confirm in game.** Built and unmeasured. Run the pack
      README's "to confirm" list with `qolprobe:egg` / `qolprobe:pet`, then
      the `hatchling_*` GameTests. Phase 2 ideas are in `docs/design/hatchling.md` §7.
- [ ] **Peoples, settlements and villages** — `docs/design/npcs.md` (four
      peoples, four jobs, rigs and atlases under `concepts/entities/`),
      `docs/design/settlements.md` (twenty blueprints under
      `concepts/structures/`) and `docs/design/villages.md` (found
      villages by jigsaw, standing, invite). Next pick: the probe in
      `villages.md` §7.1 (does a jigsaw structure generate without an
      experiment?), then streets and squares plus the offline jigsaw
      expander so the four villages can be judged whole in the viewer.
- [ ] **Entity concepts** — `docs/design/entities.md` has five more with
      generated models under `concepts/`. Next pick: the decoy dummy, which
      needs one probe (does `is_family: player` on a custom entity draw
      hostiles?) before it gets a design doc.

## Housekeeping

- [ ] Move Hearthstone's and Graves' registries onto
      `packages/shared/engine/positionIndex.ts`.
- [ ] Add an ESLint config so `npm run lint` stops failing on every branch.
- [ ] Grow the GameTest suite as behaviour lands (`docs/backlog.md`).

## Blocked on the stable API

- Fluidworks potions: no `ItemStack.createPotion`, potion component read-only.
- Per-block config that survives a pickaxe: block entities still experimental.
- Reading the weather: `Dimension.getWeather` is beta; the event is tracked instead.

## Done

- [x] GameTest suite on a headless server in CI: `npm run bds:setup` /
      `npm run bds:test`, and `.github/workflows/gametest.yml`
- [x] Pack icons for every pack, through the texture generator
- [x] Hatchling Phase 1: egg, warming, hatching, bonding, feeding, growth, the panel
- [x] Entity concept sheet, models, textures, animations; grain textures across every pack (#13, #14, #15, #16)
- [x] Model viewer on GitHub Pages: https://tyevco.github.io/minecraft-qol/ (#5)
- [x] Particles: hearth embers, gravestone wisp, turret vent steam, funnel drip; previewed in the viewer
- [x] Generated models and textures for every block; Lens icon (#1)
- [x] Graves, configured per role from the settings panel (#2)
- [x] Fluidworks Phase 1; shared cauldron rules; GameTest pack; CLAUDE.md (#3)
- [x] Fluidworks Phase 3: pipes, harvester, collector, labels (#4)
