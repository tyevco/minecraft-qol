/**
 * Standing (docs/design/villages.md §5) and invite (§6): the decisions.
 * Pure - no @minecraft imports - so every rule is under Vitest; engine/
 * standing.ts, engine/elder.ts and engine/follow.ts read the events and
 * move the items and the people.
 *
 * Standing is an integer per player per people, in a player dynamic
 * property (`villages:standing.<people>`, core/visitors.ts). It is never
 * shown as a number: the village's voice says where the player stands in
 * words, and the form's buttons change with the tier. Per player on
 * purpose: a sibling's standing is their own.
 */
import { PEOPLES, PEOPLE_NAMES, PLACED_BY_WORLD, WORKER, type PostRecord } from "./record";
import { ERRANDS, type Errand } from "./visitors";

export const TIERS = ["unwelcome", "stranger", "guest", "friend", "kin"] as const;
export type Tier = (typeof TIERS)[number];
export const UNWELCOME = 0, STRANGER = 1, GUEST = 2, FRIEND = 3, KIN = 4;
/** The standing a tier starts at; below the first is unwelcome. */
export const TIER_FROM: readonly number[] = [-Infinity, 0, 10, 25, 50];

export function tierOf(standing: number): number {
  let tier = UNWELCOME;
  for (let i = 1; i < TIER_FROM.length; i++) if (standing >= TIER_FROM[i]!) tier = i;
  return tier;
}

/** How a people speaks of the player, by tier. */
export function standingWords(people: number, standing: number): string {
  const who = PEOPLE_NAMES[PEOPLES[people] ?? "stonefolk"];
  switch (tierOf(standing)) {
    case UNWELCOME: return `The ${who} would rather you made amends before asking anything.`;
    case STRANGER: return `The ${who} do not know you yet.`;
    case GUEST: return `The ${who} welcome you as a guest.`;
    case FRIEND: return `The ${who} call you a friend.`;
    default: return `The ${who} count you as kin.`;
  }
}

/** What each thing is worth (§5). */
export const STANDING_ERRAND = 5;
export const STANDING_GIFT = 1;
export const STANDING_DEFENCE = 1;
export const STANDING_HIT = -5;
export const STANDING_LAPSE = -2;
/** Days an errand from the village stays open before it lapses. */
export const ERRAND_DAYS = 3;
/** A job post, sold at Friend. */
export const POST_PRICE = 6;
export const EMERALD = "minecraft:emerald";
export const POST_ITEM = "villages:post";
/** How far from a guard a monster's death counts as the village's defence, and how far a hit rouses the guards. */
export const DEFENCE_RANGE = 24;
export const ROUSE_RANGE = 16;

/**
 * Trading (§5: "+1 per trade, capped per day, so trading is a slow steady
 * way and not a farm"). The trader sells from its people's wares below;
 * a trade is always allowed at Guest and up, and the first TRADES_PER_DAY
 * trades with a people each day are worth STANDING_TRADE apiece.
 *
 * The trade is the form's, not a `minecraft:economy_trade_table`'s: the
 * stable script API cannot see a vanilla trade happen, so a trade table
 * could neither move standing nor be gated per player (a component group
 * is per entity; standing is per player). `docs/design/npcs.md` §6 asked.
 */
export const STANDING_TRADE = 1;
export const TRADES_PER_DAY = 4;

/** Something a people sells: `amount` of `item` for `price` emeralds, from the tier `from` up. */
export interface Ware {
  item: string;
  amount: number;
  price: number;
  from: number;
}
const ware = (item: string, amount: number, price: number, from = GUEST): Ware => ({ item: `minecraft:${item}`, amount, price, from });

/**
 * What each people sells (villages.md §5.1: "what a village produces ...
 * is what the trader sells"; furfolk.md §3, each people's "Sells at
 * Friend" line). Three wares at Guest and one at Friend, since §5's table
 * has traders trading at Guest and the rarer thing waiting for a friend.
 * Indexed by PEOPLES.
 */
