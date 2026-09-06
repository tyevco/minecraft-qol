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
export const SCHEMA = 4;

/**
 * Append-only (docs/design/furfolk.md §4): the index is in every post's row,
 * in the block's `villages:people` state on every generated village and in
 * the entity property of every person alive. The nine humans keep 0-8; the
 * ten furfolk follow from 9 in the design's order.
 */
export const PEOPLES = [
  "stonefolk", "reedfolk", "tinker", "tallfolk", "hobbit", "wood_elf", "high_elf", "drow", "drover",
  "foxfolk", "catfolk", "wolffolk", "rabbitfolk", "bearfolk", "fennecfolk", "mousefolk", "squirrelfolk", "otterfolk", "deerfolk",
] as const;
/** What a person is called, by people: its name tag, shown when a player looks at it. */
export const PEOPLE_NAMES: Readonly<Record<(typeof PEOPLES)[number], string>> = {
  stonefolk: "Stonefolk", reedfolk: "Reedfolk", tinker: "Tinker", tallfolk: "Tallfolk", hobbit: "Hobbit",
  wood_elf: "Wood Elf", high_elf: "High Elf", drow: "Drow", drover: "Drover",
  foxfolk: "Foxfolk", catfolk: "Catfolk", wolffolk: "Wolffolk", rabbitfolk: "Rabbitfolk", bearfolk: "Bearfolk",
  fennecfolk: "Fennecfolk", mousefolk: "Mousefolk", squirrelfolk: "Squirrelfolk", otterfolk: "Otterfolk", deerfolk: "Deerfolk",
};
export const peopleName = (people: number): string => PEOPLE_NAMES[PEOPLES[people] ?? "stonefolk"];

/**
 * The block carries the people index in two states, because a block state
 * may list at most sixteen values (BDS 1.26.45 rejects a longer list and the
 * block does not load; docs/README.md corrections). `villages:people` is
 * the low four bits and `villages:page` the rest; a post from before the
 * page state existed has none, which the engine reads as 0, so the nine
 * humans' villages are unchanged.
 */
export const PEOPLE_PER_PAGE = 16;
export const PEOPLE_STATE = "villages:people", PAGE_STATE = "villages:page";
export const peopleStates = (people: number): { [PEOPLE_STATE]: number; [PAGE_STATE]: number } => ({
  [PEOPLE_STATE]: people % PEOPLE_PER_PAGE,
  [PAGE_STATE]: Math.floor(people / PEOPLE_PER_PAGE),
});
export const peopleIndex = (people: number, page: number): number => page * PEOPLE_PER_PAGE + people;
export const JOBS = ["guard", "worker", "trader", "builder"] as const;
/** Index into JOBS of the one job that takes a trade (docs/design/villages.md §5.1). */
export const WORKER = 1;
/** What a worker does, read off the blocks round its post. Index into TRADES. */
export const TRADES = [
  "none", "lumberjack", "farmer", "miner", "fisher", "rancher",
  // The furfolk's trades (docs/design/furfolk.md §5), appended in the order they were built.
  "forager", "baker", "beekeeper", "cactus cutter", "mushroom picker", "cocoa picker", "gleaner",
] as const;

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
  /** A miner's vein allowance: tick the current day's window opened, and cycles worked in it. */
  veinAt: number;
  veinCycles: number;
  /**
   * Who placed the post: the world generator (or /setblock, a structure
   * load) or a player. A player's post is the kids' own (docs/design/
   * villages.md §6.1): it spawns nobody and waits for a visitor to settle.
   */
  placedBy: number;
}
export const PLACED_BY_WORLD = 0, PLACED_BY_PLAYER = 1;

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
  veinAt: number,
  veinCycles: number,
  placedBy: number,
];

export function packRecord(r: PostRecord): Row {
  return [r.dimId, r.x, r.y, r.z, r.people, r.job, r.entityId ?? "", r.spawnedAt, r.trade, r.surveyedAt, r.cycleAt, r.veinAt, r.veinCycles, r.placedBy];
}

/** A record's non-position fields as a new post has them. */
export const FRESH = { spawnedAt: 0, trade: 0, surveyedAt: 0, cycleAt: 0, veinAt: 0, veinCycles: 0, placedBy: PLACED_BY_WORLD } as const;

/**
 * Every stamp is a `system.currentTick`, which counts from the server's
 * boot, so after a restart a stamp from the last boot is meaningless. The
 * old heuristic read a stamp *ahead* of the clock as a restart, which only
 * holds until the new clock passes it: a stamp written seconds into one boot
 * is behind the next boot's clock within seconds, and the record then waits
 * its whole interval (measured, issue #71). So the engine keeps the last
 * tick it saw in a world property; a stored tick ahead of the clock at load
 * is a restart, and every record's waits are treated as over.
 */
export const clockRestarted = (lastTick: unknown, now: number): boolean => typeof lastTick === "number" && lastTick > now;

/** The record as a restart leaves it: every wait over, the trade and the person kept. */
export function afterRestart(r: PostRecord): void {
  r.spawnedAt = 0;
  r.surveyedAt = 0;
  r.cycleAt = 0;
  r.veinAt = 0;
  r.veinCycles = 0;
}

/** Decode one packed row. A malformed row is dropped: a misread post would spawn a stranger. */
export function unpackRecord(packed: unknown): PostRecord | undefined {
  if (!Array.isArray(packed) || packed.length < 8) return undefined;
  const [dimId, x, y, z, people, job, entityId, spawnedAt, trade = 0, surveyedAt = 0, cycleAt = 0, veinAt = 0, veinCycles = 0, placedBy = PLACED_BY_WORLD] = packed as unknown[];
  if (typeof dimId !== "string" || dimId === "") return undefined;
  const int = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
  if (![x, y, z, people, job, spawnedAt, trade, surveyedAt, cycleAt, veinAt, veinCycles, placedBy].every(int)) return undefined;
  if (typeof entityId !== "string") return undefined;
  const p = people as number, j = job as number, t = trade as number;
  if (p < 0 || p >= PEOPLES.length || j < 0 || j >= JOBS.length || t < 0 || t >= TRADES.length) return undefined;
  return {
    dimId, x: x as number, y: y as number, z: z as number, people: p, job: j,
    entityId: entityId || undefined, spawnedAt: spawnedAt as number,
    trade: t, surveyedAt: surveyedAt as number, cycleAt: cycleAt as number,
    veinAt: veinAt as number, veinCycles: veinCycles as number,
    placedBy: placedBy === PLACED_BY_PLAYER ? PLACED_BY_PLAYER : PLACED_BY_WORLD,
  };
}
