/**
 * The per-post record and its storage encoding. Pure - no @minecraft imports.
 *
 * A job post is the anchor of one person (docs/design/villages.md §4): the
 * block is placed by the world generator or a player, and the record says
 * which person it is responsible for. Rows live in the shared position index
 * (`packages/shared/engine/positionIndex.ts`), one world dynamic property,
 * schema-versioned.
 */

/**
 * Bump when the packed row changes shape. The index refuses newer schemas;
 * older rows are read with their missing fields defaulted (schema 1 rows
 * had no trade, and a worker with no trade surveys on its next tick).
 */
export const SCHEMA = 2;

export const PEOPLES = ["stonefolk", "reedfolk", "tinker", "tallfolk", "drover"] as const;
export const JOBS = ["guard", "worker", "trader", "builder"] as const;
/** Index into JOBS of the one job that takes a trade (docs/design/villages.md §5.1). */
export const WORKER = 1;
/** What a worker does, read off the blocks round its post. Index into TRADES. */
export const TRADES = ["none", "lumberjack", "farmer"] as const;

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
  /** Index into TRADES; 0 (none) until a worker's post has been surveyed. */
  trade: number;
  /** Tick the surroundings were last surveyed for a trade; 0 if never. */
  surveyedAt: number;
  /** Tick the last work cycle finished; 0 if never, which makes the first cycle due at once. */
  cycleAt: number;
}

export type Row = [
  dimId: string,
  x: number,
  y: number,
  z: number,
  people: number,
  job: number,
  entityId: string,
  spawnedAt: number,
  trade: number,
  surveyedAt: number,
  cycleAt: number,
];

export function packRecord(r: PostRecord): Row {
  return [r.dimId, r.x, r.y, r.z, r.people, r.job, r.entityId ?? "", r.spawnedAt, r.trade, r.surveyedAt, r.cycleAt];
}

/** Decode one packed row. A malformed row is dropped: a misread post would spawn a stranger. */
export function unpackRecord(packed: unknown): PostRecord | undefined {
  if (!Array.isArray(packed) || packed.length < 8) return undefined;
  const [dimId, x, y, z, people, job, entityId, spawnedAt, trade = 0, surveyedAt = 0, cycleAt = 0] = packed as unknown[];
  if (typeof dimId !== "string" || dimId === "") return undefined;
  const int = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
  if (![x, y, z, people, job, spawnedAt, trade, surveyedAt, cycleAt].every(int)) return undefined;
  if (typeof entityId !== "string") return undefined;
  const p = people as number, j = job as number, t = trade as number;
  if (p < 0 || p >= PEOPLES.length || j < 0 || j >= JOBS.length || t < 0 || t >= TRADES.length) return undefined;
  return {
    dimId, x: x as number, y: y as number, z: z as number, people: p, job: j,
    entityId: entityId || undefined, spawnedAt: spawnedAt as number,
    trade: t, surveyedAt: surveyedAt as number, cycleAt: cycleAt as number,
  };
}
