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

**Built, not yet measured in game.** Everything here compiles, bundles, and the
pure layer is under test — but this repo's rule is that a design assumption is
not trusted until it has been observed, and the block-to-entity pairing is the
riskiest assumption on the roadmap. The probe protocol in
[`docs/bulwark-turret-probe.md`](../../docs/bulwark-turret-probe.md) is the
next step: run it, write the results doc, fix whatever it finds, then run the
GameTest suite (`/gametest runset qol`, the `turret_*` tests).

What Phase 2 covers, per the design's phasing: block, paired entity,
reconciliation, vanilla ranged AI, ammo via adjacent hopper, one tier. No
upgrades, no config form, no ownership. Player targeting is not possible at all
yet — the acquisition filter is `is_family: monster`, nothing else.

## How it works

```
bulwark:turret            the block: anchor, persistence, ammo buffer, ticking
bulwark:turret_head       the entity: targeting, aiming, shooting
world property bw:turrets one row per turret: [dim, x, y, z, entityId, ammo, kills]
entity property bw:link   the head's pointer back to its block
```

**The block is the source of truth.** It carries `minecraft:tick` (1–2 s) and
the custom component `bulwark:turret`, so every turret in a ticking chunk runs
its own bookkeeping from an engine-scheduled callback: pull arrows from feeding
hoppers, then make sure exactly one head stands in its socket, then arm or
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
record names someone else. After a chunk load the block waits two ticks for
the head it remembers before spawning a replacement, so a slow-loading entity
does not produce a pop-and-cull on every load. The decisions are pure
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

**Records live in the shared position index** (`bw:turrets`, schema 1), the
seam that moves to block entities when they reach retail. Registration goes
through the block component's `onPlace`, which unlike `playerPlaceBlock` also
fires for `/setblock`, `/fill` and structures. Removal paths no hook can see
are swept: a row whose block is loaded and not a turret is evicted with its
arrows dropped; an unloaded chunk is skipped.

## The visuals

`blocks/turret.json` (the base) and `entities/turret_head.json` (the head)
plus the resource pack were generated in an earlier pass by `npm run assets`
(`tools/models`, `tools/textures`); do not hand-edit them. The head's
`bulwark:tier` entity property (1–3, `client_sync`) selects the iron, diamond
or netherite texture through the render controller, and the `bulwark:tier_N`
events set it — the Phase 3 tier path is already the entity-property route
rather than component-group churn. The head bone is `head`, animated by the
vanilla `animation.common.look_at_target`; the barrel is on that bone and
points −z, the entity convention. The head spawns at the base's socket,
`y + 14/16`.

## Behaviours worth knowing

- **A feeding hopper must point into the turret.** A hopper touching its side
  but facing down feeds the block below, exactly as it would a chest.
- **Right-click with arrows loads them**; with anything else reports status:
  ammo, kills, and whether the head is armed, idle, or missing.
- **Breaking the block returns its arrows** as items and removes the head.
- **Range is 16 blocks, line of sight required**, 1.5 s between shots.
- The head is disarmed on spawn, so a summoned or probe head does nothing.

## To confirm in game

Everything, in the order of `docs/bulwark-turret-probe.md`: P0 (definitions
load, a placed block grows a head), P1 (entity persistence), P2 (a stationary
`ranged_attack` fires, and `Projectile.owner` is set on its arrows), P3 (the
head turns), P4 (mob caps), P5 (every removal path leaves exactly one head or
none). Each row there carries the one-line fix for its failure.

| Changed | Do |
| --- | --- |
| script | `/reload`, then `/scriptevent bulwark:reconcile`; the content log says whether the block component registration took |
| block, entity or recipe JSON | exit to the main menu and re-enter |
| resource pack | exit and re-enter; **restart** for the RP manifest |

| Command | What |
| --- | --- |
| `/scriptevent bulwark:debug` | counters, loaded heads per dimension, and the nearest record with both halves of its pairing |
| `/scriptevent bulwark:reconcile` | tick every recorded turret in a loaded chunk now — the escape hatch after `/reload` or `/fill` |
| `/scriptevent qolprobe:turret-*` | the probe pack's turret probes; see the protocol doc |

## Layout

```
behavior_pack/blocks/turret.json          the block: generated model + minecraft:tick + bulwark:turret
behavior_pack/entities/turret_head.json   the head, format 1.26.40: armed/disarmed groups
behavior_pack/recipes/turret.json         iron, dispenser, stone, redstone
resource_pack/                            generated by tools/ - never hand-edited
scripts/core/                             pure: record codec, ammo, hopper rule, reconcile
scripts/engine/storage.ts                 the storage seam over the shared position index
scripts/engine/head.ts                    entity link helpers
scripts/engine/turret.ts                  the block component: tick, feed, retire
scripts/engine/hooks.ts                   shots, kills, orphans, sweep
scripts/engine/debug.ts                   bulwark:debug and bulwark:reconcile
```

## What the design doc gets wrong

| Doc says | Reality |
| --- | --- |
| `on_kill` now fires correctly — "exactly what you want for kill counts" | Melee goals only. `ranged_attack` gets no `on_kill`; kills come from `entityDie` in script. |
| `minecraft:block_entity` for tier/ammo/ownership state | **Still experimental.** Records are in the shared position index; `engine/storage.ts` is the seam. |
| `CustomForm.image` grid for upgrade slots | server-ui **2.2.0**, no stable release. Phase 3 problem. |
| Store the owner's `persistentId` | **Beta-only.** Phase 4 problem. |
| `ranged_attack.attack_interval` replaces min/max at 1.26.40 | Both forms load; the reference shows `attack_interval` as a number or `{min,max}`. What is new and matters more: `in_range_movement_mode: hold_position`, and the default 30° head-rotation caps, which a turret must raise. |

Confirmed and used: entity validation is strict at `format_version` 1.26.40
(a bad definition fails to load — check the content log); `minecraft:tick` +
`onTick` is stable; Custom Components V2 attach inline in `components`;
`look_at_target` exists and drives the client-side `query.target_x_rotation`.
