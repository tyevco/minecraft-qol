# Lens — real item, tiers, and optimal-lighting suggestions

## Context

The Lens works: it marks where hostile mobs can spawn, exactly indoors and
conservatively outdoors. Today it is switched on by a command or by wearing a
helmet **renamed** to "Lens" — a deliberate placeholder that avoided a resource
pack.

You want it to become a real thing in the world: an **enchantment-like upgrade**,
a **potion-like effect**, a **unique item**, and a **level 2** that shows where
torches should go.

Decisions taken: build the repo's first resource pack; carry modes worn / held /
offhand / consumable, phased with one real item first; **one Lens item upgraded
in place**; level 2 shows suggestions **and** coverage shading, computed with
**real light propagation**; **no status indicator** — the markers are the
feedback.

That last technical decision carries a large bonus: the flood fill that makes
torch suggestions respect walls is the *same* computation that yields exact block
light. It retires the grey `uncertain` markers, currently the Lens's biggest
weakness (`docs/lens-light-results.md`, issue #49).

---

## Premise check — two hard noes

Verified against the installed 2.9.0 typings, Mojang's shipped JSON schemas
(`bedrock-samples@v1.26.40.05`) and Learn. Two parts of the request are not
buildable as literally described.

### Custom enchantments — impossible

Confirmed four ways: no `enchantments/` folder in Learn's pack-contents list; no
enchantment-definition schema at any format version (the only `enchant` schema is
`minecraft_enchantable`, which declares which *existing* enchantments an item may
receive); `mojang-enchantments` is a closed 43-entry catalog; and
`EnchantmentTypes` has a private constructor while `new EnchantmentType(id)`
*throws* on an unknown id. Levels above a vanilla maximum are impossible too —
Mojang states *"max enchantment levels are hard-coded and can't be overwritten."*

Every addon advertising custom enchantments fakes it. So will we:

- **`"minecraft:glint": true`** — the enchanted shimmer with no enchantment.
  Stable since 1.20.30. (The old name `minecraft:foil` is legacy-only and will
  silently do nothing in a modern item.)
- **`ItemStack.setDynamicProperty`** — the real per-instance tier store.
- **`setLore`** — the visible tier line (≤20 lines, ≤50 chars, accepts
  `RawMessage` so it stays localizable).

### Custom status effects and potions — impossible

Same four-way confirmation: closed 37-entry effect registry, private
constructors, `addEffect` throws on unknown ids. Brewing is worse — both brewing
recipe types constrain `input` **and** `output` to the vanilla potion registry, so
**a brewing stand can never output a custom item**.

Achievable instead: a consumable custom item, which is most of what "potion"
means in play. `minecraft:food` + `use_animation: "drink"` +
`use_modifiers.use_duration` (mandatory — `food` alone silently does nothing) +
`using_converts_to: glass_bottle`. **`minecraft:consumable` is a *Java*
component — do not port it.** Also note `minecraft:food.effects` was removed
after 1.20.0; effects come from script.

### Offhand — possible, but the wrong primary

`minecraft:allow_off_hand` is real and stable (format 1.20.50+), and
`getEquipment(EquipmentSlot.Offhand)` reads custom items fine. But Bedrock has no
Java-style swap key: the player must drag it in the inventory screen. **Detection
is as reliable as the head slot; acquisition is worse.** Ship it as an
alternative, not the main path.

One genuine finding: **"raise to look" works only in the main hand**, via
`use_animation: "spyglass"` plus `itemStartUse`/`itemStopUse`. The offhand has no
independent use event. If hold-to-look ever becomes the headline interaction, the
item must be main-hand.

---

## Sequencing change: behaviour first, texture last

The item research turned up something that should reorder the work.

**A behavior-pack-only custom item is fully functional** — it registers, appears
in the creative menu, equips, crafts, and is completely visible to script. The
only losses are cosmetic: a magenta checkerboard icon, and a raw name key unless
`"minecraft:display_name": { "value": "Lens" }` is given a **literal** string,
which yields a correct name with zero resource pack.

Meanwhile a resource pack makes the dev loop markedly worse. `/reload` does not
touch client resources at all, and there is **no texture hot-reload on Bedrock**:

| RP change | Cheapest thing that works |
| --- | --- |
| `.lang` name | exit to main menu, re-enter |
| texture PNG | toggle the RP off/on, or exit + re-enter |
| `item_texture.json` | exit + re-enter (atlas is stitched at load) |
| RP `manifest.json` | **full game restart** |
| adding `resource_pack/` at all | **full restart**, then enable it manually |

So: **still build the RP — but last.** Iterate behaviour BP-only at `/reload`
speed with a checkerboard icon, and add the texture as a polish pass once
behaviour is settled. This keeps the expensive restart cycle out of the phase
where the real work happens.

One trap to respect: a BP that declares a UUID dependency on a missing RP **can
refuse to load**. Deploy the RP first, add the dependency last.

---

## Level 2 — the lighting solver

### The model, measured not assumed

Minecraft light is a **flood fill losing 1 per taxicab step**, not a Euclidean
radius. A torch emits **14** and covers BFS distance **≤ 13** (light 1 there, and
spawning needs block light *exactly* 0). Our own probe already corroborates it:
**13 at one block from a torch**.

Two structural facts make this clean:

- **Block light combines by `max`, not sum.** Coverage sets are fixed and
  independent, so this is **exactly minimum set cover** with no interaction terms.
- **No emission table needed.** Targets are the block-light-0 positions level 1
  already found.

### The algorithm: lazy greedy, exact where it counts

Set cover is NP-hard and greedy is provably near-optimal — Feige and
Dinur–Steurer show nothing polynomial beats `ln n`, so there is no cleverer
algorithm to hunt for. The problem is cost: an exact BFS per candidate is ~16–28M
operations, several seconds in Bedrock's interpreter. Not viable.

The key: **L1 distance ≤ BFS distance**, so L1 coverage is a superset of true
coverage and the L1 gain is a valid *upper bound*. That is exactly the
precondition for lazy greedy (CELF):

1. Cheap L1 optimistic gains for all candidates (~80k ops).
2. Max-heap on optimistic gain; pop the best.
3. If exact coverage unknown, run **one** real BFS, cache the bitset, re-key,
   push back. If the cached gain is stale, re-key and push back. Otherwise it is
   the true argmax — select it.
4. Stop at `k_max` (8), or when the best remaining exact gain is 0.

**Bit-identical to exact greedy**, running ~20–70 BFS passes instead of 400 —
roughly 0.1–1.5s, inside the `runJob` pattern `scan.ts` already uses.

What matters for trust: **every emitted suggestion has had a real,
occlusion-aware BFS run on it.** Only the search *ordering* is approximate, and
greedy corrects that before committing. A naive L1-radius version would
confidently suggest torches through walls, around corners and on the wrong floor
— always over-claiming, so the player places the torch and the red markers stay.
That failure is impossible here.

### Three predicates, deliberately not merged

| Predicate | Exists? | Glass |
| --- | --- | --- |
| Valid spawn floor | `surface.ts#isStandableFloor` + `DENY` | rejects |
| Passes light | **new** | passes |
| Supports a torch | **new** | supports |

`light_dampening` arithmetic is genuinely unconfirmed (sources contradict each
other on leaves/water/ice), so treat **only air plus an explicit allow-list** as
passing light. That under-claims coverage and suggests slightly more torches —
the same safe-direction bias as `DENY`. Same for torch support: sources conflict
on fences, slabs and glass sides, there is no `canPlaceBlock` in 2.9.0, and
Bedrock *snaps* rejected placements to a nearby face (silently putting the torch
somewhere other than suggested). Conservative whitelist of full opaque cubes.

**Targets exclude `uncertain`** — otherwise midday outdoors makes every position
a target and floods the player with useless suggestions.

### Sanity check

For a flat open floor the optimum is a known result: a **perfect Lee tiling**,
lattice `(14,13)`/`(−13,14)`, exactly **365 blocks per torch**, zero overlap.
Useful for validating the solver's count on open ground. (The commonly cited "28
apart" for a corridor is off by one — at 28 the midpoint is distance 14 from both
torches and dark. 27 is the true maximum.)

