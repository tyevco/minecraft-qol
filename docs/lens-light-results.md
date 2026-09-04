# Lens — measured light semantics

Measured in game on Bedrock **1.26.4501.0** (retail 26.45), `@minecraft/server`
2.9.0, no experiments, via `/scriptevent qolprobe:lightmatrix`. The probe builds
its own 5×5×5 rig, sweeps shelter × torch × time, and restores everything.

## Raw results — clear weather

| Config | total | sky | block light |
| --- | --- | --- | --- |
| open @noon | 15 | 15 | masked |
| open @midnight | 4 | 4 | masked |
| open +torch @noon | 15 | 15 | masked — see below |
| open +torch @midnight | 13 | 4 | **13** |
| sealed @noon | 0 | 0 | **0** |
| sealed @midnight | 0 | 0 | **0** |
| sealed +torch @noon | 13 | 0 | **13** |
| sealed +torch @midnight | 13 | 0 | **13** |

## Raw results — during rain

The first run happened in rain, which drops sky light from 15 to **12** (a
3-point reduction; Java's is 5). Kept because it is a second, independent
confirmation of the model at a different sky value:

| Config | total | sky | block light |
| --- | --- | --- | --- |
| open @noon | 12 | 12 | masked |
| open +torch @noon | **13** | 12 | **13** |

That last row is the useful one. At sky 12 a torch at block light 13 **shows
through** (max(13,12) = 13); at sky 15 the identical torch is **completely
masked** (max(13,15) = 15). Same torch, same position, different verdict purely
from the sky term — exactly what the max model predicts.

## The model

```
getLightLevel(pos)    = max(blockLight, effectiveSky)
getSkyLightLevel(pos) = effectiveSky, already darkened by time of day
```

Every row satisfies it: `open+torch@midnight` = max(13, 4) = 13,
`open@noon` = max(0, 12) = 12, `sealed+torch` = max(13, 0) = 13. The torch reads
13 at one block away, consistent with emission 14 minus one per block.

**`total − sky` is not block light.** The first hand-taken sample suggested it
might be, but only because nothing was emitting nearby, so the subtraction
happened to yield 0. On `open+torch@midnight` it would give 9 instead of 13.

## What this means for the Lens

Block light is exactly recoverable in two cases, and only those:

- **`sky === 0`** — fully enclosed. `total` *is* block light.
- **`total > sky`** — block light dominates the max, so it *is* `total`.

When `total === sky > 0`, all we know is `blockLight ≤ sky`. Under open sky that
is ≤ 4 at midnight and ≤ 15 at clear noon — i.e. at midday outdoors the reading
carries **no information at all** about block light, since 15 is the maximum a
block light can be. This is a limit of the engine API, not of our implementation,
and no amount of cleverness with these two numbers escapes it.

Hence the predicate in `packages/lens/scripts/core/spawn.ts` is **three-state** —
`spawnable` / `safe` / `uncertain` — rather than a boolean. `uncertain` is shown
in its own colour and counted as a warning in danger mode. Reporting a guess as a
fact is how a tool like this loses trust.

Practical consequence: the Lens is **exact indoors, in caves, and under any
roof** — which is where spawn-proofing actually happens — and **conservative
under open sky**, where it over-warns rather than under-warns.

The escape hatch, if outdoor precision is ever needed: compute block light
ourselves with a BFS from known light-emitting blocks, which is time-independent
and exact everywhere. That needs a light-emission table for ~40 vanilla blocks
and a `runJob`-chunked flood fill. Deliberately out of scope for v1.

## Open questions

1. ~~`sky` read 12 at noon, not 15.~~ **Resolved:** it was rain. After
   `/weather clear` it reads 15. Rain costs 3 points of sky light on Bedrock.
2. **The spawn threshold itself.** `HOSTILE_MAX_BLOCK_LIGHT = 0` reflects the
   1.18 spawning rework. It is inferred from game rules, not read from an API, so
   it is a named constant with tests pinned to it — if an in-world observation
   disagrees, that one line changes and the suite re-runs.
3. ~~Standability.~~ **Resolved** — see the Standability section below.

---

# Standability — measured

`Block` exposes no `isSolid`, so "could a mob stand here?" needed an empirical
proxy. From `/scriptevent qolprobe:solid` on Bedrock 1.26.45:

| Block | `isLiquidBlocking(Water)` | Valid floor? |
| --- | --- | --- |
| `dirt` | true | yes |
| `grass_block` | true | yes |
| `smooth_stone_slab` (bottom) | true | yes |
| `glass` | true | **no** — see below |
| `torch` | false | no |
| `lever` | false | no |

**`isLiquidBlocking(Water)` cleanly separates real floors from attachments**, and
correctly accepts a bottom slab — the case most likely to have broken it, since
mobs do spawn on bottom slabs. Neither `getTags()` nor block states helped:
glass reported no tags and no states at all.

So it is a good **necessary** condition, and it is what `isStandableFloor` is
built on. It is not quite **sufficient**: vanilla spawning also requires an
opaque surface, and glass is a full water-blocking cube that mobs will not spawn
on. That is handled by an explicit `DENY` list in
`packages/lens/scripts/core/surface.ts` covering glass, stained glass, panes,
leaves, ice variants, barrier, slime and honey.

`DENY` encodes an inferred game rule, so it is a short explicit list rather than
a heuristic. Getting an entry wrong is asymmetric: a block wrongly in `DENY`
produces a **false warning**, one wrongly omitted produces a **missing warning**.
The first is the safer failure, so the list stays conservative and only grows
with in-game confirmation.

## Worth verifying in game

Whether mobs really do not spawn on each `DENY` entry (#42). The clean test: a sealed,
fully dark room, floored with the material in question, left overnight with a
control room of stone beside it. Automatable later with the same
self-building-rig technique as the light matrix.
