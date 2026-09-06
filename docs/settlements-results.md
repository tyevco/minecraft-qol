# The builder prototype — findings

**Measured on Bedrock Dedicated Server 1.26.45.1, headless**, with the
builder pack (`packages/builder`) and the probe pack loaded in the GameTest
world. Answers `docs/design/settlements.md` §8 (the must-prototype list) and
records what the pack's own GameTests pinned. The probe is
`qolprobe:blueprint <id> [x y z]` in `packages/probe/scripts/main.js`; the
offline diff of its rotation lines against the generator is
`tools/structures/probe-rotation.ts`; the tests are
`packages/gametest/scripts/suites/builder.ts`, run with `npm run bds:test`.

## The answer

The blueprint scheme stands on the stable API. Every cell of a shipped
`.mcstructure` reads back with its states; a building placed block by block
with `Block.setPermutation` matches the game's own `structureManager.place`
cell for cell, at every rotation; and the generator's rotation tables are the
game's.

| §8 item | Measured |
| --- | --- |
| 1. `Structure.getBlockPermutation` returns every block with its states | **Yes.** Well 5×7×5: 175 cells, 77 blocks (76 and one water), 98 undefined; larder 7×8×7: 392 cells, 163 blocks; wall segment 7×6×3: 126 cells, 102 blocks. Each count is the generator's own for the same file. Undefined is air. Every state the generator wrote came back, plus the engine's own (below). |
| 2. A generated `.mcstructure` loads and places | **Yes.** `structureManager.place` of each building, read back cell for cell against the structure: well 77/77, larder 163/163, wall 102/102, and no block where the structure has none. |
| 3. Which states rotate, and how | **The generator's tables are right** (`turnStates` in `tools/structures/blueprint.ts`, now also `packages/builder/scripts/core/rotate.ts`). Diffed against `place` with `Rotate90/180/270` on all three buildings: `weirdo_direction` 222 of 222 stairs agree, `minecraft:cardinal_direction` 6 of 6 door halves agree. The turned copy keeps its **minimum corner on the origin** and swaps x and z on an odd turn. See the table below for each state. |
| 4. Walking to a placement spot | **Not measured here** beyond reusing the villages' measured mechanism (a `follow_mob` group following a waypoint entity of the pack's own family). The prototype's pace does not wait on the walk. See "The walk". |
| 5. Water: `setPermutation` over water, and the waterlogged layer | **Both fine.** A block set over water leaves the water beside it; a fence or a stair set over water reads waterlogged at once with nothing more done; `Block.setWaterlogged(true)` works; and a structure's second layer is honoured by `place` (a fence and a stair came out waterlogged, the water beside them water). |

## Reading a shipped structure (§8.1)

`qolprobe:blueprint builder:<key>` with no coordinates reads the structure
and mutates nothing. What the game reports, beside what the generator wrote:

| Building | Cells | Types | States seen |
| --- | --- | --- | --- |
| `tallfolk_well` | 175 = 77 blocks + 98 undefined | cobblestone 32, dark_oak_stairs 24, dark_oak_planks 10, oak_fence 8, water 1, lantern 1, dark_oak_slab 1 | `weirdo_direction` 0–3, `upside_down_bit`, `wood_type` {dark_oak, oak}, `liquid_depth` 0, `hanging` true, `minecraft:vertical_half` bottom, `top_slot_bit` false |
| `shared_larder` | 392 = 163 + 229 | spruce_planks 69, spruce_stairs 48, stone_bricks 25, spruce_log 12, chest 5, spruce_door 2, lantern 1, spruce_slab 1 | the above and `stone_brick_type`, `pillar_axis` y, `old_log_type`, `minecraft:cardinal_direction` {north, south}, `facing_direction` 2, `direction` 0, `open_bit`, `upper_block_bit`, `door_hinge_bit` |
| `shared_wall` | 126 = 102 + 24 | cobblestone 77, stone_bricks 12, oak_fence 6, cobblestone_wall 4, stone_stairs 2, lantern 1 | `wall_connection_type_{north,east,south,west}` none, `wall_post_bit` true, `wall_block_type` cobblestone, `hanging` false, `weirdo_direction` 1 |

- **The engine adds alias and default states** the generator never wrote:
  a chest the generator placed with no states reads
  `minecraft:cardinal_direction: north` and `facing_direction: 2`; a door
  reads a `direction` beside its cardinal direction; logs read
  `pillar_axis: y` and `old_log_type`; slabs read `top_slot_bit`. A placer
  that reads cells with `getAllStates()` and resolves them back with
  `BlockPermutation.resolve(type, states)` round-trips all of them (the
  GameTests below compare every state).
