import { BlockComponentTypes, system, world, type Block, type Container } from "@minecraft/server";
import { blockKey, safeGetBlock } from "./geometry";

/** One slot: [typeId, amount], or null when empty. */
export type Slot = readonly [string, number] | null;
export type Slots = readonly Slot[];

interface Rig {
  dimId: string;
  x: number;
  y: number;
  z: number;
  /** Snapshot from the previous tick - the pre-dispense evidence. */
  prev?: Slots;
  /** Snapshot from the current tick. */
  cur?: Slots;
  curTick: number;
  lastTriggered?: boolean;
}

const PROP_RIGS = "qol_times:rigs";

/**
 * A "rig" is a dispenser confirmed to face a cauldron. Only registered rigs are
 * polled, which is what keeps the per-tick cost negligible: a world realistically
 * has a handful, not fifty.
 */
const rigs = new Map<string, Rig>();

/**
 * How stale a snapshot may be and still count as evidence. The probe measured a
 * 4-tick gap between the triggered_bit rising edge and the item spawn, and the
 * decrement lands on the spawn tick, so 1 tick back is the useful one. A small
 * allowance absorbs a fast redstone clock.
 */
const MAX_SNAPSHOT_AGE = 3;

/**
 * Read a container without allocating an ItemStack per slot. ContainerSlot
 * exposes typeId/amount directly; getItem() would build a full stack each time.
 */
export function snapshotContainer(block: Block): Slots | undefined {
  try {
    const container = block.getComponent(BlockComponentTypes.Inventory)?.container;
    if (!container || !container.isValid) return undefined;
    const out: Slot[] = [];
    for (let i = 0; i < container.size; i++) {
      const slot = container.getSlot(i);
      out.push(slot.hasItem() ? [slot.typeId, slot.amount] : null);
    }
    return out;
  } catch {
    return undefined;
  }
}

function countOf(slots: Slots | undefined, typeId: string): number {
  if (!slots) return 0;
  let n = 0;
  for (const s of slots) if (s && s[0] === typeId) n += s[1];
  return n;
}

export function isRegistered(dimId: string, block: Block): boolean {
  return rigs.has(blockKey(dimId, block));
}

export function registerRig(dimId: string, block: Block): void {
  const key = blockKey(dimId, block);
  if (rigs.has(key)) return;
  rigs.set(key, {
    dimId,
    x: block.x,
    y: block.y,
    z: block.z,
    cur: snapshotContainer(block),
    curTick: system.currentTick,
  });
  persist();
}

export function forgetRig(dimId: string, block: { x: number; y: number; z: number }): void {
  if (rigs.delete(blockKey(dimId, block))) persist();
}

/**
 * The causal proof.
 *
 * Returns the slot the item was dispensed from, or undefined if this dispenser
 * cannot be shown to have just lost exactly one of `typeId`. Everything upstream
 * of this is circumstantial - a player can stand anywhere and throw anything.
 * Only a container that actually shrank proves a dispense happened.
 *
 * Measured behaviour this relies on: by the time entitySpawn fires, the slot is
 * ALREADY decremented, and the same-tick snapshot is taken after that, so the
 * previous tick's snapshot is the only usable "before" state.
 */
export function proveDispense(
  dimId: string,
  block: Block,
  typeId: string,
  now: Slots,
): number | undefined {
  const rig = rigs.get(blockKey(dimId, block));
  if (!rig) return undefined; // unknown rig: never act on a first sighting
  const before = rig.prev;
  if (!before) return undefined;
  if (system.currentTick - rig.curTick > MAX_SNAPSHOT_AGE) return undefined;

  // The dispenser must have lost exactly one of this item type.
  if (countOf(before, typeId) - countOf(now, typeId) !== 1) return undefined;

  // Locate the specific slot that shrank, so the residue can be written back
  // deterministically rather than via addItem.
  for (let i = 0; i < before.length; i++) {
    const b = before[i];
    if (!b || b[0] !== typeId) continue;
    const a = now[i] ?? null;
    if (a === null || a[0] !== typeId || a[1] === b[1] - 1) return i;
  }
  return undefined;
}

/** Per-tick poll over registered rigs only. */
function tick(): void {
  if (rigs.size === 0) return;
  const now = system.currentTick;

  for (const [key, rig] of rigs) {
    const dim = world.getDimension(rig.dimId);
    const block = safeGetBlock(dim, { x: rig.x, y: rig.y, z: rig.z });
    if (!block || !block.isValid) continue; // unloaded: keep it, just skip

    let triggered: boolean | undefined;
    try {
      if (!block.matches("minecraft:dispenser")) {
        rigs.delete(key);
        persist();
        continue;
      }
      triggered = block.permutation.getState("triggered_bit") as boolean | undefined;
    } catch {
      continue;
    }

    rig.lastTriggered = triggered;
    rig.prev = rig.cur;
    rig.cur = snapshotContainer(block);
    rig.curTick = now;
  }
}

/** triggered_bit reads true at event time in every measured sample. */
export function wasTriggered(dimId: string, block: Block): boolean {
  return rigs.get(blockKey(dimId, block))?.lastTriggered === true;
}

function persist(): void {
  const positions = [...rigs.values()].map((r) => [r.dimId, r.x, r.y, r.z]);
  try {
    world.setDynamicProperty(PROP_RIGS, JSON.stringify(positions));
  } catch {
    // Non-fatal: the registry rebuilds from first sightings.
  }
}

/** Rehydrate after a world load or /reload, which discards all module state. */
export function restore(): void {
  const raw = world.getDynamicProperty(PROP_RIGS);
  if (typeof raw !== "string") return;
  let positions: unknown;
  try {
    positions = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(positions)) return;

  for (const entry of positions) {
    if (!Array.isArray(entry) || entry.length !== 4) continue;
    const [dimId, x, y, z] = entry as [string, number, number, number];
    rigs.set(blockKey(dimId, { x, y, z }), { dimId, x, y, z, curTick: system.currentTick });
  }
}

export function startPolling(): number {
  return system.runInterval(tick, 1);
}

export function rigCount(): number {
  return rigs.size;
}
