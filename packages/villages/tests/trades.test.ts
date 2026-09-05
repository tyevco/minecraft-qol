import { describe, expect, it } from "vitest";
import {
  FARMER, FISHER, LUMBERJACK, MINER, NONE, MAX_TREE_LOGS, ROOM_NEEDED, RESURVEY_NONE_TICKS, RESURVEY_TICKS,
  VEIN_CYCLES_PER_DAY, VEIN_WINDOW, FISH_PER_CYCLE, COD, SALMON, TREASURES,
  ROOF_SPAN, ARRIVE_RADIUS,
  arrived, canWork, catchPlan, chooseTrade, cycleDue, fellOrder, fellPlan, findTrees, fishingSpot, harvestPlan, key, mineYield, minutesToTicks,
  nearestTree, pickSeed, pickWage, roofed, standingSpot, surveyDue, veinAllowance, veinEnclosed, type LogBlock, type Slot, type Survey, type Vec,
} from "../scripts/core/trades";
import { DEFAULT_POLICY, parsePolicy } from "../scripts/core/settings";
import { FRESH, SCHEMA, packRecord, unpackRecord, type PostRecord } from "../scripts/core/record";
import { decide } from "../scripts/core/peopling";

const survey = (s: Partial<Survey>): Survey => ({ farmland: 0, logs: 0, leaves: 0, veins: 0, water: 0, ...s });

const column = (x: number, z: number, y0: number, h: number, type = "minecraft:oak_log"): LogBlock[] =>
  Array.from({ length: h }, (_, i) => ({ pos: { x, y: y0 + i, z }, typeId: type }));
const crown = (x: number, top: number, z: number): Set<string> => new Set([key({ x: x + 1, y: top, z }), key({ x, y: top + 1, z })]);

describe("chooseTrade", () => {
  it("a field makes a farmer, trees a lumberjack, neither nothing", () => {
    expect(chooseTrade(survey({ farmland: 20, logs: 10, leaves: 30 }))).toBe(FARMER);
    expect(chooseTrade(survey({ logs: 5, leaves: 12 }))).toBe(LUMBERJACK);
    expect(chooseTrade(survey({ farmland: 2, logs: 5, leaves: 12 }))).toBe(LUMBERJACK);
    expect(chooseTrade(survey({ farmland: 2 }))).toBe(FARMER);
    expect(chooseTrade(survey({ logs: 40 }))).toBe(NONE); // a log cabin is not a forest
    expect(chooseTrade(survey({}))).toBe(NONE);
  });
  it("a vein beats everything; open water beats trees, a pond does not; a puddle is nothing", () => {
    expect(chooseTrade(survey({ veins: 1, farmland: 30, logs: 10, leaves: 30, water: 50 }))).toBe(MINER);
    expect(chooseTrade(survey({ water: 40, logs: 10, leaves: 30 }))).toBe(FISHER); // a dock among mangroves
    expect(chooseTrade(survey({ water: 6, logs: 10, leaves: 30 }))).toBe(LUMBERJACK);
    expect(chooseTrade(survey({ water: 6 }))).toBe(FISHER);
    expect(chooseTrade(survey({ water: 3 }))).toBe(NONE);
    expect(chooseTrade(survey({ water: 4, farmland: 9 }))).toBe(FARMER); // the tallfolk field's channel
  });
  it("resurveys sooner when it found nothing", () => {
    expect(surveyDue({ trade: NONE, surveyedAt: 0 }, 5)).toBe(true);
    expect(surveyDue({ trade: NONE, surveyedAt: 100 }, 100 + RESURVEY_NONE_TICKS - 1)).toBe(false);
    expect(surveyDue({ trade: NONE, surveyedAt: 100 }, 100 + RESURVEY_NONE_TICKS)).toBe(true);
    expect(surveyDue({ trade: FARMER, surveyedAt: 100 }, 100 + RESURVEY_NONE_TICKS)).toBe(false);
    expect(surveyDue({ trade: FARMER, surveyedAt: 100 }, 100 + RESURVEY_TICKS)).toBe(true);
  });
});

