/**
 * A placed building's record: one row in the shared position index (CLAUDE.md
 * rule 6), keyed by the building's origin, its minimum corner. The row says
 * what stands there, which way it was turned, how far the job has got, and
 * which table it was raised from. Packed as an array so one property holds
 * every row; the schema number guards the shape.
 */
import type { Box } from "./checks";
import type { Rotation } from "./rotate";

export const SCHEMA = 3;

export interface Position {
  dimId: string;
  x: number;
  y: number;
  z: number;
}

/** building: going up; built: finished; removing: coming down into the chest; repairing: the gaps filled from the chest. */
export type Phase = "building" | "built" | "removing" | "repairing";
export const PHASES: readonly Phase[] = ["building", "built", "removing", "repairing"];

export interface BuildingRecord extends Position {
  key: string;
  rotation: Rotation;
  sx: number;
  sy: number;
  sz: number;
  phase: Phase;
  /** Cells done so far in the phase's order: placed while building, taken while removing, looked at while repairing. */
  done: number;
  /** The blueprint table the job was started from; its chest pays for and takes back the blocks. */
  table: { x: number; y: number; z: number };
  /** Raised with the free-build toggle on: nothing was taken, so nothing comes back. */
  free: boolean;
  /** The people's palette it was raised in (core/palette.ts), or "" for the blueprint's own. */
  palette: string;
}

export type Row = [string, number, number, number, string, number, number, number, number, number, number, number, number, number, number, string];

export function packRecord(r: BuildingRecord): Row {
  return [r.dimId, r.x, r.y, r.z, r.key, r.rotation, r.sx, r.sy, r.sz, PHASES.indexOf(r.phase), r.done, r.table.x, r.table.y, r.table.z, r.free ? 1 : 0, r.palette];
}

const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export function unpackRecord(packed: unknown): BuildingRecord | undefined {
  if (!Array.isArray(packed) || packed.length < 14) return undefined;
  // A schema-1 row has no `free` column: it was paid for. A schema-2 row has no palette: the blueprint's own.
  const [dimId, x, y, z, key, rotation, sx, sy, sz, phase, done, tx, ty, tz, free = 0, palette = ""] = packed as unknown[];
  if (typeof dimId !== "string" || typeof key !== "string") return undefined;
  if (!int(x) || !int(y) || !int(z) || !int(rotation) || !int(sx) || !int(sy) || !int(sz) || !int(phase) || !int(done) || !int(tx) || !int(ty) || !int(tz)) return undefined;
  if (rotation < 0 || rotation > 3 || phase < 0 || phase >= PHASES.length) return undefined;
  return { dimId, x, y, z, key, rotation: rotation as Rotation, sx, sy, sz, phase: PHASES[phase]!, done, table: { x: tx, y: ty, z: tz }, free: free === 1 || free === true, palette: typeof palette === "string" ? palette : "" };
}

export const boxOfRecord = (r: BuildingRecord): Box => ({ x: r.x, y: r.y, z: r.z, sx: r.sx, sy: r.sy, sz: r.sz });

export const sameTable = (r: BuildingRecord, table: { x: number; y: number; z: number }): boolean => r.table.x === table.x && r.table.y === table.y && r.table.z === table.z;

/** Whether a point is inside the record's box: how a builder is "pointed at" a building. */
export function contains(r: BuildingRecord, p: { x: number; y: number; z: number }): boolean {
  return p.x >= r.x && p.x < r.x + r.sx && p.y >= r.y && p.y < r.y + r.sy && p.z >= r.z && p.z < r.z + r.sz;
}
