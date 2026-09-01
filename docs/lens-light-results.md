# Lens — measured light semantics

Measured in game on Bedrock **1.26.4501.0** (retail 26.45), `@minecraft/server`
2.9.0, no experiments, via `/scriptevent qolprobe:lightmatrix`. The probe builds
its own 5×5×5 rig, sweeps shelter × torch × time, and restores everything.

## Raw results

| Config | total | sky | block light |
| --- | --- | --- | --- |
| open @noon | 12 | 12 | masked |
| open @midnight | 4 | 4 | masked |
| open +torch @noon | 13 | 12 | **13** |
| open +torch @midnight | 13 | 4 | **13** |
| sealed @noon | 0 | 0 | **0** |
| sealed @midnight | 0 | 0 | **0** |
| sealed +torch @noon | 13 | 0 | **13** |
| sealed +torch @midnight | 13 | 0 | **13** |

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
is ≤ 4 at midnight and ≤ 12 at noon. This is a limit of the engine API, not of
our implementation, and no amount of cleverness with these two numbers escapes it.

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

1. **`sky` read 12 at noon, not 15.** The model holds either way and nothing
   depends on the absolute value, but 15 was expected under open sky. Most likely
   weather — worth one re-run after `/weather clear` to confirm it returns 15,
   purely so we understand the number.
2. **The spawn threshold itself.** `HOSTILE_MAX_BLOCK_LIGHT = 0` reflects the
   1.18 spawning rework. It is inferred from game rules, not read from an API, so
   it is a named constant with tests pinned to it — if an in-world observation
   disagrees, that one line changes and the suite re-runs.
3. **Standability.** `Block` exposes `isAir`, `isLiquid` and `isWaterlogged` but
   **no `isSolid`**, so "a mob can stand here" needs an empirical proxy. Pending
   `/scriptevent qolprobe:solid` readings for slab, torch, glass, leaves and
   water. `isLiquidBlocking("Water")` is the current candidate — grass_block
   returns `true` for it.
