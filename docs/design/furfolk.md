# Furfolk — Concept Sheet

**Animal peoples for the villages: foxes, cats, wolves, rabbits, bears, fennecs, mice, squirrels, otters and deer in the job outfits the four peoples already wear**

Companion to `design/npcs.md` and `design/villages.md` · Draft v0.1

> Concept with models, not a build order. It was prompted by a shelf of
> flocked animal figures in a toy shop — rabbits on bicycles with race
> numbers, a bear family at a picnic, a cat at a piano, a hedgehog in
> glasses — that one of the kids did not want to leave. Everything the four
> peoples have (one rig, job outfits, posts, generated villages, standing)
> carries over; what is new is the head, the tail and the village each people
> builds. The ten peoples have generated rigs, four job atlases and an
> animation set each under `concepts/entities/`, listed in the viewer as
> `concept · furfolk` beside the four (`npm run viewer`). The first five
> came from the shelf; the second five (§3.6–3.10) were picked from the
> "later" list once the first five could be seen. Nothing here has been
> run in game. §7 says what to prototype and §8 where to start.

---

## 1. The stance

The four peoples (`npcs.md` §2) are humans of different proportion. The
figures the kids like are **animals in clothes**: a fox in dungarees, a
rabbit in an apron, a bear in a straw hat. They work as toys for reasons the
peoples can borrow directly:

- **Everyone has a job and an outfit for it.** That is the villages' scheme
  already: four jobs, each an outfit painted for the people's proportions,
  each with an accessory bone. An animal people is a new head and body on
  the same outfits; the guard's breastplate and the trader's coat need no
  redesign.
- **The proportion is the charm.** A head about two fifths of the height,
  a small body, short legs, black bead eyes and no mouth to speak of. That
  is a set of numbers to the biped builder, not a new builder.
- **Hats have ear holes.** Ears go up through the cap, the straw hat and the
  helmet. On the model that is an ear cube standing taller than the hat
  cube, which is exactly what a rendered hat with holes looks like.
- **Families and neighbours, not factions.** Fox and rabbit villages are
  two kinds of village, not predator and prey. Nothing here hunts anything.

The rules of `villages.md` §1 hold unchanged: villages are found, nothing
spawns on its own, every person is a post's person, standing is per player,
nothing is taken from a village. Rejected:

- **Replacing the four.** They are built, their pieces are measured, and a
  world that has loaded them keeps them (the template cache in the
  corrections table). The furfolk are **additional** peoples with new
  identifiers. Giving the four animal heads later is a geometry and texture
  change on the same bones, and §3.12 says which animal each would be if
  that is ever wanted; it is not this proposal.
- **Children and breeding.** A village is peopled by its posts; a small
  people reads young enough, and the tinker already does. A "young"
  variant is a scale group away if a kid asks, but it would be a look, not
  a mechanic.
- **Predation, hunting, or a wolf that eats a sheep.** A wolffolk fisher
  fishes; nobody's trade kills anything.
- **Talking.** Still forms with three or four buttons.
- **Pets.** A cat that sits on your chest is the hatchling's territory, not
  a people.

## 2. What the toy look means for the rig

One change to the biped builder in `tools/models/generate.ts`, built: the
rig is split out (`bipedRig`) and a `furred()` builder adds three bones
and one substitution to it, writing to `concepts/entities/models/`. The
deer's antlers are three more cubes on the head bone, not a bone of their
own, since nothing moves them.

| Part | Today | Furfolk |
| --- | --- | --- |
| `head` cube | skin sides, `face` front, `hair` on top | `fur` all round, `muzzleFace` front (bead eyes, no mouth); markings per people |
| `beard` / `goggles` | optional cubes on the head | not used; the `muzzle` takes the same slot |
| **`muzzle`** | — | a cube on the head's front, low: 4×3×2 for most, 4×3×3 for wolf, bear and deer, 3×2×2 for cat, rabbit, fennec and squirrel, 3×2×3 for the mouse; nose on the up-front edge |
| **`left_ear`, `right_ear`** | — | children of `head`, pivot at the head top so a flick rotates them; shape per people (§3). On the top edge for most, on the sides for bear, mouse and otter |
| **`tail`** | — | child of `body`, pivot at the hip's back; a kind per people: bushy (fox), brush (fennec), thin (cat) and plume (squirrel) with a `tail_tip` segment, whip (mouse), rudder (otter), straight (wolf), puff (rabbit, deer), stub (bear) |
| **antlers** | — | deer only: an upright, a beam and a prong per side, on the head, through the hat |
| `helmet`, `hat`, `pack`, `tool` | accessory bones by job | unchanged; ears stand through the hat and helmet |
| `body`, arms, legs | outfit windows by proportion | unchanged builder; `hand` painted as fur, not skin |

