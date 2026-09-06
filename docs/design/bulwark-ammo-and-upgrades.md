# Bulwark — Ammo types and upgrades

**Phase 3 research: what the engine offers a turret beyond a plain arrow, what the stable API can read and write, and a proposal**

Companion to `design/bulwark-turret.md` §4–5 · Draft v0.1

> Research, not a build. The evidence is the vanilla 1.26.45 entity
> definitions on the test server, the `@minecraft/server` 2.9.0 typings, and
> the measurements in [`docs/bulwark-ammo-results.md`](../bulwark-ammo-results.md).
> §8 lists what had to be prototyped before any of it is built; those
> prototypes are the `rig_*` tests in `packages/gametest/scripts/suites/bulwark_ammo.ts`.
> Where this document and the original design disagree, the original was
> written from preview builds and this one from the installed engine.

**Decisions taken (2026-09-06), which override the recommendations below
where they differ:**

1. Prototype §8 before building anything. **Done**: all nine `rig_*` tests pass.
2. First-cut ammo: **tipped arrows, snowballs and splash potions.** The
   custom ember is deferred, not rejected. **Built as Phase 3a** (§7):
   hopper-direct for every kind, tints slowness, weakness and decay, and the
   spawn-time kill map, with five `turret_*` GameTests.
3. **Keep the original design's four upgrade axes** (damage, fire rate,
   range, projectile) rather than collapsing to one tier. §4.5 is rewritten
   for that; the group-count cost it carries is stated there so it is chosen
   with eyes open. **Built as Phase 3b**: damage as a script multiplier
   (not `shooter.power`), one item per tier, on the same branch.

Two choices made while building 3b, not put as questions, and worth a
second look: the **ammo gate's materials** are a fire charge for tier II and
dragon's breath for tier III (the design's projectile axis named a fire
charge, and dragon's breath is what brews the potions the top tier
unlocks); and **materials are accepted from a feeding hopper as well as by
right-click**, one per block tick, because a simulated player's right-click
never reaches a pack and the hopper path is the only one a GameTest can
drive. It is also a real path a player can automate.

---

## 1. Where Phase 2 leaves us

Every layer of the shipped turret assumes one ammo:

- `core/ammo.ts` hard-codes `AMMO_ITEM = "minecraft:arrow"`; `planPull` and
  `acceptFeed` skip anything else, so a tipped arrow in a hopper is ignored.
- The record is `[dim, x, y, z, entityId, ammo, kills]` with `ammo` a plain
  count. Nothing says what kind.
