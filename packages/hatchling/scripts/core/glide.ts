/**
 * Hatchling - the glide, as a pure decision.
 *
 * A hatchling has wings, so a ledge should be a thrill and not a funeral. Two
 * things make that true, and they are deliberately independent:
 *
 *   the entity   `minecraft:damage_sensor` refuses `fall` and `fly_into_wall`
 *                outright, so a hatchling cannot die of a drop even with
 *                script off, /reload mid-fall, or the panel switched off;
 *   this file    while it is falling it spreads its wings and drifts down at
 *                a walking pace instead of plummeting, which is what makes it
 *                LOOK like a dragon rather than a dropped stone.
 *
 * The decision is here so it can be tested without a game: given how fast the
 * hatchling is moving down and whether it is standing on something, say
 * whether it is gliding (an entity property the client animates) and how hard
 * to push back up (an impulse the engine applies).
 *
 * Units are blocks per tick, the units `Entity.getVelocity()` reports. Free
 * fall accelerates to about -3.9; `GLIDE_SPEED` is a slow, safe drift.
 */

/** How fast a gliding hatchling is allowed to descend, in blocks per tick. */
export const GLIDE_SPEED = 0.35;

/**
 * The most the glide will push back in one step. Falls are caught over a few
 * ticks rather than in one, so a long drop reads as a swoop rather than a mob
 * that stopped in mid-air, and a bad impulse scale can never fling the
 * hatchling upwards.
 */
export const MAX_ASSIST = 0.8;

/**
 * Below this downward speed nothing is happening worth animating: stepping
 * off a block, walking down a slope, the top of a jump.
 */
export const FALLING_SPEED = 0.12;

export interface Glide {
  /** Wings out: drives `hatchling:gliding`, which the animation reads. */
  gliding: boolean;
  /** Upward impulse to apply this step, in blocks per tick. 0 means leave it alone. */
  impulseY: number;
}

const STILL: Glide = { gliding: false, impulseY: 0 };

/**
 * What to do about one hatchling this step.
 *
 * `velocityY` is its current vertical speed (negative is down), `onGround`
 * whether the engine says it is standing on something, `enabled` the panel's
 * glide switch. A hatchling on the ground, rising, or barely drifting is left
 * alone - notably, the glide never fights a jump, because it only ever pushes
 * up and only ever when the hatchling is already falling faster than it wants
 * to.
 */
export function glide(velocityY: number, onGround: boolean, enabled: boolean): Glide {
  if (!enabled || onGround || !Number.isFinite(velocityY)) return STILL;
  if (velocityY > -FALLING_SPEED) return STILL;
  const deficit = -GLIDE_SPEED - velocityY;
  return { gliding: true, impulseY: deficit > 0 ? Math.min(MAX_ASSIST, deficit) : 0 };
}
