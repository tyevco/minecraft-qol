/**
 * The decision a job post makes on each tick: keep its person, wait, or
 * spawn a new one. Pure, so the timing rules are tested without a game.
 *
 * A person who is gone (killed, despawned, never spawned) is replaced, but
 * not at once: the design says a village is never permanently emptied by a
 * creeper, and also that it is not a spawner. `respawnAfter` ticks after
 * the last spawn is the earliest a replacement comes; a post that has never
 * spawned spawns on its first tick.
 */
import type { PostRecord } from "./record";

export type Verdict = { kind: "keep" } | { kind: "wait"; ticksLeft: number } | { kind: "spawn" };

/** A Minecraft day, in ticks. */
export const DAY = 24000;

export function decide(record: PostRecord, personAlive: boolean, now: number, respawnAfter = DAY): Verdict {
  if (personAlive) return { kind: "keep" };
  // A stamp ahead of the clock means the clock restarted (system.currentTick
  // counts from the server's boot, not the world's): a day has not passed,
  // but nor will one until the clock catches up, so treat it as passed.
  if (record.spawnedAt === 0 || record.spawnedAt > now) return { kind: "spawn" };
  const due = record.spawnedAt + respawnAfter;
  if (now < due) return { kind: "wait", ticksLeft: due - now };
  return { kind: "spawn" };
}

/** Where a post's person stands: the block in front of it (south), at the post's foot. */
export function spawnSpot(pos: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return { x: pos.x + 0.5, y: pos.y, z: pos.z + 1.5 };
}
