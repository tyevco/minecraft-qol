# QOL Times

Dispenser automation and Java-parity fixes for Minecraft Bedrock. Stable scripting
APIs only — **no experimental toggles**, so worlds keep achievements and are never
permanently flagged experimental.

Targets `@minecraft/server` 2.9.0 / `@minecraft/server-ui` 2.1.0
(`min_engine_version` 1.26.40). Intended for a Realm, shipped as `.mcaddon`.

## Headline feature

Dispensers interact with cauldrons: fill and drain with buckets and bottles, dye
the water, wash leather armour.

Worth knowing: **this does not exist in Java Edition either.** Mojang closed the
Java requests as Invalid (MC-9910, MC-220164, MC-165196) and Java players use
mods for it. So this is net-new automation on both editions, not a parity fix.
The genuine parity gaps are armour-stand placement (MCPE-80145) and equipping
armour onto villagers and wandering traders (MCPE-41432, MCPE-76479) — planned,
not yet built.

## Status

**Working in game:** dispensers fill and drain cauldrons in both directions; the
rig registry persists across reloads; `/qol:settings` gives per-feature toggles.
28 unit tests pass over the pure rules layer.

**Verified safe:** a dispenser full of cobblestone facing a cauldron mints
nothing — the container diff refuses because the dispenser lost cobblestone, not
a bucket.

**Not yet done:** bottles / dye / wash are implemented and unit-tested but not
yet exercised in game; the two parity features need a handler refactor (the
interceptor currently assumes a cauldron target); GameTest pack.

## Setup

```bash
npm install
cp .env.example .env     # then edit CUSTOM_DEPLOYMENT_PATH
```

`.env` is gitignored because it holds a machine-specific absolute path.

### Where packs deploy, and why it's fiddly

Development packs load from the **shared** folder:

```
%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang\development_behavior_packs
```

Confirmed empirically — packs placed only in the per-user (XUID) folder were
never listed in game, and appeared the moment the shared path was populated.
Per-user holds worlds and `options.txt`; shared holds packs.

The trap: since Bedrock 1.21.120 the Windows build moved from UWP to GDK, and on
migrated machines `Users\Shared\games\com.mojang` is a **symlink** into
`%LOCALAPPDATA%\Packages\Microsoft.MinecraftUWP_*\LocalState\games\com.mojang`.
A reinstall can delete that target, leaving a dangling link — packs then never
load, with no error anywhere. Check yours:

```bash
ls "$APPDATA/Minecraft Bedrock/Users/Shared/games/com.mojang"
```

If it errors, recreate the directory the symlink points at. Don't replace the
symlink — worlds and options resolve through the per-user folder and you don't
want to disturb them.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Vitest over the pure layers. No game required. |
| `npm run build` | `tsc` typecheck, then an esbuild bundle per pack into `dist/<pack>/`. |
| `npm run deploy` | Build, then copy each pack into `development_behavior_packs`. |
| `npm run local-deploy` | Deploy, then watch and repeat on save. |
| `npm run mcaddon` | Produce `dist/packages/<pack>.mcaddon` per pack. |

Per-pack variants exist for everything: `npx just-scripts build:qol_times`,
`deploy:qol_times`, `mcaddon:qol_times`, `clean:qol_times`.

Turn on **Settings → Creator → Content Log GUI** to see output; `console.warn()`
always appears there, `console.log()` only at Verbose/Info, which is why the code
uses `warn` throughout. Ctrl+H opens the log history.

### When `/reload` is enough, and when it isn't

| You changed | What to do |
| --- | --- |
| Anything inside an existing event handler or rule | `/reload` |
| Added or changed a **custom command** | **Exit to the main menu and re-enter the world** |
| `manifest.json`, or added a new pack folder | Restart the game |

The command case is the one that bites. `system.beforeEvents.startup` fires when
the world loads scripts and **not** on `/reload`, so a `/reload` re-runs the
module but never re-fires the callback that calls `registerCommand` — the command
silently does not exist, and the only symptom in game is Bedrock's generic
"unknown command" error. Confirmed the hard way.

Two mitigations: registration logs success or failure explicitly
(`registered /qol:settings` vs `FAILED to register ...`, which previously
swallowed `NamespaceNameError`), and `/scriptevent qol:settings` opens the same
menu. That path is subscribed at `worldLoad`, so it works right after a `/reload`.

## Documentation

[`docs/README.md`](docs/README.md) indexes everything and, importantly, lists
which claims in the original design docs turned out to be wrong. Several describe
preview-only features that have not reached retail — read the corrections before
building on them.

## Repo layout

This is a monorepo building several independent packs from a shared library.

```
packages/
  shared/        code reused across packs (core/ pure, engine/ engine-facing)
  qol-times/     behavior_pack/ + scripts/ + tests/
  hearthstone/   behavior_pack/ + resource_pack/ + scripts/ + tests/
  probe/         throwaway diagnostic pack, hand-deployed, plain JS
tools/           texture and model generators (see Models and textures)
dist/<pack>/     per-pack build output
```

Packs are declared in the `PACKS` array in `just.config.ts`; adding one is a new
entry plus a folder. Each pack gets its own bundle, deploy, mcaddon and clean
task, and its own `dist/` subdirectory so building one never wipes another's
output.

