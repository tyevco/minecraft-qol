/**
 * Where a player last stood on solid ground. Pure - no @minecraft imports.
 *
 * Two packs want this for the same reason: a player's position at the moment
 * something goes wrong is often not where they, or anyone, would want to be.
 * Graves places a gravestone where a void-faller last stood rather than under
 * the world; Guardian puts the faller back there. The engine samples, this
 * decides how old a sample may be before it stops being trusted.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GroundSample {
  pos: Vec3;
  tick: number;
}

/** The sample, if it is recent enough to still describe where they were. */
export function freshGround(
  sample: GroundSample | undefined,
  nowTick: number,
  maxAgeTicks: number,
): GroundSample | undefined {
  if (!sample) return undefined;
  return nowTick - sample.tick <= maxAgeTicks ? sample : undefined;
}
