/**
 * Walking a pipe network. Pure - no @minecraft imports.
 *
 * A funnel whose spout (or mouth) meets a pipe treats the whole connected run
 * of pipes as an extension of itself: the first terminal block found next to
 * any pipe in the run, nearest first, is what it reads or writes. The engine
 * supplies the two questions - is this a pipe, is this a terminal - so the
 * search is testable on a grid.
 */
import { FACING_VECTOR, FACINGS, add, type Vec3 } from "./facing";

export interface NetworkView {
  isPipe(pos: Vec3): boolean;
  isTerminal(pos: Vec3): boolean;
}

export const MAX_PIPES = 64;

export const key = (p: Vec3): string => `${p.x},${p.y},${p.z}`;

/**
 * Breadth-first from `start` (a pipe) over pipes, returning the first terminal
 * adjacent to the run. `exclude` is the funnel itself, which is adjacent to
 * the first pipe and must not be "found".
 */
export function walk(
  start: Vec3,
  exclude: Vec3,
  view: NetworkView,
  limit = MAX_PIPES,
): Vec3 | undefined {
  if (!view.isPipe(start)) return undefined;
  const seen = new Set<string>([key(start), key(exclude)]);
  const queue: Vec3[] = [start];
  let visited = 0;

  while (queue.length > 0 && visited < limit) {
    const pipe = queue.shift()!;
    visited++;
    for (const f of FACINGS) {
      const n = add(pipe, FACING_VECTOR[f]);
      const k = key(n);
      if (seen.has(k)) continue;
      if (view.isTerminal(n)) return n;
      if (view.isPipe(n)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return undefined;
}
