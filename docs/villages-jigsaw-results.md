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

## Villages generate on their own (design §2, §3)

Measured on BDS 1.26.45.1 in a **fresh `DEFAULT`-terrain world with no
experiments** (`dist/bds/probe`, world `qolgen`, only the probe pack and
Villages listed), the current pack deployed:

- `locate structure` finds every people's village from spawn, which means
  the four structure sets are registered and the biome filters pass
  somewhere:

  | Village | Nearest, from spawn |
  | --- | --- |
  | `villages:reedfolk_village` | 216, 104 (239 blocks) |
  | `villages:tallfolk_village` | 295, 135 (324 blocks) |
  | `villages:tinker_village` | −2471, 1385 (2832 blocks) |
  | `villages:stonefolk_village` | −1978, −2518 (3202 blocks) |
  | vanilla `minecraft:village`, for scale | 152, 808 (822 blocks) |

- One ticking area (224–383 × 64–223, 100 chunks) round the two nearest
  and a `qolprobe:jigsaw-scan` a minute later: **57 markers** in the
  region, among them nine `villages:post` blocks - four at 227/257 ×
  94/114 on the reedfolk village's stilts over water (`water 1823` in
  their survey), five across the tallfolk village at 275–338 × 122–136
  with its doors and lanterns - and `villages:debug` reports **9 posts, 9
  persons present**. The reedfolk workers surveyed themselves into
  fishers as their chunks loaded; the tallfolk posts in range were guards,
  traders and builders. Nothing was placed by hand.

So the "villages are generated, not script-placed" stance holds for the
villages themselves, not only the probe's well, and the biome filters put
the reedfolk in the wet and the tallfolk on the plains. The stonefolk and
tinker villages are far from this spawn (mountains and savanna are), and
were not loaded; they place by hand as before, and `locate` finds them.

## The second four peoples (design §3.3)

Same fresh-world setup (`qolgen2`, plain terrain, no experiments, only the
probe pack and Villages), the pack with eight peoples deployed:

- `locate structure` finds all four new villages from spawn, each in its
  own biome and none of them near this plains spawn: hobbits at 1690,
  3514; wood elves at 839, 1303; high elves at −1589, −843; drow at 1846,
  −362.
- Placed by hand from the API into two ticking areas, every one returned
  a box: hobbit 90 × 10 × 130, wood elf 100 × 15 × 77 (walkways six
  blocks up: the topmost block over the middle of that area read
  `dark_oak_planks` at y = 72), high elf 55 × 13 × 124, drow 88 × 13 ×
  115. The scans found their posts, doors and lanterns, and
  `villages:debug` reported **47 posts, 41 persons present** across the
  four placed villages and the two that had generated on their own (the
  six missing were in chunks outside the ticking areas: the hobbit box
  runs twenty blocks past the loaded edge).
- The trades read the new villages as they should: the drow miner found
  **2 enclosed veins** in its mine piece; the wood elf and high elf
  workers surveyed themselves lumberjacks among their own trees (2505 and
  1075 leaves in range); every one then waited for a wage, since a found
  village's chest starts empty.
- What that log also showed: a waiting worker repeated its reason every
  minute, four workers filling the content log between them. A reason is
  now logged when it changes, not each time it holds.
- The eighth people index works end to end: `villages_post_spawns_person`
  now places a drow post (people 7) and passes, with the rest of the
  villages suite.

## A peopled village (design §4, `packages/villages`)

With the villages pack listed in the plain world, two tallfolk villages
placed by `placeJigsawStructure` carried **16 job posts** between them; a
census 400 ticks after the next boot found **15 `villages:person` entities**
standing beside them, each with the post's people and job and the post's
tag (the sixteenth post had not ticked yet). So a village generated by the
game is peopled by its posts, with no player involved.

The fifth people placed the same way on the GameTest world (flat, surface
at y = −60): `place structure villages:drover_village 60 64 60` inside a
hundred-chunk ticking area answered `Place command succeeded`, the next boot
knew **10 drover posts** (traders, guards, builders; that draw had no
corral), and forty seconds on `/scriptevent villages:debug` listed every one
with its drover present. The pieces use blocks no other people does (sand,
smooth sandstone, hardened clay, cactus, dead bush, a filled cauldron, a
standing bell, a jukebox); none produced a content-log line.

