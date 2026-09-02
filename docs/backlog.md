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

## Lens: render the worn Lens

The Spawn Lens item, its resource pack and icon exist. What it still lacks is
an **attachable**: worn on the head it occupies the slot but draws nothing on
the player model. A goggles-style attachable geometry plus
`attachables/spawn_lens.json` in the resource pack would make a Lens-wearer
visible to other players. Purely cosmetic, so it waits.

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

## Shared library: extract the block index

`packages/qol-times/scripts/dispenser/rigRegistry.ts` holds a world-index pattern
all three planned packs need. Roughly 40 of its 193 lines are generic. Extracting
it wants three things it lacks: **chunk keying** (it stores every entry in one
dynamic property, which will hit the per-property cap), a **schema version**, and
a **tick budget** (it polls every tick, unyielded). Do this when the second
consumer appears — Hearthstone — not before.

## GameTest pack

Worth it for world-interaction regression tests ("does the dispenser actually
fill the cauldron"), not for measurements. `@minecraft/server-gametest` has no
stable release, so it needs the Beta APIs experiment in a throwaway world and
must stay out of every shipped `.mcaddon`.
