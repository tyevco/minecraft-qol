/**
 * A worker's trade: what it is, from the blocks round its post, and what one
 * work cycle does. Pure - no @minecraft imports - so every decision is under
 * Vitest; engine/trades.ts reads the blocks and makes the changes.
 *
 * docs/design/villages.md §5.1: a worker takes a trade from where its post
 * stands. A lumberjack fells the nearest tree top-down into the nearest
 * chest and plants a sapling on the stump; a farmer harvests mature crops
 * and replants them. One cycle per interval (the settings panel), a
 * stack-slot's worth a cycle, the chest checked for room first, and the
 * chest pays the worker one food item a cycle.
 */
import { cropOf, isMature } from "@qol/shared/core/crops";
import { TRADES } from "./record";

export type Trade = (typeof TRADES)[number];
export const NONE = 0, LUMBERJACK = 1, FARMER = 2, MINER = 3, FISHER = 4, RANCHER = 5;
/** The furfolk's trades (docs/design/furfolk.md §5). */
export const FORAGER = 6, BAKER = 7, BEEKEEPER = 8, CUTTER = 9, PICKER = 10, COCOA = 11, GLEANER = 12;

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
export const TICKS_PER_SHEEP = 20;
/** A component of logs bigger than this is a building, not a tree. */
export const MAX_TREE_LOGS = 32;
/** Pacing, in ticks. The work is visible: one log, one row, at a time. */
export const TICKS_PER_LOG = 10;
export const TICKS_PER_CROP = 8;
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

/** The vein: a fixture the mine piece carries (and a player can place), never terrain. */
export const VEIN = "villages:vein";
export const ORE_STATE = "villages:ore";
export const ORES = ["stone", "coal", "iron", "copper"] as const;
/** What a cycle at a vein yields: a stack-slot's worth, scaled to the ore's worth. */
export const MINE_YIELD: Readonly<Record<(typeof ORES)[number], { typeId: string; amount: number }>> = {
  stone: { typeId: "minecraft:cobblestone", amount: 8 },
  coal: { typeId: "minecraft:coal", amount: 6 },
  iron: { typeId: "minecraft:raw_iron", amount: 3 },
  copper: { typeId: "minecraft:raw_copper", amount: 4 },
};
/** A vein's daily yield, in cycles; after that the miner idles until the window rolls over. */
export const VEIN_CYCLES_PER_DAY = 4;
export const VEIN_WINDOW = 24000;
/**
 * A vein must be in a cave or a mine, not out in the open: something solid
 * over it and over the miner's standing spot, within this many blocks up.
 */
export const ROOF_SPAN = 48;
/** What does not count as a roof: sky, and what the sky shows through. */
export const OPEN_TYPES: readonly string[] = [
  "minecraft:air", "minecraft:water", "minecraft:flowing_water", "minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern",
  "minecraft:snow_layer", "minecraft:vine", "minecraft:glow_lichen", "minecraft:torch",
];
/** Swings at the vein or the water before the cycle's produce appears. */
export const WORK_SWINGS = 8;
export const TICKS_PER_SWING = 8;

export const WATER_TYPES: readonly string[] = ["minecraft:water", "minecraft:flowing_water"];

