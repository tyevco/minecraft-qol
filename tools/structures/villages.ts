/**
 * The villages of docs/design/villages.md, as jigsaw pieces and pools.
 *
 * A village is a square with the people's core building on it, streets that
 * grow from its sockets, houses that hang off the streets, and terminators
 * (a lamp post or a watch, a doorstep) for sockets the depth limit or the
 * terrain leaves open. The pieces are blueprints like the buildings; the
 * buildings are the house pool, each given one jigsaw on its doorstep. Every
 * marker sits in the ground layer (y = 0) and its final block is the paving,
 * so a resolved joint is seamless and an open one is a paving stub. The
 * reedfolk build on stilts over water: their streets are plank walkways
 * three blocks up on mangrove posts, and a joint's final block is a post.
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
  /** A building that can end a street, facing back up it. */
  watch?: string;
  /** Built on stilts over water: walkways at y = 3, joints are posts. */
  stilts?: boolean;
  /** Something more on the square, given the square and its side. */
  squareExtra?: (bp: Blueprint, side: number) => void;
  /** Vanilla biome tags the village generates in (any of). */
  biomes: string[];
  salt: number;
}

const byKey = new Map(BUILDINGS.map((b) => [b.key, b]));
const need = (k: string): Blueprint => {
  const b = byKey.get(k);
  if (!b) throw new Error(`no building ${k}`);
  return b;
};

export const PEOPLES: People[] = [
  { key: "stonefolk", title: "Stonefolk", paving: "cobblestone", post: "cobblestone_wall", core: "stonefolk_hall", houses: [["stonefolk_forge", 2], ["stonefolk_store", 2], ["shared_larder", 1]], watch: "stonefolk_watchpost", biomes: ["mountains", "extreme_hills", "meadow"], salt: 20260911 },
  { key: "reedfolk", title: "Reedfolk", paving: "mangrove_planks", post: "mangrove_fence", core: "reedfolk_stilt_house", houses: [["reedfolk_stilt_house", 3], ["reedfolk_rack", 1], ["reedfolk_dock", 1]], watch: "reedfolk_tower", stilts: true, biomes: ["swamp", "mangrove_swamp", "river"], salt: 20260912 },
  { key: "tinker", title: "Tinker", paving: "brick_block", post: "oak_fence", core: "tinker_workshop", houses: [["tinker_burrow", 3], ["tinker_still", 1], ["tinker_stall", 1], ["shared_larder", 1]], biomes: ["savanna", "plateau", "mesa"], salt: 20260913 },
  {
    key: "tallfolk", title: "Tallfolk", paving: "grass_path", post: "oak_fence", core: "tallfolk_farmhouse",
    houses: [["tallfolk_farmhouse", 3], ["tallfolk_field", 3], ["tallfolk_barn", 1], ["shared_inn", 1], ["shared_larder", 1]],
    watch: "tallfolk_gatehouse",
    squareExtra: (bp, side) => {
      const well = need("tallfolk_well");
      bp.paste(well, Math.floor(side / 2) - Math.floor(well.sx / 2), 0, side - well.sz - 3);
    },
    biomes: ["plains", "forest"], salt: 20260914,
  },
];

const STREET_MARK = "villages:street";
const HOUSE_MARK = "villages:house";
const STREET_W = 5;
/** Walkway height for a people on stilts. */
const DECK = 3;

export interface VillageSet {
  people: People;
  /** Piece key (as the pool and file name) to blueprint. */
  pieces: Map<string, Blueprint>;
  pools: Map<string, Pool>;
  startPool: string;
  maxDepth: number;
}

function marker(p: People, facing: Facing, name: string, target: string, pool: string): Jigsaw {
  return { facing, name, target, pool, final: p.stilts ? "mangrove_log" : p.paving };
}

/**
 * A building with a socket on its doorstep, the block outside its door at
 * ground level, facing out. A building with no door gets one at the middle
 * of its south side. `name` is the marker's name: a house answers a street's
 * house socket; a watch answers a street socket and so ends the street.
 */
/** Every job post in a piece gets the people's index, so its person is one of them. */
function stampPeople(p: People, bp: Blueprint): Blueprint {
  const people = PEOPLES.indexOf(p);
  for (const b of bp.blocks()) if (b.name === "minecraft:villages:post" || b.name === "villages:post") bp.set(b.x, b.y, b.z, "villages:post", { ...b.states, "villages:people": people });
  return bp;
}

