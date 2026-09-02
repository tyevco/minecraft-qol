import { describe, expect, it } from "vitest";
import {
  linkKey,
  packRecord,
  parseLinkKey,
  samePosition,
  unpackRecord,
  type Position,
  type TurretRecord,
} from "../scripts/core/record";

const pos: Position = { dimId: "minecraft:overworld", x: -12, y: 64, z: 300 };

describe("link keys", () => {
  it("round-trips a position, dimension colon included", () => {
    expect(parseLinkKey(linkKey(pos))).toEqual(pos);
  });

  it("handles negative and zero coordinates", () => {
    const p = { dimId: "minecraft:nether", x: 0, y: -64, z: -1 };
    expect(parseLinkKey(linkKey(p))).toEqual(p);
  });

  it("rejects malformed keys", () => {
    expect(parseLinkKey("hs:anchors")).toBeUndefined();
    expect(parseLinkKey("minecraft:overworld|1,2")).toBeUndefined();
    expect(parseLinkKey("minecraft:overworld|1,2,x")).toBeUndefined();
    expect(parseLinkKey("minecraft:overworld|1,,3")).toBeUndefined();
    expect(parseLinkKey("|1,2,3")).toBeUndefined();
    expect(parseLinkKey("minecraft:overworld|1.5,2,3")).toBeUndefined();
  });
});

describe("row packing", () => {
  const full: TurretRecord = { ...pos, entityId: "-4294967295", ammo: 17, kills: 3 };

  it("round-trips a full record", () => {
    expect(unpackRecord(packRecord(full))).toEqual(full);
  });

  it("round-trips an unlinked record with the entity absent, not empty", () => {
    const unlinked: TurretRecord = { ...pos, ammo: 0, kills: 0 };
    const back = unpackRecord(packRecord(unlinked));
    expect(back).toBeDefined();
    expect(back!.entityId).toBeUndefined();
  });

  it("packs to plain JSON values only", () => {
    expect(JSON.parse(JSON.stringify(packRecord(full)))).toEqual(packRecord(full));
  });

  it("drops anything malformed rather than guessing", () => {
    expect(unpackRecord(undefined)).toBeUndefined();
    expect(unpackRecord("nope")).toBeUndefined();
    expect(unpackRecord({})).toBeUndefined();
    expect(unpackRecord([])).toBeUndefined();
    expect(unpackRecord(["minecraft:overworld", 1, 2, 3])).toBeUndefined();
    expect(unpackRecord(["", 1, 2, 3, "", 0, 0])).toBeUndefined();
    expect(unpackRecord(["minecraft:overworld", 1.5, 2, 3, "", 0, 0])).toBeUndefined();
    expect(unpackRecord(["minecraft:overworld", 1, 2, 3, 7, 0, 0])).toBeUndefined();
    expect(unpackRecord(["minecraft:overworld", 1, 2, 3, "", "0", 0])).toBeUndefined();
  });

  it("clamps negative or fractional counters on read", () => {
    const back = unpackRecord(["minecraft:overworld", 1, 2, 3, "", -3, 2.9]);
    expect(back!.ammo).toBe(0);
    expect(back!.kills).toBe(2);
  });
});

describe("samePosition", () => {
  it("compares dimension and all three coordinates", () => {
    expect(samePosition(pos, { ...pos })).toBe(true);
    expect(samePosition(pos, { ...pos, dimId: "minecraft:nether" })).toBe(false);
    expect(samePosition(pos, { ...pos, y: pos.y + 1 })).toBe(false);
  });
});
