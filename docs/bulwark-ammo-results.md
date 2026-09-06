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
  slowness) both read `moveSlowdown`.
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
- **Aside.** `Potions.getAllEffectTypes()` works and `Potions.resolve` is in
  the 2.9.0 typings. The corrections table's row on the Fluidworks bottling
  line says script cannot produce a potion of a chosen effect; that row
  predates `Potions.resolve`, which this run did not call. Worth one probe
  before anyone builds on either statement.

**Confidence.** One reading per stack. The localization keys are engine
strings with no documentation behind them, so treat the four key-to-effect
pairs above as measured and any other tip as expected until read. The
plus-one rule is four readings that agree with three vanilla definitions.

**What it changes.** Nothing shipped. `qolprobe:item-at` stays in the probe
pack for the next tint. The design that follows from this is in
`docs/design/bulwark-ammo-and-upgrades.md`, and its "must prototype" list is
what the next Bulwark change should pin with GameTests before building.