// The furfolk's fixtures (docs/design/furfolk.md §5). Each threshold is set
// above what another people's pieces put near their own posts by accident: an
// orchard scatters four berry bushes, a drover's scrub has six cactus blocks,
// so the fox patch's twelve bushes and the fennec garden's thirty cactus are
// what count. A hive, a cocoa pod or an oven is placed on purpose, so one is
// enough (four pods, since a cocoa grove has eight).
/** The forager: sweet berry bushes, `growth` 3 ripe; picked back to 1, as a player's hand leaves it. */
export const BERRY_BUSH = "minecraft:sweet_berry_bush";
export const BERRY_STATE = "growth";
export const BERRY_RIPE = 3;
export const BERRY_PICKED = 1;
export const BERRIES = "minecraft:sweet_berries";
export const PATCH_MIN = 8;
export const BUSHES_PER_CYCLE = 8;
export const TICKS_PER_BUSH = 8;
/** The baker: an oven within eight, three wheat a loaf, and the oven lit while the loaves bake. */
export const OVEN_RANGE = 8;
export const WHEAT = "minecraft:wheat", BREAD = "minecraft:bread";
export const WHEAT_PER_LOAF = 3;
export const LOAVES_PER_CYCLE = 8;
export const TICKS_PER_LOAF = 20;
/** An unlit oven and what it is lit as (and back). Blast furnaces smelt ore, not bread. */
export const LIT_OF: Readonly<Record<string, string>> = { "minecraft:furnace": "minecraft:lit_furnace", "minecraft:smoker": "minecraft:lit_smoker" };
export const UNLIT_OF: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(LIT_OF).map(([k, v]) => [v, k]));
export const OVEN_TYPES: readonly string[] = [...Object.keys(LIT_OF), ...Object.values(LIT_OF)];
export const OVEN_FACING = "minecraft:cardinal_direction";
/** The beekeeper: a hive at `honey_level` 5, one glass bottle in, one honey bottle out, one hive a cycle. */
export const HIVE_TYPES: readonly string[] = ["minecraft:beehive", "minecraft:bee_nest"];
export const HONEY_STATE = "honey_level";
export const HONEY_FULL = 5;
export const GLASS_BOTTLE = "minecraft:glass_bottle", HONEY_BOTTLE = "minecraft:honey_bottle";
/** The cactus cutter: columns two or more tall, cut down to the base, top down, one block every eight ticks. */
export const CACTUS = "minecraft:cactus";
export const CACTUS_MIN = 8;
export const CUTS_PER_CYCLE = 8;
export const TICKS_PER_CUT = 8;
/** The mushroom picker: small mushrooms on mycelium, at least four left standing to spread from. */
export const MUSHROOM_TYPES: readonly string[] = ["minecraft:brown_mushroom", "minecraft:red_mushroom"];
export const MYCELIUM = "minecraft:mycelium";
export const MUSHROOMS_MIN = 4;
export const MUSHROOMS_KEPT = 4;
export const MUSHROOMS_PER_CYCLE = 8;
export const TICKS_PER_MUSHROOM = 8;
/** The cocoa picker: ripe pods (shared crops.ts knows cocoa), replanted from their own beans like a farmer's tile. */
export const COCOA_POD = "minecraft:cocoa";
export const PODS_MIN = 4;
export const PODS_PER_CYCLE = 8;
/**
 * The gleaner: a hedge of oak leaves. A hedge is leaves somebody placed,
 * which the game marks `persistent_bit`; a tree's leaves are not persistent
 * (the pieces' trees are authored that way so a felled crown decays), so a
 * hedge is a fixture and a tree is a tree. Measured in a placed deerfolk
 * village: counting every oak leaf made all four hedge workers lumberjacks,
 * since a village has trees within sixteen blocks of everything. One apple a
 * cycle per eight leaves, up to four - the design's flat alternative to
 * rolling each leaf's own 1-in-200, which from a hedge of fifty would be an
 * apple every fourth cycle and invisible.
 */
export const OAK_LEAVES = "minecraft:oak_leaves";
export const PERSISTENT_STATE = "persistent_bit";
export const APPLE = "minecraft:apple";
export const HEDGE_MIN = 16;
export const LEAVES_PER_APPLE = 8;
export const APPLES_PER_CYCLE = 4;

/**
 * The walk. A person walks to its work and back (engine/walk.ts) rather
 * than appearing there, so a route through the dark is the player's to
 * secure. `WALK_TIMEOUT` is how long a walk may take before the cycle is
 * given up; `ARRIVE_RADIUS` how close counts as there.
 */