export const WARES: readonly (readonly Ware[])[] = [
  [ware("coal", 8, 1), ware("iron_ingot", 2, 3), ware("stone_bricks", 16, 1), ware("lantern", 2, 2, FRIEND)], // stonefolk
  [ware("cooked_cod", 6, 1), ware("glass", 8, 1), ware("blue_dye", 4, 1), ware("fishing_rod", 1, 3, FRIEND)], // reedfolk
  [ware("copper_ingot", 4, 1), ware("redstone", 8, 1), ware("honey_bottle", 1, 2), ware("observer", 1, 4, FRIEND)], // tinker
  [ware("bread", 4, 1), ware("wheat", 16, 1), ware("white_wool", 4, 1), ware("cake", 1, 4, FRIEND)], // tallfolk
  [ware("baked_potato", 6, 1), ware("mushroom_stew", 1, 1), ware("cookie", 8, 1), ware("pumpkin_pie", 2, 1, FRIEND)], // hobbit
  [ware("oak_sapling", 4, 1), ware("sweet_berries", 8, 1), ware("arrow", 8, 1), ware("bow", 1, 5, FRIEND)], // wood elf
  [ware("glass", 8, 1), ware("lapis_lazuli", 4, 1), ware("book", 1, 2), ware("bookshelf", 1, 3, FRIEND)], // high elf
  [ware("brown_mushroom", 8, 1), ware("spider_eye", 2, 1), ware("string", 8, 1), ware("soul_lantern", 1, 3, FRIEND)], // drow
  [ware("leather", 4, 1), ware("cooked_beef", 4, 1), ware("hay_block", 2, 1), ware("saddle", 1, 8, FRIEND)], // drover
  [ware("sweet_berries", 8, 1), ware("spruce_sapling", 4, 1), ware("lantern", 1, 2), ware("glow_berries", 4, 1, FRIEND)], // foxfolk
  [ware("white_wool", 4, 1), ware("string", 8, 1), ware("shears", 1, 2), ware("loom", 1, 2, FRIEND)], // catfolk
  [ware("cooked_cod", 4, 1), ware("leather", 4, 1), ware("bone", 4, 1), ware("campfire", 1, 2, FRIEND)], // wolffolk
  [ware("bread", 4, 1), ware("carrot", 8, 1), ware("beetroot_seeds", 8, 1), ware("cake", 1, 4, FRIEND)], // rabbitfolk
  [ware("honey_bottle", 1, 1), ware("honeycomb", 2, 1), ware("candle", 4, 1), ware("beehive", 1, 5, FRIEND)], // bearfolk
  [ware("cactus", 4, 1), ware("sandstone", 16, 1), ware("green_dye", 4, 1), ware("glass", 8, 1, FRIEND)], // fennecfolk
  [ware("mushroom_stew", 1, 1), ware("red_mushroom", 8, 1), ware("brown_mushroom", 8, 1), ware("mycelium", 4, 2, FRIEND)], // mousefolk
  [ware("cocoa_beans", 8, 1), ware("cookie", 8, 1), ware("melon_slice", 8, 1), ware("jungle_sapling", 4, 1, FRIEND)], // squirrelfolk
  [ware("cooked_cod", 4, 1), ware("cooked_salmon", 4, 1), ware("oak_boat", 1, 2), ware("nautilus_shell", 1, 12, FRIEND)], // otterfolk
  [ware("apple", 8, 1), ware("oak_sapling", 4, 1), ware("birch_sapling", 4, 1), ware("moss_block", 8, 1, FRIEND)], // deerfolk
];

/**
 * The inn (§5's table: at Guest "the inn lets you sleep"): a bed inside a
 * village's hull is the village's, and a stranger may not use it. A guest
 * sleeping there gets the game's own respawn point, as at any bed, so the
 * village is the Hearthstone-style respawn the design wanted with nothing
 * set from script.
 */
export const BED = "minecraft:bed";
export const mayRest = (tier: number): boolean => tier >= GUEST;
export function restWords(people: number, standing: number): string {
  const who = PEOPLE_NAMES[PEOPLES[people] ?? "stonefolk"];
  return tierOf(standing) === UNWELCOME ? `The ${who} would not have you under their roof; make amends first.` : `The ${who} keep their beds for guests; they do not know you yet.`;
}

/**
 * A guard walks with the player for a day (§5's table, at Friend). The
 * elder names the nearest present guard of its own village, as for an
 * invite, and the guard follows on the invite's bond (engine/follow.ts)
 * while keeping its post, then walks home when the day is up, when the
 * player sends it, or when the clock restarts (a stamp ahead of the clock
 * is read as elapsed, as everywhere in the pack).
 */
export const ESCORT_TICKS = 24000;
export const GUARD_JOB = 0;
export const escortOver = (since: number, now: number): boolean => now < since || now - since >= ESCORT_TICKS;

