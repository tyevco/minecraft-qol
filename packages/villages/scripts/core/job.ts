/**
 * One step of a job, decided from the record and the world (settlements.md
 * §5.3, §5.4): what block goes down or comes up next, and what it costs or
 * returns. The engine performs the step; nothing here mutates anything.
 *
 * Fail towards the player keeping their things (CLAUDE.md rule 4): a block is
 * placed only once its item has been taken from the chest, in the same step;
 * a block is taken down only once its item is in the chest. A chest that is
 * short mid-build stops the job and says so, and nothing placed is undone.
 */
import { isWater, itemFor, type Cell } from "./blueprint";
import { isClear, type WorldCell } from "./checks";

export type Step =
  | { kind: "place"; index: number; cell: Cell; item: string | undefined }
  | { kind: "take"; index: number; cell: Cell; item: string | undefined }
  | { kind: "done" };

/** The next block to put down: `done` cells are already up. */
export function nextPlacement(cells: readonly Cell[], done: number): Step {
  if (done >= cells.length) return { kind: "done" };
  const cell = cells[done]!;
  return { kind: "place", index: done, cell, item: itemFor(cell) };
}

/** The next block to take down, `removal` being `removalOrder(cells)` (order.ts): `done` already taken. */
export function nextRemoval(removal: readonly Cell[], done: number): Step {
  if (done >= removal.length) return { kind: "done" };
  const cell = removal[done]!;
  return { kind: "take", index: done, cell, item: itemFor(cell) };
}

/**
 * What stands where a building's cell should be: the building's own block
 * (by type; states are not compared, so an opened door is still the door),
 * nothing that matters (air, a plant, water where no water belongs), or
 * somebody else's block, which repair leaves alone rather than destroy.
 */
export type CellStatus = "ours" | "missing" | "other";
export function repairStatus(cell: Cell, w: WorldCell): CellStatus {
  if (stillOurs(cell, w.typeId)) return "ours";
  if (isWater(cell.name) && w.isLiquid) return "ours";
  if (isClear(w)) return "missing";
  return "other";
}

/**
 * The next gap to fill (settlements.md §5.4, repair): the first cell from
 * `from` on that is missing, in placement order, with the cells passed over
 * because another block holds them. `done` for a repair is how far the list
 * has been looked at, so the same cell is never asked about twice.
 */
export function nextRepair(cells: readonly Cell[], from: number, lookup: (cell: Cell) => WorldCell | undefined): { step: Step; blocked: Cell[] } {
  const blocked: Cell[] = [];
  for (let i = from; i < cells.length; i++) {
    const cell = cells[i]!;
    const w = lookup(cell);
    if (!w) continue; // not loaded: left for another pass
    const status = repairStatus(cell, w);
    if (status === "other") blocked.push(cell);
    if (status === "missing") return { step: { kind: "place", index: i, cell, item: itemFor(cell) }, blocked };
  }
  return { step: { kind: "done" }, blocked };
}

/** Item counts from a container's stacks. */
export function countItems(stacks: readonly { typeId: string; amount: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of stacks) out[s.typeId] = (out[s.typeId] ?? 0) + s.amount;
  return out;
}

/**
 * Whether a block in the world is still the building's: the same type. States
 * are not compared, so a door someone opened or a chest turned still counts
 * as the building's and comes down into the chest; a block of another kind
 * is somebody else's now and is left alone.
 */
export const stillOurs = (cell: Cell, worldTypeId: string): boolean => cell.name === worldTypeId;

/** Seconds per block to ticks, never below one tick. */
export const ticksPerBlock = (seconds: number): number => Math.max(1, Math.round(seconds * 20));

/** How close the builder must be to a cell to work on it: within reach, or the walk is cosmetic and the block goes down regardless. */
export const REACH = 4.5;
export function withinReach(person: { x: number; y: number; z: number }, cell: { x: number; y: number; z: number }): boolean {
  const dx = person.x - (cell.x + 0.5), dz = person.z - (cell.z + 0.5);
  return Math.hypot(dx, dz) <= REACH;
}

/**
 * Where the builder should stand to place a cell: the cell's own column, at
 * the top of what is built so far under it, is not known here; the waypoint
 * goes to the cell itself and the walk stops as near as the path allows.
 */
export const standingSpot = (cell: { x: number; y: number; z: number }, groundY: number): { x: number; y: number; z: number } => ({ x: cell.x, y: Math.min(cell.y, groundY), z: cell.z });
