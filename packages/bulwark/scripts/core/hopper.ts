/**
 * Which adjacent hoppers feed a turret. Pure - no @minecraft imports.
 *
 * Vanilla-shaped: a hopper pushes into the block it points at, so a hopper at
 * `offset` from the turret feeds it only when its facing vector is the exact
 * negation of that offset. A hopper merely touching the turret's side but
 * pointing down feeds the block below it, not the turret - the same rule a
 * chest follows.
 */
import { facingVector, negate, sameOffset, type Offset } from "@qol/shared/core/facing";

export function hopperFeeds(offset: Offset, facingState: unknown): boolean {
  const facing = facingVector(facingState);
  if (!facing) return false;
  return sameOffset(facing, negate(offset));
}
