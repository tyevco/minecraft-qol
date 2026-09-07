/**
 * Retiring records whose block went away without us hearing (issue #104).
 *
 * `playerBreakBlock` is the only thing that drops a post record today, so a
 * post taken by an explosion, `/fill`, `/setblock`, a piston or a structure
 * load over it leaves its record behind for good. That record is not inert:
 * settlements cluster on x/z, so a stale row joins a live one and drags the
 * settlement's middle to wherever it used to be - which is how two visitor
 * tests failed on a re-used world with the middle sixty blocks under the
 * arena (the log in issue #104). The storehouse, the bounds hull and the
 * escort lookups read records the same way.
 *
 * The post's own tick would notice, but a record with no block never ticks.
 * So the sweep walks the index instead, and CLAUDE.md rule 6 decides each
 * row: evict on a type mismatch, and **skip, never evict, an unloaded
 * chunk** - a post in a chunk nobody has loaded is not gone, it is merely
 * out of sight, and evicting it would retire a whole village the moment
 * everyone walked away.
 *
 * The walk is a cursor and a budget rather than the whole index at once, so
 * a world with hundreds of posts costs the same per sweep as one with ten.
 */
import type { Position } from "./record";

/** What the world holds at a record's position, as far as the sweep can tell. */
export type Presence =
  /** A `villages:post` is there: the record is good. */
  | "post"
  /** Something else is there, air included: the post is gone. */
  | "gone"
  /** The chunk is not loaded, so nothing is known. Never evict on this. */
  | "unloaded";

export interface SweepPlan<T extends Position> {
  /** Rows looked at this sweep, in the order they were looked at. */
  checked: readonly T[];
  /** Rows whose block is gone, to be retired. */
  retire: readonly T[];
  /** Rows skipped because their chunk is not loaded. */
  skipped: readonly T[];
  /** Where the next sweep starts; wraps, and is 0 for an empty index. */
  next: number;
}

/**
 * Plan one sweep: look at up to `budget` rows starting at `cursor`, wrapping
 * once, and sort them by what `look` reports. `look` is the engine's block
 * read; it is the only thing here that touches the world, which is what
 * keeps this file pure.
 *
 * A budget at or below zero looks at nothing and leaves the cursor where it
 * was. A cursor past the end (the index shrank since the last sweep) starts
 * over at zero rather than skipping the rows before it.
 */
export function planSweep<T extends Position>(
  rows: readonly T[],
  cursor: number,
  budget: number,
  look: (row: T) => Presence,
): SweepPlan<T> {
  if (rows.length === 0) return { checked: [], retire: [], skipped: [], next: 0 };
  if (budget <= 0) return { checked: [], retire: [], skipped: [], next: normalise(cursor, rows.length) };

  const start = normalise(cursor, rows.length);
  const take = Math.min(budget, rows.length);
  const checked: T[] = [];
  const retire: T[] = [];
  const skipped: T[] = [];

  for (let n = 0; n < take; n++) {
    const row = rows[(start + n) % rows.length]!;
    checked.push(row);
    const presence = look(row);
    if (presence === "gone") retire.push(row);
    else if (presence === "unloaded") skipped.push(row);
  }

  return { checked, retire, skipped, next: (start + take) % rows.length };
}

/** A cursor into `length` rows: negative, fractional and past-the-end all start over at 0. */
function normalise(cursor: number, length: number): number {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= length) return 0;
  return cursor;
}
