/**
 * Palette swaps (docs/design/settlements.md §4): a blueprint carries a palette
 * of roles (footing, wall, corner, roof, ridge, window) and a people's
 * palette fills them, so a watch post in brick and copper is the tinker's.
 * The swap is a substitution over the building's blocks before placement,
 * not a second structure file.
 *
 * A block's role comes from the palette of the people the building was
 * authored for (its source row); it is replaced by the target row's block
 * for that role. Stairs and slabs follow their material: the roof's stairs
 * become the target roof's stairs, through a table of families that the
 * generator also knows (`tools/structures/blueprint.ts`; a unit test holds
 * the two equal). Anything not in the source row - fences, chests,
 * lanterns, doors, hay - stays as authored.
 *
 * The states a swapped cell keeps are the shape states its new kind has:
 * stairs keep their direction, slabs their half, logs their axis. The
 * engine's alias states (`wood_type`, `stone_brick_type`, `old_log_type`)
 * belong to the old block and would make the new permutation fail to
 * resolve, so a swapped cell never carries them.
 */
import type { Cell } from "./blueprint";

export type Role = "footing" | "wall" | "corner" | "roof" | "ridge" | "window" | "awning";
export const ROLES: readonly Role[] = ["footing", "wall", "corner", "roof", "ridge", "window", "awning"];

export interface Palette {
  key: string;
  title: string;
  /**
   * The blocks of each role. A role may name several: the shared row's two
   * footings both become a target's one footing, and an awning's two stripes
   * swap stripe for stripe (the coloured one to the people's colour, white to
   * white). A people with no block for a role leaves it as authored.
   */
  roles: Record<Role, readonly string[]>;
}

const p = (key: string, title: string, footing: string[], wall: string[], corner: string[], roof: string[], ridge: string[], window: string[], awning: string[]): Palette => ({
  key,
  title,
  roles: {
    footing: footing.map(full),
    wall: wall.map(full),
    corner: corner.map(full),
    roof: roof.map(full),
    ridge: ridge.map(full),
    window: window.map(full),
    awning: awning.map(full),
  },
});
function full(name: string): string {
  return name.includes(":") ? name : `minecraft:${name}`;
}

/**
 * Every people's row, as their buildings are built: the settlements' §4
 * table for the first five, the generator's cottage records for the second
 * four (`tools/structures/buildings.ts`) and the ten furfolk
 * (`tools/structures/furfolk.ts`, and `docs/design/furfolk.md` §3 for the
 * awnings). The first block of a cell is what a target takes; an awning is
 * the coloured stripe then white. Then the shared row.
 */