export const WALK_TIMEOUT = 600;
export const WALK_POLL = 5;
export const ARRIVE_RADIUS = 2;
/** After a walk that could not be started or completed, wait this long before the next try. */
export const WALK_RETRY_TICKS = 200;
/** A cycle's catch, and what it can be. */
export const FISH_PER_CYCLE = 4;
export const COD = "minecraft:cod", SALMON = "minecraft:salmon";
export const TREASURES: readonly string[] = ["minecraft:nautilus_shell", "minecraft:name_tag", "minecraft:saddle"];
export const TREASURE_CHANCE = 1 / 8;
/** Blocks nobody stands on: what a fishing spot's footing must not be. */
export const NOT_FOOTING: readonly string[] = [
  "minecraft:air", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava",
  "minecraft:waterlily", "minecraft:reeds", "minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern",
];

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
  veins: number;
  water: number;
  /** Grown sheep within the survey range. */
  sheep: number;
  /** The furfolk's fixtures: berry bushes, ovens (within OVEN_RANGE), full or not hives, cactus blocks, small mushrooms on mycelium, cocoa pods, persistent oak leaves. */
  bushes: number;
  ovens: number;
  hives: number;
  cactus: number;
  mushrooms: number;
  pods: number;
  hedge: number;
}

/** A survey with nothing round the post; a caller fills in what it counted. */
export const EMPTY_SURVEY: Survey = { farmland: 0, logs: 0, leaves: 0, veins: 0, water: 0, sheep: 0, bushes: 0, ovens: 0, hives: 0, cactus: 0, mushrooms: 0, pods: 0, hedge: 0 };

/**
 * Which trade the surroundings offer, strongest signal first. Fixtures that
 * are only ever placed on purpose come first: a vein, a hive, a cocoa grove,
 * an oven, a pen of sheep, a berry patch, a mushroom bed, and after a field
 * a hedge (leaves placed by hand are persistent; a tree's are not, so an
 * orchard of oaks is still felled and only a hedge is gleaned). Then the
 * land: a field beats a few trees; open water (a marsh, a river) beats
 * trees, since a reedfolk dock stands among mangroves; trees beat a pond; a
 * stray farmland block still makes a farmer. A cactus garden ranks under a
 * field, so a drover's corral beside its scrub stays a farmer. A post beside
 * none of these has no trade, and the worker just lives there.
 */
export function chooseTrade(s: Survey): number {
  if (s.veins >= 1) return MINER;
  if (s.hives >= 1) return BEEKEEPER;
  if (s.pods >= PODS_MIN) return COCOA;
  if (s.ovens >= 1) return BAKER;
  if (s.sheep >= FLOCK_MIN) return RANCHER;
  if (s.bushes >= PATCH_MIN) return FORAGER;
  if (s.mushrooms >= MUSHROOMS_MIN) return PICKER;
  if (s.farmland >= 8) return FARMER;
  if (s.hedge >= HEDGE_MIN) return GLEANER;
  if (s.cactus >= CACTUS_MIN) return CUTTER;
  if (s.water >= 16) return FISHER;
  if (s.logs >= 4 && s.leaves >= 4) return LUMBERJACK;
  if (s.water >= 4) return FISHER;
  if (s.farmland >= 1) return FARMER;
  return NONE;
}

/** A stamp ahead of the clock: the clock restarted (system.currentTick counts from boot), so the wait is over. */
const elapsed = (stamp: number, now: number, wait: number): boolean => stamp === 0 || stamp > now || now >= stamp + wait;

