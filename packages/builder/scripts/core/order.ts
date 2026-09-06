/**
 * The order a building goes up in (settlements.md §5.3): the bottom layer
 * first, and within a layer from the far corner toward the door. The door is
 * on the south (+z) wall of every blueprint, so the far corner is the
 * north-west one and a layer fills from north to south, west to east. Water
 * goes down last in its layer, so a well's ring stands before the water is
 * poured into it. Taking a building down runs the same list backwards.
 */
import { isWater, type Cell, type Size } from "./blueprint";
import { rotateCell } from "./rotate";

export function placementOrder(cells: readonly Cell[]): Cell[] {
  return [...cells].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    const la = isWater(a.name) ? 1 : 0, lb = isWater(b.name) ? 1 : 0;
    if (la !== lb) return la - lb;
    if (a.z !== b.z) return a.z - b.z;
    return a.x - b.x;
  });
}

/**
 * The block a cell hangs from or stands against, if taking that block away
 * would pop this one off as a drop: a hanging lantern's is the block above.
 * Measured on the well (docs/settlements-results.md): a hanging lantern set
 * by script under open air stays put, but the roof block above it coming
 * down by script pops it, so the removal order has to know.
 */
export function supportOf(cell: Cell): { x: number; y: number; z: number } | undefined {
  if (/(^|:)(soul_)?lantern$/.test(cell.name) && cell.states.hanging === true) return { x: cell.x, y: cell.y + 1, z: cell.z };
  return undefined;
}

/**
 * The order a building comes down in: the placement order backwards, except
 * that a block which would pop when its support goes comes down before the
 * support does, so its item reaches the chest rather than the ground.
 */
export function removalOrder(placed: readonly Cell[]): Cell[] {
  const out = [...placed].reverse();
  const key = (c: { x: number; y: number; z: number }): string => `${c.x},${c.y},${c.z}`;
  for (const cell of placed) {
    const s = supportOf(cell);
    if (!s) continue;
    const at = out.findIndex((c) => key(c) === key(cell));
    const supportAt = out.findIndex((c) => key(c) === key(s));
    if (supportAt < 0 || at < supportAt) continue;
    out.splice(at, 1);
    out.splice(supportAt, 0, cell);
  }
  return out;
}

/**
 * The cells of a building as they will stand in the world: ordered, turned,
 * and moved to the origin. This list is the job; `done` counts into it.
 */
export function worldCells(cells: readonly Cell[], size: Size, turns: number, origin: { x: number; y: number; z: number }): Cell[] {
  return placementOrder(cells).map((c) => {
    const r = rotateCell(c, size, turns);
    return { ...r, x: r.x + origin.x, y: r.y + origin.y, z: r.z + origin.z };
  });
}
