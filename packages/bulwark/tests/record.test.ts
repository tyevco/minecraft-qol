import { describe, expect, it } from "vitest";
import {
  KEY_PREFIX,
  SCHEMA,
  decodeRecord,
  encodeRecord,
  isRecordKey,
  parseRecordKey,
  recordKey,
  samePosition,
  type Position,
  type TurretRecord,
} from "../scripts/core/record";

const pos: Position = { dimId: "minecraft:overworld", x: -12, y: 64, z: 300 };

describe("record keys", () => {
  it("round-trips a position through the key, dimension colon included", () => {
    const key = recordKey(pos);
    expect(key.startsWith(KEY_PREFIX)).toBe(true);
    expect(parseRecordKey(key)).toEqual(pos);
  });

  it("handles negative and zero coordinates", () => {
    const p = { dimId: "minecraft:nether", x: 0, y: -64, z: -1 };
    expect(parseRecordKey(recordKey(p))).toEqual(p);
  });

  it("rejects keys that are not ours", () => {
    expect(isRecordKey("hs:anchors")).toBe(false);
    expect(parseRecordKey("hs:anchors")).toBeUndefined();
    expect(parseRecordKey(`${KEY_PREFIX}minecraft:overworld|1,2`)).toBeUndefined();
    expect(parseRecordKey(`${KEY_PREFIX}minecraft:overworld|1,2,x`)).toBeUndefined();
    expect(parseRecordKey(`${KEY_PREFIX}|1,2,3`)).toBeUndefined();
    expect(parseRecordKey(`${KEY_PREFIX}minecraft:overworld|1.5,2,3`)).toBeUndefined();
  });
});

describe("record encoding", () => {
  const full: TurretRecord = { ...pos, entityId: "-4294967295", ammo: 17, kills: 3 };

  it("round-trips a full record", () => {
    const decoded = decodeRecord(pos, encodeRecord(full));
    expect(decoded).toEqual({ ok: true, record: full });
  });

  it("round-trips an unlinked record with the entity absent, not empty", () => {
    const unlinked: TurretRecord = { ...pos, ammo: 0, kills: 0 };
    const decoded = decodeRecord(pos, encodeRecord(unlinked));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.record.entityId).toBeUndefined();
      expect("entityId" in decoded.record && decoded.record.entityId).toBeFalsy();
    }
  });

  it("stores the current schema first", () => {
    expect(JSON.parse(encodeRecord(full))[0]).toBe(SCHEMA);
  });

  it("refuses a newer schema rather than misreading it", () => {
    const raw = JSON.stringify([SCHEMA + 1, "1", 5, 0]);
    expect(decodeRecord(pos, raw)).toEqual({ ok: false, reason: "newer-schema" });
  });

  it("reports corruption for anything malformed", () => {
    expect(decodeRecord(pos, undefined)).toEqual({ ok: false, reason: "corrupt" });
    expect(decodeRecord(pos, 42)).toEqual({ ok: false, reason: "corrupt" });
    expect(decodeRecord(pos, "not json")).toEqual({ ok: false, reason: "corrupt" });
    expect(decodeRecord(pos, "{}")).toEqual({ ok: false, reason: "corrupt" });
    expect(decodeRecord(pos, "[1]")).toEqual({ ok: false, reason: "corrupt" });
    expect(decodeRecord(pos, JSON.stringify([1, 7, 1, 1]))).toEqual({ ok: false, reason: "corrupt" });
    expect(decodeRecord(pos, JSON.stringify([1, "7", "1", 1]))).toEqual({ ok: false, reason: "corrupt" });
  });

  it("clamps negative or fractional counters on read", () => {
    const raw = JSON.stringify([SCHEMA, "", -3, 2.9]);
    const decoded = decodeRecord(pos, raw);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.record.ammo).toBe(0);
      expect(decoded.record.kills).toBe(2);
    }
  });
});

describe("samePosition", () => {
  it("compares dimension and all three coordinates", () => {
    expect(samePosition(pos, { ...pos })).toBe(true);
    expect(samePosition(pos, { ...pos, dimId: "minecraft:nether" })).toBe(false);
    expect(samePosition(pos, { ...pos, y: pos.y + 1 })).toBe(false);
  });
});
