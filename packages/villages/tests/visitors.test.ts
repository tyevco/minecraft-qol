import { describe, expect, it } from "vitest";
import { FRESH, PEOPLES, PLACED_BY_PLAYER, PLACED_BY_WORLD, WORKER, type PostRecord } from "../scripts/core/record";
import { FARMER, FORAGER, MINER } from "../scripts/core/trades";
import {
  DAWN_TO, DAY_TICKS, EDGE_DISTANCE, ERRANDS, ERRANDS_TO_SETTLE, GIFTS, NAMES, SETTLEMENT_MIN_POSTS, SETTLEMENT_RANGE, STANDING_PER_ERRAND, VISIT_EVERY_DAYS,
  afterPayment, arrived, dayOf, deliver, edgeSpot, isDawn, leavesAt, left, lockedDawn, mayStay, newFace, nextSettlement, parseState, peopleFor, planArrival, settleTarget, settlements,
  ticksToLockedDawn,
  standingProperty, visitorName, type Face, type VisitorsState,
} from "../scripts/core/visitors";

const post = (x: number, z: number, extra: Partial<PostRecord> = {}): PostRecord => ({ dimId: "minecraft:overworld", x, y: 64, z, people: 0, job: WORKER, ...FRESH, placedBy: PLACED_BY_PLAYER, ...extra });
const first = () => 0;

describe("settlements", () => {
  it("clusters the posts the kids placed by proximity, needs two, and ignores a village's posts", () => {
    const records = [post(0, 0), post(10, 5), post(200, 200), post(230, 200), post(40, 30, { placedBy: PLACED_BY_WORLD }), post(500, 500)];
    const all = settlements(records);
    expect(all.map((s) => s.posts.length)).toEqual([2, 2]);
    expect(all[0]!.key).toBe("minecraft:overworld:0,64,0");
    expect(all[0]!.centre).toEqual({ x: 5, y: 64, z: 3 });
    expect(all[1]!.key).toBe("minecraft:overworld:200,64,200");
  });
  it("chains: a post within range of any post in a cluster joins it, and joins two clusters", () => {
    const a = post(0, 0), b = post(SETTLEMENT_RANGE * 2, 0), bridge = post(SETTLEMENT_RANGE, 0);
    expect(settlements([a, b])).toHaveLength(0);
    expect(settlements([a, b, bridge]).map((s) => s.posts.length)).toEqual([3]);
    expect(SETTLEMENT_MIN_POSTS).toBe(2);
  });
  it("keeps dimensions apart", () => {
    expect(settlements([post(0, 0), post(1, 1, { dimId: "minecraft:nether" })])).toHaveLength(0);
  });
});