describe("findTrees", () => {
  it("groups a trunk with its leaves into one tree, base at the bottom, felled top down", () => {
    const logs = column(3, 3, 64, 5);
    const trees = findTrees(logs, crown(3, 68, 3));
    expect(trees).toHaveLength(1);
    const t = trees[0]!;
    expect(t.base).toEqual({ x: 3, y: 64, z: 3 });
    expect(t.logs.map((l) => l.pos.y)).toEqual([68, 67, 66, 65, 64]);
    expect(t.sapling).toBe("minecraft:oak_sapling");
  });
  it("ignores logs with no leaves on them (a fence, a stack) and components too big to be a tree", () => {
    const stack = column(0, 0, 64, 3);
    expect(findTrees(stack, new Set())).toHaveLength(0);
    const cabin: LogBlock[] = [];
    for (let x = 0; x < 6; x++) for (let y = 64; y < 64 + Math.ceil((MAX_TREE_LOGS + 1) / 6); y++) cabin.push({ pos: { x, y, z: 0 }, typeId: "minecraft:spruce_log" });
    expect(cabin.length).toBeGreaterThan(MAX_TREE_LOGS);
    expect(findTrees(cabin, new Set([key({ x: 0, y: 64 + 10, z: 0 })]))).toHaveLength(0);
  });
  it("separates two trees and takes branches off before the trunk under them", () => {
    const a = column(0, 0, 64, 4);
    const b = [...column(10, 0, 64, 4, "minecraft:spruce_log"), { pos: { x: 11, y: 66, z: 0 }, typeId: "minecraft:spruce_log" }];
    const trees = findTrees([...a, ...b], new Set([...crown(0, 67, 0), ...crown(10, 67, 0)]));
    expect(trees).toHaveLength(2);
    const spruce = trees.find((t) => t.sapling === "minecraft:spruce_sapling")!;
    const order = spruce.logs.map((l) => `${l.pos.x},${l.pos.y}`);
    expect(order.indexOf("11,66")).toBeLessThan(order.indexOf("10,66"));
    expect(order.at(-1)).toBe("10,64");
    expect(nearestTree(trees, { x: 8, y: 64, z: 0 })).toBe(spruce);
    expect(nearestTree(trees, { x: 1, y: 64, z: 0 })!.sapling).toBe("minecraft:oak_sapling");
    expect(nearestTree([], { x: 0, y: 0, z: 0 })).toBeUndefined();
  });
  it("mangrove regrows from a propagule", () => {
    const t = findTrees(column(0, 0, 60, 3, "minecraft:mangrove_log"), crown(0, 62, 0))[0]!;
    expect(t.sapling).toBe("minecraft:mangrove_propagule");
  });
  it("fellOrder is deterministic on ties", () => {
    const logs = column(0, 0, 64, 2);
    expect(fellOrder(logs)).toEqual(fellOrder([...logs].reverse()));
  });
});

describe("fellPlan and standingSpot", () => {
  const tree = findTrees(column(5, 5, 64, 4), crown(5, 67, 5))[0]!;
  it("plants only on ground a sapling can take, and a spare sapling one time in three", () => {
    expect(fellPlan(tree, "minecraft:grass", () => 0.9).plant).toBe(true);
    expect(fellPlan(tree, "minecraft:stone", () => 0.9).plant).toBe(false);
    expect(fellPlan(tree, "minecraft:dirt", () => 0.1).spare).toBe(true);
    expect(fellPlan(tree, "minecraft:dirt", () => 0.5).spare).toBe(false);
  });
  it("stands beside the trunk on the post's side, never inside it", () => {
    expect(standingSpot({ x: 5, y: 64, z: 5 }, { x: 9, y: 64, z: 6 })).toEqual({ x: 6.5, y: 64, z: 5.5 });
    expect(standingSpot({ x: 5, y: 64, z: 5 }, { x: 5, y: 64, z: 1 })).toEqual({ x: 5.5, y: 64, z: 4.5 });
    expect(standingSpot({ x: 5, y: 64, z: 5 }, { x: 5, y: 64, z: 5 })).toEqual({ x: 6.5, y: 64, z: 5.5 });
  });
});

