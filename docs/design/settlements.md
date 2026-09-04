# Settlements — Design

**Where the peoples live: four settlement shapes, twenty buildings, and the blueprint catalogue a builder works from**

Companion to `design/npcs.md` · Draft v0.1

> Planned, not built. Every building here exists as a generated blueprint
> under `concepts/structures/` (a `.mcstructure` the game could place and a
> preview the viewer draws under `concept · <people> buildings`, with a
> cutaway slider). Nothing has been placed in a world. The point of this
> phase is to have the whole set designed before any builder code exists, so
> the builder is written against a catalogue rather than a guess.

---

## 1. The stance

A settlement is **a place the kids grew, not a place that spawned.** There
is no world generation and no village-finding: the first building of any
settlement is raised by a builder from a blueprint the kids paid for, on
ground they chose. So every rule below is about what a builder can put up
one block at a time, and how a handful of small buildings become a place.

- **Small footprints.** The biggest building is 13 wide. A builder places a
  block every few seconds, so a 650-block hall is about half an hour of
  game time to watch go up, and a 50-block well is a few minutes. Big is
  earned by adding buildings, not by big buildings.
- **One palette per people.** You should know whose settlement you are in
  from the roofline: steep dark tile on stone (stonefolk), thatch on stilts
  over water (reedfolk), copper and brick with chimneys (tinker), dark oak
  gables on cobblestone footings (tallfolk). Four blueprints per people, plus
  four shared ones any settlement can have.
- **Every job block is a building.** The guard post, forge, dock, barn,
  workshop and stall from `npcs.md` are buildings here, so hiring a person
  means having raised the place they work.
- **Buildings are honest.** A storehouse holds barrels, an inn holds beds, a
  larder holds chests. The furniture inside is the settlement's actual
  storage and respawn, not set dressing.
- **Rejected:** procedural streets, a settlement "level", any building that
  needs a block state the placer cannot set yet (stairs, doors, beds are
  stand-ins; §5).

## 2. The four settlement shapes

