/**
 * A flat, engine-free view of a scanned volume. Pure - no @minecraft imports.
 *
 * The whole point is that the world is read exactly once, into typed arrays,
 * and every subsequent computation touches only those arrays. Engine calls cost
 * far more per unit than array arithmetic, and the flood fill does hundreds of
 * thousands of steps.
 */

export interface Grid {
  spanX: number;
  spanY: number;
  spanZ: number;
  /** 1 where light propagates through the cell, 0 where it is blocked. */
  passable: Uint8Array;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function cellCount(grid: Grid): number {
  return grid.spanX * grid.spanY * grid.spanZ;
}

export function strideX(grid: Grid): number {
  return grid.spanY * grid.spanZ;
}

/** Local coordinates (0-based within the volume) to a flat index. */
export function toIndex(grid: Grid, x: number, y: number, z: number): number {
  return (x * grid.spanY + y) * grid.spanZ + z;
}

export function fromIndex(grid: Grid, index: number): Vec3 {
  const z = index % grid.spanZ;
  const rest = (index - z) / grid.spanZ;
  const y = rest % grid.spanY;
  const x = (rest - y) / grid.spanY;
  return { x, y, z };
}

export function inBounds(grid: Grid, x: number, y: number, z: number): boolean {
  return x >= 0 && y >= 0 && z >= 0 && x < grid.spanX && y < grid.spanY && z < grid.spanZ;
}

/**
 * Taxicab distance.
 *
 * Minecraft light decays 1 per taxicab step, so this - never Euclidean - is the
 * right metric. It is also always <= the true flood-fill distance, which is what
 * makes it a valid optimistic bound for the solver.
 */
export function l1(a: Vec3, b: Vec3): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

export function makeGrid(spanX: number, spanY: number, spanZ: number): Grid {
  return { spanX, spanY, spanZ, passable: new Uint8Array(spanX * spanY * spanZ) };
}
