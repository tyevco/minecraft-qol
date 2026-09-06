# Builder

A blueprint table and a builder who raises buildings from it, one block
every few seconds, paid for from the chest beside the table. A prototype of
the settlements' builder (`docs/design/settlements.md` §5, `docs/design/npcs.md`
§4), standing alone as its own pack so it can be measured before the builder
job in the villages pack takes it over. Measurements:
`docs/settlements-results.md`.

## What is built

- **Three blueprints**, written by the structure generator into
  `behavior_pack/structures/builder/` as `builder:tallfolk_well`,
  `builder:shared_larder` and `builder:shared_wall`, from the same source as
  the catalogue (`tools/structures/buildings.ts`, `builderBlueprint` in
  `generate.ts`). The larder's job post is left out: it is the villages
  pack's block, and a block the world does not know is dropped from a
  structure on load. One **blueprint item** per building
  (`builder:blueprint_<key>`, a plain item with the `builder:blueprint`
  custom component naming the key), in the creative menu under crafting.
  The trader will sell them (#73).
- **The blueprint table** (`builder:blueprint_table`): an oak table with a
  drafting sheet on it, the `builder:table` custom component. Tap it
  **holding a blueprint** and a form shows the building, its size after
  turning, the way the door will face, every material against what the
  chest beside the table holds, and "Place here" if it can go ahead. The
  building goes at your feet: its minimum corner is the block you stand on
  (the footing replaces that block, as the design's "y = 0 at the ground"
  says), it runs **east and south** from there, and it is turned so the door
  faces the way you face, to the nearest quarter. Tap the table
  **empty-handed** for what it has raised: take a building down, or carry on
  with one the builder stopped on.
- **The checks** (`scripts/core/checks.ts`, pure, under Vitest), in the
  design's order, each naming the first offender: **fits** (every cell of
  the whole box is air, a plant, snow or water; the footing layer may also
  be natural ground, or no field could ever be built on), **grounded** (a
  solid block under every footing cell; water is refused for these three),
  **not overlapping** another recorded building (boxes may touch), a chest
  beside the table, and **paid for** (what is short, listed).
- **The builder** (`builder:builder`, a tallfolk biped in the builder's
  outfit on the villages' rig, spawned on the table when a job starts if
  none is tagged for that table). It is sent to each cell by a
  `builder:waypoint` its `follow_mob` group follows, the villages' measured
  mechanism, and puts one block down every N seconds (the panel's slider,
  default 4), **bottom layer up, far corner toward the door, water last in
  its layer**. Each block costs one item taken from the chest in the same
  step; a cell the structure waterlogs is waterlogged after it is set. The
  walk is best effort: a cell out of reach waits two beats and is then
  placed regardless, so the pace never hangs on pathfinding.
- **Remove**: the same list backwards, an attached block before its support
  (a hanging lantern before the roof it hangs from, or the game pops it onto
  the ground), each block's item into the chest **before** the block goes. A
  block that is no longer the building's (a different type stands there) is
  left alone and skipped. If the chest is gone, short or full the job stops
  where it is and says so; the record keeps its progress.
- **Records** in the shared position index (`bd:buildings`, schema 2),
  keyed by the building's origin: key, rotation, box, phase (building,
  built, removing), how far it got, and the table it was raised from. Jobs
  saved mid-way resume a few seconds after the world loads.
- **The settings panel**: seconds between blocks (1–30, default 4); who
  may use the table (operators; members and operators, the default;
  everyone); and **buildings are free** (off by default): the table takes
  nothing from the chest and needs none, the form says so, and a building
  raised free returns nothing when it is taken down. The record remembers
  which it was, so turning the toggle off again cannot turn a free building
  into a chest of materials. The hatch's `free` word builds the same way.
- **Script events**, console or operator only: `builder:debug`;
  `builder:place <key> x y z <rotation> [ticksPerBlock]`, the form's path
  from a command (the origin is the footing corner, the table the nearest
  within sixteen blocks, the rotation 0–3, degrees, a `StructureRotation`
  name or the way the door should face); `builder:remove x y z
  [ticksPerBlock]`; `builder:resume x y z`; `builder:forget x y z [radius]`.
  Each leaves its verdict as the name tag of a `builder:verdict`-tagged
  waypoint at the spot for sixty ticks, because a world dynamic property
  cannot be read from another pack (measured).

