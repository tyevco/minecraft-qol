/**
 * Which locator-bar markers a player should see. Pure - no @minecraft imports.
 *
 * Hearthstone exists to answer "how do I get back", and a spawn point you cannot
 * find is only half an answer. So the pack marks the player's spawn point on
 * the locator bar, labelled by who owns it:
 *
 *   bed     the spawn point they set themselves (a bed, or a respawn anchor)
 *   hearth  the spawn point Hearthstone assigned them
 *
 * The two are mutually exclusive by construction: they are the same spawn
 * point, and the label is exactly the `decide()` verdict ownership.ts already
 * computes. The gravestone marker lives in Graves, which knows when a stone is
 * placed and emptied.
 */
import { decide, type SpawnRef } from "./ownership";
import type { Point } from "./anchors";

export type WaypointKind = "bed" | "hearth";

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
  /** The settings-panel toggles. */
  showBed: boolean;
  showHearth: boolean;
}

/** Locator-bar keys. Shared-module keys are strings; this pack owns `hs:*`. */
export const WAYPOINT_KEY: Record<WaypointKind, string> = {
  bed: "hs:bed",
  hearth: "hs:hearth",
};

export const isOurKey = (key: string): boolean => key.startsWith("hs:");

/**
 * The marker a player should have on their bar right now, if any.
 *
 * Only a marker in the player's current dimension is returned. A bar pointing
 * at Overworld coordinates while the player is in the Nether would point the
 * wrong way (the eight-to-one scale) and read as a bug, so a marker in another
 * dimension is withheld until the player is back in it.
 */
export function wantedWaypoints(inputs: WaypointInputs): WaypointSpec[] {
  const { at, spawn, owned } = inputs;
  if (!spawn || spawn.dimId !== at.dimId) return [];

  switch (decide(spawn, owned)) {
    case "managed":
      return inputs.showHearth ? [{ kind: "hearth", ...spawn }] : [];
    case "foreign":
      return inputs.showBed ? [{ kind: "bed", ...spawn }] : [];
    default:
      return [];
  }
}
