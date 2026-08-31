# Phase 0 probe results

Measured in-game on Bedrock **1.26.4501.0** (retail 26.45), stable
`@minecraft/server` 2.9.0, no experiments. These supersede the assumptions in the
plan; the interceptor is built against these, not against the docs.

The engine confirmed our dependency resolution on load:

```
Plugin [QOL Times] - promoted [@minecraft/server] from [2.0.0] to [2.9.0]
```

## Blocking unknowns — all resolved, all favourable

| # | Question | Result |
| --- | --- | --- |
| U1 | Does `entitySpawn` fire for `minecraft:item`? | **Yes.** `cause=Spawned` every time. |
| U2 | Does `entity.remove()` work synchronously in that handler? | **Yes — `SUCCEEDED`, `isValidAfter=false`.** No throw, no silent no-op. |
| U3 | Has the dispenser decremented its slot when the event fires? | **Yes.** `slot0: minecraft:water_bucketx1 -> null` against the previous tick. |

U3 is what makes the anti-mint guard possible: the container diff is causal
evidence that this dispenser really did just lose this item, not circumstantial.

## Premise confirmed

A dispenser facing a cauldron **ejects** its bucket and leaves the cauldron
untouched (`fill_level` stayed `0`). Verified for both water and lava buckets.
Vanilla genuinely does nothing here, so there is no double-apply risk today.

## Signal quality

**`triggered_bit` — strong, use it.** Waveform across one pulse:

```
tick 1971  triggered_bit false -> true
tick 1975  ITEM SPAWN            (4 ticks later)
tick 2001  triggered_bit true -> false
```

It reads `true` at event time in every sample, so it is a cheap corroborator. The
4-tick lead also means a snapshot taken on the rising edge reliably captures the
*pre*-dispense contents.

**Velocity — useless, dropped.** Samples were `0.00,0.00,0.02`, `0.00,0.00,-0.04`,
`0.00,0.00,0.00` from a dispenser facing **west**. Not aligned with facing and
essentially zero, so it cannot corroborate anything.

**`facing_direction` mapping — confirmed.** `mappingAgrees=true` in every sample,
so 0=down, 1=up, 2=north, 3=south, 4=west, 5=east holds. The geometric inversion
(`cell - facingVector == dispenser`) attributed every item correctly.

**`entityItemDrop` — never fired** for dispenser ejections, as predicted (a
dispenser is a block, not an entity). Whether it fires for player tosses is still
untested, so it is not relied upon.

## Snapshot timing — affects the registry design

`vs SAME-TICK: NO CHANGE` alongside `vs PREV-TICK: <item> -> null` means the
per-tick `runInterval` had **already run before** `entitySpawn` within the same
tick, so the "current" snapshot is post-decrement and useless as evidence.

Consequence: the registry keeps a **two-deep history** and proves the dispense by
comparing against the *previous* tick, never the current one.

## Cauldron representation

```
states={"fill_level":0,"cauldron_liquid":"water"}
fluid_container=PRESENT fillLevel=0 fluidType=Water color={alpha:0,red:0,green:0,blue:0}
```

- `minecraft:fluid_container` **is present** on a vanilla cauldron. Confirmed.
- An **empty** cauldron still reports `cauldron_liquid: "water"` and
  `fluidType: Water`. Fluid type is meaningless at level 0, so level is the only
  trustworthy emptiness test. `core/cauldron.ts#normalise` already collapses
  level 0 to `"empty"`, which is exactly right.
- `fillLevel` agreed with `fill_level` at 0, but **the scale is still unverified
  for a non-empty cauldron** (0–6 vs normalised 0–1). Both readings were 0, which
  is consistent with either.

**Design response:** read and write levels through the raw block states
(`fill_level`, `cauldron_liquid`), which are unambiguously 0–6 and directly
observed. Use `fluid_container` only for what states cannot express — `addDye()`
colour mixing and potion contents. That sidesteps the scale question entirely
rather than betting on it.

Still worth measuring when convenient: fill a cauldron to a few levels by hand and
run `/scriptevent qolprobe:scan` to read `fillLevel` against `fill_level`. It would
let us use the component for everything, but nothing is blocked on it.

## Still open

- `fillLevel` scale on a non-empty cauldron (above).
- The `cauldron_liquid` value for powder snow. `applyCauldron` therefore attempts
  the state write and falls back to `fluid_container.setFluidType` if the engine
  rejects it.
- Whether `entityItemDrop` fires for player tosses (would be a free negative
  filter, not required).