export const PALETTES: readonly Palette[] = [
  p("stonefolk", "Stonefolk", ["stone_bricks"], ["stone_bricks"], ["polished_deepslate"], ["deepslate_tiles"], ["polished_deepslate"], ["glass_pane"], ["red_wool", "white_wool"]),
  p("reedfolk", "Reedfolk", ["mangrove_log"], ["mangrove_planks"], ["mangrove_log"], ["bamboo_mosaic"], ["mangrove_log"], ["glass_pane"], ["green_wool", "white_wool"]),
  p("tinker", "Tinker", ["brick_block"], ["brick_block"], ["copper_block"], ["cut_copper"], ["oxidized_copper"], ["glass"], ["red_wool", "white_wool"]),
  p("tallfolk", "Tallfolk", ["cobblestone"], ["oak_planks"], ["oak_log"], ["dark_oak_planks"], ["dark_oak_log"], ["glass_pane"], ["yellow_wool", "white_wool"]),
  // The second four (villages.md §3.3), then the drovers, in the villages
  // pack's order. The wood elves roof with leaves, which have no stairs, so
  // a roof's stairs stay as authored under them.
  p("hobbit", "Hobbit", ["cobblestone"], ["oak_planks"], ["oak_log"], ["spruce_planks"], ["oak_log"], ["glass_pane"], []),
  p("wood_elf", "Wood Elf", ["dark_oak_planks"], ["spruce_planks"], ["dark_oak_log"], ["dark_oak_leaves"], ["dark_oak_log"], ["glass_pane"], []),
  p("high_elf", "High Elf", ["polished_diorite"], ["quartz_block"], ["quartz_pillar"], ["prismarine_bricks"], ["smooth_quartz"], ["light_blue_stained_glass_pane"], []),
  p("drow", "Drow", ["deepslate_tiles"], ["deepslate_bricks"], ["polished_blackstone"], ["polished_blackstone_bricks"], ["crying_obsidian"], ["purple_stained_glass_pane"], []),
  p("drover", "Drover", ["smooth_sandstone"], ["hardened_clay"], ["stripped_spruce_log"], ["spruce_planks"], ["dark_oak_planks"], ["glass_pane"], ["red_wool", "white_wool"]),
  // The furfolk (furfolk.md §3), roofs as built: the cats' and rabbits' are
  // their wall planks (terracotta and turf have no stairs), the fennecs' is
  // flat smooth sandstone, the mice live in mushroom blocks.
  p("foxfolk", "Foxfolk", ["cobblestone"], ["spruce_planks"], ["spruce_log"], ["mossy_cobblestone"], ["stripped_spruce_log"], ["glass_pane"], ["orange_wool", "white_wool"]),
  p("catfolk", "Catfolk", ["hardened_clay"], ["cherry_planks"], ["cherry_log"], ["cherry_planks"], ["cherry_log"], ["glass_pane"], ["pink_wool", "white_wool"]),
  p("wolffolk", "Wolffolk", ["stone_bricks"], ["spruce_planks"], ["dark_oak_log"], ["dark_oak_planks"], ["dark_oak_log"], ["glass_pane"], ["light_gray_wool", "white_wool"]),
  p("rabbitfolk", "Rabbitfolk", ["packed_mud"], ["birch_planks"], ["birch_log"], ["birch_planks"], ["birch_log"], ["glass_pane"], ["yellow_wool", "white_wool"]),
  p("bearfolk", "Bearfolk", ["cobblestone"], ["dark_oak_log"], ["dark_oak_log"], ["spruce_planks"], ["dark_oak_log"], ["glass_pane"], ["yellow_wool", "brown_wool"]),
  p("fennecfolk", "Fennecfolk", ["sandstone"], ["smooth_sandstone"], ["cut_sandstone"], ["smooth_sandstone"], ["cut_sandstone"], ["glass_pane"], ["orange_wool", "white_wool"]),
  p("mousefolk", "Mousefolk", ["mud_bricks"], ["brown_mushroom_block"], ["mushroom_stem"], ["red_mushroom_block"], ["red_mushroom_block"], ["glass_pane"], ["red_wool", "white_wool"]),
  p("squirrelfolk", "Squirrelfolk", ["jungle_log"], ["jungle_planks"], ["jungle_log"], ["jungle_planks"], ["jungle_log"], ["glass_pane"], ["lime_wool", "white_wool"]),
  p("otterfolk", "Otterfolk", ["cobblestone"], ["stripped_oak_log"], ["oak_log"], ["oak_planks"], ["oak_log"], ["glass_pane"], ["cyan_wool", "white_wool"]),
  p("deerfolk", "Deerfolk", ["mossy_cobblestone"], ["oak_planks"], ["oak_log"], ["oak_planks"], ["oak_log"], ["glass_pane"], ["green_wool", "white_wool"]),
  // The shared buildings: stone brick or cobblestone footings, spruce walls,
  // dark oak roofs, no awning. The larder's roof is spruce too and swaps as wall.
  p("shared", "Shared", ["stone_bricks", "cobblestone"], ["spruce_planks"], ["spruce_log"], ["dark_oak_planks"], ["dark_oak_log"], ["glass_pane"], []),
];

export const paletteByKey = (key: string): Palette | undefined => PALETTES.find((x) => x.key === key);

