# Bulwark — the turret (Phase 2: core)

Automated base defense: a placeable turret that acquires and shoots hostile
mobs using the engine's own AI, fed arrows by an adjacent hopper or by hand.
Stable APIs only, no experiments.

Design: [`docs/design/bulwark-turret.md`](../../docs/design/bulwark-turret.md).
**Read [`docs/README.md`](../../docs/README.md) first** — several of that
document's assumptions do not hold, and the corrections shaped this build.

The design pairs the turret with a spawn-proofing lens. The lens **already
shipped separately** as `packages/lens`, so Bulwark is the turret alone.

## Status

**Built, not yet measured in game.** Everything below compiles, bundles, and
the pure layer passes 40 unit tests — but this repo's rule is that a design
assumption is not trusted until it has been observed, and the block-to-entity
pairing is the riskiest assumption on the whole roadmap. The probe protocol in
[`docs/bulwark-turret-probe.md`](../../docs/bulwark-turret-probe.md) is the
next step: run it, write the results doc, then fix whatever it finds.

What Phase 2 covers, per the design's phasing: block, paired entity,
reconciliation, vanilla ranged AI, ammo via adjacent hopper, one tier. No
upgrades, no config form, no ownership. Player targeting is not possible at all
yet — the acquisition filter is `is_family: monster`, nothing else.

## How it works

```
bulwark:turret_base      the block: anchor, persistence, ammo buffer, ticking
bulwark:turret           the entity head: targeting, aiming, shooting
world property bw:t|…    one record per turret: [schema, entityId, ammo, kills]
entity property bw:link  the head's pointer back to its block
```

**The block is the source of truth.** It carries `minecraft:tick` (1–2 s) and
the custom component `bulwark:turret`, so every turret in a ticking chunk runs
its own bookkeeping from an engine-scheduled callback: pull arrows from feeding
hoppers, then make sure exactly one head stands on top of it, then arm or
disarm that head to match the ammo count. There is no world scan and no
per-tick script, and an unloaded turret costs nothing.

**The head is disposable.** It is `minecraft:persistent`, immune to damage,
weightless, unpushable, and disarmed when it spawns. If it goes missing the
block spawns another; if it drifts the block reseats it; if the block goes
missing the head removes itself (`entityLoad`, `entitySpawn`, and a 10-second
sweep over loaded heads all run the same check). An unlinked head — `/summon`,
or a probe — is inert and never touched.

**Two heads on one block is the one impossible outcome.** The block only ever
keeps the head its record names, adopts a claimant when the record has lost
it, and removes any other claimant; the head side removes itself when the
record names someone else. And after a chunk load the block waits two ticks
for the head it remembers before spawning a replacement, so a slow-loading
entity does not produce a pop-and-cull on every load. The decisions are pure
functions in `scripts/core/reconcile.ts`, tested exhaustively.

**Ammo gates the AI.** `ranged_attack` fires whenever it has a target and
knows nothing about ammo. So the entity has two component groups —
`bulwark:armed` holds the targeting, aiming and shooting behaviours,
`bulwark:disarmed` holds a random look-around — and script swaps them with
`triggerEvent` when the buffer crosses zero. Each arrow the world spawns is
attributed through its projectile owner; a turret's arrow costs one from the
buffer. Buffer cap is 64; a hopper and a chest keep it full forever.

**Kills are counted by script.** The `on_kill` fix the design counts on covers
melee goals only; `entityDie` with `damagingEntity === the head` is the hook.

## Behaviours worth knowing

- **Feeding a hopper must point into the turret.** A hopper touching its side
  but facing down feeds the block below, exactly as it would a chest.
- **Right-click with arrows loads them**; with anything else reports status:
  ammo, kills, and whether the head is armed, idle, or missing.
- **Breaking the block returns its arrows** as items and removes the head.
- **Range is 16 blocks, line of sight required**, 1.5 s between shots.
- The head is disarmed on spawn, so a summoned or probe head does nothing.

## Testing in game

Deploy needs both packs: the behavior pack and the resource pack. As with
Hearthstone, the BP does **not** declare a dependency on the RP — a BP that
depends on an RP which is not present can refuse to load. Enable both on the
world.

| Changed | Do |
| --- | --- |
| script | `/reload` — and then run `/scriptevent bulwark:reconcile`; the block component registration is logged at startup, and `bulwark:debug` says whether it took |
| block, entity or recipe JSON | exit to the main menu and re-enter |
| resource pack | exit and re-enter; **restart** for the RP manifest or a new RP folder |

Diagnostics, all `/scriptevent`:

| Command | What |
| --- | --- |
| `bulwark:debug` | counters, loaded heads per dimension, and the nearest record with both halves of its pairing |
| `bulwark:reconcile` | tick every recorded turret in a loaded chunk now |
| `bulwark:probe-*` | the probe protocol — see `docs/bulwark-turret-probe.md` |

## Layout

```
behavior_pack/blocks/turret_base.json   the block, with minecraft:tick + bulwark:turret
behavior_pack/entities/turret.json      the head, format 1.26.40 (strict validation)
resource_pack/                          model, look-at animation, generated textures
scripts/core/                           pure: record codec, ammo, hopper rule, reconcile
scripts/engine/storage.ts               the storage seam (world properties by position)
scripts/engine/head.ts                  entity link helpers
scripts/engine/turret.ts                the block component: tick, feed, retire
scripts/engine/hooks.ts                 shots, kills, orphans, sweep
scripts/engine/probes.ts                the probe commands
```

## What the design doc gets wrong

| Doc says | Reality |
| --- | --- |
| `on_kill` now fires correctly — "exactly what you want for kill counts" | Melee goals only. `ranged_attack` gets no `on_kill`; kills come from `entityDie` in script. |
| `minecraft:block_entity` for tier/ammo/ownership state | **Still experimental.** Records are world properties keyed by position; `engine/storage.ts` is the seam. |
| `CustomForm.image` grid for upgrade slots | server-ui **2.2.0**, no stable release. Phase 3 problem. |
| Store the owner's `persistentId` | **Beta-only.** Phase 4 problem. |
| `ranged_attack.attack_interval` replaces min/max at 1.26.40 | Both forms load; the reference shows `attack_interval` as a number or `{min,max}`. What is new and matters more: `in_range_movement_mode: hold_position`, and the default 30° head-rotation caps, which a turret must raise. |

Confirmed and used: entity validation is strict at `format_version` 1.26.40
(a bad definition fails to load — check the content log); `minecraft:tick` +
`onTick` is stable; Custom Components V2 attach inline in `components`;
`look_at_target` exists and drives the client-side `query.target_x_rotation`.
