# Jigsaw structures without an experiment — findings

**Measured on Bedrock Dedicated Server 1.26.45.1, headless, in a world with no
experiments on.** Answers `docs/design/villages.md` §7.1 and closes issue #38.
Everything below is a reading from the content log; the probe is
`qolprobe:jigsaw-place` / `qolprobe:jigsaw-scan` in `packages/probe`, the
definitions are under `packages/probe/worldgen/`, and the runs are
`dist/bds/probe-run*.log` on the machine that ran them.

## The answer

**A behavior pack's jigsaw structure loads, places and generates naturally
in a plain world.** No experiment is needed. The village program can be
built on the game's generator.

| Question | Measured |
| --- | --- |
| Does a custom jigsaw structure load without an experiment? | Yes. The world's `level.dat` had no experiment flags (`enable-experiments.mjs` was not run; no `Experiment(s) active` line in any log), the pack stack listed only the probe, and `placeJigsawStructure("qolprobe:well", ...)` returned a box `{8,62,8}–{12,69,12}`, the well's 5×8×5. |
| Does the console place it? | Yes. `place structure qolprobe:well 40 64 40` put a well at `40,62,40` (found by the scan), with no error. |
| Does the world generator place it in new chunks? | Yes. A structure set with `spacing: 4, separation: 1` produced **25 wells in a 20×20-chunk region** force-loaded with `tickingarea`, exactly one per 4×4-chunk cell, at surface heights from y=58 to y=101 (`heightmap_projection: world_surface`, `start_height` 0). Three more generated in the spawn area's cells. |
| Does `terrain_adaptation: none` on a slope look right? | Not judged: the probe counts, it does not look. The design uses `beard_thin` for buildings on ground, as vanilla's abandoned camp does. |

## What the schemas did not say

Mojang's JSON schemas describe the fields but not the files. The layout came
from the vanilla example the server ships (`behavior_packs/experimental_y_2026_drop_3/worldgen/`,
the abandoned camp), and it differs from the design doc's first guess:

| Design doc assumed | Reality |
| --- | --- |
| `jigsaw_structures/well.json` with root key `minecraft:jigsaw_structure` | **`worldgen/structures/well.json` with root key `minecraft:jigsaw`.** The binary carries a `jigsaw_structures` string too, but the vanilla pack uses `worldgen/structures`, and only that loaded. With the wrong root key the file is dropped silently: no content-log line, and `place structure` says only `Invalid structure name`. |
| `template_pools/`, `structure_sets/` at the pack root | **`worldgen/template_pools/`, `worldgen/structure_sets/`**; a `processors/` folder sits beside them. At the pack root they load nothing, silently. |
| pool element `location: "qolprobe:well"` | The vanilla form is a path relative to `structures/`: `"qolprobe/well"` for `structures/qolprobe/well.mcstructure`. |

The three files that worked, verbatim:

```json
// worldgen/structures/well.json
{ "format_version": "1.21.20",
  "minecraft:jigsaw": {
    "description": { "identifier": "qolprobe:well" },
    "step": "surface_structures",
    "terrain_adaptation": "none",
    "start_pool": "qolprobe:well",
    "max_depth": 1,
    "start_height": { "type": "constant", "value": { "absolute": 0 } },
    "heightmap_projection": "world_surface",
    "max_distance_from_center": { "horizontal": 16 } } }

// worldgen/template_pools/well.json
{ "format_version": "1.21.20",
  "minecraft:template_pool": {
    "description": { "identifier": "qolprobe:well" },
    "elements": [ { "element": { "element_type": "minecraft:single_pool_element",
                                 "location": "qolprobe/well", "projection": "rigid" },
                    "weight": 1 } ] } }

// worldgen/structure_sets/wells.json
{ "format_version": "1.21.20",
  "minecraft:structure_set": {
    "description": { "identifier": "qolprobe:wells" },
    "placement": { "type": "minecraft:random_spread", "spacing": 4, "separation": 1,
                   "salt": 20260905, "spread_type": "linear" },
    "structures": [ { "structure": "qolprobe:well", "weight": 1 } ] } }
```

The `.mcstructure` is the tool's own output (`tools/structures/generate.ts`,
the probe well: a stone brick pad with one emerald block, the tallfolk well
on top), so a generated structure with a real palette and block states loads
too; that was §7.2's question.

## How the measurement was taken, and what it cost

- **Two servers, one port.** The GameTest world has the Beta APIs experiment
  on, which is the opposite of the question, so `tools/bds/setup.mjs` grew
  `--no-experiments`, `--level-type DEFAULT` and `--world`, and a second
  install at `dist/bds/probe` holds the plain terrain world with only the
  probe pack listed in `world_behavior_packs.json`. They share the port, so
  one runs at a time.
- **No player, so `tickingarea`.** Chunks generate only where something
  loads them. Four `tickingarea add` calls of exactly 100 chunks each
  (10×10, chunk-aligned: 1008–1167 and 1168–1327 on each axis; an
  unaligned 160-block span is 11 chunks and is refused) load a fresh region
  far from spawn. The scan then counts emerald blocks with
  `Dimension.getBlocks(volume, { includeTypes })` in 32×32 tiles from y=40
  to 140 inside a `runJob`.
- **An unloaded chunk reads as empty, not as an error.** The first scan ran
  a few ticks after boot, before the ticking areas had reloaded their
  chunks, and reported zero wells in a region that had five. With
  `allowUnloadedChunks: true` nothing throws. The scan now waits (fourth
  argument, ticks) and logs the topmost block under its centre first, so an
  empty result can be told from a scan that cannot see.
- **The probe pack had not loaded for a while.** The waypoint probe's
  handler was missing its two closing braces since the Bulwark turret events
  were added after it; QuickJS reported `SyntaxError: unexpected token in
  expression: ''` at the last line and the whole pack failed, which
  `node --check` did not catch (it accepts the file) but `esbuild` and
  `acorn` do. Fixed here. Any measurement claimed from the probe between
  those two commits was not made.
- **No IPv6 in the cloud sandbox.** BDS exits at start when its IPv6
  socket fails, reporting both ports "in use". `tools/bds/no-ipv6.c` is a
  preload that stands an IPv4 loopback socket in for the IPv6 one;
  `run.mjs` builds and preloads it when `/proc/net/if_inet6` is missing.
  With it the server starts in about a second. Not used where IPv6 exists.

## What this settles for the design

- Villages are **generated, not script-placed**: `villages.md` §7.1's
  fallback is not needed.
- The generator emits the three file kinds above into a pack's `worldgen/`;
  `tools/structures/` can write them from the same source as the buildings.
- `placeJigsawStructure` is the GameTest and probe path: a whole village can
  be raised in the arena and looked at, with `keepJigsaws` for debugging.
- Still open, in order: jigsaw *blocks* in a generated structure (a
  multi-piece village needs markers; whether the 1.21.80 metadata sidecar or
  block-entity NBT is what the loader reads), `beard_thin` on real
  buildings, and biome filters with the tags in `villages.md` §3.