/**
 * The storehouse (villages.md §5.1: "what a village produces goes into its
 * own storehouse, which is what the trader sells"; issue #85). The
 * workers' chests are the storehouse: the trader also sells what the
 * worker posts of its own village (the same people, within STOCK_RANGE of
 * its post) have in their chests, at a price per kind of produce below.
 * Only produce is priced, so a tool the kids left in a chest is not for
 * sale (a food is, and the workers' wages are food, so a paid trade's
 * bread can be sold out from under it); the fixed wares stay as the
 * floor, and a kind in the people's table is offered once, from the
 * table, at the table's tier, so a Friend ware is not sold to a guest
 * from the chests.
 */
export const STOCK_RANGE = 64;
export interface StockPrice {
  amount: number;
  price: number;
}
const sp = (amount: number, price: number): StockPrice => ({ amount, price });
const STOCK_PRICES: readonly (readonly [RegExp, StockPrice])[] = [
  [/^minecraft:[a-z_]+_log$/, sp(8, 1)],
  [/^minecraft:[a-z_]+_sapling$/, sp(4, 1)],
  [/^minecraft:[a-z_]+_wool$/, sp(4, 1)],
  [/^minecraft:(wheat|carrot|potato|beetroot|melon_slice|sugar_cane)$/, sp(16, 1)],
  [/^minecraft:[a-z_]+_seeds$/, sp(16, 1)],
  [/^minecraft:(cobblestone|stone)$/, sp(16, 1)],
  [/^minecraft:coal$/, sp(8, 1)],
  [/^minecraft:raw_iron$/, sp(2, 2)],
  [/^minecraft:raw_copper$/, sp(4, 1)],
  [/^minecraft:(cod|salmon)$/, sp(6, 1)],
  [/^minecraft:sweet_berries$/, sp(8, 1)],
  [/^minecraft:bread$/, sp(4, 1)],
  [/^minecraft:honey_bottle$/, sp(1, 1)],
  [/^minecraft:cactus$/, sp(4, 1)],
  [/^minecraft:(brown_mushroom|red_mushroom)$/, sp(8, 1)],
  [/^minecraft:cocoa_beans$/, sp(8, 1)],
  [/^minecraft:apple$/, sp(8, 1)],
];
/** What a kind of produce sells for, or undefined if it is not produce. */
export function stockPrice(typeId: string): StockPrice | undefined {
  for (const [re, price] of STOCK_PRICES) if (re.test(typeId)) return price;
  return undefined;
}

/** A line of the storehouse: a ware, and how many the chests hold. */
export interface StockLine extends Ware {
  available: number;
}

/** What a people's storehouse offers a player of this tier: every priced kind the chests hold a sale's worth of, sorted, less every kind in the people's own table (at any tier). */
export function stock(counts: Readonly<Record<string, number>>, people: number, tier: number): StockLine[] {
  if (tier < GUEST) return [];
  const offered = new Set(wares(people, KIN).map((w) => w.item));
  const lines: StockLine[] = [];
  for (const [item, available] of Object.entries(counts)) {
    if (offered.has(item)) continue;
    const price = stockPrice(item);
    if (!price || available < price.amount) continue;
    lines.push({ item, amount: price.amount, price: price.price, from: GUEST, available });
  }
  return lines.sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
}

/** The worker posts whose chests are a trader's storehouse: its own village's (same people and dimension, within STOCK_RANGE), the world's. */
export function storehousePosts(posts: readonly PostRecord[], elder: PostRecord): PostRecord[] {
  return posts.filter((p) => p.placedBy === PLACED_BY_WORLD && p.people === elder.people && p.dimId === elder.dimId && p.job === WORKER && (p.x - elder.x) ** 2 + (p.z - elder.z) ** 2 <= STOCK_RANGE * STOCK_RANGE);
}

/** The wares a people shows a player of this tier: none below Guest. */
export function wares(people: number, tier: number): readonly Ware[] {
  if (tier < GUEST) return [];
  return (WARES[people] ?? WARES[0]!).filter((w) => tier >= w.from);
}

/** Trades made today, per player: the day and how many with each people (keyed by the people index). */
export interface TradeDay {
  day: number;
  counts: Record<string, number>;
}

export function parseTradeDay(raw: unknown, day: number): TradeDay {
  if (typeof raw === "string") {
    try {
      const t = JSON.parse(raw) as Partial<TradeDay>;
      if (t && t.day === day && t.counts && typeof t.counts === "object") {
        const counts: Record<string, number> = {};
        for (const [k, v] of Object.entries(t.counts)) if (typeof v === "number") counts[k] = v;
        return { day, counts };
      }
    } catch {
      /* start fresh */
    }
  }
  return { day, counts: {} };
}