export function surveyDue(record: { trade: number; surveyedAt: number }, now: number): boolean {
  return elapsed(record.surveyedAt, now, record.trade === NONE ? RESURVEY_NONE_TICKS : RESURVEY_TICKS);
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

/** The first slot holding `typeId`: a seed for a bare tile, the baker's wheat, the beekeeper's bottle. */
export function pickItem(slots: readonly (Slot | undefined)[], typeId: string): number | undefined {
  const i = slots.findIndex((s) => s !== undefined && s.typeId === typeId && s.amount > 0);
  return i < 0 ? undefined : i;
}
/** The slot a seed for a bare tile comes from, when the harvest rolled none. */
export const pickSeed = pickItem;

/** How many of `typeId` the chest holds, across its slots. */
export function countItem(slots: readonly (Slot | undefined)[], typeId: string): number {
  let n = 0;
  for (const s of slots) if (s && s.typeId === typeId) n += s.amount;
  return n;
}

export type WaitReason = "interval" | "no chest" | "chest full" | "no wage";
export type CycleVerdict = { kind: "work" } | { kind: "wait"; reason: WaitReason };

export const minutesToTicks = (minutes: number): number => Math.max(1, Math.round(minutes * 1200));

export function cycleDue(record: { cycleAt: number }, now: number, intervalTicks: number): boolean {
  return elapsed(record.cycleAt, now, intervalTicks);
}

/**
 * The trades that fill the larder work unpaid; the rest are paid from it.
 * Berries, bread, honey, apples and fish are food; the mice's mushrooms
 * become stew, so the picker fills the larder too. Cactus and cocoa beans
 * feed nobody, so those two wait for food the way a stonefolk grove does.
 */
export const paid = (trade: number): boolean => trade === LUMBERJACK || trade === MINER || trade === RANCHER || trade === CUTTER || trade === COCOA;

/**
 * May a cycle start? The chest must exist and have room (nothing is ever
 * lost: a full chest means the worker waits), and if wages are on, a paid
 * trade must be fed - the farmer and the fisher work unpaid, since they
 * are the ones filling the larder.
 */
export function canWork(trade: number, chest: ChestView | undefined, wages: boolean): CycleVerdict {
  if (!chest) return { kind: "wait", reason: "no chest" };
  if (chest.emptySlots < ROOM_NEEDED) return { kind: "wait", reason: "chest full" };
  if (wages && paid(trade) && pickWage(chest.slots) === undefined) return { kind: "wait", reason: "no wage" };
  return { kind: "work" };
}

// ---------------------------------------------------------------------------
// The vein
// ---------------------------------------------------------------------------

export interface VeinAllowance {
  /** Whether a cycle may be worked now. */
  allowed: boolean;
  /** The record's window fields after this cycle is counted (unchanged when not allowed). */
  veinAt: number;
  veinCycles: number;
}

/**
 * A vein yields VEIN_CYCLES_PER_DAY cycles per day-long window, counted on
 * the post. The window is a span of ticks rather than the world's day, so a
 * world with the daylight cycle locked still rolls over; a restarted clock
 * opens a fresh window.
 */
export function veinAllowance(record: { veinAt: number; veinCycles: number }, now: number): VeinAllowance {
  const fresh = elapsed(record.veinAt, now, VEIN_WINDOW);
  const cycles = fresh ? 0 : record.veinCycles;
  if (cycles >= VEIN_CYCLES_PER_DAY) return { allowed: false, veinAt: record.veinAt, veinCycles: record.veinCycles };
  return { allowed: true, veinAt: fresh ? now : record.veinAt, veinCycles: cycles + 1 };
}

/** Whether there is a roof over `v`: any block that is not sky-through within ROOF_SPAN above it. */
export function roofed(v: Vec, typeAt: (v: Vec) => string | undefined, span = ROOF_SPAN): boolean {
  for (let y = v.y + 1; y <= v.y + span; y++) {
    const t = typeAt({ x: v.x, y, z: v.z });
    if (t === undefined) return false; // the world's top, or unloaded: no roof seen
    if (t !== "minecraft:air" && !LEAF_TYPES.includes(t) && !OPEN_TYPES.includes(t)) return true;
  }
  return false;
}

/** A vein counts only in a cave or a mine: roofed, with the miner's standing spot roofed too. */
export function veinEnclosed(vein: Vec, from: Vec, typeAt: (v: Vec) => string | undefined): boolean {
  const stand = standingSpot(vein, from);
  return roofed(vein, typeAt) && roofed({ x: Math.floor(stand.x), y: stand.y, z: Math.floor(stand.z) }, typeAt);
}

/** Has the walker arrived: within ARRIVE_RADIUS horizontally and a couple of blocks vertically of the spot? */
export function arrived(at: Vec, spot: Vec, radius = ARRIVE_RADIUS): boolean {
  const dx = at.x - spot.x, dz = at.z - spot.z;
  return dx * dx + dz * dz <= radius * radius && Math.abs(at.y - spot.y) <= 2;
}

export function nearestOf<T extends { pos: Vec }>(items: readonly T[], from: Vec): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const it of items) {
    const d = dist2(it.pos, from);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}

