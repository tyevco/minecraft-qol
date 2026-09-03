# Hatchling

A pet dragon for the kids. Craft an egg, put it down and warm it until it
hatches; offer the hatchling sweet berries to make friends; keep feeding it
and it grows. It follows, sits, takes a name and a lead, and never fights.

Design: [`docs/design/hatchling.md`](../../docs/design/hatchling.md). Phase 1
is built and **not yet run in game**; see "To confirm in game" below.

## How to play

| Step | What to do |
| --- | --- |
| Craft an egg | A chicken egg in the middle, eight **coal** (ember), **bone meal** (moss) or **snowballs** (frost) around it |
| Put it down | Use the egg on top of a block. It sits there on a nest |
| Warm it | Interact with the same item it was made from. Three times by default, ten minutes apart. The shell cracks, the egg wobbles, then it hatches |
| Pick it up | Sneak and interact with an empty hand. Any warmth is lost |
| Make friends | Offer the wild hatchling **sweet berries** |
| Feed it | More berries, fifteen minutes apart. Every four feedings it grows a size, twice. Hearts and a happy flap each time |
| Sit, stand, name, lead | As for any pet: empty hand to sit or stand, a name tag, a lead |

## The panel

Open it from the world's pack list, or in game from Settings → Behavior Packs
→ Hatchling → the gear icon.

| Setting | Default | Meaning |
| --- | --- | --- |
| Warmings to hatch | 3 | how many times an egg is warmed before it hatches (1–6) |
| Rest between warmings | 10 min | wall-clock minutes before the egg takes another warming (0–60) |
| Feedings per growth stage | 4 | feedings to reach the next size (1–10); there are two sizes to grow into |
| Rest between feedings | 15 min | wall-clock minutes before a hatchling is hungry again (0–60) |
| Anyone can warm eggs and feed hatchlings | on | off: only the owner may feed a bonded hatchling. Eggs are always shared |

No commands. `/scriptevent hatchling:debug` prints what the pack read from the
panel and the state of the nearest egg and hatchling.

## How it works

**The egg is an entity**, placed by the egg item's custom component onto the
top of the block it was used on. It cannot be hurt or pushed. Warming and
picking up are the `playerInteractWithEntity` before-event: the decision
(`scripts/core/rules.ts`, `warm`) is made there from what is held, when the
egg was last warmed and what the panel says, the interaction is cancelled
when the pack is handling it, and the change is applied on the next tick:
take the item, then set the egg's cracks property and remember the time.
The last warming fires the entity event `hatchling:hatch`, and the pack acts
on that event, not on the interaction: after the hatch animation it spawns
the hatchling of the same variant, then removes the egg. A spawn that fails
leaves the egg warmable. An egg loaded with `hatching` set (the world closed
mid-hatch) finishes on load.

One measured rule shapes every spawn here: a `spawnEvent` passed to
`spawnEntity` **replaces** `minecraft:entity_spawned` rather than running
alongside it, so a hatchling spawned that way has no stage group and no
tameable component. The pack spawns plainly and triggers the variant event
after (measured in the GameTest suite).

**Bonding is vanilla.** `EntityTameableComponent` is read-only in 2.9.0, so
the hatchling hatches wild with `minecraft:tameable` (berries, probability
1.0) and the engine bonds it on the first offer. Script reads the owner back
through `tamedToPlayerId`.

**Feeding and growth are script.** The same before-event decides
(`feed`): not food is left to the engine (that is the sit/stand toggle),
otherwise the pack cancels and applies: take the berries, heal a little,
raise `hatchling:happy` for the flap, and either count the feeding or fire
`hatchling:grow_1` / `grow_2`, which swap the stage component group (scale
0.55 → 0.8 → 1.1, max health 10 → 16 → 24).

**Per-entity memory** is dynamic properties on the entity: warmings and last
warmed on the egg, feedings and last fed on the hatchling. Variant, cracks,
stage and happy are entity properties with `client_sync`, which is what the
render controllers and animation controllers read.

## Layout

```
scripts/core/rules.ts     pure: variants, panel parser, warm(), feed(), cooldowns   <- vitest
scripts/engine/egg.ts     the egg item, warming, pick-up, hatching
scripts/engine/pet.ts     feeding and growth
scripts/engine/tend.ts    consume one item, action-bar messages, property reads
scripts/engine/settings.ts, debug.ts
behavior_pack/            manifest (format 3), entities/, items/, recipes/
resource_pack/            client entities, render controllers; models, textures,
                          animations and controllers are GENERATED from tools/
```

## To confirm in game

The probe pack has `qolprobe:egg <variant>`, `qolprobe:pet <variant>` and
`qolprobe:hatch-cleanup`. Enable Hatchling alongside it.

1. **Does the egg item place an egg?** Use it on the top of a block. If
   nothing appears, read the content log: "registered item component" at
   startup, then either a placement failure with its reason or nothing at
   all. Nothing at all means `onUseOn` did not fire; check the item JSON's
   inline `hatchling:egg_item` against the V2 shape Bulwark's block uses.
2. **Is `blockFace` `Direction.Up` for the top face**, and are `block.x/y/z`
   the block used on rather than the neighbour? If the egg appears inside
   the block or beside it, `at` in `engine/egg.ts` is off by the face.
3. **Do the cracks show?** `qolprobe:egg 1` spawns a moss egg with one crack.
   No crack: `part_visibility` on the render controller is not reading the
   property; the fallback is one texture per crack stage in a texture array
   (nine atlases). Flicker on the crack: the overlay's `inflate: 0.25` is
   z-fighting; raise it to 0.5 in `tools/models/generate.ts`.
4. **Does warming consume and cool down?** Warm with coal; the action bar
   should count down warmings and refuse within the rest. If it takes the
   item without changing the egg, `consumeOne` succeeded but the property
   write threw: read the log.
5. **Does the hatch produce one hatchling and remove the egg?** Both by
   warming and by `triggerEvent` (`qolprobe:egg` then warm it to the end).
   Two hatchlings means `dataDrivenEntityTrigger` fired twice and the
   `hatch_scheduled` guard did not hold; no hatchling and no egg means the
   remove ran without the spawn, which the code orders against, so read the
   log for the spawn error.
6. **Does bonding work?** `qolprobe:pet 0`, offer berries: hearts, and the
   probe's log should flip to `tamed=true owner=<your id>`. Still wild:
   `tame_event` did not fire or `probability` is not read as 1.0; try
   `"probability": 1` (integer) or check that `minecraft:tameable` is
   allowed outside a component group.
7. **Does feeding grow it without a pop?** Four berries at a zero rest
   (panel) should scale it up smoothly; a visible flash means the group swap
   resets the entity's render state, which is cosmetic and can be hidden
   behind the happy flap if it bothers anyone.
8. **Does the rest survive relog and `/reload`?** Feed, leave, return: the
   debug line should still show the rest. Dynamic properties on an entity
   are documented as persistent; if they are not, move the timestamps to a
   world dynamic property keyed by entity id.
9. **Does `Date.now()` advance?** The debug line's rest should fall by the
   minute. If it never changes, replace the clock in `engine/` with
   `system.currentTick / 20`, accepting that it then pauses with the world.
10. **Do hostiles ignore it?** Spawn a zombie next to a hatchling at night.
    It should not be targeted (`mob` family). If it is, add
    `minecraft:behavior.avoid_mob_type` for the common hostiles.

The GameTest pack pins what does not need a player:
`hatchling_egg_keeps_variant_and_shell`, `hatchling_egg_hatches_into_its_variant`,
`hatchling_grows_by_stage_event`.
