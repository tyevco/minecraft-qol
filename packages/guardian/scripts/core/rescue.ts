/**
 * The void catch. Pure - no @minecraft imports.
 *
 * There is no `void` damage cause in @minecraft/server 2.9.0, so a fall out
 * of the world cannot be softened through the hurt event; even if it could,
 * cancelling the damage would leave the player falling forever. The catch is
 * therefore a teleport: notice a protected player below the dimension floor,
 * and put them back on the last ground they stood on.
 */
import { freshGround, type GroundSample, type Vec3 } from "@qol/shared/core/ground";

export interface HeightRange {
  min: number;
  max: number;
}

export interface RescueOptions {
  /**
   * How far below the floor counts as "out of the world". The Overworld and
   * Nether floors are bedrock, so anything below them is already a fall; the
   * End's floor is y = 0 with islands far above it. A small margin keeps a
   * player clipping the bottom of the world from being yanked around.
   */
  margin: number;
  /**
   * How old a ground sample may be and still be where they are put back. The
   * age of the sample IS the length of the fall: falling from the End's
   * islands to the floor takes a few seconds, from the build height a little
   * longer. Twenty seconds covers any fall in the game with room to spare.
   */
  maxAgeTicks: number;
}

export const DEFAULT_RESCUE: RescueOptions = { margin: 2, maxAgeTicks: 400 };

export function belowWorld(y: number, range: HeightRange, opts: RescueOptions = DEFAULT_RESCUE): boolean {
  return y < range.min - opts.margin;
}

export interface Rescue {
  pos: Vec3;
  /** Which fallback produced the position, for the message and the log. */
  source: "ground" | "spawn";
}

/**
 * Where to put a player who is below the world.
 *
 * 1. Where they last stood, if that was recently and inside the world. This
 *    is the ledge they fell from, which is where they wanted to be.
 * 2. Their spawn point, if it is in this dimension - the case for a /reload
 *    mid-fall, when the tracker has no sample yet.
 * 3. Nothing. The caller leaves vanilla to it; Graves is downstream.
 *
 * `spawn` is already filtered to this dimension by the engine, so this stays
 * ignorant of dimensions altogether.
 */
export function chooseRescue(
  range: HeightRange,
  nowTick: number,
  lastGround: GroundSample | undefined,
  spawn: Vec3 | undefined,
  opts: RescueOptions = DEFAULT_RESCUE,
): Rescue | undefined {
  const ground = freshGround(lastGround, nowTick, opts.maxAgeTicks);
  if (ground && inside(ground.pos.y, range)) return { pos: ground.pos, source: "ground" };
  if (spawn && inside(spawn.y, range)) return { pos: spawn, source: "spawn" };
  return undefined;
}

function inside(y: number, range: HeightRange): boolean {
  return y >= range.min && y < range.max;
}
