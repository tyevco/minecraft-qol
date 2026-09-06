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
  const out = [...cells].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    const la = isWater(a.name) ? 1 : 0, lb = isWater(b.name) ? 1 : 0;
    if (la !== lb) return la - lb;
    if (a.z !== b.z) return a.z - b.z;
    return a.x - b.x;
  });
  // A block that leans on another goes up after it: a ladder set against air
  // pops off (measured on the turned inn, whose ladder faced west with its
  // wall to the east, three cells later in the order). Moving it to just
  // after its support keeps the layer-by-layer look and, since removal is
  // this list backwards, takes it down before the wall.
  const key = (c: { x: number; y: number; z: number }): string => `${c.x},${c.y},${c.z}`;
  for (const cell of [...out]) {
    const s = leansOn(cell);
    if (!s) continue;
    const at = out.findIndex((c) => key(c) === key(cell));
    const supportAt = out.findIndex((c) => key(c) === key(s));
    if (supportAt < 0 || supportAt < at) continue;
    out.splice(at, 1);
    out.splice(supportAt, 0, cell); // supportAt is one less now: right after the support
  }
  // A two-block thing goes up as a pair: its other half follows at once. A
  // door's lower half left alone in a wall for a layer is taken off by the
  // neighbour update the wall's next block gives it (measured on the larder,
  // 161 of 163 cells), while a free-standing pair a few cells apart survived.
  for (const cell of [...out]) {
    const c = companionOf(cell);
    if (!c) continue;
    const at = out.findIndex((x) => key(x) === key(cell));
    const other = out.findIndex((x) => key(x) === key(c));
    if (other < 0 || other <= at + 1) continue;
    const [half] = out.splice(other, 1);
    out.splice(at + 1, 0, half!);
  }
  return out;
}

/** Beds: `direction` is the way the head points from the foot: south, west, north, east. */
const BED_HEAD: [number, number][] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

/**
 * The other half of a two-block thing: a door's upper half from its lower and
 * back, a bed's head from its foot and back. Placed together and taken down
 * together, since the game removes a lone half and may drop it.
 */
export function companionOf(cell: Cell): { x: number; y: number; z: number } | undefined {
  if (/(^|:)(wooden_|[a-z_]+_)?door$/.test(cell.name) && typeof cell.states.upper_block_bit === "boolean") {
    return { x: cell.x, y: cell.y + (cell.states.upper_block_bit ? -1 : 1), z: cell.z };
  }
  if (/(^|:)bed$/.test(cell.name) && typeof cell.states.head_piece_bit === "boolean") {
    const d = cell.states.direction;
    const step = typeof d === "number" ? BED_HEAD[d] : undefined;
    if (!step) return undefined;
    const sign = cell.states.head_piece_bit ? -1 : 1;
    return { x: cell.x + sign * step[0], y: cell.y, z: cell.z + sign * step[1] };
  }
  return undefined;
}

/** Ladders: `facing_direction` is the way the ladder faces, away from its wall. */
const LADDER_WALL: Record<number, [number, number]> = { 2: [0, 1], 3: [0, -1], 4: [1, 0], 5: [-1, 0] };

/**
 * The block a cell must lean on to stay up when placed: a ladder's wall. A
 * hanging lantern set under open air stays (measured), so it is not here;
 * it is in `supportOf`, which is about coming down.
 */
export function leansOn(cell: Cell): { x: number; y: number; z: number } | undefined {
  if (/(^|:)ladder$/.test(cell.name)) {
    const f = cell.states.facing_direction;
    const d = typeof f === "number" ? LADDER_WALL[f] : undefined;
    if (d) return { x: cell.x + d[0], y: cell.y, z: cell.z + d[1] };
  }
  return undefined;
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
