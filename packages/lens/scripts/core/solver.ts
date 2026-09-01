import { fromIndex, l1, type Grid } from "./grid";
import {
  Flooder,
  TORCH_REACH,
  anyBitSet,
  bitsetWords,
  clearBits,
  popcountAnd,
  setBit,
} from "./lighting";

/**
 * Where to put torches. Pure - no @minecraft imports, so it unit-tests in Node.
 *
 * This is minimum set cover: choose the fewest light positions covering every
 * spawnable position. It is cleanly set cover because block light combines by
 * `max`, not sum - two torches never add up to rescue a position neither covers
 * alone, so coverage sets are fixed and independent.
 *
 * Set cover is NP-hard and greedy is provably near-optimal (Feige;
 * Dinur-Steurer show nothing polynomial beats ln n), so greedy is the algorithm.
 * The problem is cost: a flood fill per candidate is far too slow.
 *
 * The trick is that taxicab distance is always <= true flood distance, so L1
 * coverage is a superset of real coverage and the L1 gain is a valid UPPER
 * BOUND on the true gain. That is exactly the precondition for lazy greedy: we
 * only pay for a real flood fill when a candidate's optimistic bound says it
 * might be the best, and we never select one without having run it.
 *
 * Result: identical picks to exact greedy, at a fraction of the cost - and
 * every emitted suggestion has been validated against real occlusion, so it can
 * never suggest a torch whose light a wall blocks.
 */

export interface SolveOptions {
  /** Flood distance a light source still helps at. Torch = 13. */
  reach?: number;
  /** Stop after this many suggestions. */
  maxPicks?: number;
  /** Yield to the host roughly every N flood fills. */
  yieldEveryFloods?: number;
}

export interface Pick {
  /** Cell index to place a light at. */
  candidate: number;
  /** Target cell indices this pick newly covers. */
  covered: number[];
}

export interface SolveResult {
  picks: Pick[];
  /** Targets no legal candidate can reach. Reported, never silently dropped. */
  uncovered: number[];
}

interface Entry {
  candidate: number;
  /** Upper bound while !hasCoverage; exact gain once hasCoverage && fresh. */
  gain: number;
  coverage?: Uint32Array;
  hasCoverage: boolean;
  /** Whether `gain` was computed against the current uncovered set. */
  fresh: boolean;
}

/**
 * Runs as a generator so a large solve spreads across ticks rather than
 * blocking. Tests drive it to completion with a plain loop.
 */
export function* solve(
  grid: Grid,
  targets: readonly number[],
  candidates: readonly number[],
  options: SolveOptions = {},
): Generator<void, SolveResult, void> {
  const reach = options.reach ?? TORCH_REACH;
  const maxPicks = options.maxPicks ?? 8;
  const yieldEvery = options.yieldEveryFloods ?? 1;

  if (targets.length === 0 || candidates.length === 0) {
    return { picks: [], uncovered: [...targets] };
  }

  const words = bitsetWords(targets.length);
  const uncovered = new Uint32Array(words);
  for (let t = 0; t < targets.length; t++) setBit(uncovered, t);

  const targetCoords = targets.map((i) => fromIndex(grid, i));

  // Optimistic pass: L1 gains. Cheap, and an admissible upper bound.
  const entries: Entry[] = candidates.map((candidate) => {
    const c = fromIndex(grid, candidate);
    let gain = 0;
    for (const t of targetCoords) if (l1(c, t) <= reach) gain++;
    return { candidate, gain, hasCoverage: false, fresh: false };
  });

  const flooder = new Flooder(grid);
  const picks: Pick[] = [];
  let floods = 0;

  while (picks.length < maxPicks && anyBitSet(uncovered)) {
    let selected: Entry | undefined;

    // Inner loop: refine the current best until it is exact and fresh.
    for (;;) {
      let best: Entry | undefined;
      for (const e of entries) {
        if (e.gain <= 0) continue;
        if (!best || e.gain > best.gain) best = e;
      }
      // Nothing left that could help - remaining targets are unreachable.
      if (!best) break;

      if (!best.hasCoverage) {
        const dist = flooder.run(best.candidate, reach);
        const coverage = new Uint32Array(words);
        for (let t = 0; t < targets.length; t++) {
          const d = dist[targets[t]!]!;
          if (d >= 0 && d <= reach) setBit(coverage, t);
        }
        best.coverage = coverage;
        best.hasCoverage = true;
        best.gain = popcountAnd(coverage, uncovered);
        best.fresh = true;

        if (++floods % yieldEvery === 0) yield;
        continue;
      }

      if (!best.fresh) {
        best.gain = popcountAnd(best.coverage!, uncovered);
        best.fresh = true;
        continue;
      }

      selected = best;
      break;
    }

    if (!selected) break;

    // Record which targets this pick newly covers, then remove them.
    const coverage = selected.coverage!;
    const covered: number[] = [];
    for (let t = 0; t < targets.length; t++) {
      const bit = 1 << (t & 31);
      if ((coverage[t >>> 5]! & bit) !== 0 && (uncovered[t >>> 5]! & bit) !== 0) {
        covered.push(targets[t]!);
      }
    }
    clearBits(uncovered, coverage);
    picks.push({ candidate: selected.candidate, covered });

    // This candidate is spent, and every cached gain is now stale-high.
    selected.gain = 0;
    for (const e of entries) {
      if (e !== selected && e.hasCoverage) e.fresh = false;
    }
    yield;
  }

  const remaining: number[] = [];
  for (let t = 0; t < targets.length; t++) {
    if ((uncovered[t >>> 5]! & (1 << (t & 31))) !== 0) remaining.push(targets[t]!);
  }

  return { picks, uncovered: remaining };
}

/** Drive the generator to completion. For tests and small synchronous uses. */
export function solveSync(
  grid: Grid,
  targets: readonly number[],
  candidates: readonly number[],
  options: SolveOptions = {},
): SolveResult {
  const it = solve(grid, targets, candidates, options);
  let step = it.next();
  while (!step.done) step = it.next();
  return step.value;
}
