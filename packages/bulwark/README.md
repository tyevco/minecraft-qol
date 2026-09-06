# Bulwark — the turret (Phase 2: core; Phase 3: ammo kinds, upgrades, the panel, targeting)

Automated base defense: a placeable turret that acquires and shoots hostile
mobs using the engine's own AI, fed arrows by an adjacent hopper or by hand,
and tipped arrows, snowballs or splash potions by hopper. Stable APIs only,
no experiments.

Design: [`docs/design/bulwark-turret.md`](../../docs/design/bulwark-turret.md).
**Read [`docs/README.md`](../../docs/README.md) first** — several of that
document's assumptions do not hold, and the corrections shaped this build.

The design pairs the turret with a spawn-proofing lens. The lens **already
shipped separately** as `packages/lens`, so Bulwark is the turret alone.

## Status

**Built; pairing, feeding and firing measured headlessly.** The five
`turret_*` GameTests pass on a dedicated server: a placed block grows one
head, a removed head is replaced, a hopper feeds it, breaking it returns the
arrows, and an armed head shoots a husk with the arrow leaving at the barrel
([`docs/bulwark-turret-results.md`](../../docs/bulwark-turret-results.md)).
What no simulated player can measure — persistence across unload and restart,
head rotation as a player sees it, mob caps — is still the probe protocol in
[`docs/bulwark-turret-probe.md`](../../docs/bulwark-turret-probe.md) (#39).

What Phase 2 covers, per the design's phasing: block, paired entity,
reconciliation, vanilla ranged AI, ammo via adjacent hopper, one tier. No
upgrades, no config form, no ownership.

**Phase 3a, ammo kinds, is built** on the research in
[`docs/design/bulwark-ammo-and-upgrades.md`](../../docs/design/bulwark-ammo-and-upgrades.md)
and the measurements in [`docs/bulwark-ammo-results.md`](../../docs/bulwark-ammo-results.md):
a hopper of arrows of slowness, weakness or decay, of snowballs, or of splash
potions of those three effects makes the turret fire those, straight from the
hopper. **Phase 3b, the four upgrade axes, is built too**: damage, fire rate,
range and ammo, three tiers each, raised one tier at a time by feeding the
turret one item. Nine `turret_*` GameTests pin the two phases. **Phase 3c,
the settings panel**, is a format-3 manifest with three Realm-wide switches
(a range cap, special ammo on or off, upgrades on or off) and a
`bulwark:debug` line per turret. **Targeting priority** (#91) is built: sneak
and right-click a turret with an empty hand for its form, and choose nearest,
weakest first or strongest first. Player targeting is not possible at all
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

**Two kinds of supply.** Plain arrows are pulled into the record's buffer
(64, sixteen per block tick) and returned when the block breaks. Everything
special — a tipped arrow, a snowball, a splash potion — is never taken out of
its hopper: the block's tick looks at what the feeding hoppers hold, the
head's shooter group follows the first special stack it finds, and each shot
decrements that stack where it lies. Script cannot construct a tipped arrow
(no aux value, no arrow delivery in the `Potions` registry), so a buffered
count of them could never be given back; leaving them in the hopper is what
keeps rule 4. A tipped arrow is told from a plain one by `localizationKey`
(`tipped_arrow.effect.moveSlowdown` and so on), the only field that names the
tint; an arrow whose key cannot be read is never treated as plain. Poison,
harming and healing tints are read and refused: poison and harming do nothing
to (or heal) the undead, and healing heals everything else. Special ammo
takes priority over the buffer, because a tipped arrow in the hopper is a
deliberate choice.

**Four upgrade axes, one item per tier.** Every axis starts at tier I and
is raised to II and then III by one item, by right-click or from a feeding
hopper (a hopper takes one material per block tick, and only the next step
on its axis, so a chest of diamonds is never eaten):

| Axis | Tier II | Tier III | What it does |
| --- | --- | --- | --- |
| damage | diamond | netherite ingot | the hit is scaled 1.5× then 2× in script (`entityHurt`), whatever the ammo; the head's texture follows |
| fire rate | redstone block | quartz | 1–2 s between shots, then 0.6–1.2 s, then 0.3–0.6 s |
| range | eye of ender | ender chest | 16 blocks, then 24, then 32: acquisition, aim and follow range together |
| ammo | fire charge | dragon's breath | which kinds a hopper may feed: plain arrows only, then tipped arrows, then snowballs and splash potions |

Rate and range share one engine component, so the head carries nine aim
groups (`bulwark:aim_r<rate>_g<range>`) and wears exactly one when armed;
damage is script, so it costs no groups; the ammo gate is a rule in
`core/tiers.ts`. Tiers live in the record (schema 2; an old row reads as
tier I everywhere) and every material fed comes back when the block breaks.
The third material is refused before the second, with the reason.

**The settings panel is the only configuration** (CLAUDE.md rule 3),
read through `packages/shared/engine/packSettings.ts` every five seconds:

| Setting | Default | Effect |
| --- | --- | --- |
| Furthest any turret may reach | 32 | a range tier above the cap aims at the cap's tier; the tier itself is kept, and its material still comes back on break |
| Hoppers may feed tipped arrows, snowballs and splash potions | on | off: every turret fires plain arrows from its buffer, whatever its hoppers hold |
| Turrets accept upgrade materials | on | off: materials are left in the hand and the hopper, with a message |

Everything is on by default so a fresh world plays the whole feature; the
switches are for a crowded Realm. The status line says when a setting is
holding a turret back.

**Targeting priority is script ranking over engine selecting.** Measured
(`rig_target_*`): the order of a selector's `entity_types` entries is not a
priority, an `actor_health` filter on an entry does hold, and a second
group's selector replaces the first's. So the head carries nine target
groups, `bulwark:target_<any|wounded|healthy>_g<range>`, and a turret set to
"weakest first" counts the monsters in range each block tick and wears the
wounded-only selector (three hearts or under) while any are there, the plain
one otherwise; "strongest first" the same at seven and a half hearts or
over. Nearest is the plain selector always. The choice lives in the record
(schema 3; older rows read as nearest) and is made on the turret's form,
which is the one per-turret setting: the panel is per world.

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

**The collision box is what aims the barrel.** `ranged_attack` releases the
arrow from the entity's eye, and the eye is 0.85 × `collision_box.height`
(measured; there is no eye-height component in the stable API). The barrel
is drawn 5.5/16 above the origin, so the box is 0.47 tall: 0.85 × 0.47 =
0.40 puts the eye on the barrel axis and the arrow, which spawns a hair below
the eye and about a block forward along the aim, leaves at the muzzle. At the
original 0.9 the shot left six pixels above the barrel. Change the barrel's
height in `tools/models/generate.ts` and this number moves with it;
`turret_shot_origin` fails with the measured offset if they part.

## Behaviours worth knowing

- **A feeding hopper must point into the turret.** A hopper touching its side
  but facing down feeds the block below, exactly as it would a chest.
- **Right-click with arrows loads them**; with anything else reports status:
  ammo, kills, whether the head is armed, idle, or missing, and what it is
  firing from a hopper. Right-click with a tipped arrow, snowball or splash
  potion is refused with the reason: those are fed by hopper only.
- **A hopper of special ammo is fired as it is.** Arrows of slowness,
  weakness and decay; snowballs; splash potions of slowness, weakness and
  decay (their long and strong forms too). The first special stack in the
  first feeding hopper wins; plain arrows in the same hopper still fill the
  buffer, and the turret falls back to the buffer when the special runs out.
- **Kills by any projectile are counted.** Every shot the turret fires is
  remembered by id, because a kill by a custom projectile names the
  projectile, not the shooter (measured).
- **Sneak and right-click with an empty hand opens the turret's form**: the
  targeting dropdown and a read-out of ammo, kills and tiers. Nothing else
  is on it yet.
- **Right-click with an upgrade material spends it**, or says why not
  (already that tier; needs the previous material first). A material in the
  feeding hopper does the same, one per block tick. The status line lists
  the tiers, and says when a hopper offers ammo the turret's ammo tier does
  not yet allow, and what to feed it.
- **Breaking the block returns its arrows** as items and removes the head.
- **Range is 16 blocks, line of sight required**, 1.5 s between shots. Line
  of sight is judged from the eye, which sits at barrel height.
- The head is disarmed on spawn, so a summoned or probe head does nothing.

## To confirm in game

What the headless suite cannot see, in the order of
`docs/bulwark-turret-probe.md`: P1 (entity persistence), the rest of P2
(`Projectile.owner` is set on its arrows, so ammo goes down; range and a
target straight below), P3 (the head turns, and the barrel visibly points
where the arrow goes), P4 (mob caps), P5 under a real player. P0 and the
first half of P2 are measured: a placed block grows a head, and a stationary
`ranged_attack` fires. Each row there carries the one-line fix for its
failure.

| Changed | Do |
| --- | --- |
| script | `/reload`, then `/scriptevent bulwark:reconcile`; the content log says whether the block component registration took |
| block, entity or recipe JSON | exit to the main menu and re-enter |
| resource pack | exit and re-enter; **restart** for the RP manifest |

#91 adds one: **the form and the two priorities.** A simulated player
cannot open a form, and a GameTest cannot set a turret's priority any other
way, so the selector swap is pinned on the rig (`rig_target_filter_on_top`)
and the choice in script is unit-tested, but the turret end to end is not.
Sneak, right-click a turret with an empty hand, pick "Weakest first"; stand
a wounded zombie behind a healthy one and expect the wounded one shot first.
If the form does not open, the server-ui module is not loading and the
content log names it; if the nearest is shot, `bulwark:debug`'s per-turret
line shows whether the head is wearing `target_wounded`.

Phase 3c adds one: **the panel itself.** `world.getPackSettings()` has no
setter, so no test can flip a switch; the defaults are what the suite runs
under. Change each setting in the pack's settings screen, wait five
seconds, and `/scriptevent bulwark:debug` should show the new policy on its
first line; a turret at range tier III should then fire at 24 or 16 blocks
under the cap, refuse a hopper's tipped arrows with special ammo off, and
refuse a diamond with upgrades off.

Phase 3b adds two. **Range tiers beyond 16 blocks**: the arena is eight
blocks, so a test cannot stand a mob 24 blocks away. Feed a turret an eye of
ender, then an ender chest, and check that a monster at 20 and then 30
blocks with line of sight is shot; if not, `follow_range` inside a component
group is not being applied and belongs in the base components with the
largest value. **Hand feeding of materials**: a simulated player's
right-click never reaches the pack, so only the hopper path is measured;
right-click a turret with a diamond and expect "damage raised to tier II".

Phase 3a adds one row a simulated player cannot check, because a pack's
dynamic properties are invisible to the test pack: **the kill counter
through the projectile map.** Let a turret kill something, then
`/scriptevent bulwark:debug` — `kills` should have gone up, and `by
projectile` says whether the map or the damaging entity attributed it. If
`kills` stays at zero for a vanilla arrow, `damagingEntity` is not the
shooter for mob arrows either and the map is the only route, which is
already the code's fallback; if it stays at zero for everything, the map is
not being filled and `shots` in the same line says whether attribution ran.

| Command | What |
| --- | --- |
| `/scriptevent bulwark:debug` | counters, loaded heads per dimension, and the nearest record with both halves of its pairing |
| `/scriptevent bulwark:reconcile` | tick every recorded turret in a loaded chunk now — the escape hatch after `/reload` or `/fill` |
| `/scriptevent qolprobe:turret-*` | the probe pack's turret probes; see the protocol doc |

## Layout

```
behavior_pack/blocks/turret.json          the block: generated model + minecraft:tick + bulwark:turret
behavior_pack/entities/turret_head.json   the head, format 1.26.40: armed/disarmed groups, one ammo group per kind
behavior_pack/recipes/turret.json         iron, dispenser, stone, redstone
resource_pack/                            generated by tools/ - never hand-edited
scripts/core/                             pure: record codec, ammo kinds and rules, upgrade tiers, panel policy, targeting, hopper rule, reconcile
scripts/engine/form.ts                    the per-turret form (server-ui)
scripts/engine/settings.ts                the panel poller
scripts/engine/storage.ts                 the storage seam over the shared position index
scripts/engine/head.ts                    entity link helpers
scripts/engine/turret.ts                  the block component: tick, feed, retire
scripts/engine/hooks.ts                   shots, kills, orphans, sweep
scripts/engine/debug.ts                   bulwark:debug and bulwark:reconcile
```

## What the design doc gets wrong

| Doc says | Reality |
| --- | --- |
| `on_kill` was misrouted to `on_attack` and now fires correctly — "exactly what you want for kill counts" | The fix covers **melee goals only**. `ranged_attack` is **not** in the fixed list, so a ranged turret gets no `on_kill`. Kill tracking needs a script-side hook. |
| `minecraft:block_entity` for tier/ammo/ownership state | **Still experimental.** Use world dynamic properties keyed by position — see `packages/hearthstone/scripts/engine/registry.ts`. |
| `CustomForm.image` grid for upgrade slots | server-ui **2.2.0**, no stable release. `CustomForm` itself is stable in 2.1.0; use `ActionFormData` button icons or glyphs. |
| Store the owner's `persistentId` | **Beta-only.** Mint an id into a player dynamic property on `initialSpawn`. |

Confirmed correct in the doc, and worth keeping: entity JSON validation went
strict at `format_version` 1.26.40 (invalid data now **fails to load** rather than
being ignored); `ranged_attack.attack_interval` is now a float range replacing
the old min/max pair; `float_wander.float_duration` must be a min/max object; and
`minecraft:variant` + component groups + `Entity.triggerEvent` is the sanctioned
way to swap tiers in place. Note `EntityVariantComponent.value` is **read-only**,
so tier changes must go through an entity event — or consider **entity properties**
(`description.properties` + `setProperty`), which are directly writable and avoid
the component-group churn.

## What is built: the visuals

`behavior_pack/blocks/turret.json` (the base block) and
`behavior_pack/entities/turret_head.json` (the head) plus the resource pack are
**visual definitions only**. The entity has physics, health and a damage sensor
that refuses everything, and nothing else — no targeting, no shooting. Its
`bulwark:tier` entity property (1–3, `client_sync`) selects the iron, diamond or
netherite texture through the render controller, and the three `bulwark:tier_N`
events set it, so the tier-swap path is already the entity-property route
suggested below rather than component-group churn. The head bone is named `head`
and animated by the vanilla `animation.common.look_at_target`, so once the entity
has a target it should track it with no further client work.

Spawn the head one block above the base's origin (`y + 14/16`) so it sits in the
socket. The head's idle animation vents a puff of steam from the `vents`
locator every three seconds (`bulwark:vent`); a `muzzle` locator is already in
the geometry for the attack flash when shooting is built. Generated by `npm run assets`; see the root README.

## Must prototype before committing to the architecture

The doc is right that the block↔entity pairing is the load-bearing assumption.
Test reconciliation across chunk unload/reload, world reload, `/reload`, dimension
travel and restart before building on it. Use the probe pack — it already has the
build-a-rig-and-restore-it pattern.

Also unresolved and worth an early answer: **do custom entities with no
`spawn_rules` file count toward mob caps?** The docs do not say, and a hundred
turrets is exactly the scale where it would matter — a perimeter that silently
suppresses legitimate spawns would be a confusing bug to chase later.

## Social design worth not deferring

Player targeting **off by default**, behind a clearly labelled setting. Friendly
fire exclusions (owner, tamed mobs, villagers, iron golems, named mobs) via
`type_family` filters so they stay in engine. A density cap on placement, because
turrets are an obvious lag vector and it is cheaper to prevent than to diagnose.