- **`getItemStack(1)` on every palette entry** gives back one item of the
  block's own name for all 17 distinct blocks across the three buildings, and
  `undefined` for water. So a materials list is the block names, water aside,
  which is what the table asks for. (A door is two cells and one item; the
  pack charges the lower half only.)
- **`getIsWaterlogged`** is false for every cell of the three buildings,
  which have no second layer, and true for the two cells the probe pool
  structure waterlogs, so the second layer the generator now writes
  (`Blueprint.waterlog`) reaches the API.
- The design's catalogue table (§3) is stale for these three: the well is
  5×7×5 and 76 blocks (not 5×6×5 and 51), the larder 163 blocks in the
  builder pack (161 in the table; its job post is left out, below), the
  wall segment 102 (103). The generator is the authority; the table is a
  sketch.
- The larder carries a `villages:post`. The builder pack stands alone, and a
  block the world does not know is dropped from a structure on load, so the
  builder's copy of each building leaves the post out
  (`builderBlueprint` in `tools/structures/generate.ts`). It comes back when
  the builder moves into the villages pack.

## Rotation (§8.3, §6)

`place` with a `StructureRotation`, read back over a generous box:

| Building | Rotate90 | Rotate180 | Rotate270 |
| --- | --- | --- | --- |
| well, origin 26,−60,10 / 42 / 58 | extents 26..30 × 10..14 | 42..46 × 10..14 | 58..62 × 10..14 |
| larder, origin 30,−60,40 / 50 / 70 | 30..36 × 40..46 | 50..56 × 40..46 | 70..76 × 40..46 |
| wall 7×6×3, origin 30,−60,80 / 50 / 70 | 30..**32** × 80..**86** | 50..56 × 80..82 | 70..72 × 80..86 |

So **the turned copy's minimum corner stays on the origin** (offset 0,0,0
every time), and a 7×3 box turned once is 3×7 from the same corner. That is
also `Blueprint.rotated()`'s coordinate map, one clockwise quarter turn
taking (x, z) to (depth − 1 − z, x): the offline diff found **0 position
misses** for every directional block of every building at every rotation.

The state tables, against the game (the offline diff's tally; "agree" is a
block where the generator's turned value equals the game's):

| State | Agree | Differ | What it means, confirmed |
| --- | --- | --- | --- |
| `weirdo_direction` (stairs) | 222 | 0 | the side the full-height half is on: 0 east, 1 west, 2 south, 3 north |
| `minecraft:cardinal_direction` (doors) | 6 | 0 | the way the closed door faces: south unturned, west after one clockwise turn, north after two |
| `direction` alias on a door | — | — | the game keeps it in step: 0 south, 1 west, 2 north, 3 east (read 1 at Rotate90, 2 at Rotate180) |
| `facing_direction` alias on a chest | — | — | the game keeps it in step with the cardinal direction: 2 north, 3 south, 4 west, 5 east (read 5 at Rotate90, 3 at Rotate180, 4 at Rotate270 for a north chest) |
| `wall_connection_type_*` | 12 | 0 | but every value in these three buildings is `none`: the battlements are lone posts, so a real join is **unmeasured** |
| `pillar_axis` | — | — | only `y` occurs in these three; the x↔z swap is the design's assumption still |
| `upside_down_bit`, `hanging`, `minecraft:vertical_half`, `open_bit`, `upper_block_bit`, `door_hinge_bit` | — | — | not directional; unchanged, as expected |

The bed's `direction`, the ladder's `facing_direction` and a lying log are in
no shipped building yet; `core/rotate.ts` turns them by the same tables,
and a unit test (`packages/builder/tests/rotate.test.ts`) holds core equal
to the generator cell for cell on all three buildings, so the table lives in
one place and the game has agreed with that place wherever it was asked.

## Water (§8.5)

A 5×5 pond one deep on stone bricks, then by script:

| Step | At once | 40 ticks later |
| --- | --- | --- |
| `setPermutation(cobblestone)` at the centre | cobblestone; the four neighbours water | the same |
| `setPermutation(oak_fence)` in the pond | `oak_fence` **waterlogged** | the same |
| `setPermutation(stone_stairs)` in the pond | `stone_stairs` **waterlogged** | the same |
| `fence.setWaterlogged(true)` | returns; waterlogged stays true | — |
| `place(qolprobe:pool)`, a structure whose second layer waterlogs a fence and a stair | fence and stair waterlogged, the water beside them water | — |

So a block set over water by script is waterlogged by the engine on its own,
and neighbours are left alone. The reedfolk stilts are open only on the
design side: a footing over water is refused by `grounded` for these three
ground buildings, and stilts will need their own rule.