function withDoorstep(p: People, b: Blueprint, name = HOUSE_MARK): Blueprint {
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
  const ox = sx < 0 ? 1 : 0, oz = sz < 0 ? 1 : 0;
  const size: [number, number, number] = [Math.max(b.sx, sx + 1) + ox, b.sy, Math.max(b.sz, sz + 1) + oz];
  const out = new Blueprint(b.key, b.title, size, b.people, b.notes);
  out.paste(b, ox, 0, oz);
  out.jigsaw(sx + ox, 0, sz + oz, marker(p, facing, name, name, "minecraft:empty"));
  return stampPeople(p, out);
}

function lamp(p: People, bp: Blueprint, x: number, y: number, z: number): void {
  bp.set(x, y, z, p.post).set(x, y + 1, z, "lantern");
}

/** The ground of a piece: paving at y = 0, or a plank deck on posts. */
function ground(p: People, bp: Blueprint, x: number, z: number, w: number, d: number): number {
  if (!p.stilts) {
    bp.fill(x, 0, z, w, 1, d, p.paving);
    return 0;
  }
  bp.fill(x, DECK, z, w, 1, d, p.paving);
  for (let i = x; i < x + w; i += Math.max(1, w - 1))
    for (let k = z; k < z + d; k += 4) bp.fill(i, 0, k, 1, DECK, 1, "mangrove_log");
  for (let k = z; k < z + d; k += Math.max(1, d - 1))
    for (let i = x; i < x + w; i += 4) bp.fill(i, 0, k, 1, DECK, 1, "mangrove_log");
  return DECK;
}