/** A trade with a people, counted: the day's state after it, and whether it still earns standing (within the day's cap). */
export function countTrade(trades: TradeDay, people: number): { next: TradeDay; earns: boolean } {
  const before = trades.counts[String(people)] ?? 0;
  return { next: { day: trades.day, counts: { ...trades.counts, [String(people)]: before + 1 } }, earns: before < TRADES_PER_DAY };
}

/**
 * Breaking a village's block (§5: −1 a block). Nothing records a generated
 * village's box, so its bounds are a hull round its posts: a block within
 * VILLAGE_HULL of a world-placed post on x/z, from VILLAGE_BELOW under the
 * post's floor to VILLAGE_ABOVE over it, is the village's (issue #73;
 * the squares are up to 23 wide with the post at the middle, the lots up
 * to 14, and the streets between them 7 or 11 long, measured from the
 * structures). The
 * kids' own posts make no village. Natural blocks are free: the ground,
 * rock and ore under a village, trees, plants and crops, snow and water,
 * since the villages are built on and of them and a kid digging past one
 * is not stripping it; and the vein is meant to be carried home.
 */
export const STANDING_BREAK = -1;
export const VILLAGE_HULL = 20;
export const VILLAGE_BELOW = 3;
export const VILLAGE_ABOVE = 12;
const NATURAL = /^minecraft:(grass_block|dirt|coarse_dirt|rooted_dirt|podzol|mud|clay|mycelium|moss_block|moss_carpet|dirt_path|farmland|stone|cobblestone|mossy_cobblestone|deepslate|cobbled_deepslate|granite|diorite|andesite|tuff|calcite|dripstone_block|pointed_dripstone|gravel|sand|red_sand|sandstone|red_sandstone|terracotta|[a-z]+_terracotta|bedrock|obsidian|magma|netherrack|[a-z_]*_ore|ancient_debris|raw_[a-z]+_block|[a-z_]+_log|[a-z_]+_wood|[a-z_]+_stem|[a-z_]+_hyphae|[a-z_]+_leaves|[a-z_]+_sapling|azalea|flowering_azalea|mangrove_roots|bamboo|bamboo_sapling|cactus|sugar_cane|kelp|seagrass|sea_pickle|lily_pad|vine|cave_vines[a-z_]*|glow_lichen|dead_bush|short_grass|tall_grass|fern|large_fern|[a-z_]+_(flower|tulip|orchid|bluet|poppy|dandelion|allium|daisy|lilac|peony|cornflower|rose_bush|sunflower|torchflower|pitcher_plant)|dandelion|poppy|allium|cornflower|peony|lilac|sunflower|rose_bush|torchflower|pitcher_plant|wheat|carrots|potatoes|beetroot|melon_block|melon_stem|pumpkin|carved_pumpkin|pumpkin_stem|sweet_berry_bush|cocoa|brown_mushroom|red_mushroom|[a-z_]+_mushroom_block|mushroom_stem|water|flowing_water|lava|flowing_lava|snow_layer|snow|powder_snow|ice|packed_ice|blue_ice|frosted_ice|sponge|wet_sponge|coral[a-z_]*|[a-z_]+_coral[a-z_]*|tube_coral|brain_coral|bubble_coral|fire_coral|horn_coral|amethyst_block|budding_amethyst|amethyst_cluster|[a-z]+_amethyst_bud|sculk[a-z_]*|soul_sand|soul_soil|basalt|blackstone|end_stone|prismarine|dark_prismarine|air)$/;
/** A block a player may break inside a village's hull at no cost. */
export const isNatural = (typeId: string): boolean => NATURAL.test(typeId) || typeId === "villages:vein";

export interface Spot {
  dimId: string;
  x: number;
  y: number;
  z: number;
}

/** The village a spot lies in: the nearest world-placed post whose hull holds it, or none. */
export function villageOf(posts: readonly PostRecord[], at: Spot): PostRecord | undefined {
  let best: PostRecord | undefined;
  let bestD = Infinity;
  for (const p of posts) {
    if (p.placedBy !== PLACED_BY_WORLD || p.dimId !== at.dimId) continue;
    if (at.y < p.y - VILLAGE_BELOW || at.y > p.y + VILLAGE_ABOVE) continue;
    const d = (p.x - at.x) ** 2 + (p.z - at.z) ** 2;
    if (d > VILLAGE_HULL * VILLAGE_HULL || d >= bestD) continue;
    bestD = d;
    best = p;
  }
  return best;
}

