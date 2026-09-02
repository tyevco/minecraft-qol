import {
  LocationInUnloadedChunkError,
  LocationOutOfWorldBoundariesError,
  type Block,
  type Dimension,
  type Vector3,
} from "@minecraft/server";

/**
 * Block lookups throw on unloaded chunks and out-of-world coordinates rather
 * than returning undefined, so every lookup goes through here.
 *
 * Anything that is not one of those two expected failures is rethrown - turning
 * every error into undefined would silently swallow real bugs.
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

/**
 * The full three-layer pattern, which is what call sites actually need:
 * fetch safely, check validity, and guard the property access separately -
 * because the chunk can go away between the fetch and the read.
 *
 * Returns undefined if the block is unavailable or `fn` throws on it.
 */
export function withBlock<T>(
  dim: Dimension,
  loc: Vector3,
  fn: (block: Block) => T,
): T | undefined {
  const block = safeGetBlock(dim, loc);
  if (!block || !block.isValid) return undefined;
  try {
    return fn(block);
  } catch {
    return undefined;
  }
}

export function blockKey(
  dimId: string,
  b: { x: number; y: number; z: number },
): string {
  return `${dimId}|${b.x},${b.y},${b.z}`;
}
