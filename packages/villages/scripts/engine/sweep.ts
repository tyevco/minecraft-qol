/**
 * The sweep that retires post records whose block went away (issue #104).
 *
 * `playerBreakBlock` drops a record when a player mines a post. Nothing else
 * does, and the post's own tick cannot help: a record whose block is gone
 * never ticks again. So an explosion, `/fill`, `/setblock`, a piston or a
 * structure load over a post leaves a row behind that every settlement
 * reading still counts - which is what dragged a settlement's middle sixty
 * blocks below the test arena in issue #104.
 *
 * The decision is `core/sweep.ts`; this file is only the block read and the
 * retirement. Rule 6 of CLAUDE.md is honoured by reading an unavailable
 * block as `unloaded`: a post nobody is standing near is out of sight, not
 * gone, and evicting on that would retire a village the moment its last
 * visitor walked away.
 */
import { world, type Dimension } from "@minecraft/server";
import { safeGetBlock } from "@qol/shared/engine/safeBlock";
import { planSweep, type Presence } from "../core/sweep";
import type { PostRecord } from "../core/record";
import { COMPONENT_ID as POST_BLOCK, retire } from "./post";
import * as storage from "./storage";

const TAG = "[Villages]";

/**
 * Rows looked at per sweep. The sweep runs on main.ts's ten-second interval,
 * so a world with a hundred posts is walked end to end in about a minute -
 * fast enough that a stale row cannot outlive a play session, cheap enough
 * that the walk never shows up in a tick.
 */
export const SWEEP_BUDGET = 16;

let cursor = 0;
/** Records retired since the world loaded, for the debug listing. */
let retired = 0;

export const retiredCount = (): number => retired;

/**
 * What the world holds at a record's position. An unreadable block - an
 * unloaded chunk, or a position outside the world - reads as `unloaded`,
 * because both are cases where the sweep does not know, and rule 6 says
 * never to evict on not knowing.
 */
function presenceAt(record: PostRecord): Presence {
  let dim: Dimension;
  try {
    dim = world.getDimension(record.dimId);
  } catch {
    // A record from a dimension this world does not have: not ours to judge.
    return "unloaded";
  }
  const block = safeGetBlock(dim, record);
  if (!block) return "unloaded";
  try {
    if (!block.isValid) return "unloaded";
    return block.typeId === POST_BLOCK ? "post" : "gone";
  } catch {
    // The chunk went away between the fetch and the read.
    return "unloaded";
  }
}

/**
 * One pass. Returns how many records were retired, so the caller can log a
 * sweep that did something and stay quiet on the many that do not.
 */
export function sweep(): number {
  // `storage.all()` hands back the index's own array and `retire` replaces it,
  // so the plan is made against this snapshot and read from `plan.retire`,
  // never from the index while it is being changed. A cursor left past the
  // end of a now-shorter index simply starts the next sweep over (planSweep).
  const plan = planSweep(storage.all(), cursor, SWEEP_BUDGET, presenceAt);
  cursor = plan.next;

  let done = 0;
  for (const row of plan.retire) {
    try {
      retire(world.getDimension(row.dimId), row);
      done++;
      retired++;
      console.warn(
        `${TAG} retired the record of a post that is no longer there at ${row.x},${row.y},${row.z} ` +
          `(${row.dimId}); ${storage.count()} post(s) left`,
      );
    } catch (e) {
      // The row stays, and the next sweep round will try it again.
      console.warn(`${TAG} could not retire the stale post record at ${row.x},${row.y},${row.z}: ${e}`);
    }
  }
  return done;
}

/** Install nothing of its own: main.ts calls `sweep` on the ten-second interval. */
export function install(log: (...parts: unknown[]) => void): void {
  log(`stale-post sweep armed: ${SWEEP_BUDGET} record(s) per pass`);
}
