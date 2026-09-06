# Bulwark ammo types — what script can read off a tipped arrow, measured

**What was measured.** A chest at `0 100 0` in the headless test world,
force-loaded with `tickingarea`, filled by console `/replaceitem` with one
stack per slot, then read back by `/scriptevent qolprobe:item-at 0 100 0 60`
in the probe pack. The handler logs each stack's `typeId`, `amount`,
`localizationKey`, `getTags()`, `getComponents()`, the `minecraft:potion`
component if there is one, and `isStackableWith(new ItemStack("minecraft:arrow"))`;
then the `Potions` registry. BDS as `tools/bds/setup.mjs` installs it (the
newest vanilla behaviour pack on it is `vanilla_1.26.45`), `@minecraft/server`
2.9.0. One run; every line below is a direct reading.

| `/replaceitem … ` | `typeId` | `localizationKey` | `minecraft:potion` | stacks with a plain arrow |
| --- | --- | --- | --- | --- |
| `arrow 1 0` | `minecraft:arrow` | `item.arrow.name` | none | **true** |
| `arrow 1 6` | `minecraft:arrow` | `tipped_arrow.effect.nightVision` | none | false |
| `arrow 1 18` | `minecraft:arrow` | `tipped_arrow.effect.moveSlowdown` | none | false |
| `arrow 1 26` | `minecraft:arrow` | `tipped_arrow.effect.poison` | none | false |
| `arrow 1 43` | `minecraft:arrow` | `tipped_arrow.effect.moveSlowdown` | none | false |
| `splash_potion 1 21` | `minecraft:splash_potion` | `%potion.heal.splash.name` | effect `minecraft:healing`, delivery `ThrownSplash` | false |
| `potion 1 25` | `minecraft:potion` | `%potion.poison.name` | effect `minecraft:poison`, delivery `Consume` | false |
| `fire_charge 1` | `minecraft:fire_charge` | `item.fireball.name` | none | false |
| `arrow 1 35` | `minecraft:arrow` | `tipped_arrow.effect.weakness` | none | false |
| `arrow 1 36` | `minecraft:arrow` | `tipped_arrow.effect.weakness` | none | false |
| `arrow 1 37` | `minecraft:arrow` | `tipped_arrow.effect.wither` | none | false |
| `arrow 1 19` | `minecraft:arrow` | `tipped_arrow.effect.moveSlowdown` | none | false |
| `arrow 1 22` | `minecraft:arrow` | `tipped_arrow.effect.heal` | none | false |
| `arrow 1 24` | `minecraft:arrow` | `tipped_arrow.effect.harm` | none | false |
| `splash_potion 1 17` | `minecraft:splash_potion` | `%potion.moveSlowdown.splash.name` | `minecraft:slowness`, `ThrownSplash` | false |
| `splash_potion 1 18` | `minecraft:splash_potion` | `%potion.moveSlowdown.splash.name` | `minecraft:long_slowness`, `ThrownSplash` | false |
| `splash_potion 1 42` | `minecraft:splash_potion` | `%potion.moveSlowdown.splash.name` | `minecraft:strong_slowness`, `ThrownSplash` | false |
| `splash_potion 1 34` | `minecraft:splash_potion` | `%potion.weakness.splash.name` | `minecraft:weakness`, `ThrownSplash` | false |
| `splash_potion 1 36` | `minecraft:splash_potion` | `%potion.wither.splash.name` | `minecraft:wither`, `ThrownSplash` | false |
| `lingering_potion 1 34` | `minecraft:lingering_potion` | `%potion.weakness.linger.name` | `minecraft:weakness`, `ThrownLingering` | false |
| `snowball 3` | `minecraft:snowball` | `item.snowball.name` | none | false |

(The second block of rows is a second run, made when the pack needed the
keys for the tints it fires.)

Every stack reported `getComponents()` empty; the arrows carried the one tag
`minecraft:arrow`, nothing else did.

`Potions.getAllDeliveryTypes()`: `Consume`, `ThrownSplash`, `ThrownLingering`.

