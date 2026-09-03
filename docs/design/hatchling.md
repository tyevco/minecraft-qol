# Hatchling — Design Document

**A pet dragon for the kids: craft an egg, warm it, hatch it, feed it, watch it grow**

Target: `@minecraft/server` 2.9.0 / `@minecraft/server-ui` 2.1.0 · Entity format version 1.26.40 · Written alongside the implementation, v0.1

> Phase 1 is **built** (`packages/hatchling`) and **unmeasured**. The pack README
> lists what to confirm in game; `qolprobe:egg` and `qolprobe:pet` in the probe
> pack measure it. This document grew out of the concept sheet
> (`entities.md` §3.4) and corrects it where the typings disagreed.

---

## 1. The pitch

A pure-fun companion. Nothing in the Realm gets easier because of it; it is a
thing to care for and show off. The loop is short enough for a young player to
hold in their head and long enough to come back to:

1. **Craft an egg.** A chicken egg ringed with coal, bone meal or snowballs
   makes an ember, moss or frost egg. All three are Overworld, day-one items.
2. **Put it down and warm it.** The egg is an entity on top of a block. Warm it
   by hand with the same thing it was made from, a few times, with a rest in
   between. The shell cracks as it goes; the egg wobbles once it is cracked.
3. **It hatches** into a hatchling of the egg's variant, wild.
4. **Make friends.** Offer it sweet berries. It is now theirs: it follows, sits
   when told, takes a name tag and a lead.
5. **Feed it and it grows**, two sizes over a dozen feedings, each followed by a
   rest. A grown hatchling still likes a treat.

### Design stance

- **It never fights.** No attack goals, no `hurt_by_target`. It panics and
  runs. Its type family is `mob`, which the vanilla hostiles do not target, so
  it is not a liability at night either.
- **Real time, not a timer.** The rests between warmings and feedings are wall
  clock (`Date.now()`), so leaving the Realm running does nothing; a player
  has to come back and tend. There is no way to rush it and no reason to,
  which is what keeps it from being a chore or a trivial unlock.
- **Shared by default.** Anyone can warm any egg and feed any hatchling, so
  siblings can look after each other's. A panel toggle restricts feeding to
  the owner for families that want it.
- **Fail towards the player.** An egg that cannot be given back stays where it
  is; a hatch whose spawn fails leaves the egg warmable; every item is taken
  only after the thing it paid for exists.

## 2. What the stable API gives, and one thing it does not

Checked against the installed `node_modules/@minecraft/server/index.d.ts`.

| Need | Stable mechanism |
| --- | --- |
| Place the egg from an item | Item custom component V2, `hatchling:egg_item`, `onUseOn`: the block and face are on the event, the player is `source` |
| Warm, feed, pick up | `world.beforeEvents.playerInteractWithEntity`: `target`, `itemStack`, `player.isSneaking`, `cancel`; the mutation on the next tick via `system.run` |
| Variant, cracks, stage on the client | Entity properties with `client_sync`; `Entity.setProperty` / `getProperty`; render controllers read `q.property` |
| Crack overlays | Render controller `part_visibility` keyed on the cracks property; the overlay bones exist in the geometry |
| Growth | `minecraft:scale` and `minecraft:health` in stage component groups swapped by `Entity.triggerEvent` (`EntityScaleComponent.value` is read-only) |
| Ownership | **`minecraft:tameable` in the entity JSON**, `tame_items` + `probability: 1.0` + `tame_event`; script reads `EntityTameableComponent.isTamed` / `tamedToPlayerId` |
| Per-entity memory | Entity dynamic properties: warmings, last warmed, feedings, last fed |
| Hatching as an event | `Entity.triggerEvent("hatchling:hatch")` and `world.afterEvents.dataDrivenEntityTrigger` filtered to the egg and that event |
| Hatch that survived a world close | `world.afterEvents.entityLoad`: an egg loaded with `hatching` set finishes hatching |

**The correction.** The concept sheet said script would tame the hatchling to
whoever warmed the egg. It cannot: `EntityTameableComponent` in 2.9.0 is
read-only, and `tame()` / `tameToPlayer()` live only on
`EntityTameMountComponent`, for rideables. So the hatchling hatches **wild**
and is bonded by the vanilla component the moment a player offers it berries.
That turned out to be a better beat anyway: the hatch and the bond are two
moments, not one. Recorded in `docs/README.md`.