---

## Phasing

**Phase 1 — the item, BP-only.** `packages/lens/behavior_pack/items/lens.json` at
`format_version "1.26.30"` (highest with a published schema; what vanilla ships).
`minecraft:wearable` with `slot.armor.head` and `protection` — there is **no**
`minecraft:armor` item component. `minecraft:glint`, literal `display_name`, a
shaped recipe at `format_version "1.20.10"`. No attachable: the item equips,
occupies the slot and is script-readable without one; it just doesn't render on
the model, which is irrelevant here. Swap `main.ts#wornMode` from `nameTag`
matching to a `typeId` comparison.

**Phase 2 — carry modes.** Held and offhand (`minecraft:allow_off_hand`). If
hold-to-look is wanted, main-hand with `use_animation: "spyglass"` and
`itemStartUse`/`itemStopUse`.

**Phase 3 — tiers.** Level per item instance via `ItemStack.setDynamicProperty`,
shown with `setLore`, upgraded in place. `ContainerSlot` also carries dynamic
properties, so the tier can be mutated without copying the stack back.

**Phase 4 — the solver.** Flood fill, lazy greedy, suggestion markers, coverage
shading, and the `uncertain` retirement it enables. `MarkerPool` gains a fourth
colour and a distinct glyph; the 400-shape budget is no constraint at ≤15
suggestions.

