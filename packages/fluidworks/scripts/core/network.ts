/**
 * Walking a pipe network. Pure - no @minecraft imports.
 *
 * A funnel whose spout (or mouth) meets a pipe treats the whole connected run
 * of pipes as an extension of itself: the first terminal block found next to
 * any pipe in the run, nearest first, is what it reads or writes. The engine
 * supplies the two questions - is this a pipe, is this a terminal - so the
 * search is testable on a grid.
 *
 * The route also remembers the pipes it came through, so the engine can show
 * the flow travelling along them when the funnel does something.
 */
import { FACING_VECTOR, FACINGS, add, type Vec3 } from "./facing";

export interface NetworkView {
  isPipe(pos: Vec3): boolean;
  isTerminal(pos: Vec3): boolean;
}

export const MAX_PIPES = 64;

export const key = (p: Vec3): string => `${p.x},${p.y},${p.z}`;

export interface Route {
  terminal: Vec3;
  /** The pipes from the one beside the funnel to the one beside the terminal. */
  path: Vec3[];
}

/**
 * Breadth-first from `start` (a pipe) over pipes, returning the first terminal
 * adjacent to the run and the pipes that lead to it. `exclude` is the funnel
 * itself, which is adjacent to the first pipe and must not be "found".
 */
export function route(
  start: Vec3,
  exclude: Vec3,
  view: NetworkView,
  limit = MAX_PIPES,
): Route | undefined {
  if (!view.isPipe(start)) return undefined;
  const startKey = key(start);
  const seen = new Set<string>([startKey, key(exclude)]);
  const parent = new Map<string, Vec3>();
  const queue: Vec3[] = [start];
  let visited = 0;

  const pathTo = (pipe: Vec3): Vec3[] => {
    const path: Vec3[] = [];
    for (let p: Vec3 | undefined = pipe; p; p = parent.get(key(p)))
      path.push(p);
    return path.reverse();
  };

  while (queue.length > 0 && visited < limit) {
    const pipe = queue.shift()!;
    visited++;
    for (const f of FACINGS) {
      const n = add(pipe, FACING_VECTOR[f]);
      const k = key(n);
      if (seen.has(k)) continue;
      if (view.isTerminal(n)) return { terminal: n, path: pathTo(pipe) };
      if (view.isPipe(n)) {
        seen.add(k);
        parent.set(k, pipe);
        queue.push(n);
      }
    }
  }
  return undefined;
}

/** The terminal `route` finds, without the path. */
export function walk(
  start: Vec3,
  exclude: Vec3,
  view: NetworkView,
  limit = MAX_PIPES,
): Vec3 | undefined {
  return route(start, exclude, view, limit)?.terminal;
}
