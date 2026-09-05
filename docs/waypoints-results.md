# Waypoints — measured locator-bar behaviour

What has been seen in game of the shared locator-bar module
(`packages/shared/engine/waypoints.ts`, design in `design/waypoints.md`).
The engine questions in that design's §4 map onto `qolprobe:waypoint` in the
probe pack; issue #37 tracks them and names the fallback each one has.

## Confirmed

**A pack-added `LocationWaypoint` renders on a real player's locator bar.**

Observed 2026-09-04 on a Realm-style world (no experiments, Hearthstone
enabled) by a person at the keyboard, not by a probe log: standing near a
Hearthstone anchor with no spawn point set, the hearth marker appeared on the
locator bar at the anchor, as the Hearthstone README's first confirm item
describes.

That one observation settles several things the module had only inferred from
the typings:

- `new LocationWaypoint(location, selector, colour)` followed by
  `player.locatorBar.addWaypoint(...)` works on stable 2.9.0 with no
  experiment on.
- A `WaypointTextureSelector` built from the vanilla `WaypointTexture` enum
  (`SmallStar` here) is accepted and drawn (design §4 item 1, the vanilla half:
  a texture from our own resource pack is still untried).
- The RGB colour is honoured: the marker read as the ember-orange the pack
  sets, not a default.
- Hearthstone's end-to-end path is live: the sweep runs, `decide()` returned
  `managed`, `wantedWaypoints` produced the hearth spec, and the format-3
  panel's "Show the Hearthstone you will respawn at" toggle defaulted on, since
  the marker showed with nothing changed in the panel.

## Not yet measured

Everything else in issue #37 stands. In the order the probe asks them:

- **W2, `/reload`.** Whether the bar keeps a pack's waypoints across a reload,
  so whether `reset()` has anything to sweep. A duplicate marker after
  `/reload` means the bar kept the old one and `getAllWaypoints()` did not
  return it.
- **W3, cross-dimension.** Both packs withhold a marker in another dimension,
  so the engine's own behaviour is never exercised. Untested.
- **W4, the `playerWaypoints` game rule.** Whether "off" hides pack markers.
- **`LocatorBar.maxCount`.** Not read yet; the probe logs it.
- **The bed marker.** Sleeping in a bed should swap the star for a pale blue
  square by the next sweep. Not yet watched.
- **Toggle off in the panel** clears the marker within five seconds. Not yet
  watched.
- **Graves' gravestone marker** (a red `Circle`). Same module, same
  constructor, so the render result above makes it very likely to work, but
  the Graves-specific sequence (die, circle points at the stone, empty it, circle
  goes; two deaths, two circles) has not been run.
