/**
 * Block <-> entity reconciliation decisions. Pure - no @minecraft imports.
 *
 * This is the load-bearing assumption of the whole design (design doc §10.1):
 * the block is the anchor and the entity is the head, and whichever side goes
 * missing, the other must notice and repair without ever producing two heads
 * on one block. Everything here is a decision over plain data so it can be
 * tested exhaustively; the engine layer gathers the facts and applies the
 * verdict.
 *
 * Invariants:
 *   - a block with a record has at most one linked entity
 *   - an entity linked to a block that is not a turret does not survive
 *   - an entity with no link is inert and is never touched (probes, /summon)
 */
import { samePosition, type Position } from "./record";

/** What the engine knows about one of our entities. */
export interface Head {
  id: string;
  /** Where the entity says its block is. Absent for an unlinked entity. */
  link?: Position;
  /** Whether it is standing in its block's cell right now. */
  atBlock: boolean;
}

export type BlockAction =
  | { kind: "keep"; id: string }
  | { kind: "teleport"; id: string }
  | { kind: "adopt"; id: string }
  | { kind: "spawn" };

export interface BlockVerdict {
  action: BlockAction;
  /** Duplicates to remove - other heads claiming this block. */
  remove: string[];
}

/**
 * Decide what a ticking turret block should do about its head.
 *
 * @param block   the block's position
 * @param linked  the entity the record names, if it is currently loaded and ours
 * @param nearby  every entity of our type found at the block, linked or not
 */
export function reconcileBlock(
  block: Position,
  linked: Head | undefined,
  nearby: readonly Head[],
): BlockVerdict {
  // Heads that claim this block. Ordered by id so the choice is stable across
  // ticks rather than depending on query order.
  const claimants = nearby
    .filter((h) => h.link !== undefined && samePosition(h.link, block))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (linked) {
    const remove = claimants.filter((h) => h.id !== linked.id).map((h) => h.id);
    return {
      action: linked.atBlock ? { kind: "keep", id: linked.id } : { kind: "teleport", id: linked.id },
      remove,
    };
  }

  const first = claimants[0];
  if (first) {
    return {
      action: { kind: "adopt", id: first.id },
      remove: claimants.slice(1).map((h) => h.id),
    };
  }

  return { action: { kind: "spawn" }, remove: [] };
}

export type EntityVerdict = "keep" | "remove" | "inert";

/**
 * Decide what to do with a head the engine has just seen (on load, or in the
 * slow sweep).
 *
 * @param head           the entity's own claim
 * @param blockIsTurret  what stands at the claimed position; undefined when
 *                       that chunk is not loaded, which is not evidence of
 *                       anything
 * @param recordEntityId the id the block's record names, if a record exists
 */
export function reconcileEntity(
  head: Head,
  blockIsTurret: boolean | undefined,
  recordEntityId: string | undefined,
): EntityVerdict {
  if (!head.link) return "inert";
  if (blockIsTurret === undefined) return "keep";
  if (!blockIsTurret) return "remove";
  // The block is real. If its record names another head, this one is a
  // duplicate; if the record names nobody yet, the block's tick will adopt it.
  if (recordEntityId !== undefined && recordEntityId !== head.id) return "remove";
  return "keep";
}

/**
 * Where the head's feet sit: the socket on top of the base model, 14/16 of a
 * block up (tools/models/generate.ts). The entity has no gravity and no
 * collision, so nothing about the world holds it there except reconciliation.
 */
export const HEAD_SEAT = 14 / 16;

/**
 * A head is "at" its block when it is in the block's column and within half a
 * block of its seat - inside the base's own cell, or just above it.
 */
export function isAtBlock(block: Position, location: { x: number; y: number; z: number }): boolean {
  return (
    Math.floor(location.x) === block.x &&
    Math.floor(location.z) === block.z &&
    location.y >= block.y &&
    location.y < block.y + HEAD_SEAT + 0.5
  );
}

/** Where a head stands: centred on the block, feet in the socket. */
export function headSpawnLocation(block: Position): { x: number; y: number; z: number } {
  return { x: block.x + 0.5, y: block.y + HEAD_SEAT, z: block.z + 0.5 };
}

/**
 * Ticks a block waits for a head it remembers before giving up and spawning
 * a replacement.
 *
 * On chunk load the block can tick before its entity has finished loading.
 * Spawning immediately would produce a second head, which the entity-side
 * check then removes - correct, but a visible pop and a wasted entity on every
 * load. A short grace period lets the remembered head turn up. A head that has
 * genuinely been destroyed stays missing, so the wait costs a few seconds once.
 */
export const SPAWN_GRACE_TICKS = 2;

/**
 * Whether a block whose head is missing should spawn one now.
 *
 * @param remembered whether the record names a head at all
 * @param misses     consecutive block ticks the remembered head was not found
 */
export function spawnAllowed(remembered: boolean, misses: number): boolean {
  if (!remembered) return true;
  return misses >= SPAWN_GRACE_TICKS;
}
