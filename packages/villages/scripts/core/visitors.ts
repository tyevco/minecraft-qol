/**
 * Visitors (docs/design/villages.md §6.1): a person of one of the peoples
 * who walks into the kids' own settlement at dawn, carries one errand from
 * its people's table, and after three errands paid offers to stay. Pure -
 * no @minecraft imports - so every decision is under Vitest; engine/
 * visitors.ts spawns, walks, shows the form and moves the items.
 *
 * A settlement is a cluster of posts the kids placed (`placedBy`), two or
 * more within earshot of each other. A kids' post spawns nobody (core/
 * peopling.ts): its people arrive as visitors who chose to stay, or as
 * invited villagers (§6, not built). The same people keeps sending the same
 * named face, so a visitor becomes familiar; the face, its errand and how
 * many it has been paid for live in one world property (engine/visitors.ts).
 */
import { PEOPLES, PEOPLE_NAMES, PLACED_BY_PLAYER, WORKER, type PostRecord } from "./record";
import { BAKER, BEEKEEPER, COCOA, CUTTER, FARMER, FISHER, FORAGER, GLEANER, LUMBERJACK, MINER, PICKER, RANCHER, type Vec } from "./trades";

/** Days between visits (the third day or so: two or three). */
export const VISIT_EVERY_DAYS = 2;
export const VISIT_DAYS_SPREAD = 2;
/** Posts the kids placed within this of each other are one settlement; this many make one. */
export const SETTLEMENT_RANGE = 48;
export const SETTLEMENT_MIN_POSTS = 2;
/** How far from the settlement's middle a visitor appears, and the dawn window it appears in (time of day, ticks). */
export const EDGE_DISTANCE = 14;
export const DAWN_FROM = 0;
export const DAWN_TO = 1000;
/** Errands paid before the visitor offers to stay, and the standing each is worth. */
export const ERRANDS_TO_SETTLE = 3;
export const STANDING_PER_ERRAND = 5;
export const STANDING_PROPERTY = "villages:standing.";

export interface Errand {
  item: string;
  amount: number;
}
export interface Gift {
  item: string;
  amount: number;
}

/**
 * Each people's errands ("bring N of this"), from its liked gifts
 * (villages.md §5, furfolk.md §3), and the gift it pays with, from what it
 * sells. Indexed by PEOPLES.
 */