describe("dawn on a locked clock", () => {
  const empty = parseState(undefined);
  it("counts nothing while the cycle runs, and a dawn every day of ticks while it is locked", () => {
    expect(lockedDawn(empty, true, 500)).toEqual({ state: empty, dawn: false, changed: false });
    const seen = lockedDawn(empty, false, 500);
    expect(seen).toMatchObject({ dawn: false, changed: true });
    expect(seen.state.lockedTick).toBe(500);
    expect(lockedDawn(seen.state, false, 500 + DAY_TICKS - 1)).toEqual({ state: seen.state, dawn: false, changed: false });
    const dawn = lockedDawn(seen.state, false, 500 + DAY_TICKS);
    expect(dawn).toMatchObject({ dawn: true, changed: true });
    expect(dawn.state).toMatchObject({ lockedTick: 500 + DAY_TICKS, extraDays: 1 });
    expect(dayOf(dawn.state, 7)).toBe(8);
    expect(ticksToLockedDawn(dawn.state, 500 + DAY_TICKS + 100)).toBe(DAY_TICKS - 100);
    expect(ticksToLockedDawn(empty, 0)).toBe(DAY_TICKS);
  });
  it("a tick behind the stored one is a restart, read as the day elapsed; unlocking forgets the tick and keeps the days", () => {
    const locked = { ...empty, lockedTick: 90000, extraDays: 3 };
    const restarted = lockedDawn(locked, false, 120);
    expect(restarted).toMatchObject({ dawn: true, changed: true });
    expect(restarted.state).toMatchObject({ lockedTick: 120, extraDays: 4 });
    const unlocked = lockedDawn(restarted.state, true, 200);
    expect(unlocked).toMatchObject({ dawn: false, changed: true });
    expect(unlocked.state.lockedTick).toBeUndefined();
    expect(unlocked.state.extraDays).toBe(4);
    expect(dayOf(unlocked.state, 10)).toBe(14); // the world's day never goes back
  });
  it("the boot marker's restart is a dawn even when the new clock has already passed the stored tick", () => {
    // Short sessions on a Realm that sleeps: the tick is stored soon after
    // one boot and the next boot's first poll comes later than it, so the
    // heuristic alone would never see a restart (the case record.ts names).
    const locked = { ...empty, lockedTick: 40, extraDays: 1 };
    expect(lockedDawn(locked, false, 60)).toEqual({ state: locked, dawn: false, changed: false });
    const restarted = lockedDawn(locked, false, 60, true);
    expect(restarted).toMatchObject({ dawn: true, changed: true });
    expect(restarted.state).toMatchObject({ lockedTick: 60, extraDays: 2 });
    expect(lockedDawn(empty, false, 60, true).state.lockedTick).toBe(60); // a lock first seen is never a dawn
    expect(lockedDawn(locked, true, 60, true).state.lockedTick).toBeUndefined(); // nor is a cycle that runs
  });
  it("the state keeps the locked tick and the extra days, and reads an older state as none", () => {
    const s = { ...empty, nextDay: 3, lockedTick: 40, extraDays: 2 };
    expect(parseState(JSON.stringify(s))).toEqual(s);
    expect(parseState(JSON.stringify({ version: 1, nextDay: 3, faces: {} }))).toEqual({ version: 1, nextDay: 3, extraDays: 0, faces: {}, lastSettlement: undefined, visit: undefined });
  });
});

describe("dawn and the edge", () => {
  it("is dawn when the time of day enters the window, once", () => {
    expect(isDawn(23900, 10)).toBe(true);
    expect(isDawn(10, 30)).toBe(false);
    expect(isDawn(6000, 6020)).toBe(false);
    expect(isDawn(12000, 0)).toBe(true); // /time add across midnight
    expect(isDawn(DAWN_TO - 1, DAWN_TO)).toBe(false);
  });
  it("puts the spot EDGE_DISTANCE from the middle", () => {
    const spot = edgeSpot({ x: 10, y: 64, z: 10 }, () => 0.25);
    expect(Math.round(Math.hypot(spot.x - 10, spot.z - 10))).toBe(EDGE_DISTANCE);
    expect(spot.y).toBe(64);
  });
});

describe("who comes", () => {
  const s = (posts: PostRecord[]) => settlements(posts)[0]!;
  it("draws the people from the settlement's trades, else any", () => {
    expect(peopleFor(s([post(0, 0, { trade: MINER }), post(3, 3)]), first)).toBe(0); // stonefolk mine
    expect(peopleFor(s([post(0, 0, { trade: FORAGER }), post(3, 3)]), first)).toBe(9); // foxfolk berries
    expect(peopleFor(s([post(0, 0, { trade: FARMER }), post(3, 3)]), () => 0.99)).toBe(12); // rabbitfolk, the last farmer people
    expect(peopleFor(s([post(0, 0), post(3, 3)]), () => 0.99)).toBe(PEOPLES.length - 1);
    expect(peopleFor(s([post(0, 0, { job: 0, trade: MINER }), post(3, 3)]), first)).toBe(0); // a guard's stale trade field counts for nothing: any people, the first
  });
  it("settlements take turns", () => {
    const all = settlements([post(0, 0), post(3, 3), post(200, 0), post(203, 3)]);
    expect(nextSettlement(all, undefined)!.key).toBe(all[0]!.key);
    expect(nextSettlement(all, all[0]!.key)!.key).toBe(all[1]!.key);
    expect(nextSettlement(all, all[1]!.key)!.key).toBe(all[0]!.key);
    expect(nextSettlement(all, "gone")!.key).toBe(all[0]!.key);
    expect(nextSettlement([], undefined)).toBeUndefined();
  });
  it("every people has three errands, a gift and three names", () => {
    expect(ERRANDS).toHaveLength(PEOPLES.length);
    expect(GIFTS).toHaveLength(PEOPLES.length);
    expect(NAMES).toHaveLength(PEOPLES.length);
    for (const table of ERRANDS) expect(table).toHaveLength(3);
    for (const names of NAMES) expect(names).toHaveLength(3);
    expect(newFace(9, first)).toEqual({ name: "Bramble", errand: { item: "minecraft:sweet_berries", amount: 16 }, paid: 0 });
    expect(visitorName(newFace(9, first), 9)).toBe("Bramble the Foxfolk");
    expect(standingProperty(9)).toBe("villages:standing.foxfolk");
  });
});

