/**
 * The villages of docs/design/villages.md, as jigsaw pieces and pools.
 *
 * A village is a square with the people's core building on it, streets that
 * grow from its sockets, houses that hang off the streets, and terminators
 * (a lamp post or a watch, a doorstep) for sockets the depth limit or the
 * terrain leaves open. The pieces are blueprints like the buildings; the
 * buildings are the house pool, each given one jigsaw on its doorstep. Every
 * marker sits in the ground layer (y = 0) and its final block is the paving,
 * so a resolved joint is seamless and an open one is a paving stub.
 *
 * Room to breathe: the generator, like the game, takes the first piece that
 * fits, so a village is exactly as dense as its pieces. Streets are seven
 * wide with a three-wide path between grass verges, so a house stands two
 * blocks back from the path; greens (a meadow, an orchard, a terrace, a reed
 * bed) and plain empty lots compete with houses for every house socket; and
 * a lane piece, longer, with trees on its verges and no house sockets, puts
 * distance between clusters. The reedfolk build on stilts over water: their
 * streets are plank walkways three blocks up on mangrove posts, and a joint's
 * final block is a post.
 *
 * Marker names are shared: `villages:street` on street ends and square edges,
 * `villages:house` on doorsteps and on the street sides that want a house.
 * The same source emits the .mcstructure pieces, the template pools, the
 * jigsaw structure and the structure set (§2 of the design), and feeds the
 * offline expander (jigsaw.ts) that draws whole villages for the viewer.
 */
import { Blueprint, type Facing, type Jigsaw } from "./blueprint";
import { BUILDINGS } from "./buildings";
import { canvas, expand, prng, type Expansion, type Pool } from "./jigsaw";

export interface People {
  key: string;
  title: string;
  paving: string;
  /** The ground beside the path and under greens; the deck for stilts. */
  verge: string;
  /** The block under a lamp's lantern. */
  post: string;
  /** Core building on the square (a BUILDINGS key). */
  core: string;
  /** House pool: building keys with weights. */
  houses: [key: string, weight: number][];
  /** Green pieces for the house pool: a painter and a weight. */
  greens: [key: string, weight: number, paint: (bp: Blueprint, rand: () => number, y: number) => void][];
  /** Weight of a plain empty lot in the house pool. */
  emptyLots: number;
  /** The tree on a lane's verge. */
  tree: { log: string; leaves: string };
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

// ---------------------------------------------------------------------------
// Greenery
// ---------------------------------------------------------------------------

/**
 * A tree: a trunk and a two-layer crown. The crown is clipped to the piece,
 * so a tree on a verge leans out of frame rather than failing. The leaves
 * are not persistent: every leaf is within reach of the trunk, so they stay
 * while it stands and decay once a lumberjack has felled it (§5.1).
 */
function tree(bp: Blueprint, x: number, y: number, z: number, log: string, leaves: string, height = 4): void {
  const L = { persistent_bit: false, update_bit: false };
  const leaf = (i: number, j: number, k: number) => {
    if (i < 0 || k < 0 || j < 0 || i >= bp.sx || k >= bp.sz || j >= bp.sy) return;
    if (bp.at(i, j, k) === undefined) bp.set(i, j, k, leaves, L);
  };
  bp.fill(x, y, z, 1, height, 1, log);
  const top = y + height;
  for (let i = -2; i <= 2; i++)
    for (let k = -2; k <= 2; k++) {
      if (Math.abs(i) === 2 && Math.abs(k) === 2) continue;
      for (let j = top - 2; j < top; j++) leaf(x + i, j, z + k);
    }
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) if (Math.abs(i) + Math.abs(k) < 2) leaf(x + i, top, z + k);
  leaf(x, top + 1, z);
}

const FLOWERS = ["poppy", "dandelion", "cornflower", "oxeye_daisy", "azure_bluet"];

/**
 * A grove: three grown trees, a lumberjack's post and a chest for the logs
 * (docs/design/villages.md §5.1). The post's person is spawned south of the
 * post, so the post stands with open grass in front of it.
 */