export const ERRANDS: readonly (readonly Errand[])[] = [
  [{ item: "minecraft:coal", amount: 16 }, { item: "minecraft:iron_ingot", amount: 8 }, { item: "minecraft:bread", amount: 8 }], // stonefolk
  [{ item: "minecraft:cod", amount: 8 }, { item: "minecraft:string", amount: 16 }, { item: "minecraft:glass", amount: 8 }], // reedfolk
  [{ item: "minecraft:copper_ingot", amount: 8 }, { item: "minecraft:redstone", amount: 16 }, { item: "minecraft:honey_bottle", amount: 2 }], // tinker
  [{ item: "minecraft:wheat", amount: 16 }, { item: "minecraft:white_wool", amount: 8 }, { item: "minecraft:apple", amount: 8 }], // tallfolk
  [{ item: "minecraft:potato", amount: 16 }, { item: "minecraft:cake", amount: 1 }, { item: "minecraft:mushroom_stew", amount: 2 }], // hobbit
  [{ item: "minecraft:oak_sapling", amount: 8 }, { item: "minecraft:sweet_berries", amount: 16 }, { item: "minecraft:string", amount: 8 }], // wood elf
  [{ item: "minecraft:glass", amount: 16 }, { item: "minecraft:lapis_lazuli", amount: 8 }, { item: "minecraft:book", amount: 2 }], // high elf
  [{ item: "minecraft:spider_eye", amount: 4 }, { item: "minecraft:brown_mushroom", amount: 16 }, { item: "minecraft:string", amount: 16 }], // drow
  [{ item: "minecraft:leather", amount: 8 }, { item: "minecraft:hay_block", amount: 4 }, { item: "minecraft:cooked_beef", amount: 8 }], // drover
  [{ item: "minecraft:sweet_berries", amount: 16 }, { item: "minecraft:glow_berries", amount: 8 }, { item: "minecraft:egg", amount: 8 }], // foxfolk
  [{ item: "minecraft:cod", amount: 8 }, { item: "minecraft:salmon", amount: 4 }, { item: "minecraft:string", amount: 16 }], // catfolk
  [{ item: "minecraft:bone", amount: 8 }, { item: "minecraft:cooked_mutton", amount: 8 }, { item: "minecraft:leather", amount: 8 }], // wolffolk
  [{ item: "minecraft:carrot", amount: 16 }, { item: "minecraft:dandelion", amount: 8 }, { item: "minecraft:golden_carrot", amount: 2 }], // rabbitfolk
  [{ item: "minecraft:honey_bottle", amount: 2 }, { item: "minecraft:honeycomb", amount: 4 }, { item: "minecraft:sweet_berries", amount: 16 }], // bearfolk
  [{ item: "minecraft:sweet_berries", amount: 8 }, { item: "minecraft:melon_slice", amount: 16 }, { item: "minecraft:rabbit_hide", amount: 8 }], // fennecfolk
  [{ item: "minecraft:wheat", amount: 16 }, { item: "minecraft:bread", amount: 8 }, { item: "minecraft:brown_mushroom", amount: 8 }], // mousefolk
  [{ item: "minecraft:melon_slice", amount: 8 }, { item: "minecraft:sweet_berries", amount: 16 }, { item: "minecraft:bread", amount: 8 }], // squirrelfolk
  [{ item: "minecraft:cod", amount: 8 }, { item: "minecraft:salmon", amount: 8 }, { item: "minecraft:seagrass", amount: 16 }], // otterfolk
  [{ item: "minecraft:apple", amount: 8 }, { item: "minecraft:wheat", amount: 16 }, { item: "minecraft:sweet_berries", amount: 8 }], // deerfolk
];
export const GIFTS: readonly Gift[] = [
  { item: "minecraft:coal", amount: 8 }, { item: "minecraft:cooked_cod", amount: 4 }, { item: "minecraft:copper_ingot", amount: 4 }, { item: "minecraft:bread", amount: 4 },
  { item: "minecraft:cake", amount: 1 }, { item: "minecraft:oak_sapling", amount: 4 }, { item: "minecraft:glass", amount: 8 }, { item: "minecraft:string", amount: 8 }, { item: "minecraft:leather", amount: 4 },
  { item: "minecraft:sweet_berries", amount: 8 }, { item: "minecraft:white_wool", amount: 4 }, { item: "minecraft:cooked_cod", amount: 4 }, { item: "minecraft:bread", amount: 4 }, { item: "minecraft:honey_bottle", amount: 1 },
  { item: "minecraft:cactus", amount: 4 }, { item: "minecraft:mushroom_stew", amount: 1 }, { item: "minecraft:cookie", amount: 4 }, { item: "minecraft:cooked_salmon", amount: 4 }, { item: "minecraft:apple", amount: 4 },
];
/** Three names a people's visitors go by; the first face a people sends keeps its name. */
export const NAMES: readonly (readonly string[])[] = [
  ["Brynn", "Durrow", "Hesk"], ["Merle", "Sedge", "Tarn"], ["Pip", "Cog", "Winnow"], ["Ansel", "Hale", "Rowan"], ["Tobbo", "Daisy", "Bramwell"],
  ["Lirien", "Fael", "Seren"], ["Aurel", "Ithil", "Calas"], ["Vezra", "Ilyth", "Sorn"], ["Cass", "Jory", "Wren"],
  ["Bramble", "Russet", "Vix"], ["Mochi", "Tansy", "Sable"], ["Grey", "Fenn", "Ash"], ["Clover", "Thistle", "Nib"], ["Honey", "Bruin", "Marl"],
  ["Sandy", "Dune", "Zephyr"], ["Crumb", "Tilly", "Nook"], ["Hazel", "Chip", "Tuft"], ["Ripple", "Kelp", "Otto"], ["Fern", "Larch", "Moss"],
];

export interface Settlement {
  /** The dimension and the lowest post key, so a settlement keeps its identity as posts are added. */
  key: string;
  dimId: string;
  centre: Vec;
  posts: PostRecord[];
}

const dist2xz = (a: Vec, b: Vec): number => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/**
 * The kids' settlements: posts a player placed, clustered by proximity
 * (a post within SETTLEMENT_RANGE of any post in a cluster joins it), the
 * clusters of at least SETTLEMENT_MIN_POSTS kept. Sorted by key, so a
 * choice among them is deterministic.
 */
