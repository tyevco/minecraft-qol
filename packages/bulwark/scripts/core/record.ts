/**
 * The per-turret record and its storage encoding. Pure - no @minecraft imports.
 *
 * Records live in the shared position index (`packages/shared/engine/
 * positionIndex.ts`): one world dynamic property holding every row, with a
 * schema version, because `minecraft:block_entity` is still experimental in
 * 26.45 retail (docs/README.md). This file owns the row shape; the index owns
 * where rows live. When block entities reach retail, `engine/storage.ts` is
 * what changes.
 */

import { priorityFromIndex, priorityIndex, type Priority } from "./targeting";
import { BASE_TIERS, isTier, type Tiers } from "./tiers";

/**
 * Bump when the packed row changes shape. The index refuses newer schemas
 * and reads older ones through `unpackRecord`, so a reader that accepts the
 * previous shape is the whole migration. Schema 2 added the four tiers;
 * a schema-1 row reads as tier 1 on every axis. Schema 3 added the targeting
 * priority; an older row reads as nearest.
 */
export const SCHEMA = 3;

export interface Position {
  dimId: string;
  x: number;
  y: number;
  z: number;
}

export interface TurretRecord extends Position {
  /** The paired head, once one has been spawned and linked. */
  entityId?: string;
  /** Arrows buffered, 0..AMMO_CAP. */
  ammo: number;
  /** Kills attributed to this turret by the script-side hook. */
  kills: number;
  /** Upgrade tiers, one per axis (core/tiers.ts). */
  tiers: Tiers;
  /** Targeting priority, chosen on the turret's form (core/targeting.ts). */
  priority: Priority;
}

/** Compact row form. Short: one property holds every turret. */
export type Row = [
  dimId: string,
  x: number,
  y: number,
  z: number,
  entityId: string,
  ammo: number,
  kills: number,
  damage: number,
  rate: number,
  range: number,
  gate: number,
  priority: number,
];

export function packRecord(r: TurretRecord): Row {
  return [
    r.dimId,
    r.x,
    r.y,
    r.z,
    r.entityId ?? "",
    r.ammo,
    r.kills,
    r.tiers.damage,
    r.tiers.rate,
    r.tiers.range,
    r.tiers.gate,
    priorityIndex(r.priority),
  ];
}

/**
 * Decode one packed row. A malformed row is dropped rather than guessed at:
 * a record misread as "no head, no ammo" would spawn a duplicate head.
 */
export function unpackRecord(packed: unknown): TurretRecord | undefined {
  if (!Array.isArray(packed) || packed.length < 7) return undefined;
  const [dimId, x, y, z, entityId, ammo, kills, damage, rate, range, gate, priority] = packed as unknown[];
  if (typeof dimId !== "string" || dimId === "") return undefined;
  if (![x, y, z].every((n) => typeof n === "number" && Number.isInteger(n))) return undefined;
  if (typeof entityId !== "string" || typeof ammo !== "number" || typeof kills !== "number") {
    return undefined;
  }
  return {
    dimId,
    x: x as number,
    y: y as number,
    z: z as number,
    entityId: entityId === "" ? undefined : entityId,
    ammo: Math.max(0, Math.floor(ammo)),
    kills: Math.max(0, Math.floor(kills)),
    // A schema-1 row has no tiers; a malformed tier is the base, not a guess.
    tiers: {
      damage: isTier(damage) ? damage : BASE_TIERS.damage,
      rate: isTier(rate) ? rate : BASE_TIERS.rate,
      range: isTier(range) ? range : BASE_TIERS.range,
      gate: isTier(gate) ? gate : BASE_TIERS.gate,
    },
    priority: priorityFromIndex(priority),
  };
}

/** The head's pointer back to its block, stored as one entity property. */
export function linkKey(pos: Position): string {
  return `${pos.dimId}|${pos.x},${pos.y},${pos.z}`;
}

/** Invert linkKey. Dimension ids contain a colon, so the separator is a pipe. */
export function parseLinkKey(key: string): Position | undefined {
  const split = key.lastIndexOf("|");
  if (split <= 0) return undefined;
  const dimId = key.slice(0, split);
  const parts = key.slice(split + 1).split(",");
  if (parts.length !== 3) return undefined;
  const [x, y, z] = parts.map((p) => (p === "" ? NaN : Number(p)));
  if (![x, y, z].every((n) => Number.isInteger(n))) return undefined;
  return { dimId, x: x!, y: y!, z: z! };
}

export function samePosition(a: Position, b: Position): boolean {
  return a.dimId === b.dimId && a.x === b.x && a.y === b.y && a.z === b.z;
}
