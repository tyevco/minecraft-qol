/**
 * Funnel orientation. Pure - no @minecraft imports.
 *
 * The block's `minecraft:facing_direction` state is taken to be the direction
 * the SPOUT points: the model is authored with the spout on +z, the state's
 * default "south", and the permutations rotate from there. Input is the face
 * opposite the spout. If the first in-game placement shows the spout pointing
 * the other way, flip `y_rotation_offset` in the block JSON - not this table.
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