describe("harvestPlan", () => {
  const tile = (x: number, z: number, typeId: string, age: number) => ({ pos: { x, y: 65, z }, typeId, age });
  it("takes the ripe tiles nearest the post, a cycle's worth, and leaves the rest growing", () => {
    const tiles = [];
    for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) tiles.push(tile(x, z, "minecraft:wheat", x === 2 && z === 2 ? 3 : 7));
    const plan = harvestPlan(tiles, { x: 0, y: 65, z: 0 }, 8);
    expect(plan).toHaveLength(8);
    expect(plan[0]!.pos).toEqual({ x: 0, y: 65, z: 0 });
    expect(plan.every((t) => t.age === 7)).toBe(true);
    expect(plan.every((t) => t.pos.x + t.pos.z <= 3)).toBe(true);
  });
  it("skips crops the farmer does not tend, and unripe ones", () => {
    const plan = harvestPlan([tile(0, 0, "minecraft:cocoa", 2), tile(1, 0, "minecraft:carrots", 6), tile(2, 0, "minecraft:potatoes", 7), tile(3, 0, "minecraft:melon_stem", 7)], { x: 0, y: 65, z: 0 });
    expect(plan.map((t) => t.typeId)).toEqual(["minecraft:potatoes"]);
  });
});

describe("the chest, the wage, the cycle", () => {
  const bread: Slot = { typeId: "minecraft:bread", amount: 3, food: true };
  const seeds: Slot = { typeId: "minecraft:wheat_seeds", amount: 2, food: false };
  const slots = [undefined, seeds, bread, undefined];
  it("pays from the first food slot and reseeds from the matching seed", () => {
    expect(pickWage(slots)).toBe(2);
    expect(pickWage([seeds, undefined])).toBeUndefined();
    expect(pickSeed(slots, "minecraft:wheat_seeds")).toBe(1);
    expect(pickSeed(slots, "minecraft:carrot")).toBeUndefined();
  });
  it("needs a chest with room; a lumberjack needs a wage unless wages are off; a farmer works unpaid", () => {
    expect(canWork(LUMBERJACK, undefined, true)).toEqual({ kind: "wait", reason: "no chest" });
    expect(canWork(LUMBERJACK, { emptySlots: ROOM_NEEDED - 1, slots }, true)).toEqual({ kind: "wait", reason: "chest full" });
    expect(canWork(LUMBERJACK, { emptySlots: 5, slots: [seeds] }, true)).toEqual({ kind: "wait", reason: "no wage" });
    expect(canWork(LUMBERJACK, { emptySlots: 5, slots: [seeds] }, false)).toEqual({ kind: "work" });
    expect(canWork(LUMBERJACK, { emptySlots: 5, slots }, true)).toEqual({ kind: "work" });
    expect(canWork(FARMER, { emptySlots: 5, slots: [] }, true)).toEqual({ kind: "work" });
  });
  it("the first cycle is due at once, then one per interval", () => {
    const interval = minutesToTicks(10);
    expect(interval).toBe(12000);
    expect(cycleDue({ cycleAt: 0 }, 1, interval)).toBe(true);
    expect(cycleDue({ cycleAt: 100 }, 100 + interval - 1, interval)).toBe(false);
    expect(cycleDue({ cycleAt: 100 }, 100 + interval, interval)).toBe(true);
  });
  it("a stamp from before a restart (ahead of the clock) does not stall anything", () => {
    expect(cycleDue({ cycleAt: 500000 }, 100, 12000)).toBe(true);
    expect(surveyDue({ trade: FARMER, surveyedAt: 500000 }, 100)).toBe(true);
    const rec: PostRecord = { dimId: "d", x: 0, y: 0, z: 0, people: 0, job: 1, ...FRESH, spawnedAt: 500000 };
    expect(decide(rec, false, 100)).toEqual({ kind: "spawn" });
  });
  it("only the trades that do not fill the larder are paid", () => {
    const slots = [seeds];
    expect(canWork(MINER, { emptySlots: 5, slots }, true)).toEqual({ kind: "wait", reason: "no wage" });
    expect(canWork(FISHER, { emptySlots: 5, slots }, true)).toEqual({ kind: "work" });
  });
});