`Potions.getAllEffectTypes()`, in registry order (index in brackets):
`water` [0], `mundane`, `long_mundane`, `thick`, `awkward`, `nightvision` [5],
`long_nightvision`, `invisibility`, `long_invisibility`, `leaping`,
`long_leaping`, `strong_leaping`, `fire_resistance`, `long_fire_resistance`,
`swiftness`, `long_swiftness`, `strong_swiftness`, `slowness` [17],
`long_slowness` [18], `water_breathing`, `long_water_breathing`, `healing`
[21], `strong_healing`, `harming`, `strong_harming`, `poison` [25],
`long_poison`, `strong_poison`, `regeneration` [28], `long_regeneration`,
`strong_regeneration`, `strength`, `long_strength`, `strong_strength`,
`weakness` [34], `long_weakness`, `wither` [36], `turtle_master`,
`long_turtle_master`, `strong_turtle_master`, `slow_falling`,
`long_slow_falling`, `strong_slowness` [42], `wind_charged`, `weaving`,
`oozing`, `infested` [46]. All prefixed `minecraft:`.

**What it means.**

- **A tipped arrow is a `minecraft:arrow` with no potion component.** Its
  type id, tags and component list are identical to a plain arrow's. The one
  stable field that names the tint is `localizationKey`, which reads
  `tipped_arrow.effect.<effect>` against `item.arrow.name` for a plain arrow.
  So a turret *can* tell what it was fed, by that key. The key does not
  distinguish strength or duration: aux 18 (slowness) and aux 43 (strong
  slowness) both read `moveSlowdown`, 35 and 36 both `weakness`. The keys the
  pack matches on are `moveSlowdown`, `weakness` and `wither`; `heal`, `harm`,
  `poison` and `nightVision` are read and refused (`core/ammo.ts`).
- **`isStackableWith` a plain arrow is the cheap tipped-or-not test**: true
  only for the plain one. It says nothing about which tint.
- **An arrow's aux value is its potion's registry index plus one.** 6 →
  `nightvision` [5], 18 → `slowness` [17], 26 → `poison` [25], 43 →
  `strong_slowness` [42]. Vanilla's own shooters agree: the stray's
  `minecraft:shooter` says `aux_val: 19` = `long_slowness` [18] + 1 and the
  bogged's `aux_val: 26` = `poison` [25] + 1. A potion or splash potion's aux
  is the index itself, no offset: `splash_potion 1 21` read `healing` [21],
  `potion 1 25` read `poison` [25], and the witch throws `aux_val` 21, 28, 17,
  25 and 34 for healing, regeneration, slowness, poison and weakness. This is
  the table a Bulwark `minecraft:shooter` group needs for each tip it fires.
- **Script cannot make a tipped arrow.** There is no delivery type for
  arrows in the registry, so `Potions.resolve` cannot produce one; `ItemStack`
  has no aux value; and `new ItemStack("minecraft:arrow")` is the plain one.
  A tipped arrow only ever exists as a stack the world already holds. This
  is the constraint that shapes the ammo design in
  [`design/bulwark-ammo-and-upgrades.md`](design/bulwark-ammo-and-upgrades.md):
  a buffered count of tipped arrows could never be given back as tipped
  arrows on break, so special ammo is not buffered at all.
- **Potions and splash potions are fully readable**: effect id and delivery
  both come off `ItemPotionComponent`. A potion-throwing tier would not need
  the localization trick.
- **Aside.** `Potions.getAllEffectTypes()` works, and `Potions.resolve` is
  measured below (`rig_splash_potion_applies`): it makes a splash potion of a
  chosen effect. The corrections table's row on the Fluidworks bottling line
  predates it.

**Confidence.** One reading per stack. The localization keys are engine
strings with no documentation behind them, so treat the nine key-to-effect
pairs above as measured and any other tip as expected until read. The
plus-one rule is ten readings that agree with three vanilla definitions.

