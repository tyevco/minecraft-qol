import { describe, expect, it } from "vitest";
import { BUILDINGS } from "../../../tools/structures/buildings";
import { blueprintItemId, CATALOGUE, itemFor, keyOfBlueprintItem, materials, plainName, structureId, type Cell } from "../scripts/core/blueprint";
import { countItems, nextPlacement, nextRemoval, stillOurs, ticksPerBlock } from "../scripts/core/job";

const cell = (name: string, states = {}): Cell => ({ x: 0, y: 0, z: 0, name, states });

describe("itemFor", () => {
  it("charges one item of the block's own name", () => {
    expect(itemFor(cell("minecraft:dark_oak_stairs", { weirdo_direction: 1 }))).toBe("minecraft:dark_oak_stairs");
    expect(itemFor(cell("minecraft:chest"))).toBe("minecraft:chest");
  });
  it("charges nothing for water, a door's upper half or a bed's head", () => {
    expect(itemFor(cell("minecraft:water"))).toBeUndefined();
    expect(itemFor(cell("minecraft:spruce_door", { upper_block_bit: true }))).toBeUndefined();
    expect(itemFor(cell("minecraft:spruce_door", { upper_block_bit: false }))).toBe("minecraft:spruce_door");
    expect(itemFor(cell("minecraft:bed", { head_piece_bit: true }))).toBeUndefined();
  });
});

describe("materials", () => {
  it("counts the well as the design does, water aside, most first", () => {
    const well = BUILDINGS.find((b) => b.key === "tallfolk_well")!;
    const m = materials(well.blocks().map((b) => ({ x: b.x, y: b.y, z: b.z, name: b.name, states: b.states })));
    expect(m).toEqual({ "minecraft:cobblestone": 32, "minecraft:dark_oak_stairs": 24, "minecraft:dark_oak_planks": 10, "minecraft:oak_fence": 8, "minecraft:dark_oak_slab": 1, "minecraft:lantern": 1 });
    expect(Object.keys(m)[0]).toBe("minecraft:cobblestone");
  });
  it("asks for one door, not two halves", () => {
    const larder = BUILDINGS.find((b) => b.key === "shared_larder")!;
    const m = materials(larder.blocks().map((b) => ({ x: b.x, y: b.y, z: b.z, name: b.name, states: b.states })));
    expect(m["minecraft:spruce_door"]).toBe(1);
    expect(m["minecraft:chest"]).toBe(5);
  });
});

describe("the catalogue", () => {
  it("names a structure and an item per building, and reads the key back off the item", () => {
    for (const e of CATALOGUE) {
      expect(structureId(e.key)).toBe(`builder:${e.key}`);
      expect(keyOfBlueprintItem(blueprintItemId(e.key))).toBe(e.key);
      expect(BUILDINGS.some((b) => b.key === e.key), `${e.key} is not a generated building`).toBe(true);
    }
    expect(keyOfBlueprintItem("minecraft:paper")).toBeUndefined();
    expect(keyOfBlueprintItem("builder:blueprint_castle")).toBeUndefined();
  });
  it("says a block's name plainly", () => {
    expect(plainName("minecraft:dark_oak_stairs")).toBe("dark oak stairs");
  });
});

describe("job steps", () => {
  const cells = [cell("minecraft:cobblestone"), cell("minecraft:water"), cell("minecraft:lantern", { hanging: true })];
  it("places forward and takes backward, one cell a step", () => {
    expect(nextPlacement(cells, 0)).toEqual({ kind: "place", index: 0, cell: cells[0], item: "minecraft:cobblestone" });
    expect(nextPlacement(cells, 1)).toMatchObject({ kind: "place", index: 1, item: undefined });
    expect(nextPlacement(cells, 3)).toEqual({ kind: "done" });
    const removal = [...cells].reverse();
    expect(nextRemoval(removal, 0)).toEqual({ kind: "take", index: 0, cell: cells[2], item: "minecraft:lantern" });
    expect(nextRemoval(removal, 2)).toMatchObject({ kind: "take", index: 2, cell: cells[0] });
    expect(nextRemoval(removal, 3)).toEqual({ kind: "done" });
  });
  it("counts a chest and knows its own blocks", () => {
    expect(countItems([{ typeId: "a", amount: 3 }, { typeId: "b", amount: 1 }, { typeId: "a", amount: 2 }])).toEqual({ a: 5, b: 1 });
    expect(stillOurs(cells[0]!, "minecraft:cobblestone")).toBe(true);
    expect(stillOurs(cells[0]!, "minecraft:stone")).toBe(false);
  });
  it("paces in ticks, never below one", () => {
    expect(ticksPerBlock(4)).toBe(80);
    expect(ticksPerBlock(0)).toBe(1);
  });
});
