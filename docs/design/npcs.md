# Peoples — Concept Sheet

**Settlers who are not villagers: four peoples, jobs that cost something, and builders that work from blueprints**

Target: `@minecraft/server` 2.9.0 / `@minecraft/server-ui` 2.1.0 · Entity format version 1.26.40 · Draft v0.1

> Brainstorm with models, not a build order. The four peoples have generated
> rigs, sixteen job atlases and animation sets under `concepts/entities/` so
> they can be judged in the viewer (`concept · peoples`). Nothing here has
> been run in game. When a piece is picked up it gets its own design doc, as
> the hatchling did.

---

## 1. The stance

Villagers feel flat because they are one species with hats. A settlement on
this Realm should be made of **peoples with different shapes and different
economies**, so walking into one feels different from walking into another,
and every person in it should be **someone the kids placed**, doing a job
that costs the settlement something. Nothing spawns on its own; nothing works
for free; nothing fights a war.

- **Every NPC is a job block plus a person**, the Bulwark pattern. The block
  is the anchor and the persistence; the person walks between the block and
  the rest of the settlement. Take the block away and the person leaves.
- **Upkeep, not automation.** A guard eats from the larder; the farmer fills
  it. A settlement that stops being tended winds down rather than running
  forever.
- **Forms, not dialogue.** Talking to anyone is an `ActionFormData` with three
  or four buttons, the same UI the kids use for pack settings.
- **Rejected:** free-roaming NPCs, a raid or siege mechanic, dialogue trees,
  any NPC that mines or fights at range.

## 2. The peoples

One biped builder in `tools/models/generate.ts` produces all four from a set
of proportions; the bones are vanilla's (`head`, `body`, `left_arm`,
`right_arm`, `left_leg`, `right_leg`), so `animation.common.look_at_target`
and one shared walk cycle apply to all. Names are placeholders.
Animal peoples on the same rig (foxes, cats, wolves, rabbits, bears) are
concepted in `design/furfolk.md`.

| People | Shape | Feature on the model | Where they live, what they deal in |
| --- | --- | --- | --- |
| **Stonefolk** | short and broad (head 8×7, body 10×10, legs 8) | beard | hillside halls; ore, stone, the Bulwark turrets |
| **Reedfolk** | tall and lean (head 7×8, body 8×14, legs 14) | conical reed hat | marsh and river, stilt houses; fish, boats, dye and glass |
| **Tinker** | small and quick (head 7×6, body 6×8, legs 7) | goggles pushed up on the forehead | workshops with steam; copper, redstone, Fluidworks parts |
| **Tallfolk** | a head taller than a player (body 8×13, legs 13) | straw hat | open ground; bread, wool, horses |

Skin, hair and eye colour are per people; each people's face is painted for
its own head window, so a short broad head and a tall narrow one both get
eyes where eyes go. The painters take the window size as an argument, and the
model generator's comment says the two must agree.

## 3. The jobs

A job is a texture variant plus accessory bones the render controller shows
by a property, exactly as the egg shows its cracks:

| Job | Outfit | Bones shown | What it does |
| --- | --- | --- | --- |
| **Guard** | iron breastplate with a red tabard stripe, dark trousers | `helmet` | stands at a post, patrols between two, or follows a player who hires them; melee only; eats from the larder daily and goes home when it is empty |
| **Worker** | green tunic, leather apron | `hat` (cap, reed hat or straw hat by people) | tends what the kids planted: replants a harvested crop, shears a regrown sheep, pulls a fish an hour into the larder; slower than a Fluidworks harvester on purpose, and it is what feeds the guards |
| **Trader** | purple coat with gold buttons | `pack` | data-driven trade tables, one per people, selling pack items (turret parts, egg ingredients, funnel components) so progression has a gate |
| **Builder** | blue tunic, leather apron | `tool` (hammer), `pack` | raises blueprints block by block; §4 |

Also on the list, without models yet: a **healer** by a bed, an **innkeeper**
who sets a respawn point, and a **herald** who reads the locator bar out as
text and keeps messages for a player who is offline.

## 4. Builders, made viable

Free-form construction is out of reach and half-built junk is worse than
nothing. The viable version is **blueprints**, and the stable API supports it:
`world.structureManager` is stable, a saved structure can be read block by
block with `Structure.getBlockPermutation`, `createFromWorld` saves an area,
and `place` has an animation mode.

1. **The blueprint table** is a block. A blueprint item (a saved structure: a
   hut, a wall segment, a well, a watchtower, a bridge span) goes in; the
   player stands where the corner should be and confirms; the table shows a
   ghost outline for a few seconds first.
2. **Materials in, structure out.** The table counts the structure's blocks
   and asks for them. Nothing is placed until the chest beside the table
   holds it.
3. **The builder places one block every few seconds**, walking to each spot,
   from the ground up, taking each block from the chest. A house takes twenty
   real minutes. The kids watch it go up and can help by dropping planks in.
4. **Only air and plants are overwritten.** A blueprint that would cut into an
   existing build is refused at the table with the offending spot shown.
5. **Repair is the same job backwards**: a builder pointed at a damaged
   blueprint building replaces what is missing from the chest.
6. **A survey scroll** saves an area the kids built as a new blueprint, so a
   builder can raise another copy of their own house across the river.

## 5. What the stable API gives

| Need | Stable mechanism |
| --- | --- |
| Persistence and ownership | the job block anchors the person: position index + reconciliation, as Bulwark |
| Guard AI | `nearest_attackable_target` on `monster`, `melee_attack`, `home` + `move_towards_home_restriction`, `follow_owner` for a hire |
| Talking | `ActionFormData` from `playerInteractWithEntity` |
| Trade | `minecraft:trade_table` / `economy_trade_table` in the entity JSON, one per people |
| Job look | texture array by a people property, `part_visibility` by a job property |
| Blueprints | `world.structureManager.get`, `Structure.getBlockPermutation`, `createFromWorld`; `Block.setPermutation` per placement |
| Larder | a chest read through `BlockInventoryComponent`, as the turret reads its hopper |

## 6. Must prototype

- **Structures from script:** that `getBlockPermutation` reads every block of
  a saved `.mcstructure`, that a structure placed block by block matches
  `place`, and how a walking entity is sent to each spot (a `home` that
  moves, or `teleport` steps).
- **`home` on a custom entity** keeping it within a radius across chunk
  reloads.
- **Trade tables on a custom entity** and whether the trade UI opens without
  `minecraft:trade_table` needing the villager's own components.
- **Hire and follow:** `follow_owner` needs `tameable`; a guard hired for a
  walk is bonded the way the hatchling is, and released by a form button.
- **Cost of the form** on every interaction: whether the before-event can
  cancel and open a form on the next tick without a flicker.

## 7. Where to start

1. **Guard and post**, one people. Proves the block-plus-person pattern on a
   mob that walks, and the larder loop.
2. **Blueprint table and one builder** with three small blueprints. The
   structure API is the risk; probe it first.
3. **Trader**, because trade tables are data-only and give every other pack a
   gate.
