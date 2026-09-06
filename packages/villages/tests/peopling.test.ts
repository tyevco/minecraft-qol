import { describe, expect, it } from "vitest";
import { DAY, decide, spawnSpot } from "../scripts/core/peopling";
import { FRESH, JOBS, PEOPLE_PER_PAGE, PEOPLES, packRecord, peopleIndex, peopleStates, unpackRecord, type PostRecord } from "../scripts/core/record";

const post: PostRecord = { dimId: "minecraft:overworld", x: 1, y: 64, z: 2, people: 3, job: 1, ...FRESH };

describe("decide", () => {
  it("keeps a living person", () => {
    expect(decide({ ...post, spawnedAt: 100, entityId: "e" }, true, 5000)).toEqual({ kind: "keep" });
  });
  it("spawns on the first tick of a post that never spawned", () => {
    expect(decide(post, false, 12)).toEqual({ kind: "spawn" });
  });
  it("waits a day before replacing a lost person, then spawns", () => {
    const r = { ...post, spawnedAt: 1000, entityId: "gone" };
    expect(decide(r, false, 1000 + DAY - 1)).toEqual({ kind: "wait", ticksLeft: 1 });
    expect(decide(r, false, 1000 + DAY)).toEqual({ kind: "spawn" });
  });
  it("puts the person in front of the post", () => {
    expect(spawnSpot({ x: 3, y: 64, z: 7 })).toEqual({ x: 3.5, y: 64, z: 8.5 });
  });
});

describe("record", () => {
  it("round-trips through the packed row", () => {
    const r: PostRecord = { ...post, entityId: "-123", spawnedAt: 42 };
    expect(unpackRecord(packRecord(r))).toEqual(r);
    expect(unpackRecord(packRecord(post))).toEqual(post);
  });
  it("splits a people index across the block's two states and reads it back", () => {
    expect(peopleStates(3)).toEqual({ "villages:people": 3, "villages:page": 0 });
    expect(peopleStates(18)).toEqual({ "villages:people": 2, "villages:page": 1 });
    for (let i = 0; i < PEOPLES.length; i++) {
      const st = peopleStates(i);
      expect(st["villages:people"]).toBeLessThan(PEOPLE_PER_PAGE);
      expect(peopleIndex(st["villages:people"], st["villages:page"])).toBe(i);
    }
    expect(peopleIndex(7, 0)).toBe(7); // a post from before the page state existed reads its page as 0
  });
  it("drops a row with an unknown people or job rather than guess", () => {
    expect(unpackRecord(["minecraft:overworld", 0, 0, 0, PEOPLES.length, 0, "", 0])).toBeUndefined();
    expect(unpackRecord(["minecraft:overworld", 0, 0, 0, PEOPLES.length - 1, 0, "", 0])).toMatchObject({ people: PEOPLES.length - 1 });
    expect(unpackRecord(["minecraft:overworld", 0, 0, 0, 0, JOBS.length, "", 0])).toBeUndefined();
    expect(unpackRecord(["", 0, 0, 0, 0, 0, "", 0])).toBeUndefined();
  });
});
