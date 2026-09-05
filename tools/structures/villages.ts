/**
 * The villages of docs/design/villages.md, as jigsaw pieces and pools.
 *
 * A village is a square with the people's core building on it, streets that
 * grow from its sockets, houses that hang off the streets, and terminators
 * (a lamp post, a doorstep) for sockets the depth limit or the terrain leaves
 * open. The pieces are blueprints like the buildings; the buildings are the
 * house pool, each given one jigsaw on its doorstep. Every marker sits in
 * the ground layer (y = 0) and its final block is paving, so a resolved joint
 * is seamless and an unresolved one is a paving stub.
 *
 * Marker names are shared: `villages:street` on street ends and square edges,
 * `villages:house` on doorsteps and on the street sides that want a house.
 * The same source emits the .mcstructure pieces, the template pools, the
 * jigsaw structure and the structure set (§2 of the design), and feeds the
 * offline expander (jigsaw.ts) that draws whole villages for the viewer.
 */
import { Blueprint, type Facing, type Jigsaw } from "./blueprint";
import { BUILDINGS } from "./buildings";
import { canvas, expand, type Expansion, type Pool } from "./jigsaw";

export interface People {
  key: string;
  title: string;
  paving: string;
  /** The block under a lamp's lantern. */
  post: string;
  /** Core building on the square (a BUILDINGS key). */
  core: string;
  /** House pool: building keys with weights. */
  houses: [key: string, weight: number][];
  /** Vanilla biome tags the village generates in (any of). */
  biomes: string[];
  salt: number;
}

export const PEOPLES: People[] = [
  { key: "stonefolk", title: "Stonefolk", paving: "cobblestone", post: "cobblestone_wall", core: "stonefolk_hall", houses: [["stonefolk_forge", 2], ["stonefolk_store", 2], ["stonefolk_watchpost", 1], ["shared_larder", 1]], biomes: ["mountains", "extreme_hills", "meadow"], salt: 20260911 },
  { key: "reedfolk", title: "Reedfolk", paving: "mangrove_planks", post: "mangrove_fence", core: "reedfolk_stilt_house", houses: [["reedfolk_stilt_house", 3], ["reedfolk_rack", 2], ["reedfolk_tower", 1], ["shared_larder", 1]], biomes: ["swamp", "mangrove_swamp", "river"], salt: 20260912 },
  { key: "tinker", title: "Tinker", paving: "brick_block", post: "oak_fence", core: "tinker_workshop", houses: [["tinker_burrow", 3], ["tinker_still", 1], ["tinker_stall", 1], ["shared_larder", 1]], biomes: ["savanna", "plateau", "mesa"], salt: 20260913 },
  { key: "tallfolk", title: "Tallfolk", paving: "grass_path", post: "oak_fence", core: "tallfolk_farmhouse", houses: [["tallfolk_farmhouse", 3], ["tallfolk_barn", 1], ["shared_inn", 1], ["shared_larder", 1], ["tallfolk_field", 2]], biomes: ["plains", "forest"], salt: 20260914 },
];

const STREET_MARK = "villages:street";
const HOUSE_MARK = "villages:house";
const STREET_W = 5;
const STREET_L = 7;

export interface VillageSet {
  people: People;
  /** Piece key (as the pool and file name) to blueprint. */
  pieces: Map<string, Blueprint>;
  pools: Map<string, Pool>;
  /** Pool identifiers as the pack names them, keyed the same as `pools`. */
  poolIds: Map<string, string>;
  startPool: string;
  maxDepth: number;
}

function street(p: People, key: string, x: number, z: number, target: string, pool: string, facing: Facing): Jigsaw {
  void x; void z;
  return { facing, name: key, target, pool, final: p.paving };
}

/** A building with a socket on its doorstep, facing out of the door. */
function withDoorstep(p: People, b: Blueprint): Blueprint {
  const door = b.blocks().find((x) => /door$/.test(x.name) && !x.states.upper_block_bit);
  let dx = Math.floor(b.sx / 2), dz = b.sz - 1;
  let facing: Facing = "south";
  if (door) {
    dx = door.x;
    dz = door.z;
    facing = (door.states["minecraft:cardinal_direction"] as Facing) ?? "south";
  }
  const step = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[facing];
  const sx = dx + step[0]!, sz = dz + step[1]!;
  const size: [number, number, number] = [Math.max(b.sx, sx + 1), b.sy, Math.max(b.sz, sz + 1)];
  const ox = sx < 0 ? 1 : 0, oz = sz < 0 ? 1 : 0;
  size[0] += ox;
  size[2] += oz;
  const out = new Blueprint(b.key, b.title, size, b.people, b.notes);
  out.paste(b, ox, 0, oz);
  out.jigsaw(sx + ox, 0, sz + oz, { facing, name: HOUSE_MARK, target: HOUSE_MARK, pool: "minecraft:empty", final: p.paving });
  return out;
}