Not built, filed as issues: **repair** and **survey** (§5.4, #78); the
hand-over into the villages pack, where the builder job does this work and
the trader sells the blueprints (#80, #73). The rest of the catalogue and the
palette swaps wait on that.

## Measured

- Everything in `docs/settlements-results.md`: every cell of a shipped
  structure reads back with its states; `place` matches the file 77/77,
  163/163, 102/102; the generator's rotation tables are the game's (222
  stairs, 6 door halves, the corner staying on the origin); blocks set over
  water are waterlogged on their own and the structure's second layer is
  honoured.
- **Seen on a client** (the first in-game look): the builder appears at
  the table, walks to the well and places it, in the blue outfit with the
  hammer showing. Two things came of it: the well's first layer sits in the
  turf and could not be seen going in, so a job now pulses sparks
  (`minecraft:endrod`) round the box's edges every second while it runs and
  the chat names the corner, the extent and the door's facing; and the
  hammer hung head-down along the forearm, so the rig gained an upright
  grip (`toolUp` in `tools/models/generate.ts`), used by the builder only
  until the villages' people are looked at the same way.
- Five GameTests pass headlessly (`suites/builder.ts`): the well goes up
  block by block and matches the structure cell for cell, materials gone
  from the chest; a stone in the way is refused by name and position; a
  chest one cobblestone short is refused naming it; remove puts exactly the
  76 items back; the well turned once by the pack equals the game's
  `Rotate90` placement cell for cell; a free well goes up from an empty
  chest and comes down leaving it empty.

## To confirm in game

Nothing here has been seen on a client; a SimulatedPlayer is no player to
this pack, so the form, the roles and the look are unmeasured. The list is
issue #79; paste what you see there.

- **The form** opens on tapping the table with a blueprint in hand, shows
  the materials and "Place here", and the building starts where you stand,
  running east and south, the door facing the way you faced. If the
  interact fires but no form shows, the block hook may need to open it from
  `world.beforeEvents.playerInteractWithBlock` instead; if the door faces
  the wrong way, `rotationFromYaw` in `core/rotate.ts` is the one line
  (yaw 0 is taken as south).
- **The empty-hand form** lists this table's buildings with "Take down" and
  "Carry on", and a visitor is turned away with the panel at its default.
- **The builder's look**, seen once: a tallfolk in the blue outfit, hammer
  showing. Still to judge: the hat hidden, the pack on its back, the swing
  while placing (`builder:working` reaching the client), and the hammer now
  held upright.
- **The outline**: sparks round the box just above the footing and up its
  corners, every second while the builder works, and the chat line naming
  the corner and extent. If they cannot be seen in daylight, `PARTICLE` in
  `engine/outline.ts` is the one name to change.
- **The walk reads as building**: the builder arrives at the cell before
  or as the block appears at four seconds a block, and does not end up
  inside the wall it is building. If it lags, `PATIENCE` in `engine/jobs.ts`
  (beats it may take) and the waypoint's `search_range` (48) in
  `entities/builder.json` are the numbers; if it walks into the well, the
  waypoint should stand outside the box rather than on the cell.
- **The verdict marker** is a waypoint entity with a name tag, so for sixty
  ticks after a hatch the builder may walk toward it; it is only spawned by
  the script events, never by the form.
- **A door comes down whole**: the larder's door is two cells and one item;
  taking the upper half first may pop the lower as a drop the way the roof
  popped the lantern. Not in a GameTest because the larder is 7×8×7 and the
  arena is 8 high with the floor at 0. If the door item lands on the ground,
  `supportOf` in `core/order.ts` should name the lower half as the upper's
  support, and the lower half's own removal should be checked for a drop.
- **Water in the well**: placed last in its layer with no item taken. If it
  flows out before the ring closes (it should not: the ring is placed
  first), or a bucket is expected, `itemFor` in `core/blueprint.ts` is the
  rule.
- **A real slope**: the footing replaces the turf under the whole box only
  where it is natural ground (`isGround` in `core/checks.ts`); a box with
  a fence or a chest on its footing layer is refused by name. On a slope
  the higher cells of the footing layer are air and the lower ones
  ground, which is accepted; the box above the footing must be clear.
- **Structures are cached per world at first use** (villages findings), so
  a world that has loaded `builder:tallfolk_well` once keeps that version
  across pack updates; a changed building needs a new identifier or a
  fresh world.