describe("the vein", () => {
  it("yields a day's cycles, then nothing until the window rolls over", () => {
    let rec = { veinAt: 0, veinCycles: 0 };
    for (let i = 1; i <= VEIN_CYCLES_PER_DAY; i++) {
      const a = veinAllowance(rec, 1000 + i);
      expect(a.allowed).toBe(true);
      expect(a.veinAt).toBe(1001);
      expect(a.veinCycles).toBe(i);
      rec = { veinAt: a.veinAt, veinCycles: a.veinCycles };
    }
    expect(veinAllowance(rec, 2000).allowed).toBe(false);
    expect(veinAllowance(rec, 2000)).toMatchObject(rec);
    const next = veinAllowance(rec, 1001 + VEIN_WINDOW);
    expect(next).toEqual({ allowed: true, veinAt: 1001 + VEIN_WINDOW, veinCycles: 1 });
    expect(veinAllowance(rec, 10).allowed).toBe(true); // the clock restarted
  });
  it("yields by ore, stone for an unknown state", () => {
    expect(mineYield("coal")).toEqual({ typeId: "minecraft:coal", amount: 6 });
    expect(mineYield("iron").typeId).toBe("minecraft:raw_iron");
    expect(mineYield(undefined)).toEqual({ typeId: "minecraft:cobblestone", amount: 8 });
  });
});

describe("a cave or a mine", () => {
  const world = new Map<string, string>();
  const put = (x: number, y: number, z: number, t: string) => world.set(key({ x, y, z }), t);
  const typeAt = (v: Vec) => (v.y > 100 ? undefined : world.get(key(v)) ?? "minecraft:air");
  it("a roof is anything solid above, within the span; leaves, grass and water are not a roof", () => {
    expect(roofed({ x: 0, y: 10, z: 0 }, typeAt)).toBe(false);
    put(0, 40, 0, "minecraft:stone");
    expect(roofed({ x: 0, y: 10, z: 0 }, typeAt)).toBe(true);
    expect(roofed({ x: 0, y: 10, z: 0 }, typeAt, 20)).toBe(false);
    put(0, 40, 0, "minecraft:oak_leaves");
    expect(roofed({ x: 0, y: 10, z: 0 }, typeAt)).toBe(false);
    put(0, 11, 0, "minecraft:water");
    put(0, 12, 0, "minecraft:short_grass");
    expect(roofed({ x: 0, y: 10, z: 0 }, typeAt)).toBe(false);
    put(0, 12, 0, "minecraft:cobblestone");
    expect(roofed({ x: 0, y: 10, z: 0 }, typeAt)).toBe(true);
    expect(ROOF_SPAN).toBeGreaterThan(20);
  });
  it("a vein counts only with a roof over it and over where the miner stands", () => {
    const vein = { x: 5, y: 10, z: 5 };
    const post = { x: 9, y: 10, z: 5 }; // the miner stands at 6,10,5
    expect(veinEnclosed(vein, post, typeAt)).toBe(false);
    put(5, 13, 5, "minecraft:stone");
    expect(veinEnclosed(vein, post, typeAt)).toBe(false); // the stand is still open to the sky
    put(6, 13, 5, "minecraft:stone");
    expect(veinEnclosed(vein, post, typeAt)).toBe(true);
  });
  it("arrival is within the radius horizontally and a couple of blocks vertically", () => {
    const spot = { x: 10.5, y: 64, z: 10.5 };
    expect(arrived({ x: 11.2, y: 64, z: 11.9 }, spot)).toBe(true);
    expect(arrived({ x: 10.5 + ARRIVE_RADIUS + 0.1, y: 64, z: 10.5 }, spot)).toBe(false);
    expect(arrived({ x: 10.5, y: 67, z: 10.5 }, spot)).toBe(false);
  });
});

