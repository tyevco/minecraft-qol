/**
 * Turning a blueprint to face the way the player faces (settlements.md §7,
 * "rotate coordinates in core/ and rotate direction-style states by table").
 *
 * A quarter turn is clockwise seen from above: east goes to south. The
 * coordinate map and every table here were measured against the game's own
 * `structureManager.place` with a `rotation`, on the well, the larder and
 * the wall segment placed at all four rotations and read back block by block
 * (docs/settlements-results.md): the turned copy keeps its minimum corner on
 * the origin, and 222 stairs, six door halves and the wall joins read as the
 * tables say. The bed's `direction`, the ladder's `facing_direction` and a
 * lying log's `pillar_axis` follow the same tables but no shipped building
 * has one yet, so those rows are the design's assumption (§6) still.
 */
import type { Cell, Size, States } from "./blueprint";

export type Rotation = 0 | 1 | 2 | 3;
export type Facing = "north" | "east" | "south" | "west";

export const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];
/** `StructureRotation` names, by quarter turns; also the names the hatch accepts. */
export const ROTATION_NAMES: Record<Rotation, string> = { 0: "None", 1: "Rotate90", 2: "Rotate180", 3: "Rotate270" };

const CLOCKWISE: Record<Facing, Facing> = { north: "east", east: "south", south: "west", west: "north" };
const FACINGS: readonly Facing[] = ["north", "east", "south", "west"];

export function turnFacing(f: Facing, turns: number): Facing {
  let out = f;
  for (let i = 0; i < mod4(turns); i++) out = CLOCKWISE[out];
  return out;
}

export const mod4 = (t: number): Rotation => (((t % 4) + 4) % 4) as Rotation;

/** Stairs: `weirdo_direction` is the side the full-height half is on. */
const WEIRDO: readonly Facing[] = ["east", "west", "south", "north"];
/** Doors (as an alias of the cardinal direction) and beds: `direction` counts south, west, north, east. */
const DIRECTION: readonly Facing[] = ["south", "west", "north", "east"];
/** Ladders and chests (as an alias): `facing_direction` 2..5 is north, south, west, east. */
const FACING_DIRECTION: Record<number, Facing> = { 2: "north", 3: "south", 4: "west", 5: "east" };
const FACING_DIRECTION_OF: Record<Facing, number> = { north: 2, south: 3, west: 4, east: 5 };

const isFacing = (v: unknown): v is Facing => typeof v === "string" && (FACINGS as readonly string[]).includes(v);

/** A block's states after `turns` clockwise quarter turns. Anything not directional is left alone. */
export function turnStates(states: States, turns: number): States {
  const t = mod4(turns);
  if (t === 0) return states;
  const out: States = { ...states };
  const w = states.weirdo_direction;
  if (typeof w === "number" && w >= 0 && w <= 3) out.weirdo_direction = WEIRDO.indexOf(turnFacing(WEIRDO[w]!, t));
  const d = states.direction;
  if (typeof d === "number" && d >= 0 && d <= 3) out.direction = DIRECTION.indexOf(turnFacing(DIRECTION[d]!, t));
  const f = states.facing_direction;
  if (typeof f === "number" && FACING_DIRECTION[f]) out.facing_direction = FACING_DIRECTION_OF[turnFacing(FACING_DIRECTION[f]!, t)];
  const c = states["minecraft:cardinal_direction"];
  if (isFacing(c)) out["minecraft:cardinal_direction"] = turnFacing(c, t);
  const p = states.pillar_axis;
  if ((p === "x" || p === "z") && t % 2 === 1) out.pillar_axis = p === "x" ? "z" : "x";
  if ("wall_connection_type_north" in states)
    for (const side of FACINGS) {
      const v = states[`wall_connection_type_${side}`];
      if (v !== undefined) out[`wall_connection_type_${turnFacing(side, t)}`] = v;
    }
  return out;
}

/** The box a turned building occupies: x and z swap on an odd turn. */
export function rotatedSize(size: Size, turns: number): Size {
  return mod4(turns) % 2 === 0 ? { ...size } : { x: size.z, y: size.y, z: size.x };
}

/**
 * Where a cell lands after `turns` clockwise quarter turns of a box of
 * `size`, the box's minimum corner staying where it was. One turn maps
 * (x, z) to (depth - 1 - z, x).
 */
export function rotatePoint(x: number, z: number, size: Size, turns: number): [number, number] {
  let cx = x, cz = z, w = size.x, d = size.z;
  for (let i = 0; i < mod4(turns); i++) {
    [cx, cz] = [d - 1 - cz, cx];
    [w, d] = [d, w];
  }
  return [cx, cz];
}

export function rotateCell(cell: Cell, size: Size, turns: number): Cell {
  const [x, z] = rotatePoint(cell.x, cell.z, size, turns);
  return { ...cell, x, z, states: turnStates(cell.states, turns) };
}

/**
 * The turn that makes a south-facing blueprint face the way a player looks.
 * Bedrock yaw: 0 is south, 90 west, ±180 north, -90 east; the nearest of the
 * four wins.
 */
export function rotationFromYaw(yaw: number): Rotation {
  const y = ((yaw % 360) + 360) % 360;
  return mod4(Math.round(y / 90));
}

/** The way the door faces after `turns`: south unturned. */
export const doorFacing = (turns: number): Facing => turnFacing("south", turns);

export function parseRotation(text: string | undefined): Rotation | undefined {
  if (text === undefined) return undefined;
  const n = Number(text);
  if (Number.isInteger(n) && n >= 0 && n <= 3) return n as Rotation;
  if (n === 90 || n === 180 || n === 270) return (n / 90) as Rotation;
  const named = (Object.entries(ROTATION_NAMES) as [string, string][]).find(([, name]) => name.toLowerCase() === text.toLowerCase());
  if (named) return Number(named[0]) as Rotation;
  const facing = FACINGS.indexOf(text.toLowerCase() as Facing);
  if (facing >= 0) return mod4(facing - 2); // the way the door faces: south is 0
  return undefined;
}
