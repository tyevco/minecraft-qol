import { describe, expect, it } from "vitest";
import {
  FARMER, LUMBERJACK, NONE, MAX_TREE_LOGS, ROOM_NEEDED, RESURVEY_NONE_TICKS, RESURVEY_TICKS,
  canWork, chooseTrade, cycleDue, fellOrder, fellPlan, findTrees, harvestPlan, key, minutesToTicks,
  nearestTree, pickSeed, pickWage, standingSpot, surveyDue, type LogBlock, type Slot,
} from "../scripts/core/trades";
import { DEFAULT_POLICY, parsePolicy } from "../scripts/core/settings";
import { SCHEMA, packRecord, unpackRecord, type PostRecord } from "../scripts/core/record";

const column = (x: number, z: number, y0: number, h: number, type = "minecraft:oak_log"): LogBlock[] =>
  Array.from({ length: h }, (_, i) => ({ pos: { x, y: y0 + i, z }, typeId: type }));
const crown = (x: number, top: number, z: number): Set<string> => new Set([key({ x: x + 1, y: top, z }), key({ x, y: top + 1, z })]);

describe("chooseTrade", () => {
  it("a field makes a farmer, trees a lumberjack, neither nothing", () => {
    expect(chooseTrade({ farmland: 20, logs: 10, leaves: 30 })).toBe(FARMER);
    expect(chooseTrade({ farmland: 0, logs: 5, leaves: 12 })).toBe(LUMBERJACK);
    expect(chooseTrade({ farmland: 2, logs: 5, leaves: 12 })).toBe(LUMBERJACK);
    expect(chooseTrade({ farmland: 2, logs: 0, leaves: 0 })).toBe(FARMER);
    expect(chooseTrade({ farmland: 0, logs: 40, leaves: 0 })).toBe(NONE); // a log cabin is not a forest
    expect(chooseTrade({ farmland: 0, logs: 0, leaves: 0 })).toBe(NONE);
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
});

describe("settings", () => {
  it("defaults, clamps and ignores junk", () => {
    expect(parsePolicy({})).toEqual(DEFAULT_POLICY);
    expect(parsePolicy({ "villages:cycle_minutes": 3, "villages:wages": false })).toEqual({ cycleMinutes: 3, wages: false });
    expect(parsePolicy({ "villages:cycle_minutes": 900, "villages:wages": "no" })).toEqual({ cycleMinutes: 60, wages: true });
    expect(parsePolicy({ "villages:cycle_minutes": 0 }).cycleMinutes).toBe(1);
  });
});

describe("record schema 2", () => {
  const rec: PostRecord = { dimId: "minecraft:overworld", x: 1, y: 64, z: 2, people: 0, job: 1, entityId: "-42", spawnedAt: 10, trade: 1, surveyedAt: 11, cycleAt: 12 };
  it("round-trips, and reads a schema-1 row with the trade fields defaulted", () => {
    expect(SCHEMA).toBe(2);
    expect(unpackRecord(packRecord(rec))).toEqual(rec);
    const old = ["minecraft:overworld", 1, 64, 2, 0, 1, "", 10];
    expect(unpackRecord(old)).toEqual({ dimId: "minecraft:overworld", x: 1, y: 64, z: 2, people: 0, job: 1, entityId: undefined, spawnedAt: 10, trade: 0, surveyedAt: 0, cycleAt: 0 });
    expect(unpackRecord([...old, 9, 0, 0])).toBeUndefined();
  });
});
