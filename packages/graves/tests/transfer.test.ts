import { describe, expect, it } from "vitest";
import {
  parseEquipmentAt,
  planTransfer,
  type Source,
} from "../scripts/core/transfer";

const slot = (index: number): Source => ({ kind: "slot", index });
const equip = (slot: string): Source => ({ kind: "equipment", slot });

describe("planTransfer", () => {
  it("does nothing for an empty inventory", () => {
    expect(planTransfer([], 45)).toEqual({
      moves: [],
      equipmentAt: {},
      leftover: [],
    });
  });

  it("packs sources into consecutive grave slots, armour first", () => {
    const plan = planTransfer(
      [slot(5), slot(0), equip("Chest"), equip("Head")],
      45,
    );
    expect(plan.moves.map((m) => m.to)).toEqual([0, 1, 2, 3]);
    expect(plan.moves.map((m) => m.from)).toEqual([
      equip("Chest"),
      equip("Head"),
      slot(0),
      slot(5),
    ]);
    expect(plan.equipmentAt).toEqual({ 0: "Chest", 1: "Head" });
    expect(plan.leftover).toEqual([]);
  });

  it("leaves the tail with the player when the stone is short", () => {
    const plan = planTransfer([slot(0), slot(1), slot(2), equip("Legs")], 2);
    expect(plan.moves.map((m) => m.from)).toEqual([equip("Legs"), slot(0)]);
    expect(plan.leftover).toEqual([slot(1), slot(2)]);
  });

  it("never plans more moves than capacity", () => {
    const many = Array.from({ length: 41 }, (_, i) => slot(i));
    expect(planTransfer(many, 27).moves).toHaveLength(27);
    expect(planTransfer(many, 27).leftover).toHaveLength(14);
  });
});

describe("parseEquipmentAt", () => {
  it("round-trips a plan's map", () => {
    const map = planTransfer([equip("Head"), slot(3)], 45).equipmentAt;
    expect(parseEquipmentAt(JSON.stringify(map))).toEqual({ 0: "Head" });
  });
  it("tolerates garbage", () => {
    expect(parseEquipmentAt(undefined)).toEqual({});
    expect(parseEquipmentAt("nope")).toEqual({});
    expect(parseEquipmentAt(JSON.stringify({ a: "Head", 1: 2 }))).toEqual({});
  });
});