/** What a cycle at a vein of `ore` produces; an unknown ore state yields stone. */
export function mineYield(ore: unknown): { typeId: string; amount: number } {
  const key = typeof ore === "string" && (ORES as readonly string[]).includes(ore) ? (ore as (typeof ORES)[number]) : "stone";
  return MINE_YIELD[key];
}

// ---------------------------------------------------------------------------
// The water
// ---------------------------------------------------------------------------

export interface FishingSpot {
  /** Where the fisher stands (a block with footing under it and air in it). */
  stand: Vec;
  /** The water fished. */
  water: Vec;
}

/**
 * Where to fish from: beside a water block, on a bank at the water's own
 * level (footing at the water's height, air above), or on a deck up to
 * three blocks over it (the reedfolk way). Nearest to the post wins.
 * `typeAt` reads a block's type; the pure code never touches the world.
 */
export function fishingSpot(waters: readonly Vec[], typeAt: (v: Vec) => string | undefined, from: Vec): FishingSpot | undefined {
  const footing = (v: Vec): boolean => {
    const t = typeAt(v);
    return t !== undefined && !NOT_FOOTING.includes(t);
  };
  const open = (v: Vec): boolean => typeAt(v) === "minecraft:air";
  const spots: FishingSpot[] = [];
  for (const w of waters) {
    if (!open({ x: w.x, y: w.y + 1, z: w.z })) continue; // not the surface
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const bank = { x: w.x + dx, y: w.y, z: w.z + dz };
      const stand = { x: bank.x, y: bank.y + 1, z: bank.z };
      if (footing(bank) && open(stand)) spots.push({ stand, water: w });
    }
    for (let up = 2; up <= 4; up++) {
      const deck = { x: w.x, y: w.y + up, z: w.z };
      const stand = { x: w.x, y: w.y + up + 1, z: w.z };
      if (footing(deck) && open(stand)) spots.push({ stand, water: w });
    }
  }
  return nearestOf(spots.map((s) => ({ pos: s.stand, spot: s })), from)?.spot;
}

/** A cycle's catch: cod and salmon, and one time in eight something from the deep. */
export function catchPlan(rand: () => number): { typeId: string; amount: number }[] {
  let cod = 0;
  for (let i = 0; i < FISH_PER_CYCLE; i++) if (rand() < 0.65) cod++;
  const out: { typeId: string; amount: number }[] = [];
  if (cod > 0) out.push({ typeId: COD, amount: cod });
  if (FISH_PER_CYCLE - cod > 0) out.push({ typeId: SALMON, amount: FISH_PER_CYCLE - cod });
  if (rand() < TREASURE_CHANCE) out.push({ typeId: TREASURES[Math.floor(rand() * TREASURES.length)]!, amount: 1 });
  return out;
}

// ---------------------------------------------------------------------------
// The furfolk's trades (docs/design/furfolk.md §5). Each plan is what one
// cycle does, from a view of the blocks the engine read; the engine makes the
// changes in the plan's order, inputs before outputs.
// ---------------------------------------------------------------------------

export interface StateBlock {
  pos: Vec;
  typeId: string;
  /** The state the trade cares about: `growth` for a bush, `honey_level` for a hive, `age` for a pod. */
  state: number;
}

const byDistance = <T extends { pos: Vec }>(items: readonly T[], from: Vec): T[] =>
  [...items].sort((a, b) => dist2(a.pos, from) - dist2(b.pos, from) || a.pos.x - b.pos.x || a.pos.y - b.pos.y || a.pos.z - b.pos.z);

