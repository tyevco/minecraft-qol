/**
 * The `facing_direction` block state, decoded. Pure - no @minecraft imports.
 *
 * Shared by dispensers, hoppers, droppers and observers. The mapping was
 * measured, not assumed: the QOL Times probe logs the raw state next to the
 * vector it inferred from geometry, and every sample agreed
 * (docs/phase0-results.md). Hoppers use the same encoding, minus 1 - a hopper
 * cannot point up.
 */

export interface Offset {
  x: number;
  y: number;
  z: number;
}

/** facing_direction -> unit vector the block points along. */
export const FACING: readonly Offset[] = [
  { x: 0, y: -1, z: 0 }, // 0 down
  { x: 0, y: 1, z: 0 }, // 1 up
  { x: 0, y: 0, z: -1 }, // 2 north
  { x: 0, y: 0, z: 1 }, // 3 south
  { x: -1, y: 0, z: 0 }, // 4 west
  { x: 1, y: 0, z: 0 }, // 5 east
];

/** The six face-adjacent offsets, in facing_direction order. */
export const NEIGHBOURS: readonly Offset[] = FACING;

/**
 * Decode a raw state value. Block states come back typed as
 * `boolean | number | string | undefined`, so this accepts unknown and answers
 * undefined for anything that is not a valid facing.
 */
export function facingVector(state: unknown): Offset | undefined {
  if (typeof state !== "number" || !Number.isInteger(state)) return undefined;
  return FACING[state];
}

export function sameOffset(a: Offset, b: Offset): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function negate(o: Offset): Offset {
  return { x: -o.x, y: -o.y, z: -o.z };
}