export function settlements(records: readonly PostRecord[]): Settlement[] {
  const kids = records.filter((r) => r.placedBy === PLACED_BY_PLAYER);
  const clusters: PostRecord[][] = [];
  for (const r of kids) {
    const near = clusters.filter((c) => c.some((p) => p.dimId === r.dimId && dist2xz(p, r) <= SETTLEMENT_RANGE * SETTLEMENT_RANGE));
    if (near.length === 0) clusters.push([r]);
    else {
      const [first, ...rest] = near;
      first!.push(r);
      for (const other of rest) {
        first!.push(...other);
        clusters.splice(clusters.indexOf(other), 1);
      }
    }
  }
  return clusters
    .filter((c) => c.length >= SETTLEMENT_MIN_POSTS)
    .map((posts) => {
      const sorted = [...posts].sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
      const first = sorted[0]!;
      const centre = {
        x: Math.round(posts.reduce((s, p) => s + p.x, 0) / posts.length),
        y: Math.round(posts.reduce((s, p) => s + p.y, 0) / posts.length),
        z: Math.round(posts.reduce((s, p) => s + p.z, 0) / posts.length),
      };
      return { key: `${first.dimId}:${first.x},${first.y},${first.z}`, dimId: first.dimId, centre, posts: sorted };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Dawn: the time of day has just entered the window. `prev` is the last reading. */
export function isDawn(prev: number, now: number): boolean {
  const inside = (t: number): boolean => t >= DAWN_FROM && t < DAWN_TO;
  return inside(now) && !inside(prev);
}

/** Which peoples a settlement's trades would draw (villages.md §6.1): the people whose villages carry that trade. */
export const PEOPLES_BY_TRADE: Readonly<Record<number, readonly number[]>> = {
  [MINER]: [0, 2, 7],
  [FISHER]: [1, 11, 17],
  [FARMER]: [3, 8, 12],
  [LUMBERJACK]: [0, 3, 5, 9, 13],
  [RANCHER]: [8, 10],
  [FORAGER]: [9],
  [BAKER]: [12],
  [BEEKEEPER]: [13],
  [CUTTER]: [14],
  [PICKER]: [15],
  [COCOA]: [16],
  [GLEANER]: [18],
};

/** The people a settlement draws: one of those its workers' trades belong to, else any. */
export function peopleFor(settlement: Settlement, rand: () => number): number {
  const drawn = new Set<number>();
  for (const p of settlement.posts) if (p.job === WORKER) for (const people of PEOPLES_BY_TRADE[p.trade] ?? []) drawn.add(people);
  const pool = drawn.size ? [...drawn].sort((a, b) => a - b) : PEOPLES.map((_, i) => i);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
}

/** A spot on the settlement's edge: EDGE_DISTANCE from its middle, in a random direction. The engine finds the ground under it. */
export function edgeSpot(centre: Vec, rand: () => number): Vec {
  const angle = rand() * Math.PI * 2;
  return { x: Math.round(centre.x + Math.cos(angle) * EDGE_DISTANCE), y: centre.y, z: Math.round(centre.z + Math.sin(angle) * EDGE_DISTANCE) };
}

/** A people's familiar face: the name it sends, its open errand and how many it has been paid for. */
export interface Face {
  name: string;
  errand: Errand;
  paid: number;
}

/** The visitor in the world now. */
export interface Visit {
  people: number;
  settlement: string;
  /** The day it arrived; it leaves at the next dawn. */
  day: number;
  entityId?: string;
}

export interface VisitorsState {
  version: 1;
  /** The day the next visitor may come; 0 means as soon as there is a settlement. */
  nextDay: number;
  /** The settlement visited last, so settlements take turns. */
  lastSettlement?: string;
  /** Faces by people index (a string key, since it is JSON). */
  faces: Record<string, Face>;
  visit?: Visit;
}

export const EMPTY_STATE: VisitorsState = { version: 1, nextDay: 0, faces: {} };

export function parseState(raw: unknown): VisitorsState {
  if (typeof raw !== "string") return { ...EMPTY_STATE, faces: {} };
  try {
    const s = JSON.parse(raw) as Partial<VisitorsState>;
    if (!s || s.version !== 1 || typeof s.nextDay !== "number") return { ...EMPTY_STATE, faces: {} };
    return { version: 1, nextDay: s.nextDay, lastSettlement: s.lastSettlement, faces: s.faces ?? {}, visit: s.visit };
  } catch {
    return { ...EMPTY_STATE, faces: {} };
  }
}

/** A new face for a people: its first name and its first errand. */
export function newFace(people: number, rand: () => number): Face {
  const names = NAMES[people] ?? NAMES[0]!;
  return { name: names[Math.min(names.length - 1, Math.floor(rand() * names.length))]!, errand: pickErrand(people, rand), paid: 0 };
}

export function pickErrand(people: number, rand: () => number): Errand {
  const table = ERRANDS[people] ?? ERRANDS[0]!;
  return { ...table[Math.min(table.length - 1, Math.floor(rand() * table.length))]! };
}

/** Which settlement gets the next visitor: the one after the last visited, in key order. */
export function nextSettlement(all: readonly Settlement[], last: string | undefined): Settlement | undefined {
  if (all.length === 0) return undefined;
  const i = last === undefined ? -1 : all.findIndex((s) => s.key === last);
  return all[(i + 1) % all.length];
}

export type ArrivalPlan = { kind: "none"; reason: "visiting" | "not due" | "no settlement" } | { kind: "arrive"; settlement: Settlement; people: number; face: Face; spot: Vec };

/** What dawn brings: a visitor, if one is due and there is somewhere for it to go. */
export function planArrival(state: VisitorsState, day: number, all: readonly Settlement[], rand: () => number): ArrivalPlan {
  if (state.visit) return { kind: "none", reason: "visiting" };
  if (day < state.nextDay) return { kind: "none", reason: "not due" };
  const settlement = nextSettlement(all, state.lastSettlement);
  if (!settlement) return { kind: "none", reason: "no settlement" };
  const people = peopleFor(settlement, rand);
  const face = state.faces[String(people)] ?? newFace(people, rand);
  return { kind: "arrive", settlement, people, face, spot: edgeSpot(settlement.centre, rand) };
}

/** The state once the visitor has arrived (the engine adds the entity id). */
export function arrived(state: VisitorsState, plan: Extract<ArrivalPlan, { kind: "arrive" }>, day: number): VisitorsState {
  return {
    ...state,
    faces: { ...state.faces, [String(plan.people)]: plan.face },
    lastSettlement: plan.settlement.key,
    visit: { people: plan.people, settlement: plan.settlement.key, day },
  };
}

/** Whether the visitor leaves at this dawn: it stays a day, so any dawn after the one it arrived on. */
export function leavesAt(state: VisitorsState, day: number): boolean {
  return state.visit !== undefined && day > state.visit.day;
}

/** The state once the visitor has gone, paid or not: the next comes in a few days. An unpaid errand is kept for its next visit. */
export function left(state: VisitorsState, day: number, rand: () => number): VisitorsState {
  const { visit: _gone, ...rest } = state;
  return { ...rest, nextDay: day + VISIT_EVERY_DAYS + Math.floor(rand() * VISIT_DAYS_SPREAD) };
}

export type DeliveryVerdict = { kind: "short"; have: number; need: number } | { kind: "paid"; gift: Gift; standing: number; settles: boolean };

/** Handing the errand's items over: short, or paid - the gift, the standing and whether this was the third. */
export function deliver(face: Face, people: number, carried: number): DeliveryVerdict {
  if (carried < face.errand.amount) return { kind: "short", have: carried, need: face.errand.amount };
  return { kind: "paid", gift: GIFTS[people] ?? GIFTS[0]!, standing: STANDING_PER_ERRAND, settles: face.paid + 1 >= ERRANDS_TO_SETTLE };
}

/** The face after an errand is paid: one more paid, a new errand drawn. */
export function afterPayment(face: Face, people: number, rand: () => number): Face {
  return { name: face.name, errand: pickErrand(people, rand), paid: face.paid + 1 };
}

/** Whether a face has earned the offer to stay. */
export const mayStay = (face: Face): boolean => face.paid >= ERRANDS_TO_SETTLE;

/** The post a settler takes: the nearest empty one the kids placed in the settlement. `empty` says whether a post has its person. */
export function settleTarget(settlement: Settlement, from: Vec, empty: (post: PostRecord) => boolean): PostRecord | undefined {
  let best: PostRecord | undefined;
  let bestD = Infinity;
  for (const p of settlement.posts) {
    if (!empty(p)) continue;
    const d = dist2xz(p, from);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** What the visitor says. */
export function greeting(face: Face, people: number): string {
  const who = PEOPLE_NAMES[PEOPLES[people] ?? "stonefolk"];
  const item = face.errand.item.replace("minecraft:", "").replace(/_/g, " ");
  return `${face.name} of the ${who}. I am looking for ${face.errand.amount} ${item}. Bring them before I go and I will remember it.`;
}

export const visitorName = (face: Face, people: number): string => `${face.name} the ${PEOPLE_NAMES[PEOPLES[people] ?? "stonefolk"]}`;
export const standingProperty = (people: number): string => `${STANDING_PROPERTY}${PEOPLES[people] ?? "stonefolk"}`;
