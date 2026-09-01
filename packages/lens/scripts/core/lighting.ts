import { cellCount, fromIndex, inBounds, toIndex, type Grid } from "./grid";

/**
 * Light propagation. Pure.
 *
 * Measured model: block light is a 6-connected flood fill losing exactly 1 per
 * step through passable cells - not a Euclidean radius. A torch emits 14, so it
 * still gives light 1 at flood distance 13, and spawning needs block light
 * exactly 0. Hence a torch spawn-proofs everything within 13 steps.
 */

/** Torch emission. Light at flood distance d is EMISSION - d. */
export const TORCH_EMISSION = 14;

/** Greatest flood distance at which a torch still leaves light >= 1. */
export const TORCH_REACH = TORCH_EMISSION - 1;

/**
 * Reusable breadth-first flood fill over a grid.
 *
 * Owns its buffers so a solver can run dozens of fills without allocating, which
 * matters: allocation churn means GC pauses, and this runs inside a tick budget.
 */
export class Flooder {
  private readonly dist: Int16Array;
  private readonly queue: Int32Array;

  constructor(private readonly grid: Grid) {
    const n = cellCount(grid);
    this.dist = new Int16Array(n);
    this.queue = new Int32Array(n);
  }

  /**
   * Flood outward from `source`, at most `maxDepth` steps.
   *
   * Returns the internal distance array: -1 where unreached, otherwise the step
   * count. The array is reused between calls, so read it before flooding again.
   */
  run(source: number, maxDepth: number): Int16Array {
    const { grid, dist, queue } = this;
    dist.fill(-1);

    if (source < 0 || source >= dist.length) return dist;
    // A blocked source cannot emit; a torch occupies an air cell.
    if (!grid.passable[source]) return dist;

    dist[source] = 0;
    queue[0] = source;
    let head = 0;
    let tail = 1;

    while (head < tail) {
      const current = queue[head++]!;
      const d = dist[current]!;
      if (d >= maxDepth) continue;

      // Bounds must be checked in coordinates: adding a flat stride would wrap
      // around an edge and leak light through the far side of the volume.
      const { x, y, z } = fromIndex(grid, current);
      for (let axis = 0; axis < 6; axis++) {
        const nx = x + (axis === 0 ? 1 : axis === 1 ? -1 : 0);
        const ny = y + (axis === 2 ? 1 : axis === 3 ? -1 : 0);
        const nz = z + (axis === 4 ? 1 : axis === 5 ? -1 : 0);
        if (!inBounds(grid, nx, ny, nz)) continue;

        const next = toIndex(grid, nx, ny, nz);
        if (dist[next] !== -1) continue;
        if (!grid.passable[next]) continue;

        dist[next] = d + 1;
        queue[tail++] = next;
      }
    }

    return dist;
  }
}

/** Bitset helpers over a Uint32Array. */
export function bitsetWords(bitCount: number): number {
  return (bitCount + 31) >>> 5;
}

export function setBit(bits: Uint32Array, i: number): void {
  bits[i >>> 5]! |= 1 << (i & 31);
}

export function clearBits(target: Uint32Array, remove: Uint32Array): void {
  for (let w = 0; w < target.length; w++) target[w]! &= ~remove[w]!;
}

export function popcountAnd(a: Uint32Array, b: Uint32Array): number {
  let total = 0;
  for (let w = 0; w < a.length; w++) {
    let v = a[w]! & b[w]!;
    // Standard SWAR popcount.
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    total += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  return total;
}

export function anyBitSet(bits: Uint32Array): boolean {
  for (let w = 0; w < bits.length; w++) if (bits[w] !== 0) return true;
  return false;
}
