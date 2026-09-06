import { describe, expect, it } from "vitest";
import { boxOfRecord, contains, packRecord, sameTable, unpackRecord, type BuildingRecord } from "../scripts/core/record";

const record: BuildingRecord = { dimId: "minecraft:overworld", x: 10, y: 64, z: -3, key: "tallfolk_well", rotation: 1, sx: 5, sy: 7, sz: 5, phase: "building", done: 12, table: { x: 20, y: 64, z: 0 }, free: false };

describe("records", () => {
  it("round-trip through the packed row", () => {
    expect(unpackRecord(packRecord(record))).toEqual(record);
    expect(unpackRecord(packRecord({ ...record, phase: "removing", done: 0 }))).toMatchObject({ phase: "removing", done: 0 });
    expect(unpackRecord(packRecord({ ...record, free: true }))?.free).toBe(true);
    expect(unpackRecord(packRecord({ ...record, phase: "repairing" }))?.phase).toBe("repairing");
  });
  it("read a schema-1 row, which has no free column, as paid for", () => {
    expect(unpackRecord(packRecord(record).slice(0, 14))).toEqual(record);
  });
  it("reject a row of the wrong shape rather than guessing", () => {
    expect(unpackRecord(undefined)).toBeUndefined();
    expect(unpackRecord(["minecraft:overworld", 1, 2, 3])).toBeUndefined();
    expect(unpackRecord(packRecord(record).map((v, i) => (i === 5 ? 7 : v)))).toBeUndefined();
    expect(unpackRecord(packRecord(record).map((v, i) => (i === 9 ? 4 : v)))).toBeUndefined();
    expect(unpackRecord(packRecord(record).map((v, i) => (i === 1 ? 1.5 : v)))).toBeUndefined();
  });
  it("knows its box and whether a point is inside it", () => {
    expect(boxOfRecord(record)).toEqual({ x: 10, y: 64, z: -3, sx: 5, sy: 7, sz: 5 });
    expect(contains(record, { x: 10, y: 64, z: -3 })).toBe(true);
    expect(contains(record, { x: 14, y: 70, z: 1 })).toBe(true);
    expect(contains(record, { x: 15, y: 64, z: 0 })).toBe(false);
    expect(contains(record, { x: 12, y: 63, z: 0 })).toBe(false);
  });
  it("is tied to its table", () => {
    expect(sameTable(record, { x: 20, y: 64, z: 0 })).toBe(true);
    expect(sameTable(record, { x: 21, y: 64, z: 0 })).toBe(false);
  });
});
