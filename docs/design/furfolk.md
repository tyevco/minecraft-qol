# Furfolk — Concept Sheet

**Animal peoples for the villages: foxes, cats, wolves, rabbits and bears in the job outfits the four peoples already wear**

Companion to `design/npcs.md` and `design/villages.md` · Draft v0.1

> Concept, not a build order, and not yet a model. It was prompted by a
> shelf of flocked animal figures in a toy shop — rabbits on bicycles with
> race numbers, a bear family at a picnic, a cat at a piano, a hedgehog in
> glasses — that one of the kids did not want to leave. Everything the four
> peoples have (one rig, job outfits, posts, generated villages, standing)
> carries over; what is new is the head, the tail and the village each people
> builds. Nothing here has been run in game or drawn by the generator. §7
> says what to prototype and §8 where to start, and the first step is rigs in
> `concepts/entities/` so the look can be judged in the viewer before any
> pack changes.

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
  change on the same bones, and §3.7 says which animal each would be if
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

One change to the biped builder in `tools/models/generate.ts`: three
optional bones and one substitution.

| Part | Today | Furfolk |
| --- | --- | --- |
| `head` cube | skin sides, `face` front, `hair` on top | `fur` all round, `muzzleFace` front (bead eyes, no mouth); markings per people |
| `beard` / `goggles` | optional cubes on the head | not used; the `muzzle` takes the same slot |
| **`muzzle`** | — | a cube on the head's front, low: 4×3×2 for most, 4×3×3 for wolf and bear, 3×2×2 for cat and rabbit; nose on the up-front edge |
| **`left_ear`, `right_ear`** | — | children of `head`, pivot at the head top so a flick rotates them; shape per people (§3) |
| **`tail`** | — | child of `body`, pivot at the hip's back, angled down and out; per people, two segments for the cat |
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

For comparison the tinker is 21 units at 0.75 and the tallfolk 34 at 1.15.
The head is two fifths of the body-plus-legs height or more in every row;
that ratio is the whole difference between "a short villager" and "a toy".

**Textures.** The `BIPED` atlas layout in `tools/atlases.ts` keeps its
tiles; `skin`, `face`, `hair`, `hairTop` and `hand` are painted by three new
painters in `tools/textures/tiles.ts`: `furTile(coat)` (a grain like
`hairTile`, in the coat colour), `muzzleFaceTile(look, w, h, markings)` (two
2×2 bead eyes with a single glint pixel each, a nose on the muzzle window,
markings drawn from a small per-people list: blaze, cheeks, stripes, mask,
ear tips) and `muzzleTile(coat, muzzleColour)`. The window sizes are the
model's, as now, and the two generators' comments keep saying so. The four
job looks (`JOBS` in `tools/textures/generate.ts`) are reused as they are.

**Coats.** The figures come in colour families (a chocolate rabbit and a
milk rabbit are the same rabbit). A second coat per people doubles the
atlases from four to eight per people, all generated. Which coat a post's
person wears would come from a hash of the post's position, so the record
does not change and a respawned person keeps its coat. Worth having, not
worth doing first; §8.

**Animation.** The one `bipedSet` in `tools/animations/generate.ts` serves
all peoples and reads a geometry back so every animated bone exists. It
would read a furfolk geometry with the union of the new bones and add an
ear flick to the idle, a tail swish to idle and walk, and a tail sway to the
work swing. Whether an animation may name a bone a given geometry lacks (a
foxfolk set applied to the tailless tinker) is §7 item 4; if not, the set is
generated twice, one for the four and one for the furred.

## 3. The peoples

Names are placeholders in the `-folk` pattern the pack uses; the kids may
well have better ones, and the display name is one line in `en_US.lang`.
Each row is: the look, the village, the trade its village carries, and what
it likes. Palette roles are those of `settlements.md` §4; a people whose
buildings are a palette swap on the `cottage()` shapes needs only its
signature pieces drawn.

### 3.1 Foxfolk — the berry pickers