/** The items a people likes (its errand table's items): a gift of one is +1, once per person per day. */
export function likes(people: number): readonly string[] {
  return (ERRANDS[people] ?? ERRANDS[0]!).map((e) => e.item);
}

/** Gifts given today, per player: the day and the persons already given to. */
export interface GiftDay {
  day: number;
  persons: string[];
}

export function parseGiftDay(raw: unknown, day: number): GiftDay {
  if (typeof raw === "string") {
    try {
      const g = JSON.parse(raw) as Partial<GiftDay>;
      if (g && g.day === day && Array.isArray(g.persons)) return { day, persons: g.persons.filter((p): p is string => typeof p === "string") };
    } catch {
      /* start fresh */
    }
  }
  return { day, persons: [] };
}

/** May this person be given to today? Returns the day's state after the gift, or undefined if not. */
export function acceptGift(gifts: GiftDay, personId: string): GiftDay | undefined {
  if (gifts.persons.includes(personId)) return undefined;
  return { day: gifts.day, persons: [...gifts.persons, personId] };
}

/** The player's open errand with a people (the village's, not a visitor's): what, and the day it was taken. */
export interface OpenErrand extends Errand {
  day: number;
}

export function parseErrand(raw: unknown): OpenErrand | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const e = JSON.parse(raw) as Partial<OpenErrand>;
    if (e && typeof e.item === "string" && typeof e.amount === "number" && typeof e.day === "number") return { item: e.item, amount: e.amount, day: e.day };
  } catch {
    /* none */
  }
  return undefined;
}

/** An errand older than ERRAND_DAYS has lapsed: the standing cost, and the errand is dropped. */
export const lapsed = (errand: OpenErrand, day: number): boolean => day - errand.day > ERRAND_DAYS;

export type ElderOffer = {
  tier: number;
  words: string;
  /** The open errand, if any, and whether the player carries enough to pay it. */
  errand?: OpenErrand;
  canPay: boolean;
  /** Whether a new errand may be taken (none open, and not unwelcome). */
  canTake: boolean;
  /** The trader trades (Guest and up). */
  canTrade: boolean;
  /** A job post may be bought (Friend and up), a guard asked to walk along (Friend), and a person invited (Kin). */
  canBuy: boolean;
  canEscort: boolean;
  canInvite: boolean;
};

/** What the village's voice offers a player (§5's table). */
export function elderOffer(people: number, standing: number, errand: OpenErrand | undefined, carried: number, emeralds: number): ElderOffer {
  const tier = tierOf(standing);
  return {
    tier,
    words: standingWords(people, standing),
    errand,
    canPay: errand !== undefined && carried >= errand.amount,
    canTake: errand === undefined && tier >= STRANGER,
    canTrade: tier >= GUEST,
    canBuy: tier >= FRIEND && emeralds >= POST_PRICE,
    canEscort: tier >= FRIEND,
    canInvite: tier >= KIN,
  };
}

/**
 * The person the elder names for an invite: one of this village's people
 * (the posts of the same people within `range` of the elder's post) with
 * the job asked for, present, and not the elder itself; the nearest.
 * `present` says whether a post has its person.
 */
export function inviteCandidate(posts: readonly PostRecord[], elder: PostRecord, job: number, range: number, present: (post: PostRecord) => boolean): PostRecord | undefined {
  let best: PostRecord | undefined;
  let bestD = Infinity;
  for (const p of posts) {
    if (p.people !== elder.people || p.job !== job || p.dimId !== elder.dimId) continue;
    if (p.x === elder.x && p.y === elder.y && p.z === elder.z) continue;
    const d = (p.x - elder.x) ** 2 + (p.z - elder.z) ** 2;
    if (d > range * range || !present(p)) continue;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** The guard the elder names to walk with the player: the nearest present one of its own village. */
export const escortCandidate = (posts: readonly PostRecord[], elder: PostRecord, range: number, present: (post: PostRecord) => boolean): PostRecord | undefined =>
  inviteCandidate(posts, elder, GUARD_JOB, range, present);

/** A follower settles on a post the kids placed if the post's job matches its own (§6: "a matching job block") and the post is empty. */
export function mayTakePost(follower: { job: number }, post: PostRecord, empty: boolean): boolean {
  return empty && post.job === follower.job;
}

/** A worker's follower may take a worker's post; the jobs are what they are. */
export const jobName = (job: number): string => ["guard", "worker", "trader", "builder"][job] ?? "worker";
export const WORKER_JOB = WORKER;