/** The ripe bushes nearest the post, a cycle's worth. */
export function foragePlan(bushes: readonly StateBlock[], from: Vec, limit = BUSHES_PER_CYCLE): StateBlock[] {
  return byDistance(bushes.filter((b) => b.typeId === BERRY_BUSH && b.state >= BERRY_RIPE), from).slice(0, limit);
}

/** A ripe bush gives two or three berries, as it does to a hand. */
export function berryYield(rand: () => number): number {
  return 2 + (rand() < 0.5 ? 1 : 0);
}

export interface BakePlan {
  /** Loaves this cycle: the chest's wheat, three a loaf, up to a cycle's worth. */
  loaves: number;
}

export function bakePlan(slots: readonly (Slot | undefined)[], limit = LOAVES_PER_CYCLE): BakePlan {
  return { loaves: Math.min(limit, Math.floor(countItem(slots, WHEAT) / WHEAT_PER_LOAF)) };
}

/** The oven to bake in: the nearest, lit or not. */
export function nearestOven(ovens: readonly StateBlock[], from: Vec): StateBlock | undefined {
  return nearestOf(ovens.filter((o) => OVEN_TYPES.includes(o.typeId)), from);
}

/**
 * Whether the oven is swapped for its lit block while the baker works. Only
 * an unlit oven with nothing in it: a village oven is empty, a kid's may be
 * smelting, and the swap must never eject what a player put in.
 */
export function litSwap(typeId: string, empty: boolean): string | undefined {
  const lit = LIT_OF[typeId];
  return lit !== undefined && empty ? lit : undefined;
}

/** The full hive nearest the post; one a cycle, so bottles run out before the honey does. */
export function hivePlan(hives: readonly StateBlock[], from: Vec): StateBlock | undefined {
  return nearestOf(hives.filter((h) => HIVE_TYPES.includes(h.typeId) && h.state >= HONEY_FULL), from);
}

/**
 * The cactus blocks to cut: every block standing on another cactus (the base
 * stays and regrows the column), nearest column first and top down within
 * it, so nothing is ever cut with cactus still above it. A cycle's worth.
 */
export function cutPlan(cactus: readonly Vec[], from: Vec, limit = CUTS_PER_CYCLE): Vec[] {
  const set = new Set(cactus.map(key));
  const above = cactus.filter((c) => set.has(key({ x: c.x, y: c.y - 1, z: c.z })));
  const columnD = (c: Vec) => (c.x - from.x) ** 2 + (c.z - from.z) ** 2;
  return [...above].sort((a, b) => columnD(a) - columnD(b) || a.x - b.x || a.z - b.z || b.y - a.y).slice(0, limit);
}

/**
 * The mushrooms to pick: nearest first, a cycle's worth, and never the last
 * MUSHROOMS_KEPT, which stay to spread from - a bed picked bare on mycelium
 * comes back too slowly to be a trade.
 */
export function pickPlan(mushrooms: readonly Vec[], from: Vec, limit = MUSHROOMS_PER_CYCLE, keep = MUSHROOMS_KEPT): Vec[] {
  const spare = Math.max(0, mushrooms.length - keep);
  return byDistance(mushrooms.map((pos) => ({ pos })), from).slice(0, Math.min(limit, spare)).map((m) => m.pos);
}

/** The ripe pods nearest the post, a cycle's worth. Ripe is the shared crop table's `mature` (age 2). */
export function cocoaPlan(pods: readonly StateBlock[], from: Vec, limit = PODS_PER_CYCLE): StateBlock[] {
  const crop = cropOf(COCOA_POD);
  return byDistance(pods.filter((p) => p.typeId === COCOA_POD && crop !== undefined && isMature(crop, p.state)), from).slice(0, limit);
}

/** A cycle at a hedge: one apple per eight leaves, up to four. Nothing is touched. */
export function gleanPlan(leaves: number, perApple = LEAVES_PER_APPLE, limit = APPLES_PER_CYCLE): number {
  return Math.min(limit, Math.floor(leaves / perApple));
}

export const tradeName = (trade: number): Trade => TRADES[trade] ?? "none";
