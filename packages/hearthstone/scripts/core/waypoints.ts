/**
 * Which locator-bar markers a player should see. Pure - no @minecraft imports.
 *
 * Hearthstone exists to answer "how do I get back", and a spawn point you cannot
 * find is only half an answer. So the player gets up to three markers:
 *
 *   bed     the spawn point they set themselves (a bed, or a respawn anchor)
 *   hearth  the spawn point Hearthstone assigned them
 *   grave   where they last died, until they get back to it
 *
 * "bed" and "hearth" are mutually exclusive by construction: they are the same
 * spawn point, labelled by who owns it - which is exactly the `decide()` verdict
 * ownership.ts already computes.
 */
import { decide, type SpawnRef } from "./ownership";
import { distanceSq, type Point } from "./anchors";

export type WaypointKind = "bed" | "hearth" | "grave";

export interface WaypointSpec {
  kind: WaypointKind;
  dimId: string;
  x: number;
  y: number;
  z: number;
}

export interface WaypointInputs {
  /** Where the player is standing now. */
  at: Point;
  /** What the game says their spawn point is. */
  spawn: SpawnRef | undefined;
  /** The spawn point we last recorded assigning them. */
  owned: SpawnRef | undefined;
  /** Where they last died, if they have not been back since. */
  grave: SpawnRef | undefined;
  /** The per-player toggle. */
  enabled: boolean;
}

/**
 * How close counts as "back at your grave". Generous enough that picking up the
 * drops clears the marker without having to stand on the exact block; tight
 * enough that walking past a cave entrance above it does not.
 */
export const GRAVE_REACHED_RADIUS = 4;

export function reachedGrave(at: Point, grave: SpawnRef | undefined): boolean {
  if (!grave || grave.dimId !== at.dimId) return false;
  return distanceSq(at, grave) <= GRAVE_REACHED_RADIUS * GRAVE_REACHED_RADIUS;
}

/**
 * The markers a player should have on their bar right now.
 *
 * Only markers in the player's current dimension are returned. A bar pointing
 * at Overworld coordinates while the player is in the Nether would point the
 * wrong way (the eight-to-one scale) and read as a bug, so a marker in another
 * dimension is simply withheld until the player is back in it.
 */
export function wantedWaypoints(inputs: WaypointInputs): WaypointSpec[] {
  if (!inputs.enabled) return [];

  const out: WaypointSpec[] = [];
  const { at, spawn, owned, grave } = inputs;

  if (grave && !reachedGrave(at, grave)) {
    out.push({ kind: "grave", ...grave });
  }

  if (spawn) {
    const verdict = decide(spawn, owned);
    if (verdict === "managed") out.push({ kind: "hearth", ...spawn });
    else if (verdict === "foreign") out.push({ kind: "bed", ...spawn });
  }

  return out.filter((w) => w.dimId === at.dimId);
}

export function sameSpec(a: WaypointSpec | undefined, b: WaypointSpec | undefined): boolean {
  if (!a || !b) return false;
  return a.kind === b.kind && a.dimId === b.dimId && a.x === b.x && a.y === b.y && a.z === b.z;
}

/** "minecraft:the_end" -> "the End", for messages. */
export function describeDimension(dimId: string): string {
  switch (dimId) {
    case "minecraft:overworld":
      return "the Overworld";
    case "minecraft:nether":
      return "the Nether";
    case "minecraft:the_end":
      return "the End";
    default:
      return dimId.replace(/^minecraft:/, "").replace(/_/g, " ");
  }
}