- **Look:** rust coat, white muzzle, cheeks and chest, dark ear tips and
  dark "socks" on the arms and legs. Tall triangular ears (2×4×1, tilted
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
  down the tail; a cream muzzle; small pointed ears (2×3×1). A thin tail in
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
  shoulders; ears set wide (2×3×1, upright); a straight tail (2×2×7) held
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
  the toy shop's favourite. Tall ears (2×6×1, upright) that stand a full
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
  the head (3×3×1, no tilt), a wide muzzle with a lighter patch, a stub
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

### 3.6 Later, a line each

Considered and worth keeping on the list, in the order the kids named them
in the shop:

- **Mousefolk** — tiny (below the tinker, scale 0.65), round ears, a thin
  tail; a mill people on rivers, whose trade would be the baker's twin
  (wheat to bread) if the rabbits are not built, or **miller** if a
  flour item ever exists. Trade-off: two small peoples read alike.
- **Hedgehogfolk** — spines as a `hairTop`-style crest of small cubes; a
  hedgerow people in forests; forager.
- **Squirrelfolk** — the fox's tail at cat scale, curled up the back; an
  oak canopy village on platforms (the reedfolk's stilts, in trees).
- **Otterfolk** — sleek, the reedfolk's river; the fisher again, which is
  why the reedfolk should keep the dock.
- **Owlfolk** — the messenger concept (`entities.md`) as a people; a
  night people is a nice idea and a hard one, since posts sleep for nobody.
- **Penguinfolk** — one was on the shelf; a beach and ice people; conflicts
  with the wolffolk's biomes, so one or the other.
- **Koalafolk** and **deerfolk** — no trade or place yet that another
  people does not already have.

### 3.7 If the four ever get heads

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
5, wolffolk 6, rabbitfolk 7, bearfolk 8, whatever order they are built in.

| Where | Today | Change |
| --- | --- | --- |
| `scripts/core/record.ts` `PEOPLES` | four names | append; `unpackRecord` already bounds-checks against its length, so a row from a newer pack is dropped by an older one rather than misread |
| `blocks/post.json` `villages:people` state | `[0, 1, 2, 3]` | append values. The block's permutation count is peoples × jobs (36 at nine peoples), well within what the engine allows |
| `entities/person.json` property `villages:people` | `range: [0, 3]` | widen the range; one `villages:people_N` component group and event per people, each with its scale (and the bear's `movement`) |
| `render_controllers/person.json` | `Array.people` of four geometries, `Array.look` of sixteen textures, index `people * 4 + job` | arrays grow; the clamp bounds and the multiplier come from `JOBS.length`, which is what they always meant. Bone visibility unchanged; `tail` and the ears are always on |
| `entity/person.entity.json` | four geometries, sixteen textures | one geometry and four textures per new people (eight with coats) |
| `tools/models/generate.ts` | `biped()` | the three optional bones and `fur` faces of §2; one call per people |
| `tools/textures/generate.ts`, `tiles.ts` | `PEOPLES`, human painters | the fur, muzzle-face and muzzle painters; one `People` row per people carrying coat, muzzle and markings |
| `tools/animations/generate.ts` | one `bipedSet` reading the stonefolk geometry | reads the union geometry; ear flick and tail swish (§7 item 4) |
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

The **baker** is the one trade that makes food out of not-food, which is
what the wage design has been missing: a village with a farmer and a baker
runs unattended, and a kids' settlement that grows wheat can feed its guards
by inviting a rabbit. A **honey bottle** is food too (`minecraft:is_food`,
to check with `hasTag` as the wage does), so the bearfolk village also
feeds itself once someone drops bottles in the chest.

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
   through the hat crown) render as ear holes and not as z-fighting at the
   join. If they fight, the hat cube shrinks by half a unit where the ears
   pass.
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

1. **Rigs in the viewer, first.** The §2 builder change and painters, one
   call per people, into `concepts/entities/` with the peoples' job atlases
   and the animation set, listed as `concept · furfolk` beside the four.
   Judge them with the kids; let them pick the first people and its name.
   Nothing in a shipped pack changes for this step.
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