Proportions, in the builder's `[w, h, d]` units (a block is 16), with the
`minecraft:scale` the people's component group would set. All are shorter
than a player, as the figures are shorter than a hand:

| People | Head | Body | Arm | Leg | Height (units, scaled) | Scale |
| --- | --- | --- | --- | --- | --- | --- |
| Foxfolk | 8×8×8 | 6×8×4 | 3×8×3 | 3×6×3 | 22 → 19 | 0.85 |
| Catfolk | 8×7×8 | 6×8×4 | 3×8×3 | 3×6×3 | 21 → 18 | 0.85 |
| Wolffolk | 8×8×9 | 8×10×4 | 4×10×4 | 4×8×4 | 26 → 27 | 1.05 |
| Rabbitfolk | 8×8×8 | 6×7×4 | 3×7×3 | 3×5×3 | 20 → 16 | 0.8 |
| Bearfolk | 9×8×9 | 10×10×5 | 4×10×4 | 4×7×4 | 25 → 29 | 1.15 |
| Fennecfolk | 8×7×8 | 5×7×4 | 3×7×3 | 3×5×3 | 19 → 15 | 0.8 |
| Mousefolk | 7×6×7 | 5×6×3 | 2×6×2 | 3×4×3 | 16 → 10 | 0.65 |
| Squirrelfolk | 8×7×8 | 5×7×4 | 3×7×3 | 3×5×3 | 19 → 16 | 0.85 |
| Otterfolk | 8×7×9 | 6×9×4 | 3×9×3 | 3×6×3 | 22 → 20 | 0.9 |
| Deerfolk | 8×8×8 | 6×12×4 | 3×12×3 | 3×11×3 | 31 → 34 | 1.1 |

For comparison the tinker is 21 units at 0.75 and the tallfolk 34 at 1.15.
The head is two fifths of the body-plus-legs height or more in every row
but the deer's, which is the one people meant to read as tall and thin
rather than as a toy; that ratio is the whole difference between "a short
villager" and "a toy".

**Textures** (built). A `FURRED` atlas layout in `tools/atlases.ts` keeps
the `BIPED` tiles in their slots and adds `muzzle`, `ear`, `tail` and
`tailTip` in a fifth row and column (80 px). `skin`, `face`, `hair`,
`hairTop` and `hand` are painted by fur painters in `tools/textures/tiles.ts`:
`furTile(coat)` (a soft grain in the coat colour), `furFaceTile(fur, w, h)`
(two 2×2 bead eyes with a single glint pixel each, no mouth, markings drawn
from a small per-people list: cheeks, blaze, stripes, mask, ear tips, brow),
`muzzleTile` (pale fur, the nose at the top of the window, the top-left
corner left plain for the muzzle's other faces), `earTile` (the coat round a
pink inside), `tailTile` and `antlerTile`. A people's tail tip is pale
unless its `tip` says otherwise (the fennec's is dark, the squirrel's its
own coat). The window sizes are the model's, as now, and
the two generators' comments keep saying so. The four job looks (`JOBS` in
`tools/textures/generate.ts`) are reused as they are, so a foxfolk guard
wears the same breastplate as a stonefolk one.

**Coats.** The figures come in colour families (a chocolate rabbit and a
milk rabbit are the same rabbit). A second coat per people doubles the
atlases from four to eight per people, all generated. Which coat a post's
person wears would come from a hash of the post's position, so the record
does not change and a respawned person keeps its coat. Worth having, not
worth doing first; §8.

