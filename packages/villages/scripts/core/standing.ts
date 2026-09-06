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
import { PEOPLES, PEOPLE_NAMES, WORKER, type PostRecord } from "./record";
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
  /** A job post may be bought (Friend and up) and a person invited (Kin). */
  canBuy: boolean;
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
    canBuy: tier >= FRIEND && emeralds >= POST_PRICE,
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

/** A follower settles on a post the kids placed if the post's job matches its own (§6: "a matching job block") and the post is empty. */
export function mayTakePost(follower: { job: number }, post: PostRecord, empty: boolean): boolean {
  return empty && post.job === follower.job;
}

/** A worker's follower may take a worker's post; the jobs are what they are. */
export const jobName = (job: number): string => ["guard", "worker", "trader", "builder"][job] ?? "worker";
export const WORKER_JOB = WORKER;