describe("the water", () => {
  // A 3x3 pond at y=64 with stone banks, a plank deck three above its middle.
  const world = new Map<string, string>();
  const put = (x: number, y: number, z: number, t: string) => world.set(key({ x, y, z }), t);
  for (let x = -1; x <= 3; x++) for (let z = -1; z <= 3; z++) put(x, 64, z, "minecraft:stone");
  const waters: Vec[] = [];
  for (let x = 0; x <= 2; x++) for (let z = 0; z <= 2; z++) { put(x, 64, z, "minecraft:water"); waters.push({ x, y: 64, z }); }
  put(1, 67, 1, "minecraft:mangrove_planks");
  const typeAt = (v: Vec) => world.get(key(v)) ?? "minecraft:air";

  it("stands on the bank nearest the post, on the water's side", () => {
    const spot = fishingSpot(waters, typeAt, { x: 6, y: 65, z: 1 })!;
    expect(spot.stand).toEqual({ x: 3, y: 65, z: 1 });
    expect(spot.water).toEqual({ x: 2, y: 64, z: 1 });
  });
  it("stands on a deck over the water when that is nearer", () => {
    const spot = fishingSpot(waters, typeAt, { x: 1, y: 68, z: 1 })!;
    expect(spot.stand).toEqual({ x: 1, y: 68, z: 1 });
  });
  it("does not stand on a lily pad, on water, or where there is no water surface", () => {
    put(3, 64, 1, "minecraft:waterlily");
    const spot = fishingSpot(waters, typeAt, { x: 6, y: 65, z: 1 })!;
    expect(spot.stand).not.toEqual({ x: 3, y: 65, z: 1 });
    put(3, 64, 1, "minecraft:stone");
    const covered = waters.map((w) => ({ ...w, y: 60 })); // deep water, stone above
    for (const w of covered) put(w.x, 61, w.z, "minecraft:stone");
    expect(fishingSpot(covered, typeAt, { x: 6, y: 65, z: 1 })).toBeUndefined();
    expect(fishingSpot([], typeAt, { x: 0, y: 0, z: 0 })).toBeUndefined();
  });
  it("catches a cycle's worth of cod and salmon, with a treasure one time in eight", () => {
    const seq = (values: number[]) => { let i = 0; return () => values[i++ % values.length]!; };
    expect(catchPlan(seq([0.1, 0.1, 0.1, 0.1, 0.9]))).toEqual([{ typeId: COD, amount: FISH_PER_CYCLE }]);
    expect(catchPlan(seq([0.9]))).toEqual([{ typeId: SALMON, amount: FISH_PER_CYCLE }]);
    const treasure = catchPlan(seq([0.5, 0.5, 0.9, 0.9, 0.05, 0.99]));
    expect(treasure).toEqual([{ typeId: COD, amount: 2 }, { typeId: SALMON, amount: 2 }, { typeId: TREASURES.at(-1), amount: 1 }]);
  });
});

describe("settings", () => {
  it("defaults, clamps and ignores junk", () => {
    expect(parsePolicy({})).toEqual(DEFAULT_POLICY);
    expect(parsePolicy({ "villages:cycle_minutes": 3, "villages:wages": false })).toEqual({ cycleMinutes: 3, wages: false });
    expect(parsePolicy({ "villages:cycle_minutes": 900, "villages:wages": "no" })).toEqual({ cycleMinutes: 60, wages: true });
    expect(parsePolicy({ "villages:cycle_minutes": 0 }).cycleMinutes).toBe(1);
  });
});

describe("record schema", () => {
  const rec: PostRecord = { dimId: "minecraft:overworld", x: 1, y: 64, z: 2, people: 0, job: 1, entityId: "-42", spawnedAt: 10, trade: 1, surveyedAt: 11, cycleAt: 12, veinAt: 13, veinCycles: 2 };
  it("round-trips, and reads older rows with the newer fields defaulted", () => {
    expect(SCHEMA).toBe(3);
    expect(unpackRecord(packRecord(rec))).toEqual(rec);
    const old = ["minecraft:overworld", 1, 64, 2, 0, 1, "", 10];
    expect(unpackRecord(old)).toEqual({ dimId: "minecraft:overworld", x: 1, y: 64, z: 2, people: 0, job: 1, entityId: undefined, ...FRESH, spawnedAt: 10 });
    expect(unpackRecord([...old, 2, 5, 6])).toMatchObject({ trade: 2, surveyedAt: 5, cycleAt: 6, veinAt: 0, veinCycles: 0 });
    expect(unpackRecord([...old, 9, 0, 0])).toBeUndefined();
  });
});