function lamp(p: People, bp: Blueprint, x: number, z: number): void {
  bp.set(x, 1, z, p.post).set(x, 2, z, "lantern");
}

export function villageSet(p: People): VillageSet {
  const byKey = new Map(BUILDINGS.map((b) => [b.key, b]));
  const need = (k: string): Blueprint => {
    const b = byKey.get(k);
    if (!b) throw new Error(`no building ${k}`);
    return b;
  };
  const pieces = new Map<string, Blueprint>();
  const streetsPool = `villages:${p.key}/streets`;
  const housesPool = `villages:${p.key}/houses`;

  // The square: paving, the core building at the north facing south, lamps
  // at the corners, a socket in the middle of the east, west and south edges.
  const core = need(p.core);
  const side = Math.max(15, core.sx + 6);
  const square = new Blueprint(`${p.key}_square`, `${p.title} Square`, [side, core.sy, side], p.key, `The centre of a ${p.title.toLowerCase()} village: the ${core.title.toLowerCase()} on a paved square, streets from three sides.`);
  square.fill(0, 0, 0, side, 1, side, p.paving);
  square.paste(core, Math.floor((side - core.sx) / 2), 0, 1);
  for (const [x, z] of [[1, side - 2], [side - 2, side - 2]] as const) lamp(p, square, x, z);
  const mid = Math.floor(side / 2);
  square.jigsaw(side - 1, 0, mid, street(p, STREET_MARK, side - 1, mid, STREET_MARK, streetsPool, "east"));
  square.jigsaw(0, 0, mid, street(p, STREET_MARK, 0, mid, STREET_MARK, streetsPool, "west"));
  square.jigsaw(mid, 0, side - 1, street(p, STREET_MARK, mid, side - 1, STREET_MARK, streetsPool, "south"));
  pieces.set("square", square);

  // Streets run north-south, 5 wide and 7 long, a socket at each end and a
  // house socket on each side at the middle.
  const straight = new Blueprint(`${p.key}_street_straight`, `${p.title} Street`, [STREET_W, 3, STREET_L], p.key, "A straight run of street with a house socket each side.");
  straight.fill(0, 0, 0, STREET_W, 1, STREET_L, p.paving);
  straight.jigsaw(2, 0, 0, street(p, STREET_MARK, 2, 0, STREET_MARK, streetsPool, "north"));
  straight.jigsaw(2, 0, STREET_L - 1, street(p, STREET_MARK, 2, STREET_L - 1, STREET_MARK, streetsPool, "south"));
  straight.jigsaw(0, 0, 3, { facing: "west", name: HOUSE_MARK, target: HOUSE_MARK, pool: housesPool, final: p.paving });
  straight.jigsaw(STREET_W - 1, 0, 3, { facing: "east", name: HOUSE_MARK, target: HOUSE_MARK, pool: housesPool, final: p.paving });
  pieces.set("street_straight", straight);

  const corner = new Blueprint(`${p.key}_street_corner`, `${p.title} Corner`, [STREET_W, 3, STREET_W], p.key, "A street turning a corner, with a lamp on the outside.");
  corner.fill(0, 0, 0, STREET_W, 1, STREET_W, p.paving);
  corner.jigsaw(2, 0, 0, street(p, STREET_MARK, 2, 0, STREET_MARK, streetsPool, "north"));
  corner.jigsaw(STREET_W - 1, 0, 2, street(p, STREET_MARK, STREET_W - 1, 2, STREET_MARK, streetsPool, "east"));
  lamp(p, corner, 0, STREET_W - 1);
  pieces.set("street_corner", corner);

  const tee = new Blueprint(`${p.key}_street_t`, `${p.title} T-junction`, [STREET_W, 3, STREET_W], p.key, "A street forking three ways.");
  tee.fill(0, 0, 0, STREET_W, 1, STREET_W, p.paving);
  tee.jigsaw(2, 0, 0, street(p, STREET_MARK, 2, 0, STREET_MARK, streetsPool, "north"));
  tee.jigsaw(STREET_W - 1, 0, 2, street(p, STREET_MARK, STREET_W - 1, 2, STREET_MARK, streetsPool, "east"));
  tee.jigsaw(0, 0, 2, street(p, STREET_MARK, 0, 2, STREET_MARK, streetsPool, "west"));
  pieces.set("street_t", tee);

  // Terminators: a lamp post where a street ends, a doorstep where no house fits.
  const lampPost = new Blueprint(`${p.key}_lamp`, `${p.title} Lamp Post`, [1, 3, 1], p.key, "Where a street ends.");
  lampPost.jigsaw(0, 0, 0, street(p, STREET_MARK, 0, 0, STREET_MARK, "minecraft:empty", "north"));
  lamp(p, lampPost, 0, 0);
  pieces.set("lamp", lampPost);
  const doorstep = new Blueprint(`${p.key}_doorstep`, `${p.title} Doorstep`, [1, 1, 1], p.key, "Where no house fits.");
  doorstep.jigsaw(0, 0, 0, { facing: "north", name: HOUSE_MARK, target: HOUSE_MARK, pool: "minecraft:empty", final: "grass" });
  pieces.set("doorstep", doorstep);

  // Houses: the buildings with a doorstep socket.
  const houseElements: Pool["elements"] = [];
  for (const [key, weight] of p.houses) {
    const piece = withDoorstep(p, need(key));
    pieces.set(key, piece);
    houseElements.push({ piece, weight });
  }

  const pools = new Map<string, Pool>([
    [`villages:${p.key}/square`, { elements: [{ piece: square, weight: 1 }] }],
    [streetsPool, { elements: [{ piece: straight, weight: 5 }, { piece: corner, weight: 2 }, { piece: tee, weight: 2 }], fallback: `villages:${p.key}/street_ends` }],
    [`villages:${p.key}/street_ends`, { elements: [{ piece: lampPost, weight: 1 }] }],
    [housesPool, { elements: houseElements, fallback: `villages:${p.key}/house_ends` }],
    [`villages:${p.key}/house_ends`, { elements: [{ piece: doorstep, weight: 1 }] }],
  ]);
  const poolIds = new Map([...pools.keys()].map((k) => [k, k]));
  return { people: p, pieces, pools, poolIds, startPool: `villages:${p.key}/square`, maxDepth: 4 };
}