/** Which palette a catalogue building was authored in: the people its key starts with (`wood_elf_hearth` is the wood elves'), or the shared row. */
export function sourcePaletteOf(buildingKey: string): Palette | undefined {
  return PALETTES.find((x) => buildingKey.startsWith(`${x.key}_`));
}

/**
 * A material's stairs and slab. The generator's table, copied for the pack
 * (core imports nothing from tools); `tests/palette.test.ts` holds the two
 * equal. A material with no shaped blocks is absent.
 */
export const FAMILIES: Readonly<Record<string, { stairs: string; slab: string }>> = {
  "minecraft:stone_bricks": { stairs: "minecraft:stone_brick_stairs", slab: "minecraft:stone_brick_slab" },
  "minecraft:polished_deepslate": { stairs: "minecraft:polished_deepslate_stairs", slab: "minecraft:polished_deepslate_slab" },
  "minecraft:deepslate_tiles": { stairs: "minecraft:deepslate_tile_stairs", slab: "minecraft:deepslate_tile_slab" },
  "minecraft:cobblestone": { stairs: "minecraft:stone_stairs", slab: "minecraft:cobblestone_slab" },
  "minecraft:brick_block": { stairs: "minecraft:brick_stairs", slab: "minecraft:brick_slab" },
  "minecraft:cut_copper": { stairs: "minecraft:cut_copper_stairs", slab: "minecraft:cut_copper_slab" },
  "minecraft:weathered_copper": { stairs: "minecraft:weathered_cut_copper_stairs", slab: "minecraft:weathered_cut_copper_slab" },
  "minecraft:oxidized_copper": { stairs: "minecraft:oxidized_cut_copper_stairs", slab: "minecraft:oxidized_cut_copper_slab" },
  "minecraft:oak_planks": { stairs: "minecraft:oak_stairs", slab: "minecraft:oak_slab" },
  "minecraft:spruce_planks": { stairs: "minecraft:spruce_stairs", slab: "minecraft:spruce_slab" },
  "minecraft:dark_oak_planks": { stairs: "minecraft:dark_oak_stairs", slab: "minecraft:dark_oak_slab" },
  "minecraft:mangrove_planks": { stairs: "minecraft:mangrove_stairs", slab: "minecraft:mangrove_slab" },
  "minecraft:bamboo_mosaic": { stairs: "minecraft:bamboo_mosaic_stairs", slab: "minecraft:bamboo_mosaic_slab" },
  "minecraft:smooth_sandstone": { stairs: "minecraft:smooth_sandstone_stairs", slab: "minecraft:smooth_sandstone_slab" },
  "minecraft:sandstone": { stairs: "minecraft:sandstone_stairs", slab: "minecraft:sandstone_slab" },
  "minecraft:birch_planks": { stairs: "minecraft:birch_stairs", slab: "minecraft:birch_slab" },
  "minecraft:cherry_planks": { stairs: "minecraft:cherry_stairs", slab: "minecraft:cherry_slab" },
  "minecraft:jungle_planks": { stairs: "minecraft:jungle_stairs", slab: "minecraft:jungle_slab" },
  "minecraft:acacia_planks": { stairs: "minecraft:acacia_stairs", slab: "minecraft:acacia_slab" },
  "minecraft:mossy_cobblestone": { stairs: "minecraft:mossy_cobblestone_stairs", slab: "minecraft:mossy_cobblestone_slab" },
  "minecraft:quartz_block": { stairs: "minecraft:quartz_stairs", slab: "minecraft:quartz_slab" },
  "minecraft:smooth_quartz": { stairs: "minecraft:smooth_quartz_stairs", slab: "minecraft:smooth_quartz_slab" },
  "minecraft:polished_diorite": { stairs: "minecraft:polished_diorite_stairs", slab: "minecraft:polished_diorite_slab" },
  "minecraft:prismarine_bricks": { stairs: "minecraft:prismarine_bricks_stairs", slab: "minecraft:prismarine_brick_slab" },
  "minecraft:deepslate_bricks": { stairs: "minecraft:deepslate_brick_stairs", slab: "minecraft:deepslate_brick_slab" },
  "minecraft:polished_blackstone_bricks": { stairs: "minecraft:polished_blackstone_brick_stairs", slab: "minecraft:polished_blackstone_brick_slab" },
  "minecraft:red_sandstone": { stairs: "minecraft:red_sandstone_stairs", slab: "minecraft:red_sandstone_slab" },
  "minecraft:mud_bricks": { stairs: "minecraft:mud_brick_stairs", slab: "minecraft:mud_brick_slab" },
};

