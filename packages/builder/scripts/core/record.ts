/**
 * A placed building's record: one row in the shared position index (CLAUDE.md
 * rule 6), keyed by the building's origin, its minimum corner. The row says
 * what stands there, which way it was turned, how far the job has got, and
 * which table it was raised from. Packed as an array so one property holds
 * every row; the schema number guards the shape.
 */
import type { Box } from "./checks";
import type { Rotation } from "./rotate";

export const SCHEMA = 1;

export interface Position {
  dimId: string;
  x: number;
  y: number;
  z: number;
}

/** building: going up; built: finished; removing: coming down into the chest. */
export type Phase = "building" | "built" | "removing";
export const PHASES: readonly Phase[] = ["building", "built", "removing"];

export interface BuildingRecord extends Position {
  key: string;
  rotation: Rotation;
  sx: number;
  sy: number;
  sz: number;
  phase: Phase;
  /** Cells done so far in the phase's order: placed while building, taken while removing. */
  done: number;
  /** The blueprint table the job was started from; its chest pays for and takes back the blocks. */
  table: { x: number; y: number; z: number };
}

export type Row = [string, number, number, number, string, number, number, number, number, number, number, number, number, number];

export function packRecord(r: BuildingRecord): Row {
  return [r.dimId, r.x, r.y, r.z, r.key, r.rotation, r.sx, r.sy, r.sz, PHASES.indexOf(r.phase), r.done, r.table.x, r.table.y, r.table.z];
}

const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export function unpackRecord(packed: unknown): BuildingRecord | undefined {
  if (!Array.isArray(packed) || packed.length < 14) return undefined;
  const [dimId, x, y, z, key, rotation, sx, sy, sz, phase, done, tx, ty, tz] = packed as unknown[];
  if (typeof dimId !== "string" || typeof key !== "string") return undefined;
  if (!int(x) || !int(y) || !int(z) || !int(rotation) || !int(sx) || !int(sy) || !int(sz) || !int(phase) || !int(done) || !int(tx) || !int(ty) || !int(tz)) return undefined;
  if (rotation < 0 || rotation > 3 || phase < 0 || phase >= PHASES.length) return undefined;
  return { dimId, x, y, z, key, rotation: rotation as Rotation, sx, sy, sz, phase: PHASES[phase]!, done, table: { x: tx, y: ty, z: tz } };
}

export const boxOfRecord = (r: BuildingRecord): Box => ({ x: r.x, y: r.y, z: r.z, sx: r.sx, sy: r.sy, sz: r.sz });

export const sameTable = (r: BuildingRecord, table: { x: number; y: number; z: number }): boolean => r.table.x === table.x && r.table.y === table.y && r.table.z === table.z;

/** Whether a point is inside the record's box: how a builder is "pointed at" a building. */
export function contains(r: BuildingRecord, p: { x: number; y: number; z: number }): boolean {
  return p.x >= r.x && p.x < r.x + r.sx && p.y >= r.y && p.y < r.y + r.sy && p.z >= r.z && p.z < r.z + r.sz;
}
