# Waypoints — Proposal

**Locator-bar markers for the places a player is trying to get back to**

Target: `@minecraft/server` 2.9.0 · no experiments · Proposal v0.1

---

## 1. The pitch

“I don't know how to get back” is the sentence behind Hearthstone and Graves.
Both fix the consequence — respawn near home, keep the items — but neither
answers it directly. The locator bar can.

`LocationWaypoint` and `Player.locatorBar` are stable in 2.9.0 (the roadmap
verified them alongside the `playerWaypoints` game rule). A waypoint is a
`DimensionLocation`, an icon selector and a colour, added per player. So:

| Marker | For | Removed when |
| --- | --- | --- |
| **Your bed** | anyone with a spawn point set | the spawn point changes or clears |
| **Your gravestone** | Graves, `grave` mode | the stone is emptied |
| **Nearest Hearthstone** | anyone Hearthstone is managing | they leave its radius or sleep in a bed |
| **Your waystones** | Waystones, if built | the stone is broken |

This is not a new pack. It is a shared module used by Graves and Hearthstone
(and Waystones), plus one small pack-independent marker — the bed — that
lives wherever is convenient, probably Hearthstone.

### Design stance

Markers are for **places you own or have earned**, not a map. Nothing is
revealed that the player did not already know the location of; the marker
just makes it findable.

---

## 2. The mechanic

A shared `waypoints.ts` in `packages/shared/engine/`:

```
ensure(player, key, dimensionLocation, icon, colour)   add if missing / move if changed
clear(player, key)                                     remove if present
```

Keyed by a string so each pack owns its own keys (`gv:grave:<id>`,
`hs:anchor`, `bed`). Each pack calls `ensure`/`clear` from events it already
handles: Graves on `placeGrave` and `retrieve`, Hearthstone on `evaluate`.
The bed marker is a `getSpawnPoint()` read on the sweep Hearthstone already
runs.

Waypoints are per player and, if the typings are right, not persisted — the
`LocatorBar` is rebuilt from packs on `playerSpawn`. Each pack re-`ensure`s
its markers there.

---

## 3. The panel

Each pack adds a toggle to its own panel:

| Pack | Setting | Default |
| --- | --- | --- |
| Hearthstone | Show your bed on the locator bar | on |
| Hearthstone | Show the Hearthstone you will respawn at | on |
| Graves | Show your gravestone on the locator bar | on |
| Waystones | Show visited waystones | on |

---

## 4. Risks and open questions

**Must prototype:**

1. What `WaypointTextureSelector` accepts — a vanilla icon set, or a texture
   from our resource pack? Decides whether a gravestone gets its own glyph.
2. `LocatorBar.maxCount`: how many markers a player may hold. Waypoints
   already compete with other players' markers on the same bar.
3. Whether a marker in another dimension shows at all, or only when the
   player is in that dimension. Affects the Nether gravestone case.
4. That the `playerWaypoints` game rule off hides ours too, so a server that
   turned the bar off is respected.

**Design questions:**

- Should the gravestone marker be visible to *other* players (a parent finding
  a kid's stone)? Per-player bars make it opt-in per viewer; a Graves toggle
  “operators see everyone's gravestones” would do it.

---

## 5. Phasing

**Phase 1 —** shared module plus the gravestone and Hearthstone markers, since
both packs already know the moments to add and remove them.

**Phase 2 —** the bed marker, and Waystones when it exists.
