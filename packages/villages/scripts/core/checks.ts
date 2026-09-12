/**
 * The checks before anything is placed (docs/design/settlements.md §5.2),
 * as pure functions over the building's cells and a lookup into the world's
 * blocks. Each refusal names the first offender by coordinate and name, so
 * the player is told what is in the way rather than that something is.
 */
import type { Cell, Size } from "./blueprint";

export interface WorldCell {
  typeId: string;
  isAir: boolean;
  isLiquid: boolean;
}

/** A block in the world, or undefined where the chunk is not loaded. */
export type Lookup = (x: number, y: number, z: number) => WorldCell | undefined;

export interface Offender {
  x: number;
  y: number;
  z: number;
  name: string;
}

export type Verdict = { ok: true } | { ok: false; reason: string; at?: Offender };

export interface Box {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

/** Things a building may grow through: plants, snow, mushrooms, the odd vine. */
const PLANT =
  /(^|:)(short_grass|tall_grass|tallgrass|fern|large_fern|double_plant|dandelion|poppy|blue_orchid|allium|azure_bluet|red_tulip|orange_tulip|white_tulip|pink_tulip|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|torchflower|pink_petals|wildflowers|leaf_litter|bush|firefly_bush|dead_bush|deadbush|sweet_berry_bush|(brown|red)_mushroom|sapling|(oak|spruce|birch|jungle|acacia|dark_oak|cherry|pale_oak|mangrove)_sapling|bamboo_sapling|seagrass|kelp|vine|cave_vines|glow_lichen|moss_carpet|hanging_roots|sugar_cane|reeds|snow_layer|cactus_flower|open_eyeblossom|closed_eyeblossom)$/;
/** The ground a footing may replace: what a field or a hill is made of. */
const GROUND =
  /(^|:)(grass_block|grass|dirt|coarse_dirt|rooted_dirt|podzol|mycelium|dirt_with_roots|grass_path|farmland|mud|clay|sand|red_sand|gravel|stone|cobblestone|mossy_cobblestone|deepslate|granite|diorite|andesite|tuff|calcite|dripstone_block|sandstone|red_sandstone|terracotta|hardened_clay|stained_hardened_clay|packed_ice|ice|snow|moss_block|pale_moss_block|netherrack|soul_sand|soul_soil|end_stone|(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_terracotta|(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_concrete_powder)$/;

export const isPlant = (typeId: string): boolean => PLANT.test(typeId);
export const isGround = (typeId: string): boolean => GROUND.test(typeId);

/** Whether a cell above the footing may be built through. */
export function isClear(c: WorldCell): boolean {
  return c.isAir || c.isLiquid || isPlant(c.typeId);
}

/** Whether a footing cell may be replaced: clear, or natural ground. */
export function isFootingClear(c: WorldCell): boolean {
  return isClear(c) || isGround(c.typeId);
}

/** Something a footing can rest on: not air, not water, not a plant. */
export function isSolid(c: WorldCell): boolean {
  return !c.isAir && !c.isLiquid && !isPlant(c.typeId);
}

const at = (x: number, y: number, z: number, name: string): Offender => ({ x, y, z, name });

/**
 * Fits (§5.2 item 1): every cell of the box, the whole box and not only the
 * cells the building writes, is clear; the footing layer (y = 0, which
 * replaces the top of the turf) may also be natural ground.
 */
export function fits(origin: { x: number; y: number; z: number }, size: Size, lookup: Lookup): Verdict {
  for (let j = 0; j < size.y; j++)
    for (let i = 0; i < size.x; i++)
      for (let k = 0; k < size.z; k++) {
        const x = origin.x + i, y = origin.y + j, z = origin.z + k;
        const c = lookup(x, y, z);
        if (!c) return { ok: false, reason: `the ground at ${x},${y},${z} is not loaded`, at: at(x, y, z, "unloaded") };
        const clear = j === 0 ? isFootingClear(c) : isClear(c);
        if (!clear) return { ok: false, reason: `${plain(c.typeId)} is in the way at ${x},${y},${z}`, at: at(x, y, z, c.typeId) };
      }
  return { ok: true };
}

/**
 * Grounded (§5.2 item 2): a solid block under every footing cell, that is
 * every cell the building places on its bottom layer. `cells` are in world
 * coordinates, as `worldCells` gives them. A building on stilts (the bridge
 * span; the catalogue entry says so) may stand on water as well, since its
 * posts go down into the river; never on air or a plant.
 */
export function grounded(originY: number, cells: readonly Cell[], lookup: Lookup, stilts = false): Verdict {
  for (const c of cells) {
    if (c.y !== originY) continue;
    const x = c.x, y = originY - 1, z = c.z;
    const under = lookup(x, y, z);
    if (!under) return { ok: false, reason: `the ground at ${x},${y},${z} is not loaded`, at: at(x, y, z, "unloaded") };
    const stands = isSolid(under) || (stilts && under.isLiquid);
    if (!stands) return { ok: false, reason: `nothing to stand on at ${x},${y},${z} (${plain(under.typeId)})`, at: at(x, y, z, under.typeId) };
  }
  return { ok: true };
}

export interface Shortfall {
  item: string;
  need: number;
  have: number;
}

/** Paid for (§5.2 item 3): the chest holds every material; what is short, listed. */
export function paidFor(needed: Readonly<Record<string, number>>, have: Readonly<Record<string, number>>): { ok: true } | { ok: false; short: Shortfall[]; reason: string } {
  const short: Shortfall[] = [];
  for (const [item, need] of Object.entries(needed)) {
    const got = have[item] ?? 0;
    if (got < need) short.push({ item, need, have: got });
  }
  if (!short.length) return { ok: true };
  return { ok: false, short, reason: `short of ${short.map((s) => `${s.need - s.have} ${plain(s.item)}`).join(", ")}` };
}

/** Boxes may touch (walls and bridges join) but not share a cell. */
export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.sx && b.x < a.x + a.sx && a.y < b.y + b.sy && b.y < a.y + a.sy && a.z < b.z + b.sz && b.z < a.z + a.sz;
}

/** Not overlapping (§5.2 item 4): the first recorded box this one would cut into. */
export function overlapping<B extends Box>(box: Box, others: readonly B[]): B | undefined {
  return others.find((o) => intersects(box, o));
}

export const boxOf = (origin: { x: number; y: number; z: number }, size: Size): Box => ({ x: origin.x, y: origin.y, z: origin.z, sx: size.x, sy: size.y, sz: size.z });

const plain = (id: string): string => id.replace(/^[^:]+:/, "").replace(/_/g, " ");
