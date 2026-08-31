import {
  LocationInUnloadedChunkError,
  LocationOutOfWorldBoundariesError,
  type Block,
  type Dimension,
  type Vector3,
} from "@minecraft/server";

/**
 * facing_direction -> unit vector. Verified in-game: the probe reported
 * mappingAgrees=true for every sample, so this table is measured, not assumed.
 */
export const FACING: readonly Vector3[] = [
  { x: 0, y: -1, z: 0 }, // 0 down
  { x: 0, y: 1, z: 0 },  // 1 up
  { x: 0, y: 0, z: -1 }, // 2 north
  { x: 0, y: 0, z: 1 },  // 3 south
  { x: -1, y: 0, z: 0 }, // 4 west
  { x: 1, y: 0, z: 0 },  // 5 east
];

export interface DispenserSource {
  dispenser: Block;
  facing: number;
  /** The block the dispenser faces - where the item appeared. */
  target: Block;
}

/**
 * Block accessors throw on unloaded chunks and out-of-world coordinates rather
 * than returning undefined, so every lookup goes through here.
 */
export function safeGetBlock(dim: Dimension, loc: Vector3): Block | undefined {
  try {
    return dim.getBlock(loc);
  } catch (e) {
    if (e instanceof LocationInUnloadedChunkError) return undefined;
    if (e instanceof LocationOutOfWorldBoundariesError) return undefined;
    throw e;
  }
}

export function blockKey(dimId: string, b: { x: number; y: number; z: number }): string {
  return `${dimId}|${b.x},${b.y},${b.z}`;
}

/**
 * Which dispenser could have ejected an item into this cell?
 *
 * Inverts the geometry rather than scanning a neighbourhood: a dispenser that
 * fired into `cell` must sit one step back along its own facing vector AND be
 * facing this way. That both disambiguates two adjacent dispensers and rejects
 * one that merely happens to be nearby.
 *
 * Returns undefined if nothing matches, or if more than one dispenser could
 * explain the item - ambiguity fails closed rather than guessing.
 */
export function findSourceDispenser(
  dim: Dimension,
  location: Vector3,
): DispenserSource | undefined {
  const cell = {
    x: Math.floor(location.x),
    y: Math.floor(location.y),
    z: Math.floor(location.z),
  };

  let found: DispenserSource | undefined;

  for (let d = 0; d < FACING.length; d++) {
    const v = FACING[d];
    if (!v) continue;

    const candidate = safeGetBlock(dim, {
      x: cell.x - v.x,
      y: cell.y - v.y,
      z: cell.z - v.z,
    });
    if (!candidate || !candidate.isValid) continue;

    try {
      // matches() excludes droppers by construction. Droppers eject everything
      // by design and must never be intercepted.
      if (!candidate.matches("minecraft:dispenser", { facing_direction: d })) continue;
    } catch {
      continue; // chunk went away mid-scan
    }

    if (found) return undefined; // ambiguous
    const target = safeGetBlock(dim, cell);
    if (!target || !target.isValid) return undefined;
    found = { dispenser: candidate, facing: d, target };
  }

  return found;
}
