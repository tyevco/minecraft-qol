import { describe, expect, it } from "vitest";
import { builderBlueprint, STILTS } from "../../../tools/structures/builder";
import { BUILDINGS } from "../../../tools/structures/buildings";
import { blueprintItemId, CATALOGUE, itemFor, keyOfBlueprintItem, materials, plainName, structureId, type Cell } from "../scripts/core/blueprint";
import { countItems, nextPlacement, nextRemoval, nextRepair, repairStatus, stillOurs, ticksPerBlock } from "../scripts/core/job";

const cell = (name: string, states = {}): Cell => ({ x: 0, y: 0, z: 0, name, states });

describe("itemFor", () => {
  it("charges one item of the block's own name", () => {
    expect(itemFor(cell("minecraft:dark_oak_stairs", { weirdo_direction: 1 }))).toBe("minecraft:dark_oak_stairs");
    expect(itemFor(cell("minecraft:chest"))).toBe("minecraft:chest");
  });
  it("charges dirt for farmland and a path, and seeds for a crop", () => {
    expect(itemFor(cell("minecraft:farmland", { moisturized_amount: 7 }))).toBe("minecraft:dirt");
    expect(itemFor(cell("minecraft:grass_path"))).toBe("minecraft:dirt");
    expect(itemFor(cell("minecraft:wheat", { growth: 7 }))).toBe("minecraft:wheat_seeds");
    expect(itemFor(cell("minecraft:carrots", { growth: 7 }))).toBe("minecraft:carrot");
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
  it("asks for the field in dirt and seeds, the channel's water free", () => {
    const field = builderBlueprint("tallfolk_field");
    const m = materials(field.blocks().map((b) => ({ x: b.x, y: b.y, z: b.z, name: b.name, states: b.states })));
    expect(m).toEqual({ "minecraft:dirt": 45, "minecraft:wheat_seeds": 42, "minecraft:grass": 32, "minecraft:oak_fence": 31, "minecraft:chest": 1, "minecraft:fence_gate": 1, "villages:post": 1 });
    expect(field.blocks().filter((b) => b.name === "minecraft:water")).toHaveLength(4);
  });
  it("ships the bridge without the river it stands in", () => {
    const bridge = builderBlueprint("shared_bridge");
    expect(bridge.blocks().some((b) => b.name === "minecraft:water")).toBe(false);
    const m = materials(bridge.blocks().map((b) => ({ x: b.x, y: b.y, z: b.z, name: b.name, states: b.states })));
    expect(m).toEqual({ "minecraft:oak_planks": 21, "minecraft:oak_log": 18, "minecraft:oak_fence": 14, "minecraft:lantern": 2 });
    expect(BUILDINGS.find((b) => b.key === "shared_bridge")!.blocks().some((b) => b.name === "minecraft:water")).toBe(true);
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
      expect(structureId(e.key)).toBe(`villages:${e.key}`);
      expect(keyOfBlueprintItem(blueprintItemId(e.key))).toBe(e.key);
      expect(BUILDINGS.some((b) => b.key === e.key), `${e.key} is not a generated building`).toBe(true);
    }
    // The pack and the generator agree on who stands in water.
    for (const e of CATALOGUE) expect(e.stilts === true, `${e.key} stilts`).toBe(STILTS.has(e.key));
    expect(keyOfBlueprintItem("minecraft:paper")).toBeUndefined();
    expect(keyOfBlueprintItem("villages:blueprint_castle")).toBeUndefined();
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

describe("repair", () => {
  const AIR = { typeId: "minecraft:air", isAir: true, isLiquid: false };
  const WATER = { typeId: "minecraft:water", isAir: false, isLiquid: true };
  const STONE = { typeId: "minecraft:stone", isAir: false, isLiquid: false };
  const POPPY = { typeId: "minecraft:poppy", isAir: false, isLiquid: false };
  const at = (x: number, name: string, states = {}): Cell => ({ x, y: 0, z: 0, name, states });
  it("tells the building's own block from a gap and from somebody else's", () => {
    expect(repairStatus(at(0, "minecraft:cobblestone"), { typeId: "minecraft:cobblestone", isAir: false, isLiquid: false })).toBe("ours");
    expect(repairStatus(at(0, "minecraft:cobblestone"), AIR)).toBe("missing");
    expect(repairStatus(at(0, "minecraft:cobblestone"), POPPY)).toBe("missing");
    expect(repairStatus(at(0, "minecraft:cobblestone"), STONE)).toBe("other");
    expect(repairStatus(at(0, "minecraft:water"), WATER)).toBe("ours");
    expect(repairStatus(at(0, "minecraft:water"), AIR)).toBe("missing");
  });
  it("finds the first gap from where it left off, and lists the cells another block holds", () => {
    const cells = [at(0, "minecraft:cobblestone"), at(1, "minecraft:cobblestone"), at(2, "minecraft:oak_fence"), at(3, "minecraft:lantern", { hanging: true })];
    const world = [STONE, { typeId: "minecraft:cobblestone", isAir: false, isLiquid: false }, AIR, AIR];
    const first = nextRepair(cells, 0, (c) => world[c.x]);
    expect(first.step).toEqual({ kind: "place", index: 2, cell: cells[2], item: "minecraft:oak_fence" });
    expect(first.blocked).toEqual([cells[0]]);
    const second = nextRepair(cells, 3, (c) => world[c.x]);
    expect(second.step).toMatchObject({ kind: "place", index: 3, item: "minecraft:lantern" });
    expect(second.blocked).toEqual([]);
    expect(nextRepair(cells, 4, (c) => world[c.x]).step).toEqual({ kind: "done" });
  });
  it("leaves a cell it cannot see for another pass", () => {
    const cells = [at(0, "minecraft:cobblestone"), at(1, "minecraft:cobblestone")];
    const r = nextRepair(cells, 0, (c) => (c.x === 0 ? undefined : AIR));
    expect(r.step).toMatchObject({ kind: "place", index: 1 });
  });
});
