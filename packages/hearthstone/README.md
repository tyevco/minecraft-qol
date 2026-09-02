# Hearthstone

Regional respawn anchors, plus the markers to find your way back.

Design: [`docs/design/hearthstone.md`](../../docs/design/hearthstone.md), measured
spawn behaviour: [`docs/hearthstone-spawn-results.md`](../../docs/hearthstone-spawn-results.md).
**Read [`docs/README.md`](../../docs/README.md) first.**

## What it does

A placed **Hearthstone** block catches players who die nearby without a spawn
point set, and sends them back to it instead of to world spawn. It never
overrides a player's own bed or respawn anchor: the moment a player sets their
own spawn, Hearthstone stops managing them for good.

The mechanic is inverted on purpose. There is no before-event that can redirect a
respawn, so instead of correcting after death we call `setSpawnPoint` while the
player is still standing near an anchor. Vanilla respawn then does the rest.

## Waypoints

Knowing where you will wake up is only half of "how do I get back". Each player
gets up to three markers on the locator bar, in their current dimension only:

| Marker | Colour, icon | Shown when |
| --- | --- | --- |
| **Bed** | pale blue square | the player set their own spawn (bed or respawn anchor) |
| **Hearth** | ember-orange star | Hearthstone assigned their spawn |
| **Grave** | red circle | they died and have not yet been back within 4 blocks |

Bed and hearth are the same spawn point under two labels, so exactly one of them
shows. The grave clears itself once the player returns to it, and is replaced by
the next death. On respawn the player is told where they died, and in which
dimension if it differs.

A marker in another dimension is withheld rather than shown, because an
Overworld coordinate pointed at from the Nether points the wrong way.

`/scriptevent hs:waypoints` toggles the markers for the player who runs it. The
choice persists in a player dynamic property.

## Diagnostics

```
/scriptevent hs:debug        anchors known, spawn point, ownership decision,
                             grave, and what is on the locator bar
/scriptevent hs:waypoints    toggle this player's markers
```

Both are subscribed at `worldLoad`, so they survive `/reload`.

## Layout

```
scripts/core/      pure, unit-tested: anchor selection, spawn ownership, waypoints
scripts/engine/    registry (anchors in a world dynamic property), waypoint pool
scripts/main.ts    wiring
behavior_pack/     block and recipe
resource_pack/     texture and names
tests/             vitest over core/
```

Anchors live in a world dynamic property rather than block entities because
`minecraft:block_entity` is still experimental in retail; `engine/registry.ts` is
the seam that changes when that lands.

## Not yet verified in game

The waypoints are built on stable API and typecheck, but a few engine behaviours
are inferred from the typings. They are listed, with their fallbacks, under
"Hearthstone" in [`docs/backlog.md`](../../docs/backlog.md).