## 3. The entities

**`hatchling:egg`.** Inanimate: gravity, a small collision box, not pushable,
knockback-proof, fire-immune, `damage_sensor` refusing every hit, persistent.
Properties `hatchling:variant` (0 ember, 1 moss, 2 frost), `hatchling:cracks`
(0–2), `hatchling:hatching`. Events `variant_N` (used as the spawn event),
`crack_N`, `hatch`. It has no vanilla interaction of its own; everything is
the before-event.

**`hatchling:hatchling`.** A small walking mob: `navigation.walk`, float,
panic, stroll, look at players; nameable, leashable, persistent, `mob`
family. Properties `variant`, `stage` (0–2), `happy` (drives the flap
animation). Component groups:

| Group | Contents |
| --- | --- |
| `stage_0` / `stage_1` / `stage_2` | scale 0.55 / 0.8 / 1.1, max health 10 / 16 / 24; `grow_1` and `grow_2` swap them and set `stage` |
| `wild` | `tameable` (sweet berries, probability 1.0, `on_tame`), `tempt` |
| `tame` | `is_tamed`, `sittable`, `stay_while_sitting`, `follow_owner` |
| `ember` | `fire_immune`, added by `variant_0` |

`on_tame` swaps `wild` for `tame`. Sitting and standing are the engine's
(interact with an empty hand); the pack leaves any non-food interaction with
a bonded hatchling uncancelled for that reason.

## 4. The decisions

All in `scripts/core/rules.ts`, under Vitest:

```
warm(egg, held, now, policy)   -> not_warm_item | cooldown | warmed(cracks) | hatch
feed(pet, held, tender, now, policy)
                               -> not_food | not_owner | cooldown | fed | grow(stage) | treat
cracksFor(warmings, toHatch)   -> 0..2, spread evenly over the warmings
cooldownRemaining(last, now)   -> ms, never negative, tolerant of a clock that went back
parsePolicy(panel)             -> clamped sliders, defaults for anything malformed
```

The engine reads state (`readEgg`, `readPet`), asks for a decision in the
before-event, cancels the interaction when it is handling it, and applies the
decision on the next tick. Order of operations on apply: re-read (the world
may have moved on), consume the item, then write the entity. A consumption
that fails (the player switched hands) applies nothing.

## 5. The panel

Format-3 manifest. Sliders for warmings to hatch (1–6, default 3), rest
between warmings (0–60 min, default 10), feedings per stage (1–10, default 4)
and rest between feedings (0–60 min, default 15); a toggle for whether anyone
may feed a bonded hatchling (default on). Eggs are always shared: an egg has
no owner until it hatches and is fed.

## 6. Must confirm in game

Listed with the fix for each outcome in the pack README. The headline items:

1. `onUseOn` fires for the custom item and `blockFace` / `block` are what the
   pack expects; that an item component callback may spawn an entity, or
   needs the `system.run` it already uses.
2. `tame_event` fires on the berries and `tamedToPlayerId` reads back the
   player's `id`.
3. `part_visibility` driven by `q.property` shows the crack overlays; whether
   the overlay a quarter pixel proud of the shell z-fights at distance.
4. A stage group swap does not visibly pop the model or reset its AI.
5. `dataDrivenEntityTrigger` with `entityTypes` / `eventTypes` options
   delivers the hatch event; `entityLoad` catches an egg that was hatching
   when the world closed.
6. `Date.now()` advances as wall clock inside the script runtime.

## 7. Later

- **Pet insurance** through Guardian Phase 3: a bonded hatchling that dies is
  re-spawned at its owner's side with its name and stage. The shape is
  already there (variant and stage are properties, the owner is on the
  tameable component).
- **Variant touches:** the ember hatchling could dry a wet player, the frost
  one slow a mob that hurts its owner, the moss one drop a sweet berry now
  and then. Cosmetic at first: a puff of embers, spores or frost from the
  `mouth` locator through the idle animation.
- **A bigger egg loop:** an egg found rather than crafted, in a nest structure
  in the right biome, for a Realm that wants exploration to matter.
- **Locator-bar marker** for a hatchling that wandered off, on the shared
  waypoints module.
