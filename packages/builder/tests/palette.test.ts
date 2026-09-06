import { describe, expect, it } from "vitest";
import { slabOf, stairsOf } from "../../../tools/structures/blueprint";
import { BUILDINGS } from "../../../tools/structures/buildings";
import { materials, type Cell } from "../scripts/core/blueprint";
import { applyPalette, FAMILIES, PALETTES, paletteByKey, paletteTable, shapeStates, sourcePaletteOf, swapTable } from "../scripts/core/palette";

const cells = (key: string): Cell[] => BUILDINGS.find((b) => b.key === key)!.blocks().map((b) => ({ x: b.x, y: b.y, z: b.z, name: b.name, states: b.states }));

describe("palettes", () => {
  it("know their families as the generator does", () => {
    for (const [block, f] of Object.entries(FAMILIES)) {
      const short = block.replace("minecraft:", "");
      expect(`minecraft:${stairsOf(short)}`, `${block} stairs`).toBe(f.stairs);
      expect(`minecraft:${slabOf(short)}`, `${block} slab`).toBe(f.slab);
    }
  });
  it("name every people of the design's table and the shared row", () => {
    expect(PALETTES.map((p) => p.key)).toEqual(["stonefolk", "reedfolk", "tinker", "tallfolk", "drover", "shared"]);
    expect(sourcePaletteOf("tallfolk_well")?.key).toBe("tallfolk");
    expect(sourcePaletteOf("shared_larder")?.key).toBe("shared");
    expect(sourcePaletteOf("survey_3")).toBeUndefined();
  });
  it("turn the tallfolk row into the stonefolk row block for block, stairs and slabs with it", () => {
    const t = swapTable(paletteByKey("tallfolk")!, paletteByKey("stonefolk")!);
    expect(t["minecraft:cobblestone"]).toBe("minecraft:stone_bricks");
    expect(t["minecraft:stone_stairs"]).toBe("minecraft:stone_brick_stairs");
    expect(t["minecraft:oak_planks"]).toBe("minecraft:stone_bricks");
    expect(t["minecraft:oak_log"]).toBe("minecraft:polished_deepslate");
    expect(t["minecraft:dark_oak_planks"]).toBe("minecraft:deepslate_tiles");
    expect(t["minecraft:dark_oak_stairs"]).toBe("minecraft:deepslate_tile_stairs");
    expect(t["minecraft:dark_oak_slab"]).toBe("minecraft:deepslate_tile_slab");
    expect(t["minecraft:dark_oak_log"]).toBe("minecraft:polished_deepslate");
    expect(t["minecraft:glass_pane"]).toBeUndefined(); // the same in both
    expect(t["minecraft:oak_fence"]).toBeUndefined(); // not a role block
  });
  it("fall back to the roof's stairs for a target with no shaped blocks, and leave a block its own palette", () => {
    const t = swapTable(paletteByKey("tallfolk")!, paletteByKey("drover")!);
    expect(t["minecraft:oak_planks"]).toBe("minecraft:hardened_clay");
    expect(t["minecraft:oak_stairs"]).toBe("minecraft:spruce_stairs"); // clay has none; the drover roof is spruce
    expect(paletteTable("tallfolk_well", "tallfolk")).toEqual({});
    expect(paletteTable("tallfolk_well", "")).toEqual({});
    expect(paletteTable("survey_1", "tinker")).toEqual({});
  });
  it("keep only the shape states a swapped block's kind has", () => {
    expect(shapeStates("minecraft:deepslate_tile_stairs", { weirdo_direction: 2, upside_down_bit: false, wood_type: "dark_oak" })).toEqual({ weirdo_direction: 2, upside_down_bit: false });
    expect(shapeStates("minecraft:polished_deepslate", { pillar_axis: "x", old_log_type: "oak" })).toEqual({});
    expect(shapeStates("minecraft:mangrove_log", { pillar_axis: "x", old_log_type: "oak" })).toEqual({ pillar_axis: "x" });
    expect(shapeStates("minecraft:deepslate_tile_slab", { "minecraft:vertical_half": "top", top_slot_bit: true })).toEqual({ "minecraft:vertical_half": "top" });
  });
  it("raise the well as stonefolk: stone bricks and deepslate tiles, the fences, water and lantern as they were", () => {
    const out = applyPalette(cells("tallfolk_well"), paletteTable("tallfolk_well", "stonefolk"));
    expect(materials(out)).toEqual({ "minecraft:stone_bricks": 32, "minecraft:deepslate_tile_stairs": 24, "minecraft:deepslate_tiles": 10, "minecraft:oak_fence": 8, "minecraft:deepslate_tile_slab": 1, "minecraft:lantern": 1 });
    const stair = out.find((c) => c.name === "minecraft:deepslate_tile_stairs")!;
    expect(Object.keys(stair.states).sort()).toEqual(["upside_down_bit", "weirdo_direction"]);
    expect(out.filter((c) => c.name === "minecraft:water")).toHaveLength(1);
  });
  it("raise the larder as tinker: brick footing and walls, copper corners, a copper roof", () => {
    const m = materials(applyPalette(cells("shared_larder"), paletteTable("shared_larder", "tinker")));
    expect(m["minecraft:brick_block"]).toBe(25 + 69); // footing and walls, and the larder's spruce roof planks swap as wall
    expect(m["minecraft:copper_block"]).toBe(12);
    expect(m["minecraft:brick_stairs"]).toBe(48);
    expect(m["minecraft:chest"]).toBe(5);
  });
});
