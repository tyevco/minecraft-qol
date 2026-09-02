import type { BlockPermutation, Dimension } from "@minecraft/server";

/** Custom states are not in the vanilla superset the API is typed against. */
type StateName = Parameters<BlockPermutation["withState"]>[0];
import { safeGetBlock } from "@qol/shared/engine/safeBlock";
import { FACING_VECTOR, FACINGS, add, type Vec3 } from "../core/facing";
import {
  CONNECTABLE,
  PIPE,
  connections,
  stateFor,
  type Neighbours,
} from "../core/pipes";

/** Set one pipe's arm states from its neighbours. No-op for a non-pipe. */
export function refreshPipe(dim: Dimension, pos: Vec3): void {
  const block = safeGetBlock(dim, pos);
  if (!block || !block.isValid) return;
  try {
    if (block.typeId !== PIPE) return;
    const neighbours: Partial<
      Record<(typeof FACINGS)[number], string | undefined>
    > = {};
    for (const f of FACINGS)
      neighbours[f] = safeGetBlock(dim, add(pos, FACING_VECTOR[f]))?.typeId;
    const wanted = connections(neighbours as Neighbours);

    let perm = block.permutation;
    let changed = false;
    for (const f of FACINGS) {
      const name = stateFor(f) as StateName;
      if (perm.getState(name) === wanted[f]) continue;
      perm = perm.withState(name, wanted[f]);
      changed = true;
    }
    if (changed) block.setPermutation(perm);
  } catch {
    /* chunk went away mid-refresh; the next placement nearby redoes it */
  }
}

/** A connectable block changed at `pos`: refresh it and every neighbour. */
export function refreshAround(dim: Dimension, pos: Vec3): void {
  refreshPipe(dim, pos);
  for (const f of FACINGS) refreshPipe(dim, add(pos, FACING_VECTOR[f]));
}

export function isConnectable(typeId: string): boolean {
  return CONNECTABLE.has(typeId);
}
