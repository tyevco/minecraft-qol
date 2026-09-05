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

## Jigsaw markers in a generated piece (design §7.2)

Two pieces: a 7×7 stone brick pad with a `minecraft:jigsaw` on its east edge
(name `qolprobe:out`, target `qolprobe:in`, target pool `qolprobe:well_socket`,
final block gold), and the well with a jigsaw on its west edge (name
`qolprobe:in`, final block diamond). A jigsaw structure `qolprobe:pair`
starts from the pad pool with `max_depth: 2`.

| Encoding of the marker | Result |
| --- | --- |
| `.mcstructure`, the jigsaw as a block entity in `block_position_data`: `id "JigsawBlock", name, target, target_pool, final_state, joint, placement_priority, selection_priority` (the field names the server binary carries) | **Joined.** `place structure qolprobe:pair 100 64 100` left the pad's lapis corner at `100,62,100`, its jigsaw replaced by gold at `97,63,106`, the socket's jigsaw replaced by diamond in the adjacent block `97,63,107`, and the well's emerald corner at `99,62,107`. Both final blocks applied; the second piece attached on the facing side, correctly aligned. |
| Java-format `.nbt` template (gzipped big-endian, Java names, Java jigsaw entity), the form vanilla's own abandoned-camp pieces take | **Loads as an empty box.** `placeJigsawStructure` returned a 2×2×2 bounding box and placed nothing; the console placement left nothing either. A pack's `.nbt` is not read the way vanilla's is, so the generator writes `.mcstructure` only. |

Two things to know from the join:

- **The start piece is rotated at random**, as vanilla village centres are:
  the pad's east jigsaw ended up on its south side, and the socket followed
  it round. Anything that must face a fixed way (a village facing a river)
  is a later problem; the pieces themselves stay consistent.
- The jigsaw block's own state is `facing_direction` (2–5 for the four
  horizontal directions, outward from the piece) with `rotation` 0; the
  pieces joined with that alone.

## A whole village (design §3)

With the pieces and pools `tools/structures/villages.ts` emits into the
probe pack, `placeJigsawStructure("villages:tallfolk_village", …)` in the
plain world returned a box of **48 × 12 × 44** (x 39–86, y 62–73, z −102 to
−59): the square, streets, houses and terminators grown by the game from
the same files the offline expander draws for the viewer. Not yet judged
block by block against the expander's version; the box says the pools are
sound and the markers all resolve. After the second pass over the pieces
(long streets, crossroads, watches at street ends, reedfolk on stilts) all
four placed the same way:

| Village | Box the game returned |
| --- | --- |
| stonefolk | 64 × 12 × 67 |
| tinker | 44 × 14 × 100 |
| reedfolk (stilted, no terrain adaptation) | 86 × 15 × 88 |
| tallfolk (first pass) | 48 × 12 × 44 |

## A peopled village (design §4, `packages/villages`)

With the villages pack listed in the plain world, two tallfolk villages
placed by `placeJigsawStructure` carried **16 job posts** between them; a
census 400 ticks after the next boot found **15 `villages:person` entities**
standing beside them, each with the post's people and job and the post's
tag (the sixteenth post had not ticked yet). So a village generated by the
game is peopled by its posts, with no player involved.

Three things the road there measured:

- **A block a pack's structure names is only as good as the loader's first
  reading of it.** The first world used for this had loaded the village
  pieces from an earlier build without posts; every later `get()` of the
  same identifier returned that post-less template, across restarts and
  after the pack file on disk had changed, while the same bytes under a new
  identifier loaded with the post. A structure template is cached per
  world at first use and not re-read. For development: change the file,
  change the world (or the identifier). For the Realm: a shipped structure
  is what the world first saw.
- **A processor list can output a custom block.** A `minecraft:rule`
  processor (not `block_rules`, whatever the schema title says; the
  content log lists the accepted names) with a `minecraft:block_match`
  input and an `output_state` naming `villages:post` with its states turned
  a lodestone into a post at placement. So had the loader dropped custom
  blocks, a vanilla stand-in and a processor would have been the way; it
  did not, and the pieces name the post directly. A jigsaw's `final_state`
  may also be a custom block.
- **The palette version stamp.** The server writes 18168865 (1.21.60.33)
  into every palette entry it saves, and the writer now stamps the same;
  vanilla blocks loaded with the old stamp too, and the test that seemed
  to show a custom block dropped for its stamp was the cached template
  above, so no claim is made about the stamp beyond matching the game's.

Two more, from the census: a post at a chunk edge threw
`LocationInUnloadedChunkError` spawning into the next chunk on the world's
first boot, so a failed spawn now leaves the record untouched and the next
tick tries again; and a person looked up by id reads as absent while its
chunk is unloaded (and the GameTest world keeps persons across runs, since a
structure reload restores blocks and not entities), so the post finds its
person by the tag it stamped when the id fails, and the tests sweep the
spot first.

Also found on the way: the tallfolk farmhouse's cobblestone floor course
had overwritten the lower half of its door since the stair pass; the
piece census (one door block where there should be two) showed it.

## Trades (design §5.1, `packages/villages`)

Both trade GameTests pass on the headless server (BDS 1.26.45.1, the
GameTest world), each running a whole work cycle inside its 600-tick
budget because a post's first cycle is due at once:

