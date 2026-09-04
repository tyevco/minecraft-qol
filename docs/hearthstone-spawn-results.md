# Hearthstone — measured spawn-point behaviour

Measured in game on Bedrock 1.26.45, `@minecraft/server` 2.9.0, no experiments,
via `/scriptevent qolprobe:spawn` / `:setspawn` / `:clearspawn`.

## Confirmed

**`getSpawnPoint()` returns `undefined` for a player who has never set one.**

```
getSpawnPoint()=UNDEFINED (never set) | worldDefaultSpawn=0,32767=auto,0
```

This is the load-bearing fact for the whole design. Eligibility is exactly
`getSpawnPoint() === undefined`, so if it had returned world spawn instead the
test would never fire and the approach would need rethinking. It does not.

Note `worldDefaultSpawn` reports **y = 32767**, the documented "height not fixed,
determined by surrounding blocks" sentinel. Any code reading the world default
must special-case it rather than treating it as a real altitude.

**Setting and reading back works in the Overworld.**

```
setSpawnPoint(-90,-60,109 in minecraft:overworld) did not throw
getSpawnPoint()=-90,-60,109 in minecraft:overworld
```

Confirmed at y = −60, well below sea level, so low altitudes are fine.

**`setSpawnPoint` throws `LocationOutOfWorldBoundariesError` outside the
dimension's height range.** Implementations must guard or catch — an anchor
placed near the world floor or ceiling can produce a respawn offset that is
itself out of bounds.

## Non-Overworld: the API accepts it

At a legal Nether altitude it works:

```
setSpawnPoint(-12,53,13 in minecraft:nether) did not throw
getSpawnPoint()=-12,53,13 in minecraft:nether
```

So `setSpawnPoint` is **not** dimension-restricted, and the earlier roof failures
were purely about altitude.

**And a player really does respawn there — verified by dying in the Nether.**

This was the part that mattered: setting and reading back is not the same as
surviving a death, and beds do not set spawn in the Nether while respawn anchors
are the vanilla mechanic there, so the engine could plausibly have accepted the
value and then ignored it. It does not.

So Hearthstone works in all three dimensions, and "allow anchors in Nether / End"
is a real setting worth building rather than a limitation to document. The only
altitude constraint is the dimension's own `heightRange`.

## Superseded: why the first Nether reading looked like a failure

**Inconclusive, and the first reading looked more damning than it was.** Three
Nether attempts all threw:

```
setSpawnPoint THREW: LocationOutOfWorldBoundariesError:
  Trying to access location (-16.0, 128.0, 8.0) which is outside of the world boundaries.
```

Every one was at **y = 128** — the Nether roof. The Nether's build range is
0–127, so y = 128 is genuinely out of bounds *regardless of dimension*. The error
is about the altitude, not about the Nether.

So this says nothing yet about whether Nether spawn points work. It needs a
retest **inside** the Nether at a legal altitude (roughly y 30–100), not standing
on the roof.

The probe now reports `Dimension.heightRange` and whether the player's current y
is inside it, and `setspawn` **refuses** with an explanation rather than throwing
when out of bounds — so this specific confusion cannot recur.

If the retest shows Nether spawn points do not survive a respawn, Hearthstone is
scoped to the Overworld and the "allow anchors in Nether / End" pack setting is
simply not built.

## Not yet tested

Whether breaking a bed clears the spawn point back to `undefined`. If it does,
the system re-adopts those players automatically — a nice emergent behaviour that
needs no code, since `decide()` already returns `assign` for an unset spawn.
On the in-game list as #36.
