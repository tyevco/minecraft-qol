/**
 * Where a gravestone stands. Pure - no @minecraft imports.
 *
 * The death location is usually right, but not always: a player who fell into
 * the void died below the world, and one shot out of the air died in mid-air.
 * The shared ground tracker remembers where each player last stood on solid
 * ground; this decides when to prefer that.
 */
import { freshGround, type GroundSample, type Vec3 } from "@qol/shared/core/ground";

export type { GroundSample, Vec3 } from "@qol/shared/core/ground";

export interface HeightRange {
  min: number;
  max: number;
}

export interface PlacementOptions {
  /** How old a ground sample may be and still be trusted, in ticks. */
  maxAgeTicks: number;
}

export const DEFAULT_PLACEMENT: PlacementOptions = { maxAgeTicks: 200 };

/** Centre of the block containing `p`, so the stone stands squarely. */
export function snapToBlock(p: Vec3): Vec3 {
  return {
    x: Math.floor(p.x) + 0.5,
    y: Math.floor(p.y),
    z: Math.floor(p.z) + 0.5,
  };
}

export function insideRange(y: number, range: HeightRange): boolean {
  return y >= range.min && y < range.max;
}

/**
 * Choose the gravestone position.
 *
 * 1. Died standing inside the world: the death spot.
 * 2. Otherwise, if we recently saw them on the ground, there - it is where a
 *    player will look for their things after a fall or a void death.
 * 3. Otherwise clamp the death spot into the world so the stone at least
 *    exists and `/graves:list` can point at it.
 */
export function gravePosition(
  death: Vec3,
  onGround: boolean,
  range: HeightRange,
  nowTick: number,
  lastGround: GroundSample | undefined,
  opts: PlacementOptions = DEFAULT_PLACEMENT,
): Vec3 {
  if (onGround && insideRange(death.y, range)) return snapToBlock(death);

  const ground = freshGround(lastGround, nowTick, opts.maxAgeTicks);
  if (ground && insideRange(ground.pos.y, range)) return snapToBlock(ground.pos);

  const y = Math.min(Math.max(death.y, range.min + 1), range.max - 2);
  return snapToBlock({ x: death.x, y, z: death.z });
}
