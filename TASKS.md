# Tasks

The working list. Pick from the top unless the user says otherwise; move an
item to **Done** with the PR number when it merges. Design detail lives in
`docs/design/`, deferred rationale in `docs/backlog.md`; this file is only
the queue.

## Now

- [ ] **In-game verification pass.** Nothing since Hearthstone has been run in
      game. In a Beta APIs world with every pack enabled: `/gametest runset qol`,
      then each pack README's "to confirm in game" list. Paste the content log
      into the next session and fix what fails. Gates everything below.
- [ ] **Model viewer on GitHub Pages.** `npm run viewer` builds `dist/viewer`
      from the generated geometry and atlases; `.github/workflows/pages.yml`
      publishes it. Needs Pages set to "GitHub Actions" in the repo settings
      once.

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

## Housekeeping

- [ ] Move Hearthstone's and Graves' registries onto
      `packages/shared/engine/positionIndex.ts`.
- [ ] Add an ESLint config so `npm run lint` stops failing on every branch.
- [ ] Pack icons (`pack_icon.png`) through the texture generator.
- [ ] Grow the GameTest suite as behaviour lands (`docs/backlog.md`).

## Blocked on the stable API

- Fluidworks potions: no `ItemStack.createPotion`, potion component read-only.
- Per-block config that survives a pickaxe: block entities still experimental.
- Reading the weather: `Dimension.getWeather` is beta; the event is tracked instead.

## Done

- [x] Generated models and textures for every block; Lens icon (#1)
- [x] Graves, configured per role from the settings panel (#2)
- [x] Fluidworks Phase 1; shared cauldron rules; GameTest pack; CLAUDE.md (#3)
- [x] Fluidworks Phase 3: pipes, harvester, collector, labels (#4)
