import { describe, expect, it } from "vitest";
import { slabOf, stairsOf } from "../../../tools/structures/blueprint";
import { BUILDINGS } from "../../../tools/structures/buildings";
import { PEOPLES } from "../../../tools/structures/villages";
import { materials, type Cell } from "../scripts/core/blueprint";
import { applyPalette, FAMILIES, PALETTES, paletteByKey, paletteTable, ROLES, shapeStates, sourcePaletteOf, swapTable } from "../scripts/core/palette";

/** A catalogue building's cells as the builder pack ships them: the villages' job post left out (`builderBlueprint` in tools/structures/generate.ts). */
const cells = (key: string): Cell[] =>
  BUILDINGS.find((b) => b.key === key)!
    .blocks()
    .filter((b) => b.name !== "villages:post")
    .map((b) => ({ x: b.x, y: b.y, z: b.z, name: b.name, states: b.states }));

describe("palettes", () => {
  it("know their families as the generator does", () => {
    for (const [block, f] of Object.entries(FAMILIES)) {
      const short = block.replace("minecraft:", "");
      expect(`minecraft:${stairsOf(short)}`, `${block} stairs`).toBe(f.stairs);
      expect(`minecraft:${slabOf(short)}`, `${block} slab`).toBe(f.slab);
    }
  });
  it("name every people of the villages pack and the shared row, and know whose a building is", () => {
    expect(PALETTES.map((p) => p.key)).toEqual([...PEOPLES.map((p) => p.key), "shared"]);
    for (const people of PEOPLES) expect(paletteByKey(people.key)?.title, people.key).toBe(people.title);
    expect(sourcePaletteOf("tallfolk_well")?.key).toBe("tallfolk");
    expect(sourcePaletteOf("wood_elf_hearth")?.key).toBe("wood_elf");
    expect(sourcePaletteOf("high_elf_hall")?.key).toBe("high_elf");
    expect(sourcePaletteOf("shared_larder")?.key).toBe("shared");
    expect(sourcePaletteOf("survey_3")).toBeUndefined();
  });
  it("are drawn from the blocks each people's buildings are built of", () => {
    // Every role block of every people stands in one of that people's generated buildings (glass and wool aside: a cottage's
    // window and a stall's stripes are what the swap gives, whether or not the people has authored one yet).
    for (const pal of PALETTES) {
      if (pal.key === "shared") continue;
      const built = new Set(BUILDINGS.filter((b) => b.key.startsWith(`${pal.key}_`)).flatMap((b) => b.blocks().map((c) => c.name)));
      expect(built.size, `${pal.key} has generated buildings`).toBeGreaterThan(0);
      for (const role of ROLES) for (const block of pal.roles[role]) if (!/glass|wool/.test(block)) expect(built.has(block), `${pal.key} ${role} ${block} is built somewhere`).toBe(true);
    }
  });
  it("give a swapped leaf or mushroom block the states it needs to stand", () => {
    expect(shapeStates("minecraft:dark_oak_leaves", { weirdo_direction: 1 })).toEqual({ persistent_bit: true, update_bit: false });
    expect(shapeStates("minecraft:mushroom_stem", { pillar_axis: "y" })).toEqual({ huge_mushroom_bits: 15 });
    expect(shapeStates("minecraft:red_mushroom_block", {})).toEqual({ huge_mushroom_bits: 14 });
    expect(shapeStates("minecraft:quartz_pillar", { pillar_axis: "x" })).toEqual({ pillar_axis: "x" });
  });
  it("raise the well as the high elves build it: diorite footing, a prismarine roof by its legacy stair name", () => {
    const m = materials(applyPalette(cells("tallfolk_well"), paletteTable("tallfolk_well", "high_elf")));
    expect(m).toEqual({ "minecraft:polished_diorite": 32, "minecraft:prismarine_bricks_stairs": 24, "minecraft:prismarine_bricks": 10, "minecraft:oak_fence": 8, "minecraft:prismarine_brick_slab": 1, "minecraft:lantern": 1 });
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
  it("swap an awning stripe for stripe: the colour to the people's, white to white, and none for the shared row", () => {
    const reed = swapTable(paletteByKey("tinker")!, paletteByKey("reedfolk")!);
    expect(reed["minecraft:red_wool"]).toBe("minecraft:green_wool");
    expect(reed["minecraft:white_wool"]).toBeUndefined();
    expect(swapTable(paletteByKey("tinker")!, paletteByKey("tallfolk")!)["minecraft:red_wool"]).toBe("minecraft:yellow_wool");
    expect(swapTable(paletteByKey("tinker")!, paletteByKey("stonefolk")!)["minecraft:red_wool"]).toBeUndefined(); // red already
    expect(swapTable(paletteByKey("tinker")!, paletteByKey("shared")!)["minecraft:red_wool"]).toBeUndefined(); // no awning to take
    // The stall as the reedfolk build it: mangrove footing, green and white stripes, the counters and posts as authored.
    expect(materials(applyPalette(cells("tinker_stall"), paletteTable("tinker_stall", "reedfolk")))).toEqual({
      "minecraft:mangrove_log": 49,
      "minecraft:green_wool": 28,
      "minecraft:white_wool": 21,
      "minecraft:spruce_fence": 10,
      "minecraft:barrel": 7,
      "minecraft:chest": 1,
      "minecraft:lantern": 1,
    });
    const shared = applyPalette(cells("tinker_stall"), paletteTable("tinker_stall", "shared"));
    expect(materials(shared)["minecraft:red_wool"]).toBe(28);
    expect(materials(shared)["minecraft:stone_bricks"]).toBe(49);
  });
  it("raise the larder as tinker: brick footing and walls, copper corners, a copper roof", () => {
    const m = materials(applyPalette(cells("shared_larder"), paletteTable("shared_larder", "tinker")));
    expect(m["minecraft:brick_block"]).toBe(25 + 69); // footing and walls, and the larder's spruce roof planks swap as wall
    expect(m["minecraft:copper_block"]).toBe(12);
    expect(m["minecraft:brick_stairs"]).toBe(48);
    expect(m["minecraft:chest"]).toBe(4); // a double chest and two singles; the fifth is a barrel, since three in a row pair badly
    expect(m["minecraft:barrel"]).toBe(1);
  });
});
