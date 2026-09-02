/**
 * Atlas layouts shared by the texture generator (which paints them) and the
 * model generator (which points faces at them).
 *
 * Every atlas is a grid of 16x16 tiles. A tile is named once here; textures
 * paint into that slot and geometry faces sample a window of it. Changing a
 * tile's slot is therefore one edit, and a face can never point at a slot the
 * painter did not fill.
 */

export type Slot = readonly [col: number, row: number];

export interface AtlasLayout<Name extends string = string> {
  /** Square atlas edge in pixels; must be a multiple of 16. */
  size: number;
  tiles: Record<Name, Slot>;
}

function layout<Name extends string>(
  size: number,
  tiles: Record<Name, Slot>,
): AtlasLayout<Name> {
  const cols = size / 16;
  for (const [name, [c, r]] of Object.entries<Slot>(tiles)) {
    if (c >= cols || r >= cols)
      throw new Error(`tile ${name} at ${c},${r} is outside a ${size}px atlas`);
  }
  return { size, tiles };
}

export const HEARTHSTONE = layout(64, {
  bricks: [0, 0],
  carved: [1, 0],
  embers: [2, 0],
  flame: [3, 0],
  plinth: [0, 1],
  dark: [1, 1],
  post: [2, 1],
});

export const FUNNEL = layout(64, {
  plate: [0, 0],
  copper: [1, 0],
  interior: [2, 0],
  spout: [3, 0],
  wheel: [0, 1],
  lid: [1, 1],
  dark: [2, 1],
  pipeU: [3, 1],
  pipeV: [0, 2],
});

export const PIPE = layout(32, {
  alongU: [0, 0],
  alongV: [1, 0],
  junction: [0, 1],
  flange: [1, 1],
});

export const TURRET_BASE = layout(64, {
  foot: [0, 0],
  plate: [1, 0],
  deck: [2, 0],
  socket: [3, 0],
  brace: [0, 1],
  dark: [1, 1],
});

export const TURRET_HEAD = layout(64, {
  plate: [0, 0],
  deck: [1, 0],
  barrel: [2, 0],
  muzzle: [3, 0],
  sight: [0, 1],
  drum: [1, 1],
  swivel: [2, 1],
  vents: [3, 1],
  barrelV: [0, 2],
});
