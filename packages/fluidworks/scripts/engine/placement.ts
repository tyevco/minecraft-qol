import type {
  Block,
  BlockCustomComponent,
  BlockPermutation,
} from "@minecraft/server";
import { safeGetBlock } from "@qol/shared/engine/safeBlock";
import {
  FACING_VECTOR,
  OPPOSITE,
  add,
  parseDirection,
  parseFacing,
  placementFacing,
} from "../core/facing";
import { PIPE } from "../core/pipes";
import { describeBlock } from "./endpoints";

/** Custom states are not in the vanilla superset the API is typed against. */
type StateName = Parameters<BlockPermutation["withState"]>[0];

export const FUNNEL_COMPONENT = "fluidworks:funnel";
const FACING_STATE = "minecraft:facing_direction" as StateName;

type Log = (...parts: unknown[]) => void;

/** Something a funnel end can point into: the spout's targets, or the mouth's. */
function isPlacementTarget(block: Block | undefined): boolean {
  if (!block || !block.isValid) return false;
  try {
    if (block.typeId === PIPE) return true;
  } catch {
    return false;
  }
  const kind = describeBlock(block).kind;
  return kind === "cauldron" || kind === "container" || kind === "source";
}

/**
 * The funnel's block component: hopper-style placement.
 *
 * `beforeOnPlayerPlace` hands us the permutation the placement trait chose
 * and the face that was clicked, and lets us swap the permutation before the
 * block exists. The clicked block is taken to lie opposite that face from
 * the funnel; if a funnel placed on a cauldron's side ends up pointing away
 * from it, that assumption is the one line to flip (see the README).
 */
export function funnelComponent(log: Log): BlockCustomComponent {
  return {
    beforeOnPlayerPlace(ev) {
      try {
        const fallback = parseFacing(ev.permutationToPlace.getState(FACING_STATE));
        if (!fallback) return;
        const face = parseDirection(ev.face);
        const clicked = face
          ? safeGetBlock(ev.dimension, add(ev.block, FACING_VECTOR[OPPOSITE[face]]))
          : undefined;
        const facing = placementFacing(
          face,
          isPlacementTarget(clicked),
          ev.player?.isSneaking ?? false,
          fallback,
        );
        if (facing !== fallback)
          ev.permutationToPlace = ev.permutationToPlace.withState(
            FACING_STATE,
            facing,
          );
      } catch (e) {
        log(`placement: ${e}`);
      }
    },
  };
}