/**
 * The block-for-block table that turns a building authored in `from` into
 * `to`: every source role block to the target's block in the same position
 * (or its last, when the target names fewer), and the source materials'
 * stairs and slabs to the target material's (or, for a target with no shaped
 * blocks, to the target roof's, or left alone). A role the target has no
 * block for is left as authored.
 */
export function swapTable(from: Palette, to: Palette): Record<string, string> {
  const table: Record<string, string> = {};
  for (const role of ROLES) {
    const targets = to.roles[role];
    if (!targets.length) continue;
    for (const [i, source] of from.roles[role].entries()) {
      const target = targets[Math.min(i, targets.length - 1)]!;
      if (source in table) continue; // the first role a block plays wins
      if (source !== target) table[source] = target;
      const sf = FAMILIES[source];
      if (!sf) continue;
      const tf = FAMILIES[target] ?? FAMILIES[to.roles.roof[0] ?? ""];
      if (!tf) continue;
      if (sf.stairs !== tf.stairs) table[sf.stairs] = tf.stairs;
      if (sf.slab !== tf.slab) table[sf.slab] = tf.slab;
    }
  }
  return table;
}

const isStairs = (n: string): boolean => /_stairs$/.test(n);
const isSlab = (n: string): boolean => /_slab$/.test(n);
const isMushroom = (n: string): boolean => /mushroom_(block|stem)$/.test(n);
const isLeaves = (n: string): boolean => /_leaves$/.test(n);
const isPillar = (n: string): boolean => /(_log|_wood|_pillar|_stem|_hyphae)$/.test(n);

/**
 * The states a cell of `name` keeps when it arrives by a swap: its kind's
 * shape states only, and the states a kind needs to stand as a building
 * block at all: leaves persistent so they do not decay, a mushroom stem
 * or block solid on every face (the generator's 15 and 14; the default 0
 * is pores all round).
 */
export function shapeStates(name: string, states: Cell["states"]): Cell["states"] {
  const out: Cell["states"] = {};
  if (isStairs(name)) {
    if ("weirdo_direction" in states) out.weirdo_direction = states.weirdo_direction!;
    if ("upside_down_bit" in states) out.upside_down_bit = states.upside_down_bit!;
  } else if (isSlab(name)) {
    if ("minecraft:vertical_half" in states) out["minecraft:vertical_half"] = states["minecraft:vertical_half"]!;
  } else if (isMushroom(name)) {
    out.huge_mushroom_bits = name.endsWith("_stem") ? 15 : 14;
  } else if (isLeaves(name)) {
    out.persistent_bit = true;
    out.update_bit = false;
  } else if (isPillar(name)) {
    if ("pillar_axis" in states) out.pillar_axis = states.pillar_axis!;
  }
  return out;
}

/** The cells with the table applied; a cell the table does not name is the same object. */
export function applyPalette(cells: readonly Cell[], table: Readonly<Record<string, string>>): Cell[] {
  return cells.map((c) => {
    const name = table[c.name];
    if (!name || name === c.name) return c;
    return { ...c, name, states: shapeStates(name, c.states) };
  });
}

/** The table for raising `buildingKey` in the palette `paletteKey`, or an empty one when it is the building's own or unknown. */
export function paletteTable(buildingKey: string, paletteKey: string | undefined): Record<string, string> {
  if (!paletteKey) return {};
  const from = sourcePaletteOf(buildingKey);
  const to = paletteByKey(paletteKey);
  if (!from || !to || from.key === to.key) return {};
  return swapTable(from, to);
}
