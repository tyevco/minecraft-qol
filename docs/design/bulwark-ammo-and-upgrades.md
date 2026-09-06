# Bulwark — Ammo types and upgrades

**Phase 3 research: what the engine offers a turret beyond a plain arrow, what the stable API can read and write, and a proposal**

Companion to `design/bulwark-turret.md` §4–5 · Draft v0.1

> Research, not a build. The evidence is the vanilla 1.26.45 entity
> definitions on the test server, the `@minecraft/server` 2.9.0 typings, and
> one measurement, [`docs/bulwark-ammo-results.md`](../bulwark-ammo-results.md).
> Nothing here is pinned by a GameTest yet; §8 lists what must be prototyped
> before any of it is built. Where this document and the original design
> disagree, the original was written from preview builds and this one from
> the installed engine.

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
| Fire charge | a custom `bulwark:ember`, not `small_fireball` | type id | yes | vanilla `small_fireball` sets the block it hits on fire; the custom one must not | second addition, behind a world toggle |
| Wind charge | `minecraft:wind_charge_projectile` | type id | yes | the burst presses buttons and opens doors and trapdoors near the impact | repeller alternative; the door thing argues against it near a base |
| Splash potion | `minecraft:splash_potion` with `aux_val` | `ItemPotionComponent` reads effect and delivery | yes, via `Potions.resolve` (unmeasured) | slow (`power` 0.5); a lingering cloud hurts players too | later; fully readable, so the cleanest to gate |
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
as good as the line of sight. Recommendation: **range is a world setting, not
a turret upgrade** — a dropdown of 16 / 24 / 32 on the settings panel, which
also lets an operator keep every turret short on a crowded Realm.

### 4.4 Projectile

With §3 in place this axis is not an upgrade at all: the projectile is
whatever the hopper holds. Drop it from the upgrade tree.

### 4.5 So: one tier axis

Collapse to a single tier, 1–3, the one the head already draws. Each tier
raises fire rate and damage together and is fed with the material its
texture shows: iron ingots to reach tier 2, diamonds for tier 3, netherite
for a fourth if the appetite is there (the property's range would grow). Tier
3 could also switch the plain-arrow shooter to the homing `bulwark:bolt`,
which is the "netherite turret does something a bow cannot" moment the design
wanted from `CustomForm.image`. The groups are then `bulwark:tier_1..3`
(each a `ranged_attack`), plus one `bulwark:ammo_<kind>` group per ammo
(each a `shooter`), plus `disarmed`: six or seven groups, not twenty-seven.

Tier state goes in the record (schema 2: `tier`, and the count of material
fed, so a broken turret drops its ingots back — rule 4). The head is
re-tiered by `triggerEvent("bulwark:tier_N")` whenever the block reconciles
it, the same place `syncArming` runs. Per the design, the group swap must
happen on the live entity: never respawn a head to change its tier.

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

**3a — ammo from the hopper.** Tipped arrows (four tints), snowballs, and the
custom ember behind a toggle. Hopper-direct consumption (§5). `bulwark:ammo_*`
groups on the head. The attribution set. Status text names the ammo and where
it comes from. **No record schema change.**

**3b — one tier.** `bulwark:tier` set from a record column, fed with ingots
by right-click, materials returned on break. `tier_1..3` groups with
`attack_interval` and `shooter.power` (or the script multiplier). Schema 2.
The homing bolt at tier 3 if §8 item 4 measures clean.

**3c — the panel.** Range dropdown; incendiary toggle; a `bulwark:debug`
line per turret reporting kind, tier and source.

Each phase gets its GameTests before the next starts: a hopper of poison
arrows leaves the husk with the poison effect; a hopper of snowballs leaves
its health untouched and its position moved; an ember leaves it on fire and
the block behind it not; a tier-3 head shoots faster and harder, measured
through `entityHurt.damage`.

## 8. Must prototype before building

Each is one GameTest or one `qolprobe:*` event; the answer changes the build.

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

- §4.2's four axes become one tier plus world settings; the projectile axis
  is replaced by ammo. The `bulwark:tier` property, events and textures the
  pack already carries are the scaffolding for it.
- §5.3's "store ammo count with a modest cap" holds for plain arrows only.
  Special ammo is not stored, because the API cannot give it back.
- §12's Phase 5 "repeller variant" is a snowball in the hopper, and arrives
  with 3a.
- The corrections table in `docs/README.md` should gain the tipped-arrow row
  once the localization key has been read for a fifth tint, and a `Potions.resolve`
  row once someone has called it.