- **`villages_lumberjack_fells_tree`**: four oak logs on dirt with a
  crown of seventeen leaves, a chest with four bread, a tallfolk worker
  post. The survey reports `logs 4, leaves 17`, the worker becomes a
  lumberjack, and after the cycle the four logs are in the chest, an oak
  sapling stands on the stump, no log block remains and the chest holds
  three bread: the wage was taken.
- **`villages_farmer_harvests_wheat`**: nine ripe wheat on wet farmland,
  an empty chest. The survey reports `farmland 9`; a cycle of eight puts
  eight wheat in the chest, at most one ripe tile is left, and the field
  is replanted from the drops.

- **`villages_miner_works_vein`**: a coal `villages:vein` in the floor,
  four bread, a stonefolk worker post. The survey reports `veins 1`, and
  after the cycle six coal are in the chest, the vein is still there and
  the chest holds three bread.
- **`villages_fisher_catches_fish`**: eight water blocks let into the
  stone floor and one bread. The survey reports `water 8`; four fish and
  no bread after the cycle. Run first without the bread, the fisher
  finished with **3 fish of 4, three runs out of three**: raw cod and
  salmon carry `minecraft:is_food`, so the wage took one of the catch.
  That is the design (every worker eats a food item a cycle), so the test
  supplies bread and pins that it is the bread that goes.

- **`villages_vein_in_the_open_is_ignored`**: the same vein under the
  open sky: the survey names it ("out in the open; a miner works a vein in
  a cave or a mine, under a roof"), no coal after 400 ticks, no bread
  taken.

### The walk (design §7 item 6)

The stable API has no "go here" for an entity, so the walk is vanilla
pathing pointed at a beacon: a `villages:waypoint` entity spawned at the
spot. Three ways of making a person go to it, measured in one arena on BDS
1.26.45 (a person at one corner, the waypoint eight blocks off, the
person's distance to it logged every 20 ticks for 300):

| Way | What happened |
| --- | --- |
| `nearest_attackable_target` (family filter, `must_see` false) + `move_towards_target` | Never left random strolling. Closest approach 1.0 at tick 200, by chance, then away again. Also true with the waypoint's `inanimate` family removed and `within_radius` 64. |
| `hurt_by_target` + `move_towards_target`, the target set by `person.applyDamage(1, { damagingEntity: waypoint })` (returns true) | Walked to it in 100 ticks (1.4 blocks), then wandered off (10.9 at tick 200). |
| `follow_mob` (`stop_distance` 1, `search_range` 32) | Walked to it in 100 ticks and **stayed**: 0.3 blocks from tick 100 to 300. |
| `follow_mob` with `"filters": { is_family other villages_waypoint }`, a decoy person two blocks from the walker | Loaded without a content-log error, walked past the decoy (closest 1.5) to the waypoint (0.3) and stayed. |

So the walking group is `follow_mob` with the family filter. The
behaviour follows the nearest match, which is why only one walk runs at a
time within 64 blocks. With the walk in, all seven villages GameTests pass,
the lumberjack's and the miner's among them, whose work spots are outside
arrival radius of the post (the farmer's and the fisher's are not, so they
passed with a broken walk too - a spot within two blocks counts as
arrived).

What was measured on the way:

- **`ItemComponentTypes.Food` is not how to recognise food.** On 1.26.45
  `new ItemStack("minecraft:bread").getComponent(ItemComponentTypes.Food)`
  is `undefined`, and `getComponents()` lists only `minecraft:compostable`;
  cooked beef has no components at all. An apple, a data-driven food, has
  `minecraft:food`. Every one of them has the **`minecraft:is_food` item
  tag** (`getTags()`), which is what the wage checks. The first run of the
  lumberjack test waited "no wage" with bread in the chest.
- **A post placed where a record already exists** must start over. The
  harness re-places a test's post at the same position as an earlier
  test's (a structure reload restores blocks, not records), and the old
  record — a lumberjack, surveyed a minute before — kept the new post from
  surveying, so the farmer's test found no wheat. `onPlace` now retires the
  old record and its person. The same happens in a world when a structure
  load or `/fill` replaces a post.
- **`system.currentTick` counts from the server's boot, not the world's
  start** (the pack's own "ready at tick 8131" on a world days old). A
  stamp saved in one session is ahead of the clock in the next, and a
  "wait a day" written as `now >= stamp + DAY` would then wait for the
  clock to catch up - a day and a half after a restart at tick 0. Every
  wait in the pack (respawn, survey, cycle, the vein's window) now treats
  a stamp ahead of the clock as elapsed. `world.getAbsoluteTime()` was
  not used instead because a world with the daylight cycle locked (a Realm
  might) would freeze it; unmeasured, and worth a probe.
- `Dimension.getBlocks(volume, { includeTypes }, true)` finds custom and
  vanilla types alike across a 33×17×33 survey volume in one call, and a
  log removed with `Block.setType("minecraft:air")` drops nothing, so a
  felled log exists only as the stack the same step puts in the chest.
  `Container.addItem` returned no remainder in either test; the
  remainder-to-drop path is untested in game.

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
- Jigsaw markers work as block entities in the `.mcstructure`, so a
  multi-piece village is authored with `Blueprint.jigsaw()` and nothing else.
- Custom blocks survive every path: `get`, `place`, jigsaw start pieces,
  joined pieces, processors and final blocks. The posts people a village.
- Still open, in order: `beard_thin` on real buildings, and biome filters
  with the tags in `villages.md` §3.
