import { Player, world } from "@minecraft/server";

/**
 * The players, as a pack may safely use them.
 *
 * On a headless server a `SimulatedPlayer` marshals as `undefined` into any
 * pack that does not itself bind `@minecraft/server-gametest`: every entry
 * of `world.getAllPlayers()` and every after-event's `.player` (measured;
 * docs/README.md corrections). A sweep that dereferenced them threw on every
 * pass and aborted the rest of its work, hundreds of lines a run (issue
 * #31). A real player marshals correctly, so skipping what is not a `Player`
 * changes nothing in play; `isValid` also skips a player mid-transfer.
 */
export const isPlayer = (p: unknown): p is Player => p instanceof Player && p.isValid;

/** Every player that is one. */
export function players(): Player[] {
  return world.getAllPlayers().filter(isPlayer);
}
