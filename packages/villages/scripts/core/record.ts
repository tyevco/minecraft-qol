/**
 * The per-post record and its storage encoding. Pure - no @minecraft imports.
 *
 * A job post is the anchor of one person (docs/design/villages.md §4): the
 * block is placed by the world generator or a player, and the record says
 * which person it is responsible for. Rows live in the shared position index
 * (`packages/shared/engine/positionIndex.ts`), one world dynamic property,
 * schema-versioned.
 */

/** Bump when the packed row changes shape. The index refuses newer schemas. */
export const SCHEMA = 1;

export const PEOPLES = ["stonefolk", "reedfolk", "tinker", "tallfolk"] as const;
export const JOBS = ["guard", "worker", "trader", "builder"] as const;

export interface Position {
  dimId: string;
  x: number;
  y: number;
  z: number;
}

export interface PostRecord extends Position {
  /** Index into PEOPLES, from the block's `villages:people` state. */
  people: number;
  /** Index into JOBS, from the block's `villages:job` state. */
  job: number;
  /** The person this post spawned, once it has. */
  entityId?: string;
  /** Tick the person was last spawned at; 0 if never. */
  spawnedAt: number;
}

export type Row = [dimId: string, x: number, y: number, z: number, people: number, job: number, entityId: string, spawnedAt: number];

export function packRecord(r: PostRecord): Row {
  return [r.dimId, r.x, r.y, r.z, r.people, r.job, r.entityId ?? "", r.spawnedAt];
}

/** Decode one packed row. A malformed row is dropped: a misread post would spawn a stranger. */
export function unpackRecord(packed: unknown): PostRecord | undefined {
  if (!Array.isArray(packed) || packed.length < 8) return undefined;
  const [dimId, x, y, z, people, job, entityId, spawnedAt] = packed as unknown[];
  if (typeof dimId !== "string" || dimId === "") return undefined;
  if (![x, y, z, people, job, spawnedAt].every((n) => typeof n === "number" && Number.isInteger(n))) return undefined;
  if (typeof entityId !== "string") return undefined;
  const p = people as number, j = job as number;
  if (p < 0 || p >= PEOPLES.length || j < 0 || j >= JOBS.length) return undefined;
  return { dimId, x: x as number, y: y as number, z: z as number, people: p, job: j, entityId: entityId || undefined, spawnedAt: spawnedAt as number };
}
