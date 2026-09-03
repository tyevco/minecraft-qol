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

export const GRAVESTONE = layout(64, {
  stone: [0, 0],
  face: [1, 0],
  top: [2, 0],
  mound: [3, 0],
  dark: [0, 1],
});

// ---------------------------------------------------------------------------
// Concept entities: proposals from docs/design/entities.md, generated into
// concepts/ so they can be looked at in the viewer before a pack exists.
// ---------------------------------------------------------------------------

export const DECOY = layout(64, {
  post: [0, 0],
  bar: [1, 0],
  burlap: [2, 0],
  target: [3, 0],
  face: [0, 1],
  straw: [1, 1],
  dark: [2, 1],
});

export const PATROL_GOLEM = layout(64, {
  stone: [0, 0],
  moss: [1, 0],
  plate: [2, 0],
  band: [3, 0],
  face: [0, 1],
  chest: [1, 1],
  dark: [2, 1],
});

export const RUNNER = layout(64, {
  plate: [0, 0],
  drum: [1, 0],
  deck: [2, 0],
  glass: [3, 0],
  face: [0, 1],
  fin: [1, 1],
  bulb: [2, 1],
  dark: [3, 1],
});

export const HATCHLING = layout(64, {
  scales: [0, 0],
  belly: [1, 0],
  face: [2, 0],
  snout: [3, 0],
  horn: [0, 1],
  membrane: [1, 1],
  dark: [2, 1],
});

export const MESSENGER = layout(64, {
  feathers: [0, 0],
  breast: [1, 0],
  face: [2, 0],
  beak: [3, 0],
  tail: [0, 1],
  satchel: [1, 1],
  strap: [2, 1],
  dark: [3, 1],
});

export const MULE = layout(64, {
  fur: [0, 0],
  belly: [1, 0],
  cheek: [2, 0],
  blaze: [3, 0],
  muzzle: [0, 1],
  mane: [1, 1],
  burlap: [2, 1],
  strap: [3, 1],
  dark: [0, 2],
});

export const EGG = layout(64, {
  shell: [0, 0],
  crackA: [1, 0],
  crackB: [2, 0],
  straw: [3, 0],
  dark: [0, 1],
});
