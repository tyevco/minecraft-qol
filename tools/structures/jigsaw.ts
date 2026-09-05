/**
 * An offline jigsaw expander: the game's algorithm, near enough, run over the
 * same pools and pieces the pack ships, so a village can be judged whole in
 * the viewer and a pool checked (a socket nothing fits, an unreachable pool)
 * before the game ever runs it. Pure: no engine, seeded, testable.
 *
 * The rules, as the game applies them (Java's JigsawPlacement, which Bedrock's
 * data-driven jigsaw follows; docs/villages-jigsaw-results.md measured the
 * joining): start with the start pool's piece at the origin, turned at random.
 * For every open marker on a placed piece, in order, draw elements from its
 * target pool by weight; for each, find a marker whose name is the socket's
 * target and turn the piece so that marker faces the socket; put the piece
 * where the two markers are adjacent; take the first whose box overlaps no
 * placed piece. If none fits, the pool's fallback is tried the same way. A
 * piece placed at depth d opens its own markers at depth d + 1, up to
 * maxDepth. Where nothing fits, the marker is left as its final block.
 */
import { Blueprint, FACINGS, OPPOSITE, type Facing, type Jigsaw } from "./blueprint";

export interface PoolElement {
  piece: Blueprint;
  weight: number;
}

export interface Pool {
  elements: PoolElement[];
  /** Tried when nothing in `elements` fits; "minecraft:empty" ends the branch. */
  fallback?: string;
}

export interface Placement {
  piece: Blueprint;
  /** The piece as placed: rotated, so its size is the box's size. */
  placed: Blueprint;
  x: number;
  y: number;
  z: number;
  turns: number;
  depth: number;
}

export interface Expansion {
  placements: Placement[];
  /** Markers left unresolved, with the pool that had nothing to offer. */
  open: { x: number; y: number; z: number; jigsaw: Jigsaw; depth: number }[];
}

const STEP: Record<Facing, [number, number, number]> = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };

/** A small seeded generator, so a seed is a village. */
export function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function weightedOrder<T extends { weight: number }>(items: T[], rand: () => number): T[] {
  const left = [...items];
  const out: T[] = [];
  while (left.length) {
    const total = left.reduce((a, e) => a + e.weight, 0);
    let pick = rand() * total;
    let i = 0;
    for (; i < left.length - 1; i++) {
      pick -= left[i]!.weight;
      if (pick < 0) break;
    }
    out.push(left.splice(i, 1)[0]!);
  }
  return out;
}

interface Box {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1 && a.z0 <= b.z1 && b.z0 <= a.z1;
}

/** The turns that make a marker facing `from` face `to` instead. */
function turnsToFace(from: Facing, to: Facing): number {
  for (let t = 0; t < 4; t++) if (FACINGS[(FACINGS.indexOf(from) + t) % 4] === to) return t;
  throw new Error("unreachable");
}

export function expand(
  pools: Map<string, Pool>,
  startPool: string,
  maxDepth: number,
  seed: number,
  options: { startTurns?: number } = {},
): Expansion {
  const rand = prng(seed);
  const start = pools.get(startPool);
  if (!start?.elements.length) throw new Error(`no start pool ${startPool}`);
  const placements: Placement[] = [];
  const boxes: Box[] = [];
  const open: Expansion["open"] = [];

  const place = (piece: Blueprint, turns: number, x: number, y: number, z: number, depth: number): Placement => {
    const placed = piece.rotated(turns);
    const p: Placement = { piece, placed, x, y, z, turns, depth };
    placements.push(p);
    boxes.push({ x0: x, y0: y, z0: z, x1: x + placed.sx - 1, y1: y + placed.sy - 1, z1: z + placed.sz - 1 });
    return p;
  };

  const first = weightedOrder(start.elements, rand)[0]!;
  const startTurns = options.startTurns ?? Math.floor(rand() * 4);
  const queue: { placement: Placement }[] = [{ placement: place(first.piece, startTurns, 0, 0, 0, 0) }];

  while (queue.length) {
    const { placement } = queue.shift()!;
    for (const m of placement.placed.markers()) {
      const sx = placement.x + m.x, sy = placement.y + m.y, sz = placement.z + m.z;
      const socket = m.jigsaw;
      if (placement.depth >= maxDepth) {
        open.push({ x: sx, y: sy, z: sz, jigsaw: socket, depth: placement.depth });
        continue;
      }
      const [dx, dy, dz] = STEP[socket.facing];
      const tx = sx + dx, ty = sy + dy, tz = sz + dz;
      let poolName: string | undefined = socket.pool;
      let done = false;
      while (poolName && poolName !== "minecraft:empty" && !done) {
        const pool = pools.get(poolName);
        if (!pool) throw new Error(`no pool ${poolName} (asked for by ${socket.name})`);
        for (const el of weightedOrder(pool.elements, rand)) {
          const candidates = el.piece.markers().filter((c) => c.jigsaw.name === socket.target);
          for (const c of candidates) {
            const turns = turnsToFace(c.jigsaw.facing, OPPOSITE[socket.facing]);
            const rotated = el.piece.rotated(turns);
            const rm = rotated.markers().find((r) => r.jigsaw === c.jigsaw || (r.jigsaw.name === c.jigsaw.name && r.jigsaw.facing === OPPOSITE[socket.facing]));
            if (!rm) continue;
            const x = tx - rm.x, y = ty - rm.y, z = tz - rm.z;
            const box: Box = { x0: x, y0: y, z0: z, x1: x + rotated.sx - 1, y1: y + rotated.sy - 1, z1: z + rotated.sz - 1 };
            if (boxes.some((b) => overlaps(b, box))) continue;
            const p = place(el.piece, turns, x, y, z, placement.depth + 1);
            // The marker that joined is spent: it becomes its final block and
            // is not expanded. (set() drops the marker with the jigsaw block.)
            p.placed.set(rm.x, rm.y, rm.z, rm.jigsaw.final);
            queue.push({ placement: p });
            done = true;
            break;
          }
          if (done) break;
        }
        if (!done) poolName = pool.fallback;
      }
      if (!done) open.push({ x: sx, y: sy, z: sz, jigsaw: socket, depth: placement.depth });
    }
  }
  return { placements, open };
}

/**
 * One blueprint of the whole expansion, markers replaced by their final
 * blocks, for the viewer. The origin moves to the lowest corner.
 */
export function canvas(expansion: Expansion, key: string, title: string, people: string, notes: string): Blueprint {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of expansion.placements) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); z0 = Math.min(z0, p.z);
    x1 = Math.max(x1, p.x + p.placed.sx - 1); y1 = Math.max(y1, p.y + p.placed.sy - 1); z1 = Math.max(z1, p.z + p.placed.sz - 1);
  }
  const out = new Blueprint(key, title, [x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1], people, notes);
  for (const p of expansion.placements) {
    out.paste(p.placed, p.x - x0, p.y - y0, p.z - z0);
    for (const m of p.placed.markers()) out.set(p.x - x0 + m.x, p.y - y0 + m.y, p.z - z0 + m.z, m.jigsaw.final);
  }
  // Every marker of the original pieces is spent or open; either way the final block stands.
  for (const o of expansion.open) out.set(o.x - x0, o.y - y0, o.z - z0, o.jigsaw.final);
  return out;
}