/** A whole village for the viewer, from a seed. */
export function villagePreview(set: VillageSet, seed: number): { expansion: Expansion; blueprint: Blueprint } {
  const expansion = expand(set.pools, set.startPool, set.maxDepth, seed, { startTurns: 0 });
  const p = set.people;
  const blueprint = canvas(expansion, `${p.key}_village`, `${p.title} Village`, p.key, `A ${p.title.toLowerCase()} village as the jigsaw expander grows it from seed ${seed}: ${expansion.placements.length} pieces, ${expansion.open.length} open sockets.`);
  return { expansion, blueprint };
}

/** The pack data for one people: file path (under the pack) to JSON. */
export function villageWorldgen(set: VillageSet): Record<string, object> {
  const p = set.people;
  const out: Record<string, object> = {};
  const location = (piece: Blueprint) => `villages/${p.key}/${piece.key}`;
  for (const [id, pool] of set.pools) {
    const name = id.split("/")[1]!;
    out[`worldgen/template_pools/villages/${p.key}/${name}.json`] = {
      format_version: "1.21.20",
      "minecraft:template_pool": {
        description: { identifier: id },
        elements: pool.elements.map((e) => ({ element: { element_type: "minecraft:single_pool_element", location: location(e.piece), projection: "rigid" }, weight: e.weight })),
        ...(pool.fallback ? { fallback: pool.fallback } : {}),
      },
    };
  }
  out[`worldgen/structures/villages/${p.key}_village.json`] = {
    format_version: "1.21.20",
    "minecraft:jigsaw": {
      description: { identifier: `villages:${p.key}_village` },
      biome_filters: [{ any_of: p.biomes.map((tag) => ({ test: "has_biome_tag", operator: "==", value: tag })) }],
      step: "surface_structures",
      terrain_adaptation: "beard_thin",
      start_pool: set.startPool,
      max_depth: set.maxDepth,
      start_height: { type: "constant", value: { absolute: 0 } },
      heightmap_projection: "world_surface",
      max_distance_from_center: { horizontal: 64 },
    },
  };
  out[`worldgen/structure_sets/villages/${p.key}_villages.json`] = {
    format_version: "1.21.20",
    "minecraft:structure_set": {
      description: { identifier: `villages:${p.key}_villages` },
      placement: { type: "minecraft:random_spread", spacing: 34, separation: 8, salt: p.salt, spread_type: "triangular" },
      structures: [{ structure: `villages:${p.key}_village`, weight: 1 }],
    },
  };
  return out;
}
