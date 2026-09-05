/**
 * A worker's trade: what it is, from the blocks round its post, and what one
 * work cycle does. Pure - no @minecraft imports - so every decision is under
 * Vitest; engine/trades.ts reads the blocks and makes the changes.
 *
 * docs/design/villages.md §5.1: a worker takes a trade from where its post
 * stands. A lumberjack fells the nearest tree top-down into the nearest
 * chest and plants a sapling on the stump; a farmer harvests mature crops
 * and replants them; a rancher shears the sheep in its pen, which regrow
 * their wool on grass. One cycle per interval (the settings panel), a
 * stack-slot's worth a cycle, the chest checked for room first, and the
 * chest pays the worker one food item a cycle.
 */
import { cropOf, isMature } from "@qol/shared/core/crops";
import { TRADES } from "./record";

export type Trade = (typeof TRADES)[number];
export const NONE = 0, LUMBERJACK = 1, FARMER = 2, RANCHER = 3;
/** Trades the chest pays; the farmer works unpaid, since it is the one filling the larder. */
export const PAID_TRADES: readonly number[] = [LUMBERJACK, RANCHER];

/** How far round the post, horizontally, the survey and the lumberjack look. */
export const SURVEY_RANGE = 16;
/** How far below and above the post the survey looks (trees reach up; fields are level). */
export const SURVEY_BELOW = 4;
export const SURVEY_ABOVE = 12;
/** How far from the post the chest may be, and how far a farmer walks. */
export const CHEST_RANGE = 12;
export const FARM_RANGE = 12;
/** Empty slots a chest must have before a cycle starts: one for the produce, one for a sapling or seeds. */
export const ROOM_NEEDED = 2;
/** Mature crops a farmer takes in one cycle: a stack-slot's worth, not a field. */
export const HARVEST_PER_CYCLE = 8;
/** Sheep a rancher shears in one cycle, and how many grown sheep make a pen. */
export const SHEAR_PER_CYCLE = 8;
export const FLOCK_MIN = 2;
export const RANCH_RANGE = 12;
/** A component of logs bigger than this is a building, not a tree. */
export const MAX_TREE_LOGS = 32;
/** Pacing, in ticks. The work is visible: one log, one row, at a time. */
export const TICKS_PER_LOG = 10;
export const TICKS_PER_CROP = 8;
export const TICKS_PER_SHEEP = 20;
/** How long a worker with nothing to do (no tree, no ripe crop) waits before looking again. */
export const IDLE_TICKS = 1200;
/** A survey is repeated this often; sooner when it found nothing, so a field planted after the post is noticed. */
export const RESURVEY_TICKS = 24000;
export const RESURVEY_NONE_TICKS = 3000;

/** A log block, and the sapling that regrows it. Stripped logs and wood are not trees. */
export const SAPLING_OF: Readonly<Record<string, string>> = {
  "minecraft:oak_log": "minecraft:oak_sapling",
  "minecraft:spruce_log": "minecraft:spruce_sapling",
  "minecraft:birch_log": "minecraft:birch_sapling",
  "minecraft:jungle_log": "minecraft:jungle_sapling",
  "minecraft:acacia_log": "minecraft:acacia_sapling",
  "minecraft:dark_oak_log": "minecraft:dark_oak_sapling",
  "minecraft:cherry_log": "minecraft:cherry_sapling",
  "minecraft:pale_oak_log": "minecraft:pale_oak_sapling",
  "minecraft:mangrove_log": "minecraft:mangrove_propagule",
};
export const LOG_TYPES: readonly string[] = Object.keys(SAPLING_OF);
export const LEAF_TYPES: readonly string[] = [
  "minecraft:oak_leaves", "minecraft:spruce_leaves", "minecraft:birch_leaves", "minecraft:jungle_leaves",
  "minecraft:acacia_leaves", "minecraft:dark_oak_leaves", "minecraft:cherry_leaves", "minecraft:pale_oak_leaves",
  "minecraft:mangrove_leaves", "minecraft:azalea_leaves",
];
/** What a sapling can be planted on: the stump's ground. Anything else, the sapling goes to the chest. */
export const PLANT_ON: readonly string[] = [
  "minecraft:dirt", "minecraft:grass", "minecraft:podzol", "minecraft:coarse_dirt", "minecraft:mud",
  "minecraft:dirt_with_roots", "minecraft:moss_block", "minecraft:mycelium",
];
/** Where produce goes. */
export const CHEST_TYPES: readonly string[] = ["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel"];
/** What a farmer tends: crops the farmer can replant from their own drops (a subset of shared crops.ts). */
export const FARM_CROPS: readonly string[] = ["minecraft:wheat", "minecraft:carrots", "minecraft:potatoes", "minecraft:beetroot"];
export const FARMLAND = "minecraft:farmland";