export function villageSet(p: People): VillageSet {
  const pieces = new Map<string, Blueprint>();
  const streetsPool = `villages:${p.key}/streets`;
  const housesPool = `villages:${p.key}/houses`;
  const streetSocket = (bp: Blueprint, x: number, z: number, facing: Facing) => bp.jigsaw(x, 0, z, marker(p, facing, STREET_MARK, STREET_MARK, streetsPool));
  const houseSocket = (bp: Blueprint, x: number, z: number, facing: Facing) => bp.jigsaw(x, 0, z, marker(p, facing, HOUSE_MARK, HOUSE_MARK, housesPool));

  // The square: the core building at the north facing south, lamps at the
  // south corners, a socket in the middle of the east, west and south edges.
  const core = need(p.core);
  const side = Math.max(15, core.sx + 6);
  const square = new Blueprint(`${p.key}_square`, `${p.title} Square`, [side, Math.max(core.sy, DECK + 3), side], p.key, `The centre of a ${p.title.toLowerCase()} village: the ${core.title.toLowerCase()} on a square, streets from three sides.`);
  const g = ground(p, square, 0, 0, side, side);
  square.paste(core, Math.floor((side - core.sx) / 2), 0, 1);
  for (const [x, z] of [[1, side - 2], [side - 2, side - 2]] as const) lamp(p, square, x, g + 1, z);
  p.squareExtra?.(square, side);
  const mid = Math.floor(side / 2);
  streetSocket(square, side - 1, mid, "east");
  streetSocket(square, 0, mid, "west");
  streetSocket(square, mid, side - 1, "south");
  pieces.set("square", stampPeople(p, square));

  // Streets run north-south, 5 wide; a socket at each open end, house
  // sockets on the sides. A stilted street is a walkway with rails.
  const streetPiece = (key: string, title: string, length: number, notes: string): Blueprint => {
    const bp = new Blueprint(`${p.key}_${key}`, `${p.title} ${title}`, [STREET_W, DECK + 3, length], p.key, notes);
    const y = ground(p, bp, 0, 0, STREET_W, length);
    if (p.stilts) for (const x of [0, STREET_W - 1]) for (let z = 0; z < length; z++) if (z % 4 !== 3) bp.set(x, y + 1, z, "mangrove_fence");
    return bp;
  };
  const straight = streetPiece("street_straight", "Street", 7, "A straight run of street with a house socket each side.");
  streetSocket(straight, 2, 0, "north");
  streetSocket(straight, 2, 6, "south");
  houseSocket(straight, 0, 3, "west");
  houseSocket(straight, STREET_W - 1, 3, "east");
  pieces.set("street_straight", straight);

  const long = streetPiece("street_long", "Long Street", 11, "A longer run with two house sockets each side.");
  streetSocket(long, 2, 0, "north");
  streetSocket(long, 2, 10, "south");
  for (const z of [3, 7]) {
    houseSocket(long, 0, z, "west");
    houseSocket(long, STREET_W - 1, z, "east");
  }
  pieces.set("street_long", long);

  const corner = streetPiece("street_corner", "Corner", STREET_W, "A street turning a corner, with a lamp on the outside.");
  streetSocket(corner, 2, 0, "north");
  streetSocket(corner, STREET_W - 1, 2, "east");
  lamp(p, corner, 0, (p.stilts ? DECK : 0) + 1, STREET_W - 1);
  pieces.set("street_corner", corner);

  const tee = streetPiece("street_t", "T-junction", STREET_W, "A street forking three ways.");
  streetSocket(tee, 2, 0, "north");
  streetSocket(tee, STREET_W - 1, 2, "east");
  streetSocket(tee, 0, 2, "west");
  pieces.set("street_t", tee);

  const cross = streetPiece("street_cross", "Crossroads", STREET_W, "Four ways.");
  streetSocket(cross, 2, 0, "north");
  streetSocket(cross, 2, STREET_W - 1, "south");
  streetSocket(cross, STREET_W - 1, 2, "east");
  streetSocket(cross, 0, 2, "west");
  pieces.set("street_cross", cross);

  // Terminators: a lamp post (or the watch) where a street ends, a doorstep where no house fits.
  const lampPost = new Blueprint(`${p.key}_lamp`, `${p.title} Lamp Post`, [1, DECK + 3, 1], p.key, "Where a street ends.");
  lampPost.jigsaw(0, 0, 0, marker(p, "north", STREET_MARK, STREET_MARK, "minecraft:empty"));
  if (p.stilts) lampPost.fill(0, 1, 0, 1, DECK, 1, "mangrove_log");
  lamp(p, lampPost, 0, (p.stilts ? DECK : 0) + 1, 0);
  pieces.set("lamp", lampPost);
  const doorstep = new Blueprint(`${p.key}_doorstep`, `${p.title} Doorstep`, [1, 1, 1], p.key, "Where no house fits.");
  doorstep.jigsaw(0, 0, 0, { facing: "north", name: HOUSE_MARK, target: HOUSE_MARK, pool: "minecraft:empty", final: p.stilts ? "mangrove_log" : "grass" });
  pieces.set("doorstep", doorstep);
  const ends: Pool["elements"] = [{ piece: lampPost, weight: 3 }];
  if (p.watch) {
    const watch = withDoorstep(p, need(p.watch), STREET_MARK);
    pieces.set(`${p.watch}_end`, watch);
    ends.push({ piece: watch, weight: 1 });
  }

  // Houses: the buildings with a doorstep socket.
  const houseElements: Pool["elements"] = [];
  for (const [key, weight] of p.houses) {
    const piece = withDoorstep(p, need(key));
    pieces.set(key, piece);
    houseElements.push({ piece, weight });
  }

  const pools = new Map<string, Pool>([
    [`villages:${p.key}/square`, { elements: [{ piece: square, weight: 1 }] }],
    [streetsPool, { elements: [{ piece: straight, weight: 5 }, { piece: long, weight: 3 }, { piece: corner, weight: 2 }, { piece: tee, weight: 2 }, { piece: cross, weight: 1 }], fallback: `villages:${p.key}/street_ends` }],
    [`villages:${p.key}/street_ends`, { elements: ends }],
    [housesPool, { elements: houseElements, fallback: `villages:${p.key}/house_ends` }],
    [`villages:${p.key}/house_ends`, { elements: [{ piece: doorstep, weight: 1 }] }],
  ]);
  return { people: p, pieces, pools, startPool: `villages:${p.key}/square`, maxDepth: 6 };
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
      // Buildings on the ground get the terrain drawn up to them; stilts stand in the water as they are.
      terrain_adaptation: p.stilts ? "none" : "beard_thin",
      start_pool: set.startPool,
      max_depth: set.maxDepth,
      start_height: { type: "constant", value: { absolute: 0 } },
      heightmap_projection: "world_surface",
      max_distance_from_center: { horizontal: 80 },
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