**Shearing from script** (the rancher, design §5.1): `Entity.triggerEvent("minecraft:on_sheared")`
on a vanilla sheep swaps its component groups exactly as a player's shears
do. In `villages_rancher_shears_sheep` two sheep spawned as
`minecraft:sheep<spawn_adult>` and turned red with `wololo` were read as
`sheep 2` by the survey (`Dimension.getEntities` by type and distance;
`EntityComponentTypes.IsBaby` absent), and after the cycle both carried
`EntityComponentTypes.IsSheared`, `EntityComponentTypes.Color` read 14 for
the wool, and the chest held red wool. The event spawns no items itself
(the drop is the interact component's `spawn_items`), so the rancher's
wool is the script's to deliver.

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

## The furfolk (design `furfolk.md` §4–5, `packages/villages`)

The ten animal peoples went into the pack together, as indices 9–18, with
their villages and the seven trades of `furfolk.md` §5. Measured on the
headless GameTest server (BDS 1.26.45.1):

- **A block state lists at most sixteen values.** The first deploy with
  `villages:people` at `[0, …, 18]` logged `blocks/post.json -> description
  -> states -> villages:people: too many input elements, expected no more
  than 16` and the post block did not exist: every `BlockPermutation.resolve`
  in the suite threw, for people 0 as much as 18. The index is now split
  across `villages:people` (0–15) and `villages:page` (0–1), a post from
  before the page existed reads its page as 0, and a village piece writes
  the page only when it is set, so the nine humans' pieces are byte for
  byte what they were. Recorded in `docs/README.md`'s corrections; the
  design's "76 permutations, well within what the engine allows" was
  wrong about the shape, not the count.
- **The nineteenth people spawns.** `villages_post_spawns_deerfolk` places
  a post at people 2, page 1 and the person's `villages:people` reads 18,
  with its name tag `Deerfolk`; the drow (7) and drover (8) tests still
  pass, so the widened property range and the appended block state keep
  the earlier indices (design §7 items 1 and 2, as far as a fresh world can
  say; a Realm's existing persons are the in-game check).
- **The seven trades**, one GameTest each, all passing, every survey line
  in the log naming the fixture it read (`bushes 8`, `ovens 1`, `hives 1`,
  `cactus 12`, `mushrooms 10`, `pods 8`, `oak leaves 16`):
  - `villages_forager_picks_berries`: eight bushes at `growth` 3 on grass
    become eight at `growth` 1, still standing, with at least sixteen
    berries in the chest and **no berry item on the ground** - so a
    `setPermutation` back to the unripe state drops nothing (the design's
    question). `growth` 3 is ripe on Bedrock, as the orchard pieces assumed.
  - `villages_baker_bakes_bread`: nine wheat become three loaves, the
    furnace was seen as `lit_furnace` during the bake and is `furnace`
    facing south after it. The swap to the lit block and back keeps the
    `minecraft:cardinal_direction` state and, on an empty furnace, has
    nothing to eject; a furnace with items is not swapped at all.
  - `villages_beekeeper_bottles_honey`: a beehive placed at `honey_level` 5
    reads back as 5 (the state's name and range on Bedrock), one glass
    bottle becomes one honey bottle, and the hive stands at `honey_level`
    0 afterwards. Whether bees inside a hive anger at a scripted level
    change is not something a structure-placed hive can show: it has none.
  - `villages_cutter_cuts_cactus`: four columns of three on sand lose their
    top two blocks each, eight cactus items reach the chest, the bases
    stand, **nothing drops as an item** when a cactus block is set to air
    top down, and a bread is taken as the wage.
  - `villages_picker_gathers_mushrooms`: ten mushrooms on mycelium become
    six in the chest and four standing.
  - `villages_cocoa_picker_picks_pods`: eight pods at `age` 2 with
    `direction` 0–3 round two jungle trunks (0 south of the log, 1 west, 2
    north, 3 east, as the squirrels' grove writes them) stay on their logs
    through a `setBlockPermutation` and a harvest; sixteen beans reach the
    chest and every pod reads `age` 0 after. Run first without bread it
    "waits: no wage", which is the rule (beans are not food), so the test
    supplies four and pins that three are left.
  - `villages_gleaner_gathers_apples`: sixteen persistent oak leaves give
    two apples and lose no leaf, with a four-log oak beside them whose
    crown is not persistent, which stays: a hedge beats a tree.
- **Two villages placed, and what their surveys said.** `place structure
  villages:deerfolk_village 60 64 60` and `villages:foxfolk_village 220 64
  60` inside two hundred-chunk ticking areas both answered `Place command
  succeeded`, and their posts surveyed within a second of placing. The fox
  patches read `bushes 30`, `30`, `24` and `12` (two patches overlap in
  range) and made four foragers; the fox grove made a lumberjack. The four
  deerfolk hedge workers read `oak leaves 183`, `275`, `71` and `97` beside
  `logs 17` to `41`: a village has trees within sixteen blocks of every
  lot, so a rule that counted every oak leaf and ranked the hedge under
  trees made all four lumberjacks. Leaves placed by hand are `persistent_bit`
  and a tree's are not (the pieces author their trees that way so a felled
  crown decays), so the survey now counts persistent oak leaves only and
  ranks a hedge above trees: a third deerfolk village placed after that
  change had both its hedge workers survey as gleaners (`hedge 52` beside
  `logs 12` and `logs 48`). The earlier village's four kept their
  lumberjack records, since a survey holds for a day and the restart
  heuristic (a stamp ahead of the clock) does not fire when the stamp is
  small. The second boot's `villages:debug` listed 21
  posts in the two villages with 21 persons present (eleven deerfolk, ten
  foxfolk); every deerfolk post read people 18 back through
  `villages:page` 1, so the page state survives the `.mcstructure` and the
  jigsaw placement as `villages:people` did.

## Visitors and the kids' posts (design §6.1, `packages/villages`)

Measured on the headless GameTest server (BDS 1.26.45.1) with the
villages suite:

- **`playerPlaceBlock` fires for a SimulatedPlayer's placement, after the
  block's own `onPlace`.** A SimulatedPlayer holding a `villages:post` item
  used it on the floor; the pack logged `a player placed a post at
  4,-51,6; its record already existed (onPlace first)` on every placement,
  in three tests. So the custom component's hook runs first and the
  player event second in the same tick, and the event reaches a pack that
  does not bind `@minecraft/server-gametest` even though the player in it
  would not. The post therefore only registers in `onPlace` and leaves the
  first spawn to the block's own tick, and the mark is always down before
  anyone is spawned. `villages_player_post_waits_for_settler` pins that a
  post placed by hand has no person after 300 ticks while a post set by
  `setBlockPermutation` (every other test) spawns at once.
- **A visitor arrives, settles and leaves.** Two posts by hand within
  three blocks made a settlement of two; `scriptevent villages:visitor
  arrive` spawned `Dune the Fennecfolk` fourteen blocks off on the flat
  world's surface (y = −60, nine below the arena), with the trader's job
  and the visitor group; `settle` walked it toward the nearest empty post,
  the walk timed out at the arena's cliff after 600 ticks, and the
  fallback put the settler there: one person with the `villages:kin` tag
  of people 14 at the post, no visitor left, and the face dropped so the
  next fennecfolk is new. `villages_visitor_leaves_at_dawn` set the time
  to 6000, brought `Sable the Catfolk`, and `time add 18000` crossed
  midnight: the poll read the time of day entering 0–1000 on a later day
  and removed the visitor within a second, logging the next visit for
  day 3.
- **Not measured**: the form. A SimulatedPlayer's interaction marshals no
  player into the pack, so `showForm` never runs headlessly; the errand's
  delivery, the standing property and the gift are in the villages README
  to confirm in game.

## Invite and the plaque (design §5–6, `packages/villages`)

`villages_invited_person_follows_and_settles`, on the headless GameTest
server:

- **A post item places the block's default states.** A SimulatedPlayer's
  hand-placed post read `villages:job` 0 (a guard's) every time, which the
  design's "a matching job block the player placed" had not allowed for
  with one post block for four jobs. The post now turns its plaque on a
  tap: the block's own `onPlayerInteract` **fires for a SimulatedPlayer's
  `interactWithBlock`** (with no player in the event), the first tap set
  the state to 1 and the block was still a post. Setting a state fires
  the custom component's `onPlace` again as a placement; the record's job
  is written before the block's, and a placement over a kids' record
  whose job and people match the block is read as the same post rather
  than retired.
- **The follow.** A `villages:waypoint` kept at a spot, with the person in
  its `villages:walking` group, brought the invited foxfolk from its post
  to within three blocks of a spot six blocks away in under four seconds;
  the same mechanism as the walk, never released. A second tap on the
  turned post settled it: a foxfolk with `villages:kin` at the kids' post,
  the follower gone, the village post's spot empty.
- **Not measured**: the gift, the trader's form, the hit and the defence,
  all of which need a real player in the event.

## Trading (design §5, `packages/villages`)

Design §5 counts a trade for standing (+1, capped per day) and
`npcs.md` §6 left open whether a custom entity trades through
`minecraft:economy_trade_table` or a form. Decided without a probe, from
the typings: the stable `@minecraft/server` 2.9.0 has no trade event, no
trade component and nothing that reads a trade table, so a vanilla table
on the person could neither move standing per trade nor be gated per
player (a component group is per entity, standing is per player), and
its UI would open on the same interact the elder's form already takes.
The trader's form trades instead: "What do you have to trade?" at guest
opens a second `ActionFormData` of the people's wares (`core/standing.ts`
`WARES`: three at guest, a fourth at friend, each so many of an item for
so many emeralds); a pick takes the emeralds first, hands over the goods,
and counts the trade in `villages:trades` (a player property: the day and
a count per people), the first four a day with a people worth +1.

Measured on the headless server (`villages_wares_are_items`): an
`ItemStack` of each of the seventy-six wares at its amount, every
identifier an item the server knows, every amount within a stack. The
form itself, the emeralds leaving and the goods arriving need a real
player (issue #84).

## The gap at a deck joint (design §3)

"Blocks missing where the jigsaw blocks were", seen in game, chased on
both servers:

- A tallfolk village placed on the flat GameTest world had **no air block
  at its paving layer** (a probe scan of the hundred-chunk area at y = −61
  and −62) and **no jigsaw block left** anywhere in it, so a ground
  people's joints and the markers' `final_state` are sound.
- A deerfolk and a reedfolk village generated in the plain world (the
  `dist/bds/probe` server, `locate structure` from spawn, then ticking
  areas) had **no surface hole within twenty blocks of a job post** by the
  probe's `surface-pits` scan (a column whose topmost block has solid
  neighbours on four sides one above it) and no jigsaw block on the
  surface. The first two scans were wrong tools: a box read block by block
  in one tick tripped the script watchdog and stopped the server (`Hang`
  in the probe pack; a `system.runJob` a tile a tick does not), and a pit
  test that counted caves and leaf litter reported thousands.
- The generator's own pieces showed it. For the three peoples on a deck
  (reedfolk at 3, squirrelfolk at 5, wood elves at 6), every marker sits
  in the ground layer, and at deck height the child piece's joint column
  was **air** for the stilt house, the rack, the dock, the tower end, the
  bower, the lookout end, every green and empty lot, and the doorstep
  terminator: the walkway ended on its own edge plank and the next block,
  at the house's door, was a drop of the deck's height where the jigsaw
  block had turned into a log at the ground. `withDoorstep`, `lot` and the
  doorstep piece now put a post column and a plank on every joint column
  (`deckLanding`), and a test asserts every deck joint is bridged. A
  reedfolk and a wood elf village placed on the flat world with the new
  pieces read **one surface pit near their 22 posts**, a plank enclosed by
  four rails on a walkway (not a hole), and no jigsaw block.

## Biome tags, as the server has them

The tags the villages' filters name were read against the server's own
biome definitions (`behavior_packs/vanilla*/biomes/*.json` on BDS
1.26.45.1, every versioned pack, since the cherry grove, the meadow, the
pale garden and the mangrove swamp live in later ones), after a wolffolk
village was found generated on grass:

| Tag | Biomes it is on |
| --- | --- |
| `cold` | cold beach, cold oceans, cold taiga and its hills, **extreme hills, forest, grove, plains**, mega taiga, taiga |
| `frozen` | cold taiga, frozen oceans and river, frozen peaks, ice mountains, ice plains and spikes, jagged peaks, snowy slopes |
| `forest` | every birch forest, every taiga (cold, mega, redwood), extreme hills plus trees, forest and its hills, roofed forest |
| `hills` | every `*_hills` biome: bamboo jungle, birch, cold taiga, **desert, jungle**, forest, mega taiga, taiga |
| `beach` | beach, cold beach, mushroom island shore, stone beach |
| `river` | river, **frozen river** |
| `mushroom_island` | **no biome**: the island's tag is `mooshroom_island` (and its shore's) |
| `mountains` | the peaks and slopes, ice mountains and plains, cherry grove, meadow, grove, and most `*_hills` |
| `taiga`, `birch`, `roofed`, `desert`, `jungle`, `cherry_grove`, `flower_forest`, `meadow`, `pale_garden`, `mangrove_swamp`, `swamp`, `savanna`, `plateau`, `mesa`, `plains`, `extreme_hills` | what their names say |

So the wolffolk's `cold` covered the forest and the plains, the
mousefolk's `mushroom_island` covered nothing, the deer's `forest` was
every wood there is, and the hobbits' `hills` reached the desert. Each
people's filter gained a `none_of` group (`avoid` on the `People`) and
the tallfolk village placed after the change with no content-log line
for any structure file. Whether `none_of` is honoured by the generator
(rather than only loaded) is for a `locate` in a plain world to show.

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