**Animation** (built as concepts). `tools/animations/generate.ts` emits one
`furredSet` per people, since the generator checks every animated bone
against the geometry and only the cat and the squirrel have a `tail_tip`: the biped idle,
walk and work, plus an ear flick now and then (a clipped sine, so the ears
rest most of the time), a tail swish in the idle and walk, and a tail sway
on the work swing. Whether a shipped pack could instead use one set naming
bones some geometries lack is §7 item 4; if it can, the five sets fold back
into `bipedSet`.

## 3. The peoples

Names are placeholders in the `-folk` pattern the pack uses; the kids may
well have better ones, and the display name is one line in `en_US.lang`.
Each row is: the look, the village, the trade its village carries, and what
it likes. Palette roles are those of `settlements.md` §4; a people whose
buildings are a palette swap on the `cottage()` shapes needs only its
signature pieces drawn.

### 3.1 Foxfolk — the berry pickers

- **Look:** rust coat, white muzzle, cheeks and chest, dark ear tips and
  dark "socks" on the arms and legs. Tall ears (3×6×1, splayed
  out). A big bushy tail (3×3×8) with a white tip, held low; the tail alone
  says fox from behind.
- **Where:** taiga and old-growth taiga, where the game's own foxes live;
  not the snowy kind (`cold`), which is the wolffolk's. Tags to check
  against `bedrock-samples/behavior_pack/biomes` as the four's were.
- **Village:** low spruce cabins with mossy roofs, half sunk into the ground
  (`terrain_adaptation: bury` on the house pieces is the thing to try, §7
  item 6), lanterns on every post because foxes are up at dusk. Palette:
  footing cobblestone, wall spruce planks, corner spruce log, roof moss
  block over spruce, ridge stripped spruce, awning orange and white wool.
  Signature pieces: a **berry patch** (a green of sweet berry bushes with a
  worker's post and a barrel) and a **den** (the core: a low mound with a
  round door and a chimney).
- **Trade:** **forager** (§5), new: picks ripe sweet berries within twelve of
  the post.
- **Likes:** sweet berries, glow berries, eggs. **Sells at Friend:** sweet
  berry bushes' seeds (sweet berries), lanterns, spruce saplings.

### 3.2 Catfolk — the weavers

- **Look:** a grey tabby with darker stripes across the top of the head and
  down the tail; a cream muzzle; small ears (3×5×1). A thin tail in
  two segments (1×1×4 and 1×1×3) so the tip can curl up. The smallest
  muzzle: cats are flat-faced in the figures.
- **Where:** cherry grove and flower forest (the tallfolk's filter excludes
  `mutated` biomes, so the flower forest is free). Tags to check.
- **Village:** terracotta and cherry planks, wool awnings everywhere, roofs
  with a flat sunny ledge. Palette: footing terracotta, wall cherry planks,
  corner cherry log, roof pink terracotta stairs, ridge cherry log, awning
  pink and white wool. Signature pieces: a **paddock** (fenced grass with two
  sheep, a worker's post and a chest; the sheep are the trade's raw
  material and are never harmed) and a **loom house** (the core, with looms
  and wool shelves).
- **Trade:** **shearer** (§5), new: shears a regrown sheep within twelve.
- **Likes:** cod, salmon, string. **Sells at Friend:** wool of every colour
  the village has shorn, looms, banners.

### 3.3 Wolffolk — the lodge people

- **Look:** grey coat, pale muzzle and underside, a dark saddle across the
  shoulders; ears set wide (3×5×1, pitched back); a straight tail (2×2×7) held
  level. The longest muzzle. Broadest shoulders after the bear.
- **Where:** snowy taiga, snowy plains and the frozen peaks' feet (`cold`
  and `frozen`, to check). Wolves are the one people at home in snow.
