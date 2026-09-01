/**
 * Anchor selection and respawn placement. Pure - no @minecraft imports.
 */

export interface Anchor {
  dimId: string;
  x: number;
  y: number;
  z: number;
  /** Effective radius, already clamped to the configured bounds. */
  radius: number;
  /** Placement order. Only used to break distance ties, so results are stable. */
  seq: number;
}

export interface Point {
  dimId: string;
  x: number;
  y: number;
  z: number;
}

export function distanceSq(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * The anchor that should catch a player standing at `at`.
 *
 * Nearest wins. Ties break by placement order so the result never flickers
 * between two equidistant anchors from one evaluation to the next.
 */
export function nearestAnchor(at: Point, anchors: readonly Anchor[]): Anchor | undefined {
  let best: Anchor | undefined;
  let bestDist = Infinity;

  for (const anchor of anchors) {
    if (anchor.dimId !== at.dimId) continue;
    const d = distanceSq(at, anchor);
    if (d > anchor.radius * anchor.radius) continue;

    if (d < bestDist || (d === bestDist && best !== undefined && anchor.seq < best.seq)) {
      best = anchor;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Horizontal offsets tried when placing a player next to an anchor, in order.
 *
 * Never spawn on the anchor's own block - the player ends up inside or on top
 * of it, which looks broken. A validated neighbour is the whole point.
 */
export const RESPAWN_OFFSETS: readonly { dx: number; dz: number }[] = [
  { dx: 0, dz: 1 },
  { dx: 1, dz: 0 },
  { dx: 0, dz: -1 },
  { dx: -1, dz: 0 },
];

/**
 * Choose where a player should actually materialise near an anchor.
 *
 * `isClear` reports whether a candidate has room to stand: the engine supplies
 * it, so this stays pure and exhaustively testable.
 *
 * Returns undefined when the anchor is walled in, which the caller must treat as
 * "obstructed" and surface. Visible failure over silent failure: an obstructed
 * anchor that says so is debuggable, one that quietly does nothing is a support
 * ticket.
 */
export function chooseRespawn(
  anchor: Point,
  isClear: (x: number, y: number, z: number) => boolean,
  preferred?: { dx: number; dz: number },
): Point | undefined {
  const order = preferred
    ? [preferred, ...RESPAWN_OFFSETS.filter((o) => o.dx !== preferred.dx || o.dz !== preferred.dz)]
    : RESPAWN_OFFSETS;

  for (const { dx, dz } of order) {
    const x = anchor.x + dx;
    const z = anchor.z + dz;
    if (isClear(x, anchor.y, z)) return { dimId: anchor.dimId, x, y: anchor.y, z };
  }
  return undefined;
}