export interface Vec {
  x: number;
  y: number;
  z: number;
}
export const key = (v: Vec): string => `${v.x},${v.y},${v.z}`;
const dist2 = (a: Vec, b: Vec): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

// ---------------------------------------------------------------------------
// The survey
// ---------------------------------------------------------------------------

export interface Survey {
  farmland: number;
  logs: number;
  leaves: number;
  /** Grown sheep within the survey range. */
  sheep: number;
}

/**
 * Which trade the surroundings offer. A pen of sheep wins outright, since
 * sheep are put there on purpose; a field wins over a few trees, trees win
 * over a stray farmland block; a post beside none of them has no trade and
 * the worker just lives there.
 */
export function chooseTrade(s: Survey): number {
  if (s.sheep >= FLOCK_MIN) return RANCHER;
  if (s.farmland >= 8) return FARMER;
  if (s.logs >= 4 && s.leaves >= 4) return LUMBERJACK;
  if (s.farmland >= 1) return FARMER;
  return NONE;
}

export function surveyDue(record: { trade: number; surveyedAt: number }, now: number): boolean {
  if (record.surveyedAt === 0) return true;
  return now >= record.surveyedAt + (record.trade === NONE ? RESURVEY_NONE_TICKS : RESURVEY_TICKS);
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

export interface LogBlock {
  pos: Vec;
  typeId: string;
}

export interface Tree {
  /** The lowest log: the stump, where the sapling goes. */
  base: Vec;
  /** Every log, top down: the felling order. */
  logs: LogBlock[];
  sapling: string;
}

const SIDES: readonly Vec[] = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];

/**
 * Group logs into trees. A tree is a connected set of logs (face-adjacent),
 * no bigger than MAX_TREE_LOGS, with leaves touching it somewhere - which is
 * what keeps a log-built house, a fence of logs or a stack in a yard off
 * the lumberjack's list. Oversized components are dropped whole.
 */
export function findTrees(logs: readonly LogBlock[], leaves: ReadonlySet<string>): Tree[] {
  const byKey = new Map<string, LogBlock>();
  for (const l of logs) byKey.set(key(l.pos), l);
  const seen = new Set<string>();
  const trees: Tree[] = [];
  for (const start of logs) {
    const k = key(start.pos);
    if (seen.has(k)) continue;
    const group: LogBlock[] = [];
    const queue = [start];
    seen.add(k);
    let touchesLeaves = false;
    let tooBig = false;
    while (queue.length) {
      const cur = queue.pop()!;
      group.push(cur);
      if (group.length > MAX_TREE_LOGS) tooBig = true;
      for (const d of SIDES) {
        const n = { x: cur.pos.x + d.x, y: cur.pos.y + d.y, z: cur.pos.z + d.z };
        const nk = key(n);
        if (leaves.has(nk)) touchesLeaves = true;
        const log = byKey.get(nk);
        if (log && !seen.has(nk)) {
          seen.add(nk);
          queue.push(log);
        }
      }
    }
    if (tooBig || !touchesLeaves) continue;
    const ordered = fellOrder(group);
    const base = group.reduce((lo, l) => (l.pos.y < lo.pos.y ? l : lo), group[0]!);
    trees.push({ base: base.pos, logs: ordered, sapling: SAPLING_OF[base.typeId] ?? "minecraft:oak_sapling" });
  }
  return trees;
}

/** Top down, and the outermost first within a layer, so a branch comes off before the trunk under it. */
export function fellOrder(logs: readonly LogBlock[]): LogBlock[] {
  const cx = logs.reduce((s, l) => s + l.pos.x, 0) / logs.length;
  const cz = logs.reduce((s, l) => s + l.pos.z, 0) / logs.length;
  const spread = (l: LogBlock) => (l.pos.x - cx) ** 2 + (l.pos.z - cz) ** 2;
  return [...logs].sort((a, b) => b.pos.y - a.pos.y || spread(b) - spread(a) || a.pos.x - b.pos.x || a.pos.z - b.pos.z);
}

