/**
 * Funnel orientation. Pure - no @minecraft imports.
 *
 * The block's `minecraft:facing_direction` state is the direction the SPOUT
 * points: the model is authored with the spout on +z, the state's default
 * "south", and the permutations rotate from there. Input is the face opposite
 * the spout. Pinned in game by the `funnel_makes_concrete` GameTest.
 */
export type Facing = "down" | "up" | "north" | "south" | "west" | "east";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const FACINGS: readonly Facing[] = [
  "down",
  "up",
  "north",
  "south",
  "west",
  "east",
];

export const FACING_VECTOR: Readonly<Record<Facing, Vec3>> = {
  down: { x: 0, y: -1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  north: { x: 0, y: 0, z: -1 },
  south: { x: 0, y: 0, z: 1 },
  west: { x: -1, y: 0, z: 0 },
  east: { x: 1, y: 0, z: 0 },
};

export const OPPOSITE: Readonly<Record<Facing, Facing>> = {
  down: "up",
  up: "down",
  north: "south",
  south: "north",
  west: "east",
  east: "west",
};

export function parseFacing(raw: unknown): Facing | undefined {
  return typeof raw === "string" && (FACINGS as readonly string[]).includes(raw)
    ? (raw as Facing)
    : undefined;
}

/** The engine's `Direction` enum spells its values "Down", "Up", "North"... */
export function parseDirection(raw: unknown): Facing | undefined {
  return typeof raw === "string" ? parseFacing(raw.toLowerCase()) : undefined;
}

export function add(p: Vec3, v: Vec3): Vec3 {
  return { x: p.x + v.x, y: p.y + v.y, z: p.z + v.z };
}

/** Where the spout delivers. */
export function outputOf(pos: Vec3, facing: Facing): Vec3 {
  return add(pos, FACING_VECTOR[facing]);
}

/** Where the mouth draws from. */
export function inputOf(pos: Vec3, facing: Facing): Vec3 {
  return add(pos, FACING_VECTOR[OPPOSITE[facing]]);
}

/**
 * Where the spout points when a funnel is placed. Hopper-style: into the
 * block that was clicked, when that block is something a funnel can use
 * (a tank, a pipe, a container, a source). Sneaking flips it, so the MOUTH
 * goes into the clicked block instead - place sneaking against a water source
 * to draw from it. Clicking anything else keeps `fallback`, the direction the
 * placement trait chose from where the player was looking.
 *
 * `clickedFace` is the face of the clicked block that the funnel was placed
 * against, so the clicked block lies opposite it from the new funnel: placed
 * on a cauldron's west face, the cauldron is to the funnel's east.
 */
export function placementFacing(
  clickedFace: Facing | undefined,
  clickedIsTarget: boolean,
  sneaking: boolean,
  fallback: Facing,
): Facing {
  if (!clickedFace || !clickedIsTarget) return fallback;
  return sneaking ? clickedFace : OPPOSITE[clickedFace];
}