describe("the visit", () => {
  const all = settlements([post(0, 0, { trade: FORAGER }), post(3, 3)]);
  const empty: VisitorsState = parseState(undefined);
  it("comes when due and there is a settlement, with the people's familiar face", () => {
    expect(planArrival(empty, 0, [], first)).toEqual({ kind: "none", reason: "no settlement" });
    expect(planArrival({ ...empty, nextDay: 5 }, 4, all, first)).toEqual({ kind: "none", reason: "not due" });
    const plan = planArrival({ ...empty, nextDay: 5 }, 5, all, first);
    expect(plan.kind).toBe("arrive");
    if (plan.kind !== "arrive") return;
    expect(plan.people).toBe(9);
    expect(plan.face.name).toBe("Bramble");
    const known: Face = { name: "Vix", errand: { item: "minecraft:egg", amount: 8 }, paid: 2 };
    const again = planArrival({ ...empty, faces: { "9": known } }, 5, all, first);
    expect(again.kind === "arrive" && again.face).toEqual(known);
  });
  it("arrives, stays the day, leaves at the next dawn, and comes back in a few days with the errand kept", () => {
    const plan = planArrival(empty, 5, all, first);
    if (plan.kind !== "arrive") throw new Error("no plan");
    const here = arrived(empty, plan, 5);
    expect(here.visit).toEqual({ people: 9, settlement: all[0]!.key, day: 5 });
    expect(here.lastSettlement).toBe(all[0]!.key);
    expect(planArrival(here, 6, all, first)).toEqual({ kind: "none", reason: "visiting" });
    expect(leavesAt(here, 5)).toBe(false);
    expect(leavesAt(here, 6)).toBe(true);
    const gone = left(here, 6, first);
    expect(gone.visit).toBeUndefined();
    expect(gone.nextDay).toBe(6 + VISIT_EVERY_DAYS);
    expect(gone.faces["9"]).toEqual(plan.face);
    expect(left(here, 6, () => 0.99).nextDay).toBe(6 + VISIT_EVERY_DAYS + 1);
  });
  it("the errand: short until the amount is carried; paid gives the gift and standing; the third earns the offer to stay", () => {
    const face = newFace(0, first);
    expect(deliver(face, 0, 15)).toEqual({ kind: "short", have: 15, need: 16 });
    const paid = deliver(face, 0, 16);
    expect(paid).toEqual({ kind: "paid", gift: GIFTS[0], standing: STANDING_PER_ERRAND, settles: false });
    let f = afterPayment(face, 0, () => 0.5);
    expect(f.paid).toBe(1);
    expect(f.errand).toEqual(ERRANDS[0]![1]);
    expect(mayStay(f)).toBe(false);
    f = afterPayment(f, 0, first);
    expect(deliver(f, 0, 64)).toMatchObject({ settles: true });
    f = afterPayment(f, 0, first);
    expect(f.paid).toBe(ERRANDS_TO_SETTLE);
    expect(mayStay(f)).toBe(true);
  });
  it("settles on the nearest empty post the kids placed", () => {
    const s = settlements([post(0, 0), post(10, 0), post(20, 0)])[0]!;
    expect(settleTarget(s, { x: 21, y: 64, z: 0 }, () => true)!.x).toBe(20);
    expect(settleTarget(s, { x: 21, y: 64, z: 0 }, (p) => p.x !== 20)!.x).toBe(10);
    expect(settleTarget(s, { x: 21, y: 64, z: 0 }, () => false)).toBeUndefined();
  });
  it("reads its state back, and starts empty from anything else", () => {
    const s = { ...empty, nextDay: 9, faces: { "3": newFace(3, first) } };
    expect(parseState(JSON.stringify(s))).toEqual(s);
    expect(parseState("nonsense")).toEqual(empty);
    expect(parseState(JSON.stringify({ version: 2 }))).toEqual(empty);
    expect(parseState(undefined).faces).not.toBe(parseState(undefined).faces);
  });
});