**What it changes.** Nothing shipped. `qolprobe:item-at` stays in the probe
pack for the next tint. The design that follows from this is in
`docs/design/bulwark-ammo-and-upgrades.md`; its "must prototype" list is
measured below.

---

# The must-prototype list, measured

**What was measured.** The `rig_*` tests in
`packages/gametest/scripts/suites/bulwark_ammo.ts`, run one at a time by
`npm run bds:test` on the same server. The shooter is `qol:shooter_rig`, an
entity the GameTest pack ships with one component group per thing under
test, swapped by `triggerEvent`; the target is a husk four blocks in front,
spawned on easy. `qol:bolt` is a custom projectile the pack ships for §8.4.
Each line is the test's own log message.

| § | Test | Reading |
| --- | --- | --- |
| 8.1a | `rig_tint_applies` | slowness group (`aux_val` 18): the husk had **slowness after the first arrow**. With the poison group (`aux_val` 26) first: 400 ticks, no effect, twice |
| 8.1b | `rig_swap_changes_next_shot` | slowness group fired once; `triggerEvent` to the weakness group; **the second shot carried weakness** (effects `[weakness]` after 2 shots) |
| 8.2 | `rig_rate_swap_keeps_firing` | slow group (2 s) fired twice; after `triggerEvent` to the fast group (0.5 s) the **first shot came 16 ticks later** and 4 shots followed in the next 120 ticks |
| 8.3 | `rig_power_scales_damage` | `shooter.power` 1.0: two hits of **1.92**; `power` 3.0: hits of **6.89 and 5.90** (mean 6.40), read off `entityHurt.damage` |
| 8.4 | `rig_custom_bolt_has_owner` | `qol:bolt` fired through `shooter.def`; `Projectile.owner` = the rig **at spawn and a tick later**; the husk died to the third bolt; `entityDie.damagingEntity` = **the bolt's id**, `damagingProjectile` = `qol:bolt` whose owner reads **none at death**; the spawn-time map gave the rig |
| 8.5 | `rig_hopper_decrement_survives_transfer` | 10 arrows in a chest draining into a hopper; 6 shots decremented the hopper's stack from the `entitySpawn` handler while it filled; 0 shots found it empty; **4 left**, exactly 10 − 6 |
| 8.6 | `rig_picks_tint_by_target` | `projectiles[]` entry slowness for `is_family: undead`, fallback weakness: the husk got **`[slowness]` only** |
| — | `rig_snowball_no_damage` | 2 snowball hits: **damage 0, health 20/20**, husk moved 0.85 blocks |
| — | `rig_splash_potion_applies` | `splash_potion` `aux_val` 34 from the shooter: the husk gained **weakness**; `Potions.resolve("minecraft:weakness", "ThrownSplash")` gave **`minecraft:splash_potion` x1, effect `minecraft:weakness`, delivery `ThrownSplash`**; a bare `"weakness"` throws `InvalidPotionEffectTypeError` |

**What it means.**

- **A `shooter` group swap takes effect on the very next shot**, and a
  `ranged_attack` swap keeps the target and fires again inside the new
  interval. Component-group swapping is enough for both ammo kinds and tiers;
  no disarm-arm pair and no respawn.
- **`shooter.power` is a damage knob**: 1.0 → 1.92, 3.0 → about 6.4, close to
  the arrow rule (velocity × 2, less drop). The default (no `power`) was not
  read; the turret fires at whatever `ranged_attack` gives a mob, which the
  vanilla arrow's mob group puts at 1.6.
- **The undead are immune to poison, and a poison tint is invisible on
  them.** 400 ticks of poison arrows at a husk left it with no effect, twice,
  while a slowness arrow landed on the second shot. The same for a poison
  splash potion. The design's §3 tint list stands: slowness, weakness and
  decay work on everyone; poison and harming do not touch the mobs that come
  at night.