Each people has a **core** (the building a settlement starts from), a
**home** (repeated per household), a **work** building (the worker's job
block), and a **watch** (the guard's). A settlement is one core, any number
of homes, and as many work and watch buildings as the kids raise. Where the
trader stands, the larder and the inn are shared (§3.5).

### 2.1 Stonefolk — the hill hall

Built into a slope, buildings terraced on stone brick footings. The hall is
the core: a long room with a hearth ring, where the settlement's chests sit
against the back wall. The forge is a room beside it under a brick chimney.
Watch posts stand at the edges, one per approach, and a guard walks between
two of them. Homes are not separate: stonefolk live in the hall, so a bigger
settlement raises a second hall rather than cottages.

Layout, seen from above, hall facing south:

```
   [watch]                 [watch]
        [forge] [ HALL ] [store]
              [larder] [stall]
   [watch]                 [watch]
```

### 2.2 Reedfolk — the stilt village

Over water: a river, a marsh, the edge of a lake. Every building stands on
mangrove logs, and the settlement is joined by bridge spans rather than
paths. The dock is the core: work, arrival and the trader's stall are all on
it. Stilt houses stand two or three spans away, each with a deck facing the
water. The reed tower is the watch, slender enough to be seen across the
marsh. Drying racks on the bank say what the settlement eats.

```
        [tower]
   [house]--[bridge]--[house]
              |
     [rack] [ DOCK ] [stall]
              |
           [house]
```

### 2.3 Tinker — the workshop yard

A yard of brick round a copper still, on flat ground where pipes can run. The
workshop is the core and the job block of both the worker and the builder:
a smoker, a smithing table, a crafting table, and a chimney that a Fluidworks
pipe would climb. The still is the landmark and, at its foot, the trader's
stall. Tinkers sleep in burrows: half-sunken brick rooms with turf roofs,
which is also why the settlement is low and wide.

```
   [burrow] [burrow] [burrow]
        [ WORKSHOP ]  [still][stall]
   [burrow]   [larder]   [watch]
```

The tinker watch is the stonefolk watch post in brick and copper; a palette
swap, not a new blueprint (§4).

### 2.4 Tallfolk — the farmstead

Open ground. The farmhouse is the core and the home at once, a barn is the
work building, and a well marks the square between them. Fields are what the
kids plant; the worker tends them, and the barn holds the hay, the sheep and
the horses. The gatehouse and wall segments make a palisade when the kids
want one, and a guard walks its walkway.

```
   [gate]===[wall]===[wall]===[wall]
   ||  [farmhouse]  [well]  [barn]  ||
   ||      [larder]  [inn] [stall]  ||
```

### 2.5 Shared

The **larder** (chests the guards eat from and the workers fill), the
**inn** (beds and the innkeeper's respawn point, so a settlement is a
Hearthstone place), the **bridge span** and the **wall segment** are built
in oak and cobblestone so they sit in any settlement. The market stall is
authored under tinker but is the trader's block for every people, with the
awning colours swapped.

## 3. The catalogue

Twenty blueprints, all generated by `tools/structures/buildings.ts`. Sizes
are the tight box in blocks (x × y × z); counts exclude water. Materials are
what the blueprint table would ask for, and the top three are listed so the
scale of the ask is visible.

### 3.1 Stonefolk

| Key | Building | Size | Blocks | Main materials | Role |
| --- | --- | --- | --- | --- | --- |
| `stonefolk_hall` | Hill Hall | 13×10×11 | 664 | deepslate_tiles 374, stone_bricks 219, polished_deepslate 57 | core and home |
| `stonefolk_forge` | Forge | 9×11×9 | 319 | deepslate_tiles 161, bricks 65, stone_bricks 61 | work (worker) |
| `stonefolk_watchpost` | Watch Post | 7×11×7 | 233 | cobblestone 91, stone_bricks 74, polished_deepslate 32 | watch (guard) |
| `stonefolk_store` | Storehouse | 9×9×9 | 295 | spruce_planks 165, stone_bricks 119, barrel 8 | storage |

### 3.2 Reedfolk

| Key | Building | Size | Blocks | Main materials | Role |
| --- | --- | --- | --- | --- | --- |
| `reedfolk_stilt_house` | Stilt House | 9×12×11 | 361 | bamboo_mosaic 165, mangrove_planks 120, mangrove_log 65 | home |
| `reedfolk_dock` | Dock | 5×4×11 | 49 | mangrove_planks 32, mangrove_log 12, lantern 2 | core and work |
| `reedfolk_rack` | Drying Rack | 7×4×3 | 35 | mud 21, mangrove_log 6, mangrove_fence 6 | decoration |
| `reedfolk_tower` | Reed Tower | 7×15×7 | 203 | mangrove_planks 49, bamboo_mosaic 35, bamboo_planks 32 | watch |

### 3.3 Tinker

| Key | Building | Size | Blocks | Main materials | Role |
| --- | --- | --- | --- | --- | --- |
| `tinker_workshop` | Workshop | 11×12×9 | 419 | cut_copper 205, bricks 144, oxidized_copper 28 | core and work (worker, builder) |
| `tinker_still` | Copper Still | 7×14×7 | 252 | weathered_copper 83, copper_block 82, cut_copper 36 | landmark |
| `tinker_stall` | Market Stall | 7×5×7 | 117 | bricks 49, red_wool 28, white_wool 21 | trader (every people) |
| `tinker_burrow` | Burrow | 9×6×9 | 253 | grass_block 130, bricks 114, copper_block 3 | home |

### 3.4 Tallfolk

| Key | Building | Size | Blocks | Main materials | Role |
| --- | --- | --- | --- | --- | --- |
| `tallfolk_farmhouse` | Farmhouse | 11×11×11 | 627 | dark_oak_planks 310, oak_planks 149, cobblestone 113 | core and home |
| `tallfolk_barn` | Barn | 11×12×13 | 749 | dark_oak_planks 431, spruce_planks 145, coarse_dirt 99 | work |
| `tallfolk_well` | Well | 5×6×5 | 51 | cobblestone 32, dark_oak_planks 9, oak_fence 8 | square |
| `tallfolk_gatehouse` | Gatehouse | 9×6×5 | 117 | cobblestone 45, oak_log 40, oak_planks 21 | watch, palisade opening |

### 3.5 Shared

| Key | Building | Size | Blocks | Main materials | Role |
| --- | --- | --- | --- | --- | --- |
| `shared_larder` | Larder | 7×8×7 | 161 | spruce_planks 118, stone_bricks 25, spruce_log 12 | the upkeep chest |
| `shared_inn` | Inn | 11×12×11 | 670 | dark_oak_planks 310, spruce_planks 158, cobblestone 81 | beds, innkeeper |
| `shared_bridge` | Bridge Span | 5×4×9 | 55 | oak_planks 21, oak_log 18, oak_fence 14 | joins, end to end |
| `shared_wall` | Wall Segment | 7×6×3 | 103 | cobblestone 77, stone_bricks 14, oak_fence 7 | palisade, side by side |

### 3.6 Conventions every blueprint follows

- **Faces south.** The door is on the +z wall, as the block models' fronts
  are, so "stand where the corner should be and face the way you want the
  door" is one rule for everything.
- **Ground is y = 0.** The bottom layer is the footing (stone bricks,
  cobblestone, bricks) or water for the reedfolk. A blueprint is placed with
  its y = 0 at the ground block the player is standing on, so a footing
  replaces the top layer of turf rather than sitting on it.
- **One block of clearance.** Roofs overhang the walls by one, so the box is
  two wider than the room; the placer checks the whole box (§5.2).
- **Lit inside.** A lantern hangs under every roof, so a raised building
  never spawns anything the Lens would flag.
- **Furniture is the real thing.** Chests, barrels, blast furnaces, a smoker,
  a smithing table, a crafting table and a campfire are placed as blocks,
  and the larder's chests are what the upkeep loop reads.

## 4. Palette swaps

A watch post in brick and copper is a tinker watch; a stall with green and
white wool is a reedfolk stall. Rather than four blueprints for the same
shape, a blueprint carries **a palette of roles** (footing, wall, corner,
roof, ridge, awning) and a people's palette fills them. The generator's
`Cottage` record is the first form of that: the same `cottage()` call draws
the forge, the farmhouse, the barn, the workshop and the inn. When the placer
is built, palette swap is a substitution over the structure's block palette
before placement, not a second file.

| Role | Stonefolk | Reedfolk | Tinker | Tallfolk | Shared |
| --- | --- | --- | --- | --- | --- |
| footing | stone_bricks | mangrove_log (stilts) | bricks | cobblestone | stone_bricks / cobblestone |
| wall | stone_bricks | mangrove_planks | bricks | oak_planks / spruce_planks | spruce_planks |
| corner | polished_deepslate | mangrove_log | copper_block | oak_log / spruce_log | spruce_log |
| roof | deepslate_tiles | bamboo_mosaic | cut_copper | dark_oak_planks | spruce / dark_oak |
| ridge | polished_deepslate | mangrove_log | oxidized_copper | dark_oak_log | dark_oak_log |
| window | glass_pane | glass_pane | glass | glass_pane | glass_pane |
| awning | red / white wool | green / white wool | red / white wool | yellow / white wool | — |

## 5. How a builder raises one

The scheme from `npcs.md` §4, made concrete against these files.

### 5.1 Blueprint items and the table

Each `.mcstructure` ships in the pack's `structures/` folder under
`settlements:<key>`. A **blueprint item** per building (one item, a
`settlements:blueprint` custom component with the key in a tag) goes into the
**blueprint table**. The table's form shows the building's name, its size,
its materials list from the structure's palette counts, and a "place here"
button. Placement is at the player's feet, snapped to the block they stand
on, facing the way they face (rotated to the nearest of the four
`StructureRotation` values).

### 5.2 Checks before anything is placed

All of these are pure functions over the structure's block list and the
world's blocks in the box, so they live in `core/` and are unit tested:

1. **Fits.** Every cell in the box is air, a plant, snow, or water (for a
   reedfolk blueprint, water is required under the stilts). The first
   offending block is shown to the player as a coordinate and a name.
2. **Grounded.** Every footing block at y = 0 has a solid block beneath it,
   or water for stilts. A blueprint half over a cliff is refused.
3. **Paid for.** The chest beside the table holds every material; the form
   lists what is short.
4. **Not overlapping another blueprint.** The position index records every
   placed building's box; boxes may touch (walls and bridges join) but not
   intersect.

### 5.3 Placing

The builder walks to each block's position, from the bottom layer up and
from the far corner toward the door, taking one item per block from the
chest and calling `Block.setPermutation`. One block every four seconds by
default (a slider). Order matters for the look: a wall rising before its
roof is what the kids want to watch. A `Structure.getBlockPermutation` read
per cell gives the block and its states, so a blueprint with stairs places
stairs correctly once the placer passes states through.

### 5.4 Repair, survey, remove

- **Repair**: for a building in the index, diff the structure against the
  world and place what is missing, from the chest.
- **Survey**: `createFromWorld` over a box the kids mark with two blocks,
  saved as a new blueprint item, so their own house becomes a catalogue
  entry. Capped at 16×16×16 so a survey is a building and not a base.
- **Remove**: a builder pointed at a building takes it down in the reverse
  order into the chest. This is the "fail towards the player" path: nothing
  is destroyed, and a wrongly placed building costs time, not materials.

## 6. Stand-ins to replace once the placer handles block states

The generator writes plain block names. These are stand-ins and the doc says
so, so nobody mistakes them for the final look:

| Stand-in | Final | Why not now |
| --- | --- | --- |
| stepped full-block roofs | stairs, slabs at the eaves | stair `weirdo_direction` and `upside_down_bit` are states; the placer must pass states first |
| white wool + red wool | beds | a bed is two blocks with a `direction` state and a head/foot pair |
| a door-sized air gap | doors | doors are two blocks with `door_hinge_bit`, `open_bit`, `upper_block_bit` |
| a scaffolding column | ladders | ladders need `facing_direction` |
| cobblestone_wall battlements | the same | already fine; listed so the wall block's connect states are known to be engine-set |

`Blueprint.set` already takes states and writes them to the palette, so the
generator can author these the moment the placer reads them; the change is
in `buildings.ts`, not in the format.

## 7. What the stable API gives

| Need | Stable mechanism |
| --- | --- |
| Ship a blueprint | `structures/` in the behavior pack; `world.structureManager.get("settlements:<key>")` |
| Read it block by block | `Structure.getBlockPermutation(location)`, `Structure.size` |
| Place one block | `Block.setPermutation(permutation)` |
| Preview the whole thing | `structureManager.place` with `animationMode` for the ghost, then undo by placing the saved air box; or draw the outline with particles |
| Survey | `structureManager.createFromWorld(id, dimension, from, to, { saveMode: World })` |
| Rotation | `StructureRotation` on `place`; for block-by-block placement, rotate coordinates in `core/` and rotate `direction`-style states by table |
| Ownership | position index (`packages/shared/engine/positionIndex.ts`) keyed by the box's origin |

## 8. Must prototype

1. **`Structure.getBlockPermutation` on a shipped `.mcstructure`** returns
   every block, including furniture and states, in the stable API. The whole
   scheme rests on this; probe it first with `qolprobe:blueprint`.
2. **A generated `.mcstructure` loads.** `tools/structures/nbt.ts` writes
   the arena for GameTest already; a building with a real palette and
   states has not been loaded. Place `settlements:tallfolk_well` with
   `/structure load` and compare with the preview.
3. **Rotation of states** when placing block by block: which state names
   need rotating (`direction`, `facing_direction`, `weirdo_direction`,
   `pillar_axis`) and how the values map.
4. **Walking to a placement spot**: a `home` that moves per block, or a
   `teleport` step per placement, and how it reads (§4 of `npcs.md`).
5. **Water under stilts**: whether `setPermutation` over water leaves the
   water in the neighbours and whether the `waterlogged` list in the
   structure is honoured by `place`.

## 9. Where this goes next

1. Probe §8.1 and §8.2, record the results in `docs/settlements-results.md`.
2. Blueprint table, blueprint items, the placer's pure checks (§5.2) under
   test, and a builder that places from the chest. Three blueprints to
   start: well, larder, wall segment. They are small and have no stand-ins.
3. Stairs, doors and beds in the generator once states pass through.
4. The rest of the catalogue, one people at a time, in the order the kids
   want to live in them.