**Phase 5 — the consumable.** The food/use-animation/use-modifiers trio above,
with `onConsume` starting a timed session.

**Phase 6 — the resource pack.** `resource_pack/manifest.json` (fresh UUIDs,
`format_version` **2** — v3 has an open issue requiring `metadata.authors`),
`textures/item_texture.json`, a 16×16 PNG, `texts/en_US.lang`
(`item.lens:lens_helmet=Lens`, **no `.name` suffix** for modern items), plus the
reciprocal BP↔RP UUID dependencies. Build wiring: `Pack` gains
`hasResourcePack?`, `deployPack` and `cleanPack` gain an RP branch (a stale RP is
harder to notice than a stale BP), `mcaddonOptions` gains `copyToResourcePacks`,
and the watch glob gains `packages/**/resource_pack/**/*`.

---

## Verification

**Unit — the solver is pure and exhaustively testable.** BFS and greedy take a
`passable` mask plus target/candidate lists and return chosen positions, with no
`@minecraft/server` import, so they run in plain Node like the existing suites.
Cases worth pinning:

- **A wall between torch and targets — coverage must not cross it.** This single
  test is what distinguishes this implementation from the naive one.
- An L-shaped corridor where L1 says 9 and the true path is 17.
- Different floor levels — a torch above a sealed room covers nothing inside it.
- A flat open floor — count should approach the Lee density of 365 per torch.
- Unreachable targets are **reported, not silently dropped**.
- Greedy never selects a candidate whose exact gain is 0.

**In game.** Reuse the probe harness — `qolprobe:lightmatrix` already builds and
restores its own rig, so the same trick can floor a sealed room with a material
and settle the two unconfirmed tables (light passage, torch support) empirically
rather than trusting the wiki. Then a real cave (suggestions respect walls), a
flat field (count against the lattice), and the decisive one: **place a suggested
torch and confirm the red markers actually clear.**

**Wording.** The UI must say it eliminates *light-based* hostile spawns in the
scanned volume — slimes, spawners, the warden and aquatic spawns ignore block
light, and mobs can wander in from outside.

---

## Landmines

| Risk | Handling |
| --- | --- |
| `minecraft:custom_components` at 1.26.30 is **unconfirmed** — schema-attested at 1.21.80, absent from 1.21.90+ | Custom components are now listed **inline** in `components`, not as an array. Test in game; fall back to pinning that one file to `1.21.80`. |
| `menu_category.group` must be **namespaced** since 1.21.60 | `minecraft:itemGroup.name.helmet`, not `itemGroup.name.helmet`. Every older tutorial is wrong. |
| `minecraft:icon` — Learn still documents a `texture` field | Use `{"textures": {"default": "..."}}`. Learn is stale; the schema and vanilla files agree. |
| `"components": {}` | Schema requires ≥1 property. Ship at least one component. |
| `mcaddonTask` registers **global** `packBP`/`packRP`/`packMcaddon` task names, so the last pack wins | Benign today only because undertaker resolves names eagerly — the same class of bug as the `PROJECT_NAME` closure we already worked around. Add a comment, and pin `@minecraft/core-build-tasks` off its caret range. |
| BP→RP dependency added before the RP is deployed can stop the BP loading | Deploy RP first, add the dependency last. |
| RP watch fires but nothing changes in game | Log a warning when `resource_pack/` is touched, saying to exit and re-enter — a silent "deployed" message is worse than not watching. |