## The placer, pinned (`suites/builder.ts`)

Six GameTests, all passing on the headless server, each after the harness's
sweep:

| Test | What it measured |
| --- | --- |
| `builder_well_goes_up_block_by_block` | `builder:place tallfolk_well` at two ticks a block: after 70 ticks some cells stand and not all, and no block stands above a layer with a gap; at the end **all 77 cells match the shipped structure**, type and every state, and every material has left the chest (32 cobblestone, 24 stairs, 10 planks, 8 fences, a slab, a lantern). |
| `builder_refuses_a_block_in_the_way` | a stone inside the box: refused, the verdict `stone is in the way at x,y,z` naming the stone's world position, nothing placed, the chest untouched. |
| `builder_refuses_a_short_chest` | 31 cobblestone for 32: refused, `the chest is short of 1 cobblestone`, nothing placed. |
| `builder_remove_puts_every_block_back` | the well built at a tick a block, then `builder:remove`: every cell air, and exactly the 76 items back in the chest, none more. |
| `builder_free_mode_moves_nothing` | the panel's free-build toggle (the hatch's `free`): the well goes up from an **empty** chest and comes down leaving it empty, so the mode moves nothing either way. |
| `builder_turned_well_matches_the_games_rotation` | the well built by the pack with rotation 1 against `structureManager.place` with `Rotate90` saved from the world: **77 of 77 cells equal**, states included. |

What was learned on the way:

- **A world dynamic property belongs to the pack that set it.** The test
  pack read the builder's `bd:last` and `bd:buildings` as `undefined` in the
  same tick the builder logged writing them, while the builder read both
  back across a server restart ("1 building(s) known"). So the hatch's
  verdict is left where another pack can read it: as the name tag of a
  `builder:verdict`-tagged waypoint entity at the spot asked about, and the
  test's sweep asks the pack to forget its records (`builder:forget x y z
  radius`) rather than reading them. The first run failed every test on
  this: the record from the first well made every later placement "cut into
  the Well".
- **`createFromWorld` saves air as a block**, `minecraft:air`, where the
  generator's file has nothing (index −1, `getBlockPermutation` undefined).
  A comparison against a structure saved from the world must treat air as
  "should be empty" or it counts 98 air cells as matches, which is what "98
  of 77 cells stand" was.
- **A hanging lantern set by script under open air stays put** (the well
  goes up bottom layer first, so the lantern at y = 3 is set before the roof
  at y = 4, and all 77 cells matched at the end), but **the roof block above
  it coming down by `setType("minecraft:air")` pops it** as a drop, and the
  builder then found no lantern to take: "expected 1 lantern back in the
  chest, found 0". So `setPermutation` gives the placed block no neighbour
  update, while removing a block updates its neighbours. The removal order
  now takes an attached block before its support (`removalOrder`,
  `supportOf` in `core/order.ts`); the door's two halves and a bed are the
  same kind of thing and are not yet in a tested building (below).
- The pace holds without the walk: with `PATIENCE` of two beats, a cell out
  of the builder's reach waits two beats and is then placed regardless, so
  the well at two ticks a block finished inside the test's budget with the
  builder walking behind.

## The walk (§8.4)

Not measured for its own sake. The builder is a `builder:builder` biped
with the villages' measured walking group, `follow_mob` filtered to the
`builder_waypoint` family, and `engine/walk.ts` keeps one waypoint per
builder, teleported from cell to cell and replaced before its ninety-second
timer. The GameTests log the builder arriving and finish on time, which
says the walk does not get in the way; whether it *reads* as a person
building (arrives before the block appears, faces the work, does not stand
in the wall) needs a client, and is in the pack README under "To confirm in
game" and issue #79. Repair and survey are #78; the move into the villages
pack is #80.

## How the measurement was taken

- The probe pack is not in `PACKS` and its manifest sits at its root, so it
  was copied into `development_behavior_packs/qolprobe` by hand (manifest,
  `scripts/`, `structures/`; not `worldgen/`, which would generate wells in
  the test world) and its uuid added to `world_behavior_packs.json`, then
  taken out again before the GameTests ran.
- `tickingarea add 0 -64 0 159 -40 159` first: the placements run to x ≈ 90
  and a chunk nobody loads reads as nothing.
- The first probe run left no log: `run.mjs` piped through `head` died on
  the closed pipe before it wrote the file. Run it with `--quiet` and read
  the log afterwards. And `pkill -f bedrock_server` kills the shell that ran
  it, since the pattern matches its own command line; `pkill -x`.
- The rotation diff is `npx ts-node -P tools/tsconfig.json
  tools/structures/probe-rotation.ts dist/bds/probe-blueprint.log`.
