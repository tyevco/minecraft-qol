import { describe, expect, it } from "vitest";
import { FRESH, PEOPLES, PLACED_BY_PLAYER, PLACED_BY_WORLD, type PostRecord } from "../scripts/core/record";
import {
  ERRAND_DAYS, ESCORT_TICKS, FRIEND, GUEST, KIN, POST_PRICE, STRANGER, TRADES_PER_DAY, UNWELCOME, VILLAGE_ABOVE, VILLAGE_BELOW, VILLAGE_HULL, WARES,
  acceptGift, countTrade, elderOffer, escortCandidate, escortOver, inviteCandidate, isNatural, lapsed, likes, mayRest, mayTakePost, parseErrand, parseGiftDay, parseTradeDay, restWords, standingWords, stock, stockPrice, storehousePosts, tierOf, villageOf, wares,
} from "../scripts/core/standing";

const post = (x: number, z: number, extra: Partial<PostRecord> = {}): PostRecord => ({ dimId: "minecraft:overworld", x, y: 64, z, people: 9, job: 2, ...FRESH, ...extra });

describe("standing", () => {
  it("tiers at the design's thresholds, in words", () => {
    expect(tierOf(-1)).toBe(UNWELCOME);
    expect(tierOf(0)).toBe(STRANGER);
    expect(tierOf(9)).toBe(STRANGER);
    expect(tierOf(10)).toBe(GUEST);
    expect(tierOf(25)).toBe(FRIEND);
    expect(tierOf(49)).toBe(FRIEND);
    expect(tierOf(50)).toBe(KIN);
    expect(standingWords(9, 0)).toBe("The Foxfolk do not know you yet.");
    expect(standingWords(9, 50)).toBe("The Foxfolk count you as kin.");
    expect(standingWords(9, -5)).toContain("amends");
  });
  it("a people likes the items of its errands; a gift counts once per person per day", () => {
    expect(likes(9)).toEqual(["minecraft:sweet_berries", "minecraft:glow_berries", "minecraft:egg"]);
    const day = parseGiftDay(undefined, 4);
    expect(day).toEqual({ day: 4, persons: [] });
    const after = acceptGift(day, "p1")!;
    expect(after.persons).toEqual(["p1"]);
    expect(acceptGift(after, "p1")).toBeUndefined();
    expect(acceptGift(after, "p2")!.persons).toEqual(["p1", "p2"]);
    expect(parseGiftDay(JSON.stringify(after), 4)).toEqual(after);
    expect(parseGiftDay(JSON.stringify(after), 5)).toEqual({ day: 5, persons: [] }); // a new day
    expect(parseGiftDay("junk", 5)).toEqual({ day: 5, persons: [] });
  });
  it("an errand from the village lapses after three days", () => {
    const e = parseErrand(JSON.stringify({ item: "minecraft:coal", amount: 16, day: 2 }))!;
    expect(e).toEqual({ item: "minecraft:coal", amount: 16, day: 2 });
    expect(lapsed(e, 2 + ERRAND_DAYS)).toBe(false);
    expect(lapsed(e, 3 + ERRAND_DAYS)).toBe(true);
    expect(parseErrand(undefined)).toBeUndefined();
    expect(parseErrand("{}")).toBeUndefined();
  });
  it("the elder's offer follows the tier: an errand to a stranger, a post at friend, an invite at kin", () => {
    const stranger = elderOffer(9, 0, undefined, 0, 0);
    expect(stranger).toMatchObject({ tier: STRANGER, canTake: true, canPay: false, canBuy: false, canInvite: false });
    expect(elderOffer(9, -1, undefined, 0, 99).canTake).toBe(false);
    const open = { item: "minecraft:egg", amount: 8, day: 1 };
    expect(elderOffer(9, 3, open, 7, 0)).toMatchObject({ canPay: false, canTake: false });
    expect(elderOffer(9, 3, open, 8, 0)).toMatchObject({ canPay: true });
    expect(stranger.canTrade).toBe(false);
    expect(elderOffer(9, 10, undefined, 0, 0).canTrade).toBe(true);
    expect(elderOffer(9, 30, undefined, 0, POST_PRICE - 1).canBuy).toBe(false);
    expect(elderOffer(9, 30, undefined, 0, POST_PRICE).canBuy).toBe(true);
    expect(elderOffer(9, 30, undefined, 0, 64).canInvite).toBe(false);
    expect(elderOffer(9, 24, undefined, 0, 0).canEscort).toBe(false);
    expect(elderOffer(9, 25, undefined, 0, 0).canEscort).toBe(true);
    expect(elderOffer(9, 50, undefined, 0, 0)).toMatchObject({ canInvite: true, canBuy: false });
  });
  it("every people has three wares at guest and a fourth at friend, each a namespaced item at a price", () => {
    expect(WARES).toHaveLength(PEOPLES.length);
    for (const [i, list] of WARES.entries()) {
      expect(list, PEOPLES[i]).toHaveLength(4);
      for (const w of list) {
        expect(w.item, PEOPLES[i]).toMatch(/^minecraft:[a-z_]+$/);
        expect(w.amount, PEOPLES[i]).toBeGreaterThanOrEqual(1);
        expect(w.price, PEOPLES[i]).toBeGreaterThanOrEqual(1);
      }
      expect(list.filter((w) => w.from === FRIEND), PEOPLES[i]).toHaveLength(1);
      expect(wares(i, STRANGER)).toEqual([]);
      expect(wares(i, GUEST)).toHaveLength(3);
      expect(wares(i, FRIEND)).toHaveLength(4);
      expect(wares(i, KIN)).toHaveLength(4);
    }
    expect(wares(9, GUEST).map((w) => w.item)).toEqual(["minecraft:sweet_berries", "minecraft:spruce_sapling", "minecraft:lantern"]);
  });
  it("a trade earns standing only for the first few each day with a people, and the count starts over with the day", () => {
    let day = parseTradeDay(undefined, 3);
    expect(day).toEqual({ day: 3, counts: {} });
    for (let n = 0; n < TRADES_PER_DAY; n++) {
      const t = countTrade(day, 9);
      expect(t.earns, `trade ${n + 1}`).toBe(true);
      day = t.next;
    }
    expect(day.counts["9"]).toBe(TRADES_PER_DAY);
    const over = countTrade(day, 9);
    expect(over.earns).toBe(false);
    expect(over.next.counts["9"]).toBe(TRADES_PER_DAY + 1);
    expect(countTrade(over.next, 3).earns).toBe(true); // another people's count is its own
    expect(parseTradeDay(JSON.stringify(over.next), 3)).toEqual(over.next);
    expect(parseTradeDay(JSON.stringify(over.next), 4)).toEqual({ day: 4, counts: {} }); // a new day
    expect(parseTradeDay("junk", 4)).toEqual({ day: 4, counts: {} });
    expect(parseTradeDay(JSON.stringify({ day: 4, counts: { 9: "two" } }), 4)).toEqual({ day: 4, counts: {} });
  });
  it("a spot is in the village of the nearest world post whose hull holds it; the kids' posts make no village", () => {
    const world = (x: number, z: number, people: number, extra: Partial<PostRecord> = {}): PostRecord => post(x, z, { placedBy: PLACED_BY_WORLD, people, ...extra });
    const posts = [world(0, 0, 9), world(24, 0, 3), post(120, 0, { placedBy: PLACED_BY_PLAYER, people: 5 })];
    const at = (x: number, y: number, z: number, dimId = "minecraft:overworld") => ({ dimId, x, y, z });
    expect(villageOf(posts, at(1, 66, 1))!.people).toBe(9);
    expect(villageOf(posts, at(-VILLAGE_HULL, 64, 0))!.people).toBe(9); // on the edge, in
    expect(villageOf(posts, at(-VILLAGE_HULL - 1, 64, 0))).toBeUndefined(); // one past it, out
    expect(villageOf(posts, at(11, 64, 0))!.people).toBe(9); // in both hulls: the nearer post's people
    expect(villageOf(posts, at(13, 64, 0))!.people).toBe(3);
    expect(villageOf(posts, at(0, 64 - VILLAGE_BELOW, 0))!.people).toBe(9);
    expect(villageOf(posts, at(0, 64 - VILLAGE_BELOW - 1, 0))).toBeUndefined(); // the mine under the village is free
    expect(villageOf(posts, at(0, 64 + VILLAGE_ABOVE, 0))!.people).toBe(9);
    expect(villageOf(posts, at(0, 64 + VILLAGE_ABOVE + 1, 0))).toBeUndefined();
    expect(villageOf(posts, at(120, 64, 0))).toBeUndefined(); // the kids' own post
    expect(villageOf(posts, at(1, 64, 1, "minecraft:nether"))).toBeUndefined();
  });
  it("the ground, rock, ore, trees, plants, crops, snow, water and the vein are natural; the village's fabric is not", () => {
    for (const id of ["grass_block", "dirt", "stone", "deepslate", "iron_ore", "deepslate_gold_ore", "raw_copper_block", "oak_log", "stripped_spruce_log", "birch_leaves", "sand", "sandstone", "gravel", "snow_layer", "snow", "water", "wheat", "sweet_berry_bush", "poppy", "tall_grass", "brown_mushroom", "cactus", "moss_block", "mycelium", "mud", "kelp", "bamboo", "cobblestone", "orange_terracotta", "air"]) {
      expect(isNatural(`minecraft:${id}`), id).toBe(true);
    }
    expect(isNatural("villages:vein")).toBe(true);
    for (const id of ["oak_planks", "stone_bricks", "cobblestone_wall", "lantern", "chest", "barrel", "glass_pane", "oak_fence", "hay_block", "white_wool", "mud_bricks", "smooth_sandstone", "cut_sandstone", "sandstone_wall", "oak_stairs", "spruce_slab", "torch", "crafting_table", "furnace", "oak_door", "bed", "polished_blackstone_bricks", "prismarine_bricks"]) {
      expect(isNatural(`minecraft:${id}`), id).toBe(false);
    }
    expect(isNatural("villages:post")).toBe(false);
  });
  it("a village's bed is for guests and up; a stranger and the unwelcome are turned away in different words", () => {
    expect(mayRest(UNWELCOME)).toBe(false);
    expect(mayRest(STRANGER)).toBe(false);
    expect(mayRest(GUEST)).toBe(true);
    expect(mayRest(KIN)).toBe(true);
    expect(restWords(9, 0)).toBe("The Foxfolk keep their beds for guests; they do not know you yet.");
    expect(restWords(9, -3)).toContain("amends");
  });
  it("names the nearest present person of the job in the elder's own village, never the elder", () => {
    const elder = post(0, 0);
    const posts = [elder, post(5, 0, { job: 1 }), post(2, 0, { job: 1 }), post(1, 0, { job: 1, people: 3 }), post(200, 0, { job: 1 }), post(3, 0, { job: 0 })];
    expect(inviteCandidate(posts, elder, 1, 64, () => true)!.x).toBe(2);
    expect(inviteCandidate(posts, elder, 1, 64, (p) => p.x !== 2)!.x).toBe(5);
    expect(inviteCandidate(posts, elder, 2, 64, () => true)).toBeUndefined(); // the elder is the only trader
    expect(inviteCandidate(posts, elder, 0, 64, () => true)!.x).toBe(3);
  });
  it("the elder names the nearest present guard of its own village to walk along, and the day ends on the clock or a restart", () => {
    const elder = post(0, 0);
    const posts = [elder, post(6, 0, { job: 0 }), post(3, 0, { job: 0 }), post(2, 0, { job: 1 }), post(4, 0, { job: 0, people: 3 })];
    expect(escortCandidate(posts, elder, 64, () => true)!.x).toBe(3);
    expect(escortCandidate(posts, elder, 64, (p) => p.x !== 3)!.x).toBe(6);
    expect(escortCandidate(posts, elder, 64, () => false)).toBeUndefined();
    expect(escortOver(1000, 1000 + ESCORT_TICKS - 1)).toBe(false);
    expect(escortOver(1000, 1000 + ESCORT_TICKS)).toBe(true);
    expect(escortOver(90000, 120)).toBe(true); // the clock restarted
  });
  it("the storehouse prices produce only, offers a sale's worth of what the chests hold, and leaves the fixed wares to themselves", () => {
    expect(stockPrice("minecraft:oak_log")).toEqual({ amount: 8, price: 1 });
    expect(stockPrice("minecraft:raw_iron")).toEqual({ amount: 2, price: 2 });
    expect(stockPrice("minecraft:light_blue_wool")).toEqual({ amount: 4, price: 1 });
    expect(stockPrice("minecraft:iron_pickaxe")).toBeUndefined();
    expect(stockPrice("minecraft:cooked_beef")).toBeUndefined(); // a wage, not produce
    const counts = { "minecraft:wheat": 40, "minecraft:oak_log": 7, "minecraft:cod": 6, "minecraft:sweet_berries": 30, "minecraft:iron_pickaxe": 1 };
    expect(stock(counts, STRANGER, [])).toEqual([]);
    const lines = stock(counts, GUEST, wares(9, GUEST)); // the foxfolk's fixed wares already sell sweet berries
    expect(lines.map((l) => l.item)).toEqual(["minecraft:cod", "minecraft:wheat"]);
    expect(lines[1]).toEqual({ item: "minecraft:wheat", amount: 16, price: 1, from: GUEST, available: 40 });
    expect(stock(counts, GUEST, []).map((l) => l.item)).toContain("minecraft:sweet_berries");
  });
  it("a trader's storehouse is the worker posts of its own village", () => {
    const elder = post(0, 0, { placedBy: PLACED_BY_WORLD });
    const posts = [
      elder,
      post(10, 0, { placedBy: PLACED_BY_WORLD, job: 1 }),
      post(0, 70, { placedBy: PLACED_BY_WORLD, job: 1 }), // too far
      post(5, 0, { placedBy: PLACED_BY_WORLD, job: 0 }), // a guard has no chest to sell from
      post(6, 0, { placedBy: PLACED_BY_WORLD, job: 1, people: 3 }), // another people's
      post(7, 0, { placedBy: PLACED_BY_PLAYER, job: 1 }), // the kids' own
    ];
    expect(storehousePosts(posts, elder).map((p) => p.x)).toEqual([10]);
  });
  it("a follower takes an empty post of its own job", () => {
    const worker = post(0, 0, { job: 1, placedBy: PLACED_BY_PLAYER });
    expect(mayTakePost({ job: 1 }, worker, true)).toBe(true);
    expect(mayTakePost({ job: 1 }, worker, false)).toBe(false);
    expect(mayTakePost({ job: 0 }, worker, true)).toBe(false);
  });
});
