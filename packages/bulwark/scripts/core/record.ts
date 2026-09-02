/**
 * The per-turret record and its storage encoding. Pure - no @minecraft imports.
 *
 * One world dynamic property per turret, keyed by position. That is the storage
 * seam: `minecraft:block_entity` with per-block dynamic properties is still
 * experimental in 26.45 retail (docs/README.md), so nothing can live on the
 * block itself. When it can, `engine/storage.ts` changes and this file gains a
 * migration; nothing else knows where records live.
 *
 * Per-turret keys rather than one index property, because a single property
 * holding every turret would hit the per-property size cap at exactly the
 * scale the design targets (a hundred turrets). Enumeration comes from
 * `world.getDynamicPropertyIds()` filtered by prefix.
 */

export const KEY_PREFIX = "bw:t|";
/** Bump when the encoded tuple changes shape. Readers refuse newer schemas. */
export const SCHEMA = 1;

export interface Position {
  dimId: string;
  x: number;
  y: number;
  z: number;
}

export interface TurretRecord extends Position {
  /** The paired entity, once one has been spawned and linked. */
  entityId?: string;
  /** Arrows buffered, 0..AMMO_CAP. */
  ammo: number;
  /** Kills attributed to this turret by the script-side hook. */
  kills: number;
}

/** Compact tuple form: [schema, entityId or "", ammo, kills]. */
type Row = [schema: number, entityId: string, ammo: number, kills: number];

export function recordKey(pos: Position): string {
  return `${KEY_PREFIX}${pos.dimId}|${pos.x},${pos.y},${pos.z}`;
}

export function isRecordKey(key: string): boolean {
  return key.startsWith(KEY_PREFIX);
}

/**
 * Invert recordKey. Dimension ids contain a colon, so the separators are
 * pipes, and the position is the final segment.
 */
export function parseRecordKey(key: string): Position | undefined {
  if (!isRecordKey(key)) return undefined;
  const rest = key.slice(KEY_PREFIX.length);
  const split = rest.lastIndexOf("|");
  if (split <= 0) return undefined;
  const dimId = rest.slice(0, split);
  const parts = rest.slice(split + 1).split(",");
  if (parts.length !== 3) return undefined;
  const [x, y, z] = parts.map((p) => Number(p));
  if (![x, y, z].every((n) => Number.isInteger(n))) return undefined;
  return { dimId, x: x!, y: y!, z: z! };
}

export function encodeRecord(r: TurretRecord): string {
  const row: Row = [SCHEMA, r.entityId ?? "", r.ammo, r.kills];
  return JSON.stringify(row);
}

export type DecodeResult =
  | { ok: true; record: TurretRecord }
  | { ok: false; reason: "corrupt" | "newer-schema" };

/**
 * Decode a stored row for the position its key names.
 *
 * Refuses rows from a newer schema rather than guessing at them: the block
 * dynamic-property format already changed once during its experimental period
 * and destroyed saved data, and a record silently misread as "no ammo, no
 * entity" would respawn a duplicate turret.
 */
export function decodeRecord(pos: Position, raw: unknown): DecodeResult {
  if (typeof raw !== "string") return { ok: false, reason: "corrupt" };
  let row: unknown;
  try {
    row = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (!Array.isArray(row) || row.length < 4) return { ok: false, reason: "corrupt" };
  const [schema, entityId, ammo, kills] = row as unknown[];
  if (typeof schema !== "number") return { ok: false, reason: "corrupt" };
  if (schema > SCHEMA) return { ok: false, reason: "newer-schema" };
  if (typeof entityId !== "string" || typeof ammo !== "number" || typeof kills !== "number") {
    return { ok: false, reason: "corrupt" };
  }
  return {
    ok: true,
    record: {
      ...pos,
      entityId: entityId === "" ? undefined : entityId,
      ammo: Math.max(0, Math.floor(ammo)),
      kills: Math.max(0, Math.floor(kills)),
    },
  };
}

export function samePosition(a: Position, b: Position): boolean {
  return a.dimId === b.dimId && a.x === b.x && a.y === b.y && a.z === b.z;
}