Two things that must stay in lockstep per pack: esbuild's `external` list and the
manifest's `dependencies`. A mismatch fails at runtime with no build error.

A pack that ships a `resource_pack/` folder sets `hasResourcePack: true`; deploy,
clean and mcaddon all grow a resource-pack branch from that one flag.

## Models and textures

Every texture and every geometry file in the repo is **generated**, not drawn:

```bash
npm run textures    # tools/textures -> resource_pack/textures/**/*.png
npm run models      # tools/models   -> resource_pack/models/**/*.geo.json
npm run assets      # both
```

Output is deterministic, so a changed PNG or `.geo.json` in a diff always
corresponds to a source change under `tools/`. Hand edits to the outputs are
overwritten on the next run.

The pieces:

- `tools/atlases.ts` names every 16x16 tile in every atlas. Textures paint into
  a named slot; geometry faces sample a window of a named slot. A face cannot
  point at a tile nobody painted, and moving a tile is one edit.
- `tools/textures/tiles.ts` paints the tiles, from ASCII art where the shape is
  deliberate and from seeded speckle where it is grain. `png.ts` is a
  dependency-free PNG encoder over Node's zlib.
- `tools/models/geometry.ts` builds per-face-UV geometry from cubes that name
  tiles instead of coordinates; the window size follows from the cube.

Conventions: block models are centred on x/z and stand on y = 0; a directional
block's front is authored on +z, the default placement-direction value; entity
models face -z, the vanilla convention. Both are in the generator's header.

What exists today:

| Pack | Asset | Notes |
| --- | --- | --- |
| Hearthstone | `geometry.hearthstone` | Stone-brick hearth with a walled bowl of embers and a flame. The flame faces use a second material instance (`alpha_test`, no face dimming) so they cut out and stay bright. |
| Lens | `spawn_lens` item icon | The Lens's first resource pack. Icon only; the item does not render on the head. |
| Fluidworks | `geometry.fluidworks_funnel`, `geometry.fluidworks_pipe` | Visual definitions only; behaviour is still unbuilt. See the pack README for the two things to verify in game. |
| Bulwark | `geometry.bulwark_turret_base` (block), `geometry.bulwark_turret_head` (entity) | The head has one texture per damage tier, picked by the `bulwark:tier` entity property. |

Resource changes never hot-reload: exit to the main menu and re-enter for a
texture or model, restart the game for a manifest. `npm run deploy` prints the
reminder.

**Why we don't use the library's `copyTask`.** It reads `PROJECT_NAME` from
`process.env` inside its returned closure, making the deploy destination a
process global — so two packs cannot deploy from one build process. `deployPack`
in `just.config.ts` uses the same `copyFiles` and `getGameDeploymentRootPaths`
helpers `copyTask` itself uses, minus the env coupling. `cleanCollateralTask` has
the same flaw and is replaced by a per-pack `rmSync`.

Note also that `just`/`undertaker` resolves task names **eagerly** inside
`series()`, so any task referenced by a per-pack task must be defined before the
loop that creates them.

## Architecture

There is **no dispenser event** in the Bedrock scripting API, and custom block
components attach only to custom blocks, never to vanilla `minecraft:dispenser`.
So we use vanilla's own failure mode: a dispenser that cannot use its item ejects
it as an item entity. We detect that via `entitySpawn`, attribute it to a
dispenser geometrically, and convert it into the interaction we wanted.

Four tiers, cheapest first — nearly every item spawn in the world exits at the
first:

1. **Type, cause, amount.** Claimed item id, not a chunk-load rehydration, and
   `amount === 1`. A dispenser dispenses exactly one item, so that last check is
   a hard invariant — without it a thrown stack of 64 bottles would convert
   wholesale for one cauldron's worth of water.
2. **Geometry.** A dispenser that fired into this cell must sit one step back
   along its own facing vector *and* face this way. Ambiguity fails closed.
3. **Legal transition** for the target cauldron's state.
4. **Causal proof.** Diff the dispenser's container against the previous tick and
   require it lost exactly one of that item. Everything above is circumstantial —
   a player can stand anywhere and throw anything. Only a container that actually
   shrank proves a dispense happened.

A consequence worth knowing: **the first dispense at any new rig does nothing.**
An unproven dispenser registers itself and defers to vanilla. That costs one
missed activation per rig, ever, and is what closes the free-mint hole.

`scripts/core/` is pure — no `@minecraft/*` imports, so it unit-tests in plain
Node. `scripts/dispenser/io.ts` is the single adapter that knows how a cauldron
is represented.

See [docs/phase0-results.md](docs/phase0-results.md) for the measured engine
behaviour this is built on, including why velocity is unusable as a signal and
why levels go through block states rather than `fluid_container.fillLevel`.

## The probe pack

`probe_pack/` is a throwaway diagnostic that logs engine behaviour without
mutating anything. It answered the blocking unknowns before the interceptor was
written; keep it for investigating future surprises.

Deploy it the same way, enable it instead of the main pack, then:

```
/scriptevent qolprobe:scan     register rigs near you + dump cauldron readout
/scriptevent qolprobe:arm      arm ONE removal test on the next item spawn
/scriptevent qolprobe:status   show what is registered
```