- **Village:** a longhouse people. Spruce and dark oak, snow on the roofs,
  a fire pit in the square. Palette: footing stone bricks, wall spruce
  planks, corner dark oak log, roof dark oak stairs with snow layers, ridge
  dark oak log, awning light grey and white wool. Signature pieces: the
  **lodge** (core, one long hall) and a **fishing hut** on a frozen pond, a
  hole in the ice beside it (a worker's post and a barrel inside).
- **Trade:** **fisher** (`villages.md` §5.1, designed and not built): the
  frozen pond is where it lands. Nothing a wolf does hurts anything.
- **Guards:** a wolffolk guard is the same guard as anyone's. Their villages
  weight the watch higher in the house pool, so a wolffolk village has more
  of them, which is the difference a kid will notice.
- **Likes:** bones, cooked mutton, leather. **Sells at Friend:** cooked fish,
  leather, campfires.

### 3.4 Rabbitfolk — the bakers

- **Look:** brown coat with a white blaze down the face and a white muzzle;
  the toy shop's favourite. Tall ears (3×7×1, near upright) that stand a full
  head above the hat; a second coat with lop ears (hanging beside the head)
  if coats come. A puff tail (3×3×2). The shortest people.
- **Where:** birch forest and the flower forest's edge; the tag is `birch`
  (to check). Not plains: that is the tallfolk's, and a rabbit village a
  field away from a tallfolk one is the point of the trade below.
- **Village:** a **warren**: houses cut into a low bank behind round doors,
  with only a chimney and a window showing (again `bury`, §7 item 6), a
  carrot patch and a bake house. Palette: footing packed mud, wall
  birch planks, corner birch log, roof grass and moss over birch, ridge
  birch log, awning yellow and white wool. Signature pieces: the **bake
  house** (core: furnaces, a chest, the worker's post) and a **carrot
  patch** (farmland with carrots and a farmer's post, reusing the built
  farmer).
- **Trade:** **baker** (§5), new: turns wheat in the chest into bread. It
  is the trade the whole wage system wants: a tallfolk farmer fills a chest
  with wheat, which is not food, and a baker makes it food.
- **Likes:** carrots, dandelions, golden carrots. **Sells at Friend:** bread,
  cake ingredients, carrot and beetroot seeds.

### 3.5 Bearfolk — the beekeepers

- **Look:** a brown coat all over, small round ears on the top corners of
  the head (3×3×1, on the sides), a wide muzzle with a lighter patch, a stub
  tail (2×2×1). The biggest people, broader than the stonefolk, and the
  slowest walk (`movement` 0.22).
- **Where:** dark forest (`roofed`, to check), where the game puts mushrooms
  and few villages.
- **Village:** big log lodges, beehives on posts, a honey-coloured look.
  Palette: footing cobblestone, wall dark oak log, corner dark oak log, roof
  spruce planks, ridge dark oak log, awning yellow and brown wool. Signature
  pieces: the **great lodge** (core) and an **apiary** (a green with four
  beehives on fence posts, flowers, a worker's post and a chest).
- **Trade:** **beekeeper** (§5), new: bottles honey from a full hive.
- **Likes:** honey bottles, honeycomb, sweet berries. **Sells at Friend:**
  honey bottles, honeycomb, candles, beehives.

### 3.6 Fennecfolk — the cactus cutters

- **Look:** a sand coat, white cheeks and muzzle, and ears taller than the
  head is (4×7×1, splayed wide), which is the whole joke of a fennec and
  the first thing a kid will see. A short brush tail (3×3×6) with a dark
  tip. As small as the rabbits.
- **Where:** desert (`desert`, to check); the first people in one, and far
  from every other village.
- **Village:** sandstone and terracotta, flat roofs to sit on at dusk,
  awnings for shade, a well in the square. Palette: footing sandstone,
  wall smooth sandstone, corner cut sandstone, roof orange terracotta
  (flat), ridge cut sandstone, awning orange and white wool. Signature
  pieces: a **cactus garden** (a fenced sand plot with cactus in rows on
  sand, a worker's post and a chest) and a **shade house** (the core: an
  open hall of pillars under one wide awning).
- **Trade:** **cactus cutter** (§5), new: cuts cactus above its base block,
  which regrows.
- **Likes:** sweet berries, melon slices, rabbit hide. **Sells at Friend:**
  cactus, green dye, sandstone.

### 3.7 Mousefolk — the mushroom pickers

- **Look:** grey with a pale muzzle, big round ears on the sides of the
  head lifted so they show above it (4×4×1), a pointed muzzle and a thin
  whip tail (1×1×7). The smallest people by a distance (scale 0.65), a
  head and a half below the tinker.
- **Where:** mushroom fields (`mushroom_island`, to check): rare, safe
  and strange, which suits a tiny people; finding them is an event.
- **Village:** houses under and inside the giant mushrooms, mycelium
  paths, red and brown mushroom blocks for walls, shroomlight in the
  lamps. Palette: footing mushroom stem, wall brown mushroom block,
  corner mushroom stem, roof red mushroom block, ridge red mushroom
  block, awning red and white wool. Signature pieces: a **mushroom
  patch** (mycelium under a giant mushroom's cap, small mushrooms, a
  worker's post and a chest) and a **toadstool hall** (the core: one big
  red mushroom with the hall inside its stem).
- **Trade:** **mushroom picker** (§5), new: picks small mushrooms, which
  spread again on mycelium.
- **Likes:** wheat, cheese if it ever exists, so bread for now, and
  brown mushrooms. **Sells at Friend:** mushroom stew, red and brown
  mushrooms, mycelium.

### 3.8 Squirrelfolk — the canopy people

- **Look:** red-brown with white cheeks and tufted ears (3×5×1, dark
  tips), and the tail: a plume (3×3×6 and a 3×3×4 tip) that goes up the
  back and curls forward over the head, bigger than the squirrel. The
  fox's colours at the cat's size.
- **Where:** jungle (`jungle`, to check), whose trees are tall enough for
  a village in them.
- **Village:** platforms in the canopy joined by rope bridges, the
  reedfolk's stilts turned into trunks: pieces stand on jungle logs
  twelve blocks up with no terrain adaptation, and the ground beneath is
  left alone. Palette: footing jungle log, wall jungle planks, corner
  jungle log, roof jungle leaves over planks, ridge jungle log, awning
  lime and white wool. Signature pieces: a **cocoa grove** (a platform
  round a jungle log hung with cocoa pods, a worker's post and a chest)
  and a **nest hall** (the core: a round platform with a leaf dome).
- **Trade:** **cocoa picker** (§5), new: picks ripe cocoa pods, which
  regrow on the log.
- **Likes:** melon slices, sweet berries, hazelnuts if they ever exist, so
  bread. **Sells at Friend:** cocoa beans, cookies, jungle saplings.

### 3.9 Otterfolk — the shore people

- **Look:** sleek dark brown with a pale throat and muzzle, tiny ears on
  the sides (2×2×1) and a thick rudder tail (3×2×5 with a 2×1×3 end) held
  low. Longer in the body than the cat, on the same short legs.
- **Where:** beaches and stony shores (`beach`, to check): the sea's edge,
  which no people has. Not rivers, which are the reedfolk's; the doc's
  earlier worry about the two fishers is answered by the shore.
- **Village:** a holt of driftwood and stone at the tide line, boats
  pulled up, nets on racks, a slipway into the water. Palette: footing
  cobblestone, wall stripped oak, corner oak log, roof oak planks, ridge
  oak log, awning cyan and white wool. Signature pieces: a **slipway**
  (a stone ramp into the sea with a worker's post and a barrel at the
  top) and a **holt** (the core: a low stone lodge with the sea on one
  side).
- **Trade:** **fisher**, the wolffolk's and the design's, from the shore
  rather than an ice hole. Two peoples fish, in two climates; the trade
  is one piece of code.
- **Likes:** cod, salmon, seagrass. **Sells at Friend:** cooked fish,
  boats, nautilus shells one time in a hundred.

### 3.10 Deerfolk — the gleaners

- **Look:** tall and thin, the one furfolk built on the tallfolk's
  proportion rather than the toy's: tan with a pale muzzle and a
  scatter of pale spots on the head, ears out to the sides (3×4×1,
  splayed wide), a puff tail, and **antlers** through the hat: an
  upright, a beam outward and a prong forward on each side, bone
  coloured. A head taller than everyone but the tallfolk.
- **Where:** forest, shared with the tallfolk; the two structure sets have
  their own salts, so a deer village and a tallfolk one can be neighbours,
  which is a reason to have both.
- **Village:** a clearing people: few walls, many trees. Oak and birch,
  moss carpets, mossy cobble, roofs of leaves. Palette: footing mossy
  cobblestone, wall oak planks, corner oak log, roof oak leaves over
  planks, ridge oak log, awning green and white wool. Signature pieces:
  an **orchard** (the tallfolk's, with a worker's post and a chest) and a
  **glade hall** (the core: a ring of oak pillars under a leaf roof, open
  at the sides).
- **Trade:** **gleaner** (§5), new: picks apples from oak leaves at the
  rate leaves would drop them, without breaking a leaf.
- **Likes:** apples, wheat, sweet berries. **Sells at Friend:** apples,
  oak and birch saplings, moss.

### 3.11 Later, a line each

Considered and worth keeping on the list:

- **Hedgehogfolk** — spines as a `hairTop`-style crest of small cubes; a
  hedgerow people in forests; forager. The kid who liked the hedgehog in
  glasses has not asked for it yet.
- **Owlfolk** — the messenger concept (`entities.md`) as a people; a
  night people is a nice idea and a hard one, since posts sleep for nobody.
- **Penguinfolk** — one was on the shelf; a beach and ice people; conflicts
  with the wolffolk's and now the otterfolk's biomes, so it would need a
  place of its own (frozen ocean shores).
- **Koalafolk** — no trade or place yet that another people does not
  already have.

### 3.12 If the four ever get heads

Not proposed; recorded so the mapping is not argued twice. Stonefolk are
**badgers** (striped face, broad, underground), reedfolk are **herons**
(tall, lean, the reed hat is already a heron's shape), tinker are **mice**
(small, quick, whiskers over goggles), tallfolk are **deer** (a head taller
than anyone, antlers through the straw hat). It would be the same builder
change as §2 on four existing specs.

## 4. What changes in the pack

Additive everywhere, and **append-only** wherever a number is stored: the
`people` index is in every post's row in the position index, in the block's
`villages:people` state on every generated village, and in the entity
property of every person alive. The four keep 0–3; foxfolk are 4, catfolk
5, wolffolk 6, rabbitfolk 7, bearfolk 8, and so on in whatever order they
are built.

| Where | Today | Change |
| --- | --- | --- |
| `scripts/core/record.ts` `PEOPLES` | four names | append; `unpackRecord` already bounds-checks against its length, so a row from a newer pack is dropped by an older one rather than misread |
| `blocks/post.json` `villages:people` state | `[0, 1, 2, 3]` | append values. The block's permutation count is peoples × jobs (56 at fourteen peoples), well within what the engine allows |
| `entities/person.json` property `villages:people` | `range: [0, 3]` | widen the range; one `villages:people_N` component group and event per people, each with its scale (and the bear's `movement`) |
| `render_controllers/person.json` | `Array.people` of four geometries, `Array.look` of sixteen textures, index `people * 4 + job` | arrays grow; the clamp bounds and the multiplier come from `JOBS.length`, which is what they always meant. Bone visibility unchanged; `tail` and the ears are always on |
| `entity/person.entity.json` | four geometries, sixteen textures | one geometry and four textures per new people (eight with coats) |
| `tools/models/generate.ts` | `biped()` | the three optional bones and `fur` faces of §2; one call per people |
| `tools/textures/generate.ts`, `tiles.ts` | `PEOPLES`, human painters | the fur, muzzle-face and muzzle painters; one `People` row per people carrying coat, muzzle and markings |
| `tools/animations/generate.ts` | one `bipedSet` reading the stonefolk geometry | the concept `furredSet`s move in, one per people, or fold into `bipedSet` if §7 item 4 allows |
| `tools/structures/buildings.ts`, `villages.ts` | four palettes, four villages | a palette and two signature pieces per people; the square, streets, greens and terminators are the shared generators with the palette swapped |
| `worldgen/` | four structures, four sets, four pool folders | one each per people, new identifiers, its own salt |
| `scripts/core/trades.ts`, `engine/trades.ts` | lumberjack, farmer | the trades of §5, each a survey rule and a cycle |
| `texts/en_US.lang` | `Settler` | unchanged unless a per-people name is wanted; the kids' names would go here |
| `manifest.json` | | version bump; the settings panel gains nothing |

A **world that already has the pack** sees new peoples only where new
chunks generate, and its existing persons and posts are untouched, as long
as the appends above never reorder. §7 item 1 confirms the property widening
keeps a live person's value.

## 5. The trades the furfolk bring

`villages.md` §5.1's rules hold for every one: one cycle every ten minutes
(the slider), one slot's worth a cycle, the work visible at the spot,
wages from the nearest chest, and nothing ever lost (room in the chest is
checked before anything is taken from the world). Each is a survey rule in
`core/trades.ts` and a cycle in `engine/trades.ts`, tested the way the
lumberjack and the farmer are.

| Trade | People | Chosen when the post is near | Cycle | Costs the world | To measure first |
| --- | --- | --- | --- | --- | --- |
| **forager** | foxfolk | four or more sweet berry bushes | pick every ripe bush within twelve, nearest first, one every eight ticks; berries to the chest; the bush is set back to its unripe state and left standing | nothing: the bush regrows as it does for a player | the `growth` state's range and which values carry berries, on BDS (the two editions differ); that `setPermutation` to the unripe state does not drop the berries as an item |
| **shearer** | catfolk | two or more sheep within twelve | shear each grown-wool sheep, one every twenty ticks: 1–3 wool of its colour to the chest, the sheep set sheared | nothing: wool regrows when the sheep grazes | whether `EntityIsShearedComponent` is writable or the sheep's `minecraft:on_sheared` event can be triggered from script; failing both, spawn the wool and trigger the sheared event's group by name; the sheep is never damaged |
| **fisher** | wolffolk | water, four blocks or more (designed) | cod or salmon into the chest, one time in eight a treasure item | nothing | none beyond `villages.md`; the frozen pond needs a water block under the ice hole |
| **baker** | rabbitfolk | a furnace or smoker within eight, and wheat in the chest | take three wheat, put one bread; up to eight loaves a cycle, and the furnace lit (`lit_furnace` swap) for the duration | nothing: three wheat become one bread, the recipe's own rate | that swapping `furnace` for `lit_furnace` and back does not eject a furnace's contents; a village furnace is empty, a kid's may not be, so the swap is skipped on a furnace with items |
| **beekeeper** | bearfolk | a beehive or bee nest within twelve | for each hive at `honey_level` 5: take one glass bottle from the chest, put one honey bottle, set the level to 0; one hive a cycle, so bottles run out before the honey does | nothing: the hive refills; a script mutation is not a player harvest, so the bees should not swarm the bear (to measure) | the state name and range on Bedrock; whether the bees anger on a scripted level change |
| **cactus cutter** | fennecfolk | four or more cactus within twelve | for each cactus column two or more tall, remove the blocks above the base, one every eight ticks, one cactus item each to the chest | nothing: the base block grows the column back | that `setType("air")` on a cactus block drops nothing (as a log does), and that removing an upper block does not break the ones above it into items before the next step |
| **mushroom picker** | mousefolk | four or more small mushrooms within twelve, on mycelium | pick up to eight, nearest first, one every eight ticks, into the chest; the tile stays mycelium | nothing the world does not regrow: mushrooms spread on mycelium at vanilla's rate, so a patch picked bare comes back slowly | how fast small mushrooms spread on a mushroom field's mycelium in the dark under a cap; if too slowly, the cycle leaves at least four standing |
| **fisher** | otterfolk | water, four blocks or more (the same trade) | as the wolffolk's | nothing | none beyond the wolffolk's |
| **cocoa picker** | squirrelfolk | four or more cocoa pods on jungle logs within twelve | for each pod at its ripe `age`: two or three cocoa beans to the chest and the pod set back to `age` 0 | nothing: the pod regrows | the pod's `age` range and ripe value on Bedrock, and its facing state's name, so the reset keeps the pod on its log |
| **gleaner** | deerfolk | eight or more oak leaves within twelve | for each oak leaf block, one roll a cycle at the leaf's own apple chance (1 in 200); each hit puts one apple in the chest; up to four a cycle; no leaf is touched | nothing: the leaves stay | that the apple chance reads right (Bedrock's leaf decay drop table); otherwise a flat one apple a cycle from a grove of eight leaves |

The **baker** is the one trade that makes food out of not-food, which is
what the wage design has been missing: a village with a farmer and a baker
runs unattended, and a kids' settlement that grows wheat can feed its guards
by inviting a rabbit. A **honey bottle** is food too (`minecraft:is_food`,
to check with `hasTag` as the wage does), so the bearfolk village also
feeds itself once someone drops bottles in the chest; so do **apples**
(the deer), **mushrooms** once someone makes stew of them (the mice), and
**fish** (the wolves and otters). The **cactus cutter** and the **cocoa
picker** are the two trades that make nothing edible, so a fennec or
squirrel village waits for food the way a stonefolk grove does.

## 6. Standing, gifts and the elder

Nothing changes in `villages.md` §5 but the tables: each people gets its
three liked gifts (§3) and an errand table in the same shape ("the loom
house is out of string; bring 16", "the den's lanterns are dark; bring 8").
Invitations (§6) work for any people; a rabbitfolk baker invited to the
kids' settlement takes the first empty worker's post the kids placed, and
bakes if there is a furnace near it.

## 7. Must prototype

1. **Widening `villages:people`'s range** on a world with persons already
   in it keeps their stored value. Bedrock resets a property whose stored
   value falls outside the new definition; a widened range should never do
   that, but the four peoples are on a Realm and it has to be seen.
   Probe: a person at value 3, a reload with `[0, 8]`, a `getProperty`.
2. **A block state with appended values** loads existing permutations
   unchanged (`villages:post` at `people` 0–3 in a generated village keeps
   its people after the state gains 4–8).
3. **Scale and the collision box.** Whether `minecraft:scale` scales the
   collision box (the four rely on the same 0.6×1.9 box at 0.75–1.15). A
   rabbit at 0.8 that is hard to click, or a bear at 1.15 that cannot fit
   its own door, is the failure to look for.
4. **An animation naming a bone the geometry lacks** (the `tail` swish
   applied to the stonefolk). Silent, or a content-log error; the answer
   decides whether there is one biped animation set or two.
5. **Ears through a hat.** That two cubes interpenetrating (the ear rising
   through the hat crown) render as ear holes in game and not as z-fighting
   at the join. In the viewer they do, which is why every top-set ear is at
   least five units tall: the cap's crown is three above the head and a
   four-unit ear vanished inside it. If they fight in game, the hat cube
   shrinks by half a unit where the ears pass.
6. **`terrain_adaptation: bury`** on a jigsaw structure whose houses are
   meant to sit in a bank (the fox den, the rabbit warren), and whether it
   applies per structure only (which the schema suggests) or can differ per
   piece. If per structure only, the warren is a cut piece: the house's
   footprint is dug by the piece itself.
7. **The biome tags** for taiga, `cold`, `frozen`, cherry grove, flower
   forest, `birch` and `roofed`, read from `bedrock-samples`, and that the
   five structure sets' salts keep them off each other's cells and off the
   four's.
8. **Sweet berry bush `growth`**, **beehive `honey_level`** and **the
   sheep's shear from script**, as in the §5 table. Each is a
   `qolprobe:<name>` script event that logs; none needs a mutation armed
   until the read is understood.
9. **The furnace swap** (§5, baker) keeps the furnace's contents.

## 8. Where this goes next

1. ~~**Rigs in the viewer, first.**~~ Built: the §2 builder change and
   painters, one call per people, into `concepts/entities/` with the
   peoples' job atlases and an animation set each, listed as `concept ·
   furfolk` beside the four. Nothing in a shipped pack changed. Judge them
   with the kids; let them pick the first people and its name, and change
   the numbers in the two `FURFOLK` tables until each reads right.
2. **Probe items 1–5** in the probe pack, in one session, since each is a
   read.
3. **One people end to end**: append it to the record, the block, the
   entity and the render controller; its palette and two signature pieces;
   its village, pool and set; its trade with a pure test and a GameTest
   (`villages_forager_picks_berries`, or whichever people came first).
   Measure it on the plain-world server as the tallfolk village was.
4. **The rest a people at a time**, each a palette, two pieces and a trade;
   the baker early, because it closes the wage loop for everyone.
5. **Coats**, once there are peoples to give them to.
