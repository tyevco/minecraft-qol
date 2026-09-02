# Hearthstone

Regional respawn anchors, plus locator-bar markers for the way back.

Design: [`docs/design/hearthstone.md`](../../docs/design/hearthstone.md) and
[`docs/design/waypoints.md`](../../docs/design/waypoints.md); measured spawn
behaviour: [`docs/hearthstone-spawn-results.md`](../../docs/hearthstone-spawn-results.md).
**Read [`docs/README.md`](../../docs/README.md) first.**

## What it does

A placed **Hearthstone** block catches players who die nearby without a spawn
point set, and sends them back to it instead of to world spawn. It never
overrides a player's own bed or respawn anchor: the moment a player sets their
own spawn, Hearthstone stops managing them for good.

The mechanic is inverted on purpose. There is no before-event that can redirect a
respawn, so instead of correcting after death we call `setSpawnPoint` while the
player is still standing near an anchor. Vanilla respawn then does the rest.

## The panel

Open it from the world's pack list, or in game from Settings → Behavior Packs
→ Hearthstone → the gear icon.

| Setting | Default | Meaning |
| --- | --- | --- |
| Show your bed (or respawn anchor) | on | a pale blue square on the locator bar at the spawn point the player set themselves |
| Show the Hearthstone you will respawn at | on | an ember-orange star at the spawn point Hearthstone assigned |

Bed and hearth are the same spawn point under two labels, so at most one shows:
the label is the `decide()` verdict in `core/ownership.ts`. A marker is shown
only in the dimension it is in, because an Overworld coordinate pointed at from
the Nether points the wrong way. The gravestone marker belongs to Graves, which
knows when a stone is placed and emptied; both packs draw through
`packages/shared/engine/waypoints.ts`.

No commands. `/scriptevent hs:debug` prints the anchors known, your spawn point
and who owns it, what the panel says, and what is on your bar.

## Layout

```
scripts/core/       pure, unit-tested: anchor selection, spawn ownership,
                    which marker to show, the panel
scripts/engine/     registry (anchors in a world dynamic property)
scripts/main.ts     wiring
behavior_pack/      manifest (format 3, with the settings panel), block, recipe
resource_pack/      model and texture (generated, see root README)
tests/              vitest over core/
```

Anchors live in a world dynamic property rather than block entities because
`minecraft:block_entity` is still experimental in retail; `engine/registry.ts` is
the seam that changes when that lands.

## To confirm in game

The manifest moved to format 3 for the panel, so this needs a full restart, not
a `/reload`, and the panel should list both toggles.

The markers themselves are built on stable API but nothing about the locator
bar has been measured. Run `/scriptevent qolprobe:waypoint` with the probe pack
for the engine questions; for this pack, with the anchor test rig or a real
anchor:

- Stand near an anchor with no spawn point: an orange star appears at the
  anchor within three seconds. `hs:debug` lists `hs:hearth@x,y,z`.
- Sleep in a bed: the star becomes a pale blue square at the bed by the next
  sweep. If both show at once, the ownership verdict is wrong, not the bar.
- `/reload`: the marker should neither vanish for good nor duplicate. A
  duplicate means the bar kept the old one and `reset()` did not find it.
- Enter the Nether: the marker disappears; return and it comes back.
- Turn a toggle off in the panel: the marker clears within five seconds.

The GameTest pack cannot observe these: a pack can only query the waypoints it
added itself.