- **A custom projectile fired through `shooter.def` has its owner at spawn**
  (the rig's id, at spawn and a tick later), so `attributeShot` works for it
  unchanged. **But the kill's `damagingEntity` is the bolt, not the rig, and
  at death the bolt's owner is unreadable** (five runs: `damagingEntity` was
  the bolt's id every time; `damagingProjectile` was `qol:bolt` with owner
  `none`, the bolt having been removed on hit). The only route that held was
  a map of projectile id → owner filled at spawn. Bulwark's kill counter
  reads `damagingEntity` and would miss every kill by a custom projectile; it
  must keep that map, which `attributeShot` already has the data for. Whether
  a vanilla arrow reports the shooter as `damagingEntity` is not measured
  here — the map covers both.
- **Decrementing a hopper stack from a spawn handler loses nothing** while
  the hopper is moving items, over six shots. Hopper-direct consumption (§5)
  is safe to build.
- **The witch's `projectiles[]` works on a custom entity**: the undead husk
  got the filtered tint and not the fallback.
- **Snowballs do no damage and push**, as the vanilla definition says.
- **`Potions.resolve` makes a splash potion of a chosen effect**, given the
  namespaced id (`minecraft:weakness`; the bare name throws), so splash
  potions are the one special ammo a turret can buffer and give back. The
  corrections table row that says script cannot produce a potion of a chosen
  effect is out of date; row updated.
- **`projectileHitEntity` did not report the arrow that applied slowness**
  (`1 arrows fired, 0 hit the husk, effects [slowness]`), while it reported
  both snowball hits. One reading; do not count arrow hits with that event
  until it has been read again.

---

# Phase 3a in the pack, measured

**What was measured.** Five `turret_*` GameTests on the shipped turret,
each a placed turret with a hopper pointing into it, filled through the
console's `/replaceitem` where a tint is needed, and a husk in front. Every
line is the test's own log message.

| Test | Reading |
| --- | --- |
| `turret_fires_tipped_from_hopper` | 8 arrows of slowness in the hopper: the husk had slowness after **3 shots, hopper holds 5 tipped of 8**, no plain arrow ever appeared in it. One per shot, nothing pulled into the buffer |
| `turret_leaves_healing_tint_alone` | 4 arrows of healing: **0 shots in 120 ticks, hopper holds 4 of 4** |
| `turret_throws_snowballs_from_hopper` | 8 snowballs: **2 thrown, 2 hit, husk health 20/20, hopper holds 6 of 8** |
| `turret_throws_splash_from_hopper` | 4 splash potions of weakness, one per slot: the husk weakened after **2 thrown, hopper holds 2 of 4** |
| `turret_prefers_special_over_buffer` | 8 plain arrows and 4 of slowness in one hopper: the plain ones left for the buffer, the tipped stayed; the first shots were the tint (**husk slowed, 2 shots, hopper tipped 2 of 4**) |

**What it means.**

- Hopper-direct ammo works end to end on the shipped turret: the head's
  shooter group follows the hopper, the shot is charged to the stack, and
  the buffer never sees a tipped arrow.
- **Splash potions do not stack.** `/replaceitem … splash_potion 4 34` left
  one potion in the slot, so a hopper feeds them one slot at a time; five
  slots is five throws.
- **A dynamic property is private to the pack that wrote it.** The
  GameTest pack read `undefined` for the head's `bw:link`, `bw:armed` and
  `bw:kind` and for the world's `bw:turrets`, in the same tick the turret was
  plainly acting on them. So a test cannot read another pack's record or
  flags; it infers them from what the world shows, which is why the kill
  counter has no GameTest (its mechanism is pinned by
  `rig_custom_bolt_has_owner`, and the pack's `bulwark:debug` line is the
  in-game check). Row added to the corrections table.

**Also measured on the way.** At entity format `1.26.40`,
`ranged_attack.attack_interval` as a bare number is rejected
(`attack_interval: expected an object`) and the entity does not load at
all. Vanilla's bogged writes the bare form at an older format version. Row
added to the corrections table.

**Confidence.** One run per reading, each on a single husk; the runner
re-ran the failures alone. Damage numbers are two hits each on easy with
`difficulty_randomization: multiplicative`, so treat them as a ratio, not a
table.
