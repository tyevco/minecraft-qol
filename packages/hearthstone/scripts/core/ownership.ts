/**
 * Who owns a player's spawn point. Pure - no @minecraft imports.
 *
 * The design inverts the obvious approach. Intercepting death and correcting the
 * respawn afterwards cannot work: there is no before-event that overrides a
 * respawn destination, so the correction lands after the player has already
 * materialised at world spawn - a visible teleport flicker, which is the exact
 * experience the feature exists to prevent.
 *
 * Instead we assign pre-emptively: while a player is near an anchor and has no
 * spawn point, quietly set one. Vanilla respawn then does all the work, and
 * death handling needs no code at all.
 *
 * That creates the one subtlety this module exists for. Once you set a spawn
 * point the player *has* one, so the naive eligibility test would never fire
 * again. We therefore record what we assigned and compare against it.
 */

export interface SpawnRef {
  dimId: string;
  x: number;
  y: number;
  z: number;
}

export type Decision =
  /** No spawn point at all - ours to assign. */
  | "assign"
  /** The current spawn point is one we assigned; a nearer anchor may take over. */
  | "managed"
  /** The player set their own (a bed, a respawn anchor). Hands off, permanently. */
  | "foreign";

export function sameSpawn(a: SpawnRef | undefined, b: SpawnRef | undefined): boolean {
  if (!a || !b) return false;
  return a.dimId === b.dimId && a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Decide what to do about a player, given where the game says they will respawn
 * and what we last recorded assigning them.
 *
 * The "foreign" branch is what makes a real bed always win, permanently, and is
 * why the system never fights a player's own decision.
 */
export function decide(current: SpawnRef | undefined, owned: SpawnRef | undefined): Decision {
  // Vanilla clears the spawn point when a bed is destroyed, so a player can
  // legitimately return to having none - and we should pick them back up.
  if (!current) return "assign";
  if (sameSpawn(current, owned)) return "managed";
  return "foreign";
}