- The head's `bulwark:armed` group carries `minecraft:shooter { def:
  "minecraft:arrow", sound: "bow" }`. The engine spawns that whatever was fed.
- Shot attribution in `engine/hooks.ts` watches `minecraft:arrow` spawns only.
  A different projectile would fire for free.
- Breaking the block drops `AMMO_ITEM × ammo`: plain arrows, always.

One thing is further along than the README says. The head already declares an
int property `bulwark:tier` (1–3, client-synced), events `bulwark:tier_1..3`
that set it, three textures (`iron`, `diamond`, `netherite`) and a render
controller that picks one by the property. No script sets the property, so
every head is iron. The visual half of tiering is done; the mechanical half is
not.

## 2. What the engine gives us

### 2.1 `minecraft:shooter` — which projectile, and its tint

Fields, each seen in a vanilla definition on the server:

| Field | Seen in | What it does |
| --- | --- | --- |
| `def` | everything | entity to spawn |
| `aux_val` | stray `19`, bogged `26`, witch `23` | the item aux: a tipped arrow's tint, a splash potion's effect |
| `sound` | skeleton `bow`, drowned `item.trident.throw` | fired sound |
| `power` | witch `0.75` | launch speed multiplier; for arrows this is damage (§2.3) |
| `magic` | witch `true` | the projectile counts as magic damage |
| `projectiles[]` | witch | ordered alternatives, each with `def`, `aux_val`, `filters` on self/target, `chance`, `lose_target` |

The witch's list is the interesting one: *pick the projectile per target at
fire time*, by filter. Healing for a hurt raider, slowness for a far target,
weakness at close range with a 25 % chance. The turret cannot use it to pick
an ammo it was not fed, but it can use it to choose among tints it has.

The component lives in a component group and swaps with `triggerEvent`
exactly as `bulwark:arm` and `bulwark:disarm` do today (the blaze's
`ranged_mode` and the skeleton's difficulty variants are the vanilla
precedent). Component groups are additive: a `bulwark:tier_2` group holding
`ranged_attack` and a `bulwark:ammo_poison` group holding `shooter` can both
be on the entity, so the axes need not be multiplied out.

### 2.2 `minecraft:behavior.ranged_attack` — rate, range, bursts

Fields seen in vanilla: `attack_interval` (or `attack_interval_min` /
`_max`), `attack_radius`, `attack_radius_min` (piglin), `burst_shots` and
`burst_interval` (blaze: three shots 0.3 s apart), `charge_shoot_trigger` /
`charge_charged_trigger` (ghast, llama: a wind-up before the shot),
`speed_multiplier`, `swing`, `target_in_sight_time`. Phase 2 uses interval
1–2 s and radius 16 with `x_max_rotation` 90 and `y_max_head_rotation` 180.

Fire rate and range are both this one component, which matters for how tiers
are grouped (§4.3).

### 2.3 `minecraft:projectile` — what a shot does when it lands

Vanilla's projectiles, as the server defines them. `damage` is the
`on_hit.impact_damage.damage` field; "velocity" means the arrow rule.

| Entity | Item that throws it | Gravity | Damage | On hit |
| --- | --- | --- | --- | --- |
| `arrow` (mob group) | arrow, tipped arrow | 0.05 | 0 × `power_multiplier` 2, i.e. from velocity; `power` 1.6 for mobs, 3.0 for players | `arrow_effect` applies the tint; knockback; `stick_in_ground` |
| `snowball` | snowball | 0.03 | 3 vs blaze only, else 0 | knockback, `snowballpoof`, removed |
| `small_fireball` | fire charge (blaze) | **0** | 5, `catch_fire` on the target | **`catch_fire` on the block it hits** (mob griefing) |
| `fireball` | ghast | 0 | 6 | explodes: `minecraft:explode` power 1, breaks blocks, causes fire |
| `wind_charge_projectile` | wind charge | 0 | 1 | `wind_burst_on_hit`: a knockback burst; pushes buttons, doors, trapdoors |
| `shulker_bullet` | none | 0.05 | 4 | **`homing: true`**, levitation 10 s |
| `llama_spit` | none | 0.06 | 1 | removed |
| `thrown_trident` | trident | 0.1 | 8 | sticks, returns |
| `egg` | egg | 0.03 | 0 | chickens |
| `dragon_fireball` | none | 0 | none | `spawn_aoe_cloud` of harming, radius 6 |
| `splash_potion` | splash potion | 0.05 | none | `thrown_potion_effect`, `douse_fire` |
| `lingering_potion` | lingering potion | 0.05 | none | `spawn_aoe_cloud` radius 3 |

Every one of those `on_hit` hooks is a plain JSON field on an entity at
format version 1.26.40, and a behaviour pack may define its own projectile
entity with any subset. That is the important reading: **a Bulwark projectile
need not be a vanilla one.** A `bulwark:ember` with `impact_damage { damage:
5, catch_fire: true }` and *no* block `catch_fire` is a fire charge that
cannot burn the base down; a `bulwark:bolt` with `homing: true` and no
levitation is the shulker's trick without the floating. The projectile's own
`minecraft:projectile` decides the hit; the shooter's `def` only names it.

### 2.4 What script can do on 2.9.0

Read against `node_modules/@minecraft/server/index.d.ts`; each is stable.

- **Groups and properties.** `Entity.triggerEvent`, `setProperty` /
  `getProperty` (the `bulwark:tier` property is already declared).
- **Attribution.** `entitySpawn` plus `EntityProjectileComponent.owner`, as
  now. `projectileHitEntity` / `projectileHitBlock` after-events carry
  `projectile`, `source` and `getEntityHit()`, so a hit can be seen without
  the arrow needing to kill.
- **Damage in script.** `beforeEvents.entityHurt` has a writable `damage` and
  a `damageSource` with `damagingEntity` and `damagingProjectile`. Guardian
  ships on exactly this (`packages/guardian/scripts/engine/shield.ts`). A
  damage tier can be a multiplier applied when `damagingEntity` is a turret
  head, with no projectile variants at all.
- **Effects and fire from script.** `Entity.addEffect`, `setOnFire`,
  `applyImpulse`, `applyKnockback`. A hit hook could do what a tint does, if
  the tint route fails.
- **Items.** `ItemStack.localizationKey` names a tipped arrow's effect;
  `isStackableWith` a plain arrow tells tipped from plain;
  `ItemPotionComponent` is present on potions and splash potions only;
  `Potions` lists effects and deliveries. **No aux value, no way to construct
  a tipped arrow** (`bulwark-ammo-results.md`). Containers: `getItem`,
  `setItem`, `moveItem`, so an existing stack can be moved or decremented but
  never re-created.
- **Policy.** A format-version-3 manifest's settings panel, read through
  `packages/shared/engine/packSettings.ts`. Per world, not per turret.

## 3. Ammo types — the candidates

Rated on: what it does to a monster, whether the turret can tell it was fed
that, whether a buffered one can be given back on break (rule 4 of
`CLAUDE.md`), and what it risks around a base.

| Ammo | Fires | Tell it apart by | Give back on break? | Risk | Verdict |
| --- | --- | --- | --- | --- | --- |
| Arrow | `minecraft:arrow` | is `AMMO_ITEM` | yes (built) | none | built |
| Tipped arrow | `minecraft:arrow` with `aux_val` = tint index + 1 | `localizationKey` `tipped_arrow.effect.*` | **no** — cannot be constructed | a healing or regeneration tint heals the target; harming heals the undead | **first addition**, hopper-direct (§5) |
| Snowball | `minecraft:snowball` | type id | yes | none; no damage, knockback only | cheap; this *is* the design's repeller variant |
| Fire charge | a custom `bulwark:ember`, not `small_fireball` | type id | yes | vanilla `small_fireball` sets the block it hits on fire; the custom one must not | **deferred** (decision 2); would sit behind a world toggle |
| Wind charge | `minecraft:wind_charge_projectile` | type id | yes | the burst presses buttons and opens doors and trapdoors near the impact | repeller alternative; the door thing argues against it near a base |
| Splash potion | `minecraft:splash_potion` with `aux_val` | `ItemPotionComponent` reads effect and delivery | yes, via `Potions.resolve` | slow (`power` 0.5); a lingering cloud hurts players too | **first cut** (decision 2); fully readable, so the cleanest to gate, and the only special ammo that can be buffered and given back |
| Trident | `minecraft:thrown_trident` | type id | yes | 8 damage; the item is a tool, one per throw, and the projectile sticks and must be returned | no |
| Egg, firework rocket, ender pearl | — | — | — | chickens; needs a crossbow's explosion data; teleports the head | no |
| Homing bolt | a custom `bulwark:bolt` with `homing: true` | not an item | n/a | none if it carries no levitation | not ammo: a **tier reward** (§4) |

**Which tints.** A tipped arrow applies its potion to whatever it hits, so
the set the turret will fire has to be chosen for monsters, and the choice is
not obvious. Harming (aux 24) *heals* zombies, skeletons, husks, drowned,
phantoms and withers, which are most of what stands outside a house at night;
healing (aux 22) hurts them and heals everything else. Poison does nothing to
the undead either. Slowness and weakness work on everyone. Decay (`wither`,
aux 37) works on everyone and stacks with arrow damage. So the honest
recommendation for a first cut is **slowness, weakness, decay and poison**,
with harming and healing left in the hopper untouched and the status text
saying why. The witch's `projectiles[]` filters could pick healing for
undead and harming for the rest *if both were loaded*, which is a Phase 3b
nicety, not a first cut.

## 4. Upgrades — what is feasible, axis by axis

The original design (§4.2) proposed four axes of three tiers: damage, fire
rate, range and projectile. Against the engine:

### 4.1 Damage

Three routes, all stable:

1. **`shooter.power`.** An arrow's damage is its velocity times two; mobs
   launch at 1.6, players at 3.0. Raising `power` per tier is the engine's own
   damage knob, costs nothing per hit, and also flattens the arc, which is
   more range. The default when `power` is absent is not documented and must
   be measured (§8).
2. **A script multiplier** in `entityHurt` before-event when
   `damagingEntity` is a turret head, read off the head's `bulwark:tier`.
   Guardian's pattern; exact and independent of the projectile.
3. **A custom projectile per tier** with its own `impact_damage`. Most
   files, and it forfeits the tipped-arrow tints unless every tier is
   redefined for every tint. No.

Route 1 first, route 2 as the fallback if `power` proves coarse.

### 4.2 Fire rate

`attack_interval` per tier group; the top tier can add `burst_shots`. Ammo
use scales by itself, because every spawned projectile costs one.

### 4.3 Range

`attack_radius`, `nearest_attackable_target.max_dist`, `follow_range` and
`look_at_target.look_distance` all move together. But `ranged_attack` is one
component holding both rate and radius, so rate × range as independent tiers
is nine `ranged_attack` groups, and `must_see` means a longer range is only
as good as the line of sight. The research's recommendation was that range
be a world setting rather than a turret upgrade — a dropdown of 16 / 24 / 32
on the settings panel, which also lets an operator keep every turret short on
a crowded Realm. **Decision 3 keeps it as an axis**; §4.5 pays the group
cost. A world-level cap on the panel is still worth having on top, for the
crowded-Realm case.

### 4.4 Projectile

With §3 in place the projectile itself is whatever the hopper holds, so this
axis cannot *choose* a projectile. What it can do, and what decision 3 keeps
it for, is gate **what the turret is able to fire**: tier 1 plain arrows
only, tier 2 adds tipped arrows, tier 3 adds snowballs and splash potions.
A turret below the tier leaves the ammo in the hopper and says so in its
status text. That is a rule in `core/`, not a component group, so it costs
nothing on the entity.

### 4.5 Four axes, and what they cost on the entity

Per decision 3 the four axes stay: damage, fire rate, range, and the
projectile gate above. The engine cost is in component groups, because
`ranged_attack` carries both interval and radius and `shooter` carries both
the projectile and `power`:

| Axis | Lives in | Groups if done in engine | Cheaper route |
| --- | --- | --- | --- |
| Damage | `shooter.power` | one per damage tier × ammo kind | the `entityHurt` multiplier (§4.1 route 2): **zero** groups |
| Fire rate | `ranged_attack.attack_interval` | rate × range combined | — |
| Range | `ranged_attack.attack_radius` plus `nearest_attackable_target.max_dist`, `follow_range`, `look_distance` | rate × range combined | — |
| Projectile gate | `core/` rule | none | — |

So the recommended shape under decision 3: **damage in script** (Guardian's
pattern, exact, no groups), **rate × range as nine `bulwark:aim_<rate>_<range>`
groups** (each one `ranged_attack` plus its target and follow ranges),
**one `bulwark:ammo_<kind>` group per ammo kind** (each one `shooter`), the
projectile gate in `core/ammo.ts`, and `disarmed`. Groups are additive, so an
armed head holds exactly one aim group and one ammo group; `syncArming`
grows into `syncGroups(entity, record)` and fires the events whose group is
not the one the record wants. Fourteen groups instead of the original's
implied eighty-one, and the record's four small integers are what the
original design asked for in §4.2.

Feeding follows the original table: iron / diamond / netherite for damage,
redstone / redstone block / quartz for fire rate, ender pearl / eye of ender
/ ender chest for range, and the projectile gate paid in the ammo it unlocks
(a stack of tipped arrows for tier 2, a splash potion for tier 3). Every
material fed is counted in the record (schema 2) so a broken turret drops it
back — rule 4. The head's `bulwark:tier` property, and its three textures,
should follow the *damage* axis, which is the one the design paired with
`minecraft:variant`.

The head is re-tiered by `triggerEvent` whenever the block reconciles it,
the same place `syncArming` runs. Per the design, the group swap must happen
on the live entity: never respawn a head to change its tier. §8.2 measures
that a `ranged_attack` swap keeps firing.

### 4.6 Targeting priority

The design's fifth axis (nearest / weakest / strongest) is expressible with
ordered `nearest_attackable_target.entity_types` and filters. It needs a
config form, which is server-ui and a per-turret setting rather than a world
one. Leave it for after the form exists.

## 5. Feeding with more than one ammo

The constraint from the measurement: a tipped arrow cannot be re-created, so
a *count* of tipped arrows in the record can never be given back as tipped
arrows. Three ways out were considered.

- **A. Special ammo is never buffered.** The plain-arrow buffer stays as
  built. Each block tick the turret also looks at the feeding hoppers' first
  ammo stack; if it is a kind it fires, the head's ammo group follows it and
  the turret is armed even with an empty buffer. When a shot is attributed,
  the turret decrements that stack in place (`getItem`, `amount - 1`,
  `setItem`) instead of the buffer. Nothing special is ever taken from the
  world, so breaking the block returns exactly what it holds today, and a
  player who hand-feeds tipped arrows is told to point a hopper at it.
- **B. A typed buffer** that stores `[kind, count]` and returns plain arrows
  for a tipped kind. Loses the tint on break. Rejected on rule 4.
- **C. Hold the actual `ItemStack` in script memory** so it can be put back.
  Lost on `/reload`, restart and chunk unload. Rejected.

**A**, with two refinements. Special ammo takes priority over the buffer
when both are present, because a tipped arrow in the hopper is a deliberate
choice. And the constructible kinds (snowballs, fire charges) *could* go
through the buffer later with a `kind` column, but a single-kind buffer makes
"what happens when the hopper switches ammo" a question with a boring answer,
so the first cut keeps the buffer plain and everything else hopper-direct.

Attribution generalises with a set: `entitySpawn` matches any of
`minecraft:arrow`, `minecraft:snowball`, `bulwark:ember`, `bulwark:bolt`, and
the owner check is unchanged. Kill counting relies on `damagingEntity` being
the shooter for every kind, which is measured for arrows only (§8).

## 6. Safety

- **Fire.** Never fire vanilla `small_fireball` near a base: its block-hit
  `catch_fire` obeys mob griefing, which a family Realm leaves on. The custom
  ember ignites the *target* only. Even so, incendiary ammo is a world toggle,
  default off, because a burning zombie walking into a wooden wall is still a
  burning zombie.
- **Explosions.** No fireball, no firework, nothing with `minecraft:explode`.
  `destroy_affected_by_griefing` is not a safety net; it is a setting someone
  else can flip.
- **Effects that backfire.** Healing and regeneration tints heal the target;
  harming heals the undead; levitation floats a mob over the wall it was
  meant to stop. §3 chooses the tints, and no Bulwark projectile carries
  levitation.
- **Doors.** A wind charge's burst opens doors and trapdoors around the
  impact, which near a base is the opposite of defence.
- **Players.** Unchanged: the acquisition filter is `is_family: monster` and
  player targeting is not built. Tints and embers make that rule more
  important, not less.

## 7. Proposal, phased

**3a — ammo from the hopper. Built.** Tipped arrows of slowness, weakness
and decay, snowballs, and splash potions of the same three effects
(decision 2; poison and harming were dropped because they do nothing to the
undead, measured). Hopper-direct consumption (§5) for every kind, splash
potions included, by decision. `bulwark:ammo_*` groups on the head, one per
kind, additive with `bulwark:armed`. The attribution set and the spawn-time
kill map. Status text names the ammo and where it comes from; a special
stack offered by hand is refused with the reason. **No record schema
change.** Pinned by `turret_fires_tipped_from_hopper`,
`turret_leaves_healing_tint_alone`, `turret_throws_snowballs_from_hopper`,
`turret_throws_splash_from_hopper` and `turret_prefers_special_over_buffer`.

**3b — the four axes. Built.** Schema 2 with four tier columns; the
materials fed are the tiers themselves (tier N on an axis is N−1 items) and
come back on break. Nine aim groups (`bulwark:aim_r<rate>_g<range>`, each
with its `ranged_attack`, target range, look distance and `follow_range`),
damage as an `entityHurt` multiplier of 1 / 1.5 / 2, the projectile gate in
`core/tiers.ts`. One item per tier by right-click or from a feeding hopper.
`bulwark:tier` follows the damage axis. Pinned by
`turret_rate_upgrade_fires_faster`, `turret_damage_upgrade_hits_harder`,
`turret_gate_holds_tipped_until_upgraded` and `turret_break_returns_upgrades`;
range tiers need a person (the arena is eight blocks).

**3c — the panel and the form.** A `bulwark:debug` line per turret reporting
kinds, tiers and source; the per-turret config form (server-ui) for targeting
priority, once there is something to configure.

Each phase gets its GameTests before the next starts: a hopper of poison
arrows leaves the husk with the poison effect; a hopper of snowballs leaves
its health untouched and its position moved; a splash potion leaves the
effect; a damage-tier head hits harder, measured through `entityHurt.damage`.

## 8. Must prototype before building

Each is one GameTest or one `qolprobe:*` event; the answer changes the build.
Items 1–6 are the `rig_*` tests in `packages/gametest/scripts/suites/bulwark_ammo.ts`,
built on a test-only `qol:shooter_rig` entity and a `qol:bolt` projectile
that ship in the GameTest pack; their readings are in
`docs/bulwark-ammo-results.md`. **All six pass.** Two things they changed:
a poison tint does nothing to the undead (the tests use slowness and
weakness), and a kill by a custom projectile names the *projectile* as
`damagingEntity`, so kill counting must fall back to `damagingProjectile`'s
owner (item 4). Item 7 needs a person.

1. **Group swap changes the next shot.** Arm a head with a `shooter` group of
   `aux_val` 26, spawn a husk, assert it gains `poison`. Then `triggerEvent`
   to a plain-arrow group between shots and assert the next hit adds nothing.
   If a swapped `shooter` does not take until re-arm, 3a needs a disarm-arm
   pair around every switch.
2. **A group swap keeps the target.** The design says not to respawn; verify
   the `ranged_attack` from a new tier group carries on at the same husk.
3. **`shooter.power`.** The default, and the `entityHurt.damage` a husk takes
   at 1.6 versus 3.0. Decides §4.1 route 1 against route 2.
4. **A custom projectile from a custom shooter has an owner.** Spawn
   `bulwark:ember` through `shooter.def`, read `Projectile.owner` at spawn
   and a tick later as `attributeShot` does; then confirm `entityDie`'s
   `damagingEntity` is the head for a kill by ember. If the owner is missing,
   embers cost nothing and count nothing, and 3a ships without them.
5. **Hopper-direct decrement races the hopper.** Decrement slot 0 from the
   `entitySpawn` handler while the hopper is also moving items; assert the
   hopper's total is exactly one less per shot over ten shots.
6. **The witch trick on a custom entity.** `projectiles[]` with a target
   filter, to see whether tint-per-target is available for 3b.
7. **Tier reapplication on reload.** Set tier 3, `/reload`, check the head is
   still drawn netherite and fires at the tier-3 interval.

## 9. What this changes in the original design

- §4.2's four axes stay (decision 3), but the projectile axis becomes a gate
  on what the turret will accept from the hopper rather than a choice of
  projectile, damage moves into script, and rate × range share nine aim
  groups. The `bulwark:tier` property, events and textures the pack already
  carries follow the damage axis.
- §5.3's "store ammo count with a modest cap" holds for plain arrows only.
  Special ammo is not stored, because the API cannot give it back.
- §12's Phase 5 "repeller variant" is a snowball in the hopper, and arrives
  with 3a.
- §4.2's fire-charge projectile tier is deferred (decision 2); when it comes
  it is the custom ember of §3, never vanilla `small_fireball`.
- The corrections table in `docs/README.md` should gain the tipped-arrow row
  once the localization key has been read for a fifth tint, and a `Potions.resolve`
  row once someone has called it.