function grove(log: string, leaves: string): (bp: Blueprint, rand: () => number, y: number) => void {
  return (bp, rand, y) => {
    tree(bp, 2, y, 2, log, leaves, 4);
    tree(bp, 6, y, 2, log, leaves, 5);
    tree(bp, 2, y, 6, log, leaves, 4);
    bp.set(7, y, 5, "chest");
    bp.set(6, y, 5, "villages:post", { "villages:people": 0, "villages:job": 1 });
    scatter(bp, rand, 4, y, 4, 5, 5, 5);
  };
}

/** Flowers and grass tufts scattered over a grass floor at y, about one cell in `every`. */
function scatter(bp: Blueprint, rand: () => number, x: number, y: number, z: number, w: number, d: number, every = 4): void {
  for (let i = x; i < x + w; i++)
    for (let k = z; k < z + d; k++) {
      if (bp.at(i, y, k) !== undefined || bp.at(i, y - 1, k) !== "minecraft:grass") continue;
      const r = rand();
      if (r < 1 / every / 2) bp.set(i, y, k, FLOWERS[Math.floor(rand() * FLOWERS.length)]!);
      else if (r < 1 / every) bp.set(i, y, k, "short_grass");
    }
}

export const PEOPLES: People[] = [
  {
    key: "stonefolk", title: "Stonefolk", paving: "cobblestone", verge: "grass", post: "cobblestone_wall", core: "stonefolk_hall",
    houses: [["stonefolk_forge", 2], ["stonefolk_store", 2], ["shared_larder", 1]],
    greens: [
      ["terrace", 3, (bp, rand, y) => {
        // A mossy shelf: boulders, a spruce, ferns.
        for (const [x, z] of [[2, 2], [6, 3], [3, 6]] as const) bp.set(x, y, z, "mossy_cobblestone");
        bp.set(6, y, 6, "moss_block").set(6, y + 1, 6, "moss_carpet");
        tree(bp, 4, y, 4, "spruce_log", "spruce_leaves", 5);
        for (let i = 0; i < 6; i++) { const x = 1 + Math.floor(rand() * 7), z = 1 + Math.floor(rand() * 7); if (bp.at(x, y, z) === undefined) bp.set(x, y, z, "fern"); }
      }],
      ["grove", 2, grove("spruce_log", "spruce_leaves")],
    ],
    emptyLots: 2, tree: { log: "spruce_log", leaves: "spruce_leaves" },
    watch: "stonefolk_watchpost", biomes: ["mountains", "extreme_hills", "meadow"], salt: 20260911,
  },
  {
    key: "reedfolk", title: "Reedfolk", paving: "mangrove_planks", verge: "mangrove_planks", post: "mangrove_fence", core: "reedfolk_stilt_house",
    houses: [["reedfolk_stilt_house", 3], ["reedfolk_rack", 1], ["reedfolk_dock", 1]],
    greens: [
      ["reed_bed", 3, (bp, rand) => {
        // Open water with mud banks, reeds and lily pads, below the walkways.
        bp.fill(0, 0, 0, 9, 1, 9, "water");
        for (let i = 0; i < 5; i++) {
          const x = 1 + Math.floor(rand() * 7), z = 1 + Math.floor(rand() * 7);
          bp.set(x, 0, z, "mud").set(x, 1, z, "reeds", { age: 0 }).set(x, 2, z, "reeds", { age: 0 });
        }
        for (let i = 0; i < 4; i++) { const x = Math.floor(rand() * 9), z = Math.floor(rand() * 9); if (bp.at(x, 0, z) === "minecraft:water" && bp.at(x, 1, z) === undefined) bp.set(x, 1, z, "waterlily"); }
      }],
    ],
    emptyLots: 2, tree: { log: "mangrove_log", leaves: "mangrove_leaves" },
    watch: "reedfolk_tower", stilts: true, biomes: ["swamp", "mangrove_swamp", "river"], salt: 20260912,
  },
  {
    key: "tinker", title: "Tinker", paving: "brick_block", verge: "grass", post: "oak_fence", core: "tinker_workshop",
    houses: [["tinker_burrow", 3], ["tinker_still", 1], ["tinker_stall", 1], ["shared_larder", 1]],
    greens: [
      ["yard", 3, (bp, rand, y) => {
        // A working yard: a composter, hay, a pumpkin patch, an acacia for shade.
        bp.set(2, y, 2, "composter", { composter_fill_level: 3 }).set(3, y, 2, "hay_block", { pillar_axis: "y" });
        for (const [x, z] of [[6, 2], [7, 3]] as const) bp.set(x, y, z, "pumpkin", { "minecraft:cardinal_direction": "south" });
        tree(bp, 3, y, 6, "acacia_log", "acacia_leaves", 4);
        scatter(bp, rand, 1, y, 1, 7, 7, 5);
      }],
    ],
    emptyLots: 2, tree: { log: "acacia_log", leaves: "acacia_leaves" },
    biomes: ["savanna", "plateau", "mesa"], salt: 20260913,
  },
  {
    key: "tallfolk", title: "Tallfolk", paving: "grass_path", verge: "grass", post: "oak_fence", core: "tallfolk_farmhouse",
    houses: [["tallfolk_farmhouse", 3], ["tallfolk_field", 3], ["tallfolk_barn", 1], ["shared_inn", 1], ["shared_larder", 1]],
    greens: [
      ["meadow", 3, (bp, rand, y) => {
        tree(bp, 6, y, 3, "oak_log", "oak_leaves", 4);
        scatter(bp, rand, 0, y, 0, 9, 9, 3);
      }],
      ["orchard", 1, (bp, rand, y) => {
        for (const [x, z] of [[2, 2], [6, 2], [2, 6], [6, 6]] as const) tree(bp, x, y, z, "oak_log", "oak_leaves", 3);
        for (let i = 0; i < 4; i++) { const x = Math.floor(rand() * 9), z = Math.floor(rand() * 9); if (bp.at(x, y, z) === undefined) bp.set(x, y, z, "sweet_berry_bush", { growth: 3 }); }
      }],
      ["grove", 2, grove("oak_log", "oak_leaves")],
    ],
    emptyLots: 2, tree: { log: "oak_log", leaves: "oak_leaves" },
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
/** Street width: a three-wide path between two-wide verges. */
const STREET_W = 7;
const PATH_X0 = 2;
const PATH_W = 3;
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

/** Every job post in a piece gets the people's index, so its person is one of them. */
function stampPeople(p: People, bp: Blueprint): Blueprint {
  const people = PEOPLES.indexOf(p);
  for (const b of bp.blocks()) if (b.name === "villages:post") bp.set(b.x, b.y, b.z, "villages:post", { ...b.states, "villages:people": people });
  return bp;
}

/**
 * A building with a socket on its doorstep, the block outside its door at
 * ground level, facing out. A building with no door gets one at the middle
 * of its south side. `name` is the marker's name: a house answers a street's
 * house socket; a watch answers a street socket and so ends the street.
 */
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

/**
 * The ground of a piece: the verge everywhere at y = 0 and the path where
 * `path` says, or a plank deck on posts for a people on stilts. Returns the
 * height of the walking surface's top face.
 */
function ground(p: People, bp: Blueprint, w: number, d: number, path?: (x: number, z: number) => boolean): number {
  if (!p.stilts) {
    bp.fill(0, 0, 0, w, 1, d, p.verge);
    if (path) for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) if (path(x, z)) bp.set(x, 0, z, p.paving);
    return 0;
  }
  bp.fill(0, DECK, 0, w, 1, d, p.paving);
  for (let i = 0; i < w; i += Math.max(1, w - 1))
    for (let k = 0; k < d; k += 4) bp.fill(i, 0, k, 1, DECK, 1, "mangrove_log");
  for (let k = 0; k < d; k += Math.max(1, d - 1))
    for (let i = 0; i < w; i += 4) bp.fill(i, 0, k, 1, DECK, 1, "mangrove_log");
  return DECK;
}

const inPathX = (x: number) => x >= PATH_X0 && x < PATH_X0 + PATH_W;

export function villageSet(p: People): VillageSet {
  const pieces = new Map<string, Blueprint>();
  const streetsPool = `villages:${p.key}/streets`;
  const housesPool = `villages:${p.key}/houses`;
  const streetSocket = (bp: Blueprint, x: number, z: number, facing: Facing) => bp.jigsaw(x, 0, z, marker(p, facing, STREET_MARK, STREET_MARK, streetsPool));
  /** A house socket at the verge's edge, with the path stub across the verge drawn in. */
  const houseSocket = (bp: Blueprint, x: number, z: number, facing: Facing) => {
    bp.jigsaw(x, 0, z, marker(p, facing, HOUSE_MARK, HOUSE_MARK, housesPool));
    if (!p.stilts) bp.set(x === 0 ? 1 : x - 1, 0, z, p.paving);
  };
  const rand = prng(PEOPLES.indexOf(p) + 11);

  // The square: paving, the core building at the north facing south, trees
  // in the north corners, lamps at the south corners, a socket in the middle
  // of the east, west and south edges.
  const core = need(p.core);
  const side = Math.max(17, core.sx + 8);
  const square = new Blueprint(`${p.key}_square`, `${p.title} Square`, [side, Math.max(core.sy, DECK + 3), side], p.key, `The centre of a ${p.title.toLowerCase()} village: the ${core.title.toLowerCase()} on a square, streets from three sides.`);
  const g = ground(p, square, side, side, () => true);
  square.paste(core, Math.floor((side - core.sx) / 2), 0, 1);
  if (!p.stilts) {
    for (const cx of [1, side - 4]) {
      square.fill(cx, 0, 1, 3, 1, 3, p.verge);
      tree(square, cx + 1, 1, 2, p.tree.log, p.tree.leaves, 4);
    }
  }
  for (const [x, z] of [[1, side - 2], [side - 2, side - 2]] as const) lamp(p, square, x, g + 1, z);
  p.squareExtra?.(square, side);
  const mid = Math.floor(side / 2);
  streetSocket(square, side - 1, mid, "east");
  streetSocket(square, 0, mid, "west");
  streetSocket(square, mid, side - 1, "south");
  pieces.set("square", stampPeople(p, square));

  // Streets run north-south: a path down the middle, verges either side, a
  // socket at each open end, house sockets at the verge edges. A stilted
  // street is a walkway with rails.
  const streetPiece = (key: string, title: string, length: number, notes: string, path: (x: number, z: number) => boolean): Blueprint => {
    const bp = new Blueprint(`${p.key}_${key}`, `${p.title} ${title}`, [STREET_W, DECK + 4, length], p.key, notes);
    const y = ground(p, bp, STREET_W, length, path);
    if (p.stilts) for (const x of [0, STREET_W - 1]) for (let z = 0; z < length; z++) if (z % 4 !== 3) bp.set(x, y + 1, z, "mangrove_fence");
    return bp;
  };
  const straight = streetPiece("street_straight", "Street", 7, "A straight run of street, a house socket each side.", (x) => inPathX(x));
  streetSocket(straight, 3, 0, "north");
  streetSocket(straight, 3, 6, "south");
  houseSocket(straight, 0, 3, "west");
  houseSocket(straight, STREET_W - 1, 3, "east");
  pieces.set("street_straight", straight);

  const long = streetPiece("street_long", "Long Street", 11, "A longer run with two house sockets each side.", (x) => inPathX(x));
  streetSocket(long, 3, 0, "north");
  streetSocket(long, 3, 10, "south");
  for (const z of [2, 8]) {
    houseSocket(long, 0, z, "west");
    houseSocket(long, STREET_W - 1, z, "east");
  }
  pieces.set("street_long", long);

  const lane = streetPiece("lane", "Lane", 13, "A lane between clusters: trees on the verges, no houses.", (x) => inPathX(x));
  streetSocket(lane, 3, 0, "north");
  streetSocket(lane, 3, 12, "south");
  if (!p.stilts) {
    tree(lane, 1, 1, 3, p.tree.log, p.tree.leaves, 4);
    tree(lane, STREET_W - 2, 1, 9, p.tree.log, p.tree.leaves, 4);
    scatter(lane, rand, 0, 1, 0, STREET_W, 13, 5);
  } else {
    lamp(p, lane, 0, DECK + 1, 6);
  }
  pieces.set("lane", lane);

  const corner = streetPiece("street_corner", "Corner", STREET_W, "A street turning a corner, with a lamp on the outside.", (x, z) => (inPathX(x) && z <= 4) || (inPathX(z) && x >= 2));
  streetSocket(corner, 3, 0, "north");
  streetSocket(corner, STREET_W - 1, 3, "east");
  lamp(p, corner, 0, (p.stilts ? DECK : 0) + 1, STREET_W - 1);
  pieces.set("street_corner", corner);

  const tee = streetPiece("street_t", "T-junction", STREET_W, "A street forking three ways.", (x, z) => (inPathX(x) && z <= 4) || inPathX(z));
  streetSocket(tee, 3, 0, "north");
  streetSocket(tee, STREET_W - 1, 3, "east");
  streetSocket(tee, 0, 3, "west");
  pieces.set("street_t", tee);

  const cross = streetPiece("street_cross", "Crossroads", STREET_W, "Four ways.", (x, z) => inPathX(x) || inPathX(z));
  streetSocket(cross, 3, 0, "north");
  streetSocket(cross, 3, STREET_W - 1, "south");
  streetSocket(cross, STREET_W - 1, 3, "east");
  streetSocket(cross, 0, 3, "west");
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

  // Houses: the buildings with a doorstep socket; greens and empty lots
  // beside them in the same pool, so not every socket grows a roof.
  const houseElements: Pool["elements"] = [];
  for (const [key, weight] of p.houses) {
    const piece = withDoorstep(p, need(key));
    pieces.set(key, piece);
    houseElements.push({ piece, weight });
  }
  const lot = (key: string, title: string, notes: string, w: number, d: number, paint?: (bp: Blueprint, y: number) => void): Blueprint => {
    const bp = new Blueprint(`${p.key}_${key}`, `${p.title} ${title}`, [w, 8, d], p.key, notes);
    if (p.stilts) {
      bp.fill(0, 0, 0, w, 1, d, "water");
    } else {
      bp.fill(0, 0, 0, w, 1, d, p.verge);
    }
    paint?.(bp, 1);
    // The socket at the middle of the south edge, facing the street.
    bp.set(Math.floor(w / 2), 0, d - 1, p.stilts ? "water" : p.verge);
    bp.jigsaw(Math.floor(w / 2), 0, d - 1, marker(p, "south", HOUSE_MARK, HOUSE_MARK, "minecraft:empty"));
    return stampPeople(p, bp);
  };
  for (const [key, weight, paint] of p.greens) {
    const piece = lot(key, key[0]!.toUpperCase() + key.slice(1).replace("_", " "), "Open ground with something growing on it.", 9, 9, (bp, y) => paint(bp, rand, y));
    pieces.set(key, piece);
    houseElements.push({ piece, weight });
  }
  const empty = lot("empty_lot", "Empty Lot", "Nothing built here yet.", 7, 7, (bp, y) => { if (!p.stilts) scatter(bp, rand, 0, y, 0, 7, 7, 6); });
  pieces.set("empty_lot", empty);
  houseElements.push({ piece: empty, weight: p.emptyLots });

  const pools = new Map<string, Pool>([
    [`villages:${p.key}/square`, { elements: [{ piece: square, weight: 1 }] }],
    [streetsPool, { elements: [{ piece: straight, weight: 5 }, { piece: long, weight: 3 }, { piece: lane, weight: 2 }, { piece: corner, weight: 2 }, { piece: tee, weight: 2 }, { piece: cross, weight: 1 }], fallback: `villages:${p.key}/street_ends` }],
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
