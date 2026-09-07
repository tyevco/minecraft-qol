# Hatchling

A pet dragon for the kids. Craft an egg, put it down and warm it until it
hatches; offer the hatchling sweet berries to make friends; keep feeding it
and it grows. It follows, sits, takes a name and a lead, and never fights.

Design: [`docs/design/hatchling.md`](../../docs/design/hatchling.md). Phase 1
is built. The egg, the hatch, growth, bonding and the fall are pinned by
GameTests on a headless server; the rest is still **not run with a real
client** - see "To confirm in game" below.

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
| Let it fall | Nothing to do. A hatchling has wings: it glides down and takes no fall damage, ever |

## The panel

Open it from the world's pack list, or in game from Settings → Behavior Packs
→ Hatchling → the gear icon.

| Setting | Default | Meaning |
| --- | --- | --- |
| Warmings to hatch | 3 | how many times an egg is warmed before it hatches (1–6) |
| Rest between warmings | 10 min | wall-clock minutes before the egg takes another warming (0–60) |
| Feedings per growth stage | 4 | feedings to reach the next size (1–10); there are two sizes to grow into |
| Rest between feedings | 15 min | wall-clock minutes before a hatchling is hungry again (0–60) |
| Anyone can warm eggs and feed hatchlings | on | off: only the owner may feed a bonded hatchling. Eggs are always shared. **Not enforceable yet** - see issue #98 |
| Hatchlings glide when they fall | on | off: they drop the vanilla way. Either way they take no fall damage - that is the entity, not this switch |

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

**Bonding is vanilla.** The hatchling hatches wild with `minecraft:tameable`
(berries, probability 1.0) and the engine bonds it on the first offer.

What script can read back is less than the design assumed. `hatchling:on_tame`
removes the `hatchling:wild` group, and `minecraft:tameable` is inside it, so a
bonded hatchling has **no tameable component**: measured in
`hatchling_tames_with_berries` as tameable=true / is_tamed=false before the
berries and tameable=false / is_tamed=true after. So "somebody's hatchling" is
the `minecraft:is_tamed` marker (`isBonded`), and the owner's id is not
readable at all - which is why the panel's owner-only switch cannot be
enforced yet (issue #98). Asking the tameable component was also what stopped
a bonded hatchling being fed, and so from ever growing.

**Feeding and growth are script.** The same before-event decides
(`feed`): not food is left to the engine (that is the sit/stand toggle),
otherwise the pack cancels and applies: take the berries, heal a little,
raise `hatchling:happy` for the flap, and either count the feeding or fire
`hatchling:grow_1` / `grow_2`, which swap the stage component group (scale
0.55 → 0.8 → 1.1, max health 10 → 16 → 24).

**Falling is not a way to die.** The entity carries a
`minecraft:damage_sensor` refusing `fall` and `fly_into_wall`, so a hatchling
that walks off a cliff, is knocked off a ledge or is dropped down a ravine
lands unhurt with the script asleep, mid-`/reload`, and with every panel
switch off. Measured in game: a 20-point fall hit leaves its health where it
was (`hatchling_ignores_fall_damage`).

On top of that it *flies* the fall. A sweep every two ticks
(`scripts/engine/flight.ts`) reads each hatchling's vertical speed and, while
it is falling faster than a drift, pushes back just enough to hold it at
`GLIDE_SPEED` - 0.35 blocks a tick - and raises `hatchling:gliding`, which the
animation controller reads to spread the wings and tuck the legs. The decision
is pure (`scripts/core/glide.ts`): it only ever pushes **up**, only while the
hatchling is already falling, and never by more than `MAX_ASSIST` in one step,
so it cannot fight a jump or fling anything into the air. Measured over a
20-block drop: 45 ticks, fastest descent -0.49 blocks/tick, against about -1.7
for the same drop in free fall (`hatchling_glides_down_a_drop`).

Guardian covers the rest of what kills a pet - fire, lava, drowning, and a
sibling's sword - for every tamed animal in the world, hatchlings included.

**Per-entity memory** is dynamic properties on the entity: warmings and last
warmed on the egg, feedings and last fed on the hatchling. Variant, cracks,
stage and happy are entity properties with `client_sync`, which is what the
render controllers and animation controllers read.

## Layout

```
scripts/core/rules.ts     pure: variants, panel parser, warm(), feed(), cooldowns   <- vitest
scripts/core/glide.ts     pure: how hard to push back on a falling hatchling    <- vitest
scripts/engine/egg.ts     the egg item, warming, pick-up, hatching
scripts/engine/pet.ts     feeding and growth
scripts/engine/flight.ts  the glide sweep: wings out, hold it at a drift
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
6. **Does bonding work?** Measured: berries bond it
   (`hatchling_tames_with_berries`). What is left to see on a real client is
   whether a bonded hatchling then feeds and grows - the pack was asking the
   wrong component for "is this bonded" and never got that far. The probe's
   log will say `tamed=false` even for a bonded one: the tameable component
   is gone by then, and `is_tamed` is the marker to read.
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
11. **Does the glide look like flight?** Walk one off a cliff. It is
    measured to descend at about half a block a tick, wings out, and to
    land unhurt; what a headless run cannot see is the animation. If the
    wings do not spread, the client entity is not carrying
    `animation.hatchling.glide` or `hatchling:gliding` is not reaching the
    client (`client_sync`). If the drift looks like hovering rather than
    gliding, raise `GLIDE_SPEED` in `scripts/core/glide.ts`.
12. **Does a hatchling ever get left at the bottom of a ravine?** It cannot
    die of the fall any more, but it can still be somewhere its player is
    not. Vanilla `follow_owner` is the only thing bringing it back today; if
    that turns out not to teleport, a recall belongs on the locator-bar
    marker in the design's "Later" list.

The GameTest pack pins what does not need a player:
`hatchling_egg_keeps_variant_and_shell`, `hatchling_egg_hatches_into_its_variant`,
`hatchling_grows_by_stage_event`, `hatchling_tames_with_berries` (taming is
vanilla, so the engine does it without the pack seeing anyone),
`hatchling_shell_cracks_while_warming` — each `crack_N` moves the shell, keeps
the variant, and does not hatch the egg early, which matters because the shell
is the only thing a player watching a half-hour warming has to go on — and the
two about falling, `hatchling_ignores_fall_damage` and
`hatchling_glides_down_a_drop`.