export function nearestTree(trees: readonly Tree[], from: Vec): Tree | undefined {
  let best: Tree | undefined;
  let bestD = Infinity;
  for (const t of trees) {
    const d = dist2(t.base, from);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

export interface FellPlan {
  order: LogBlock[];
  /** Plant the sapling on the stump (the ground under the base allows it). */
  plant: boolean;
  /** A second sapling for the chest, one time in three - the design's "a sapling one time in three". */
  spare: boolean;
}

export function fellPlan(tree: Tree, groundType: string, rand: () => number): FellPlan {
  return { order: tree.logs, plant: PLANT_ON.includes(groundType), spare: rand() < 1 / 3 };
}

/**
 * Where the worker stands to work at `target`: the block beside it on the
 * side facing `from` (its post), so it is not inside the trunk.
 */
export function standingSpot(target: Vec, from: Vec): Vec {
  const dx = from.x - target.x, dz = from.z - target.z;
  const sx = Math.abs(dx) >= Math.abs(dz) ? Math.sign(dx) || 1 : 0;
  const sz = sx === 0 ? Math.sign(dz) || 1 : 0;
  return { x: target.x + sx + 0.5, y: target.y, z: target.z + sz + 0.5 };
}

// ---------------------------------------------------------------------------
// Crops
// ---------------------------------------------------------------------------

export interface CropTile {
  pos: Vec;
  typeId: string;
  age: number;
}

/** The mature tiles nearest the post, up to a cycle's worth. */
export function harvestPlan(tiles: readonly CropTile[], from: Vec, limit = HARVEST_PER_CYCLE): CropTile[] {
  const ripe = tiles.filter((t) => {
    const crop = cropOf(t.typeId);
    return crop !== undefined && FARM_CROPS.includes(t.typeId) && isMature(crop, t.age);
  });
  ripe.sort((a, b) => dist2(a.pos, from) - dist2(b.pos, from) || a.pos.x - b.pos.x || a.pos.z - b.pos.z);
  return ripe.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Sheep
// ---------------------------------------------------------------------------

export interface Sheep {
  id: string;
  pos: Vec;
  /** The `minecraft:color` value, 0 to 15 in the dye order. */
  color: number;
  sheared: boolean;
  baby: boolean;
}

/** The wool a colour value shears to: the dye order the game uses for `minecraft:color`. */
export const WOOL: readonly string[] = [
  "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
  "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black",
].map((c) => `minecraft:${c}_wool`);

export function woolOf(color: number): string {
  return WOOL[Number.isInteger(color) && color >= 0 && color < WOOL.length ? color : 0]!;
}

/** Shearing a sheep gives one to three wool, as the game's own shears do. */
export function shearYield(rand: () => number): number {
  return 1 + Math.floor(rand() * 3);
}

/** The grown, unshorn sheep nearest the post, up to a cycle's worth. Lambs and shorn sheep are left alone. */
export function shearPlan(flock: readonly Sheep[], from: Vec, limit = SHEAR_PER_CYCLE): Sheep[] {
  const ready = flock.filter((s) => !s.sheared && !s.baby);
  ready.sort((a, b) => dist2(a.pos, from) - dist2(b.pos, from) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return ready.slice(0, limit);
}

// ---------------------------------------------------------------------------
// The chest, the wage, the cycle
// ---------------------------------------------------------------------------

export interface Slot {
  typeId: string;
  amount: number;
  food: boolean;
}

export interface ChestView {
  emptySlots: number;
  slots: readonly (Slot | undefined)[];
}

/** The slot the wage comes from: the first food. */
export function pickWage(slots: readonly (Slot | undefined)[]): number | undefined {
  const i = slots.findIndex((s) => s !== undefined && s.food && s.amount > 0);
  return i < 0 ? undefined : i;
}

/** The slot a seed for a bare tile comes from, when the harvest rolled none. */
export function pickSeed(slots: readonly (Slot | undefined)[], seed: string): number | undefined {
  const i = slots.findIndex((s) => s !== undefined && s.typeId === seed && s.amount > 0);
  return i < 0 ? undefined : i;
}

export type WaitReason = "interval" | "no chest" | "chest full" | "no wage";
export type CycleVerdict = { kind: "work" } | { kind: "wait"; reason: WaitReason };

export const minutesToTicks = (minutes: number): number => Math.max(1, Math.round(minutes * 1200));

export function cycleDue(record: { cycleAt: number }, now: number, intervalTicks: number): boolean {
  return record.cycleAt === 0 || now >= record.cycleAt + intervalTicks;
}

/**
 * May a cycle start? The chest must exist and have room (nothing is ever
 * lost: a full chest means the worker waits), and if wages are on, a
 * lumberjack or a rancher must be fed - the farmer works unpaid, since it
 * is the one filling the larder.
 */
export function canWork(trade: number, chest: ChestView | undefined, wages: boolean): CycleVerdict {
  if (!chest) return { kind: "wait", reason: "no chest" };
  if (chest.emptySlots < ROOM_NEEDED) return { kind: "wait", reason: "chest full" };
  if (wages && PAID_TRADES.includes(trade) && pickWage(chest.slots) === undefined) return { kind: "wait", reason: "no wage" };
  return { kind: "work" };
}

export const tradeName = (trade: number): Trade => TRADES[trade] ?? "none";
