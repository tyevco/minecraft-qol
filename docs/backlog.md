# Backlog

Deferred work, with enough context to pick it up cold. Ordered roughly by value.

## Lens: compute block light ourselves (BFS)

**Problem.** The engine gives us `total = max(blockLight, effectiveSky)` and
`effectiveSky`, never block light directly. So block light is only recoverable
where sky is 0 (enclosed) or where it exceeds the sky term. Outdoors at midday
sky is 15 — the ceiling any block light could reach — so the reading carries no
information at all, and those positions show as `uncertain`. See
[lens-light-results.md](lens-light-results.md).

**Fix.** Compute block light directly: flood fill outward from light-emitting
blocks, decaying 1 per block, and take the max at each position. Time-independent
and exact everywhere, indoors and out, day or night. It retires the `uncertain`
state entirely.

**Work.**
- A light-emission table for the ~40 vanilla emitters (torch 14, lantern 15,
  glowstone 15, lava 15, sea lantern 15, campfire 15, froglights 15, magma 3,
  brewing stand 1, …). No API exposes a block's emission, so this is hand-built —
  same category of inferred-game-rule data as `surface.ts#DENY`, and it should be
  tested the same way.
- A BFS in a `system.runJob` generator. Sources must be gathered from a volume
  15 blocks larger than the scan box in every direction, since light reaches in
  from outside it.
- Opacity matters: light does not pass through solid blocks, so the fill needs a
  transparency test. `isLiquidBlocking(Water)` is the existing proxy and is
  probably wrong here — glass blocks water but passes light.

**Worth doing when** the Lens is used outdoors in daylight in practice. It
changes nothing indoors, where the current path is already exact.

## Lens: pack settings

Radius, height, mode and marker density are constants in `main.ts`. Pack settings
are stable (`world.getPackSettings()`, four control types) but need manifest
`format_version` 3, which brings SemVer version strings and a required
`metadata.authors`. Deferred so the pack could be confirmed loading first.
`PackSettingChangeAfterEventSignal` is beta-only, so changes need polling.
Graves now does exactly this (`packages/graves/behavior_pack/manifest.json`,
`scripts/engine/settings.ts`); once it is confirmed loading, copy the shape.

## Lens: render the worn Lens

The Spawn Lens item, its resource pack and icon exist. What it still lacks is
an **attachable**: worn on the head it occupies the slot but draws nothing on
the player model. A goggles-style attachable geometry plus
`attachables/spawn_lens.json` in the resource pack would make a Lens-wearer
visible to other players. Purely cosmetic, so it waits.

## Graves: experience

Vanilla drops XP orbs on death whatever the mode. Re-granting `getTotalXp()`
on respawn would duplicate whatever orbs the player then walks over, so it
needs the orbs removed on the death tick — the drop-chasing the design avoided.
Worth it only if XP loss turns out to be what actually frustrates the kids.

## Lens: verify the DENY list

`surface.ts#DENY` lists surfaces mobs will not spawn on despite blocking water
(glass, panes, leaves, ice, barrier, slime, honey). Inferred, not measured. Test:
sealed dark rooms floored with each material, left overnight against a stone
control. Automatable with the same self-building-rig trick as the light matrix.

## QOL Times: unverified features

Bottles, dye and wash are implemented and unit-tested but never exercised in
game. Also the two parity features — dispenser places armour stands
(MCPE-80145), dispenser equips armour onto villagers and wandering traders
(MCPE-41432 / MCPE-76479) — which need the interceptor generalised, since it
currently assumes a cauldron target.

## Shared library: finish the block index

`packages/shared/engine/positionIndex.ts` is the generic position-keyed index,
with a schema version, used by Fluidworks. Hearthstone and Graves still carry
their own copies of the same pattern and should move onto it. Still missing
from the shared one: **chunk keying** (every row in one dynamic property will
hit the per-property cap eventually) and a **tick budget** (Fluidworks yields
every four funnels inside a job, which is a start, not a budget).

## Fluidworks: the rest of the design

Phase 2 is potions (`setPotion` exists, `getPotion` does not - the pack must
shadow which potion is in a tank), Phase 3 is fluid through pipes, the Filter
and Harvester funnels, the Collector and tank labels. The pipe already carries
its connection states; the planner in `core/machine.ts` is where a pipe walk
would plug in.

## GameTest pack

Worth it for world-interaction regression tests ("does the dispenser actually
fill the cauldron"), not for measurements. `@minecraft/server-gametest` has no
stable release, so it needs the Beta APIs experiment in a throwaway world and
must stay out of every shipped `.mcaddon`.
