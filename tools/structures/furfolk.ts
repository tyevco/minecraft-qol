/**
 * The furfolk's buildings and villages (docs/design/furfolk.md §3), authored
 * the way the four peoples' are: a palette and a silhouette per people, a
 * core building for the square, houses for the street sockets, greens with
 * the people's trade in them, and for some a watch to end a street. They are
 * concepts: `concept: true` on each people writes every job post as a
 * lodestone (a processor list turns lodestones into posts once the people is
 * in the pack; measured in docs/villages-jigsaw-results.md) and sends the
 * pieces and worldgen to the probe pack, which never ships.
 *
 * Silhouettes, one line each: foxes in low mossy-roofed spruce cabins and a
 * turf den; cats in cherry and terracotta with wool everywhere; wolves in a
 * long spruce lodge on snow, with a hut on the ice; rabbits in birch warrens
 * under turf, round a bake house; bears in log lodges with hives on posts;
 * fennecs in flat-roofed sandstone under awnings; mice under and inside giant
 * mushrooms; squirrels on jungle-log platforms five up; otters in a stone
 * holt at the tide line with a slipway; deer in an open pillared hall in a
 * clearing.
 */
import { Blueprint } from "./blueprint";
import { BUILDINGS, bed, building, cottage, post, table, type Cottage } from "./buildings";
import { FLOWERS, grove, orchard, scatter, tree } from "./greenery";
import type { People } from "./villages";

// ---------------------------------------------------------------------------
// Shapes the four peoples did not need
// ---------------------------------------------------------------------------

/**
 * A low house under turf: walls, a round-framed door, windows, and two
 * layers of the turf block on top overhanging by one, the tinker burrow's
 * shape in the people's materials. Returns the height of the top layer.
 */
function mound(bp: Blueprint, x: number, z: number, w: number, d: number, wallH: number, m: Cottage & { turf: string; frame: string }): number {
  bp.fill(x, 0, z, w, 1, d, m.floor);
  bp.walls(x, 1, z, w, wallH, d, m.wall);
  for (const [cx, cz] of [[x, z], [x + w - 1, z], [x, z + d - 1], [x + w - 1, z + d - 1]] as const) bp.fill(cx, 1, cz, 1, wallH, 1, m.corner);
  const doorX = x + Math.floor(w / 2);
  const front = z + d - 1;
  bp.door(doorX, 1, front, m.door, "south");
  bp.set(doorX - 1, 1, front, m.frame).set(doorX + 1, 1, front, m.frame);
  bp.set(doorX - 1, 2, front, m.frame).set(doorX + 1, 2, front, m.frame);
  if (wallH >= 3) bp.set(doorX, 3, front, m.frame);
  const glass = m.window ?? "glass_pane";
  bp.set(x + 1, Math.min(2, wallH), front, glass).set(x + w - 2, Math.min(2, wallH), front, glass);
  bp.fill(x - 1, wallH + 1, z - 1, w + 2, 1, d + 2, m.turf);
  bp.fill(x, wallH + 2, z, w, 1, d, m.turf);
  bp.set(doorX, wallH, z + Math.floor(d / 2), "lantern");
  return wallH + 2;
}

/** A flat roof: a layer of the block overhanging by one, a parapet post at each corner. */
function flatRoof(bp: Blueprint, x: number, y: number, z: number, w: number, d: number, block: string, parapet: string): void {
  bp.fill(x - 1, y, z - 1, w + 2, 1, d + 2, block);
  for (const [cx, cz] of [[x - 1, z - 1], [x + w, z - 1], [x - 1, z + d], [x + w, z + d]] as const) bp.set(cx, y + 1, cz, parapet);
}

/** A platform on posts: posts at the corners and every fourth block along the edges, planks at `y`. */
function platform(bp: Blueprint, x: number, y: number, z: number, w: number, d: number, postBlock: string, planks: string): void {
  for (let i = 0; i < w; i += Math.max(1, w - 1)) for (let k = 0; k < d; k += 4) bp.fill(x + i, 0, z + k, 1, y, 1, postBlock);
  for (let k = 0; k < d; k += Math.max(1, d - 1)) for (let i = 0; i < w; i += 4) bp.fill(x + i, 0, z + k, 1, y, 1, postBlock);
  bp.fill(x, y, z, w, 1, d, planks);
}

/** Walls with block states, which Blueprint.walls does not take: four fills round a box. */
function wallsWith(bp: Blueprint, x: number, y: number, z: number, w: number, h: number, d: number, block: string, states: Record<string, number>): void {
  bp.fill(x, y, z, w, h, 1, block, states).fill(x, y, z + d - 1, w, h, 1, block, states);
  bp.fill(x, y, z, 1, h, d, block, states).fill(x + w - 1, y, z, 1, h, d, block, states);
}

const inside = (bp: Blueprint, x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < bp.sx && y < bp.sy && z < bp.sz;

/** A mushroom cap: squares shrinking by two a layer, corners cut, in the cap block; clipped to the piece like a tree's crown. */
function cap(bp: Blueprint, cx: number, y: number, cz: number, radius: number, block: string): number {
  let layer = 0;
  for (let r = radius; r >= 0; r--, layer++) {
    for (let i = -r; i <= r; i++)
      for (let k = -r; k <= r; k++) {
        if (r > 1 && Math.abs(i) === r && Math.abs(k) === r) continue;
        if (inside(bp, cx + i, y + layer, cz + k)) bp.set(cx + i, y + layer, cz + k, block, { huge_mushroom_bits: 14 });
      }
  }
  return layer;
}
const STEM = { huge_mushroom_bits: 15 };
const CAP = { huge_mushroom_bits: 14 };

/** A leaf canopy: like a cap, in persistent leaves, so a hall can have a roof of foliage. */
function canopy(bp: Blueprint, cx: number, y: number, cz: number, radius: number, leaves: string): void {
  const L = { persistent_bit: true, update_bit: false };
  for (let r = radius, layer = 0; r >= 0; r--, layer++)
    for (let i = -r; i <= r; i++)
      for (let k = -r; k <= r; k++) {
        if (r > 1 && Math.abs(i) === r && Math.abs(k) === r) continue;
        if (inside(bp, cx + i, y + layer, cz + k) && bp.at(cx + i, y + layer, cz + k) === undefined) bp.set(cx + i, y + layer, cz + k, leaves, L);
      }
}

/** A watch tower: a hollow log-cornered tower with a rail platform on top, a ladder, a lantern and the guard's post. */
function tower(bp: Blueprint, wall: string, corner: string, floor: string, rail: string, door: string, height: number): void {
  bp.fill(1, 0, 1, 5, 1, 5, floor);
  bp.walls(1, 1, 1, 5, height, 5, wall);
  for (const [cx, cz] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(cx, 1, cz, 1, height, 1, corner);
  bp.door(3, 1, 5, door, "south");
  bp.set(3, 3, 1, "glass_pane").set(1, Math.min(5, height - 1), 3, "glass_pane").set(5, Math.min(5, height - 1), 3, "glass_pane");
  bp.fill(0, height + 1, 0, 7, 1, 7, floor);
  bp.walls(0, height + 2, 0, 7, 1, 7, rail);
  bp.set(3, height + 2, 3, "lantern");
  bp.ladder(3, 1, 2, height, "south");
  bp.set(3, height + 1, 2, "air");
  post(bp, 3, 1, 3, "guard");
}

/** The stall counter and awning, in a people's colours: fence posts, barrels, striped wool overhead. */
function awning(bp: Blueprint, x: number, y: number, z: number, w: number, d: number, a: string, b: string): void {
  for (let i = 0; i < w; i++) bp.fill(x + i, y, z, 1, 1, d, i % 2 === 0 ? a : b);
}

// ---------------------------------------------------------------------------
// Foxfolk: spruce cabins with mossy stone roofs, a turf den, berry patches.
// ---------------------------------------------------------------------------

const FOX: Cottage = { floor: "cobblestone", wall: "spruce_planks", corner: "spruce_log", roof: "mossy_cobblestone", door: "spruce", ridge: "stripped_spruce_log" };

building("foxfolk_den", "Den", "foxfolk", "A low turf mound with a round door and a cobblestone chimney: the heart of a foxfolk village, warm and half underground. The trader's post is inside.", (bp) => {
  const top = mound(bp, 1, 1, 9, 7, 3, { ...FOX, turf: "moss_block", frame: "spruce_log" });
  bp.fill(2, 1, 1, 1, top + 1, 1, "cobblestone").set(2, top + 1, 1, "campfire");
  bp.set(2, 1, 2, "chest").set(3, 1, 2, "barrel").set(8, 1, 2, "chest");
  bed(bp, 7, 1, 5);
  table(bp, 5, 1, 4, "spruce");
  post(bp, 3, 1, 5, "trader");
  bp.set(7, 2, 3, "lantern");
});

building("foxfolk_cabin", "Cabin", "foxfolk", "A one-room spruce cabin under a mossy stone roof, a lantern on a post by the door. The foxfolk home.", (bp) => {
  cottage(bp, 1, 1, 7, 7, 3, FOX);
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest").set(6, 1, 3, "barrel");
  post(bp, 4, 1, 5, "builder");
  bp.set(0, 1, 8, "spruce_fence").set(0, 2, 8, "lantern");
});

building("foxfolk_lookout", "Lookout", "foxfolk", "A spruce tower with a railed platform, lit at night because foxes are up at dusk. The foxfolk guard post.", (bp) => {
  tower(bp, "spruce_planks", "spruce_log", "cobblestone", "spruce_fence", "spruce", 7);
});

const berryPatch = (bp: Blueprint, rand: () => number, y: number): void => {
  for (const x of [2, 4, 6]) for (const z of [2, 3, 5, 6]) bp.set(x, y, z, "sweet_berry_bush", { growth: 3 });
  bp.set(7, y, 4, "barrel");
  bp.set(6, y, 4, "villages:post", { "villages:people": 0, "villages:job": 1 });
  bp.set(1, y, 7, "spruce_fence").set(1, y + 1, 7, "lantern");
  scatter(bp, rand, 0, y, 0, 9, 9, 6);
};

// ---------------------------------------------------------------------------
// Catfolk: cherry planks on terracotta, wool awnings, a loom house.
// ---------------------------------------------------------------------------

const CAT: Cottage = { floor: "hardened_clay", wall: "cherry_planks", corner: "cherry_log", roof: "cherry_planks", door: "cherry", ridge: "cherry_log" };

building("catfolk_loom_house", "Loom House", "catfolk", "Two looms, shelves of wool and a striped awning over the door: the centre of a catfolk village, where the shorn wool becomes cloth. The trader's post.", (bp) => {
  cottage(bp, 1, 1, 9, 7, 4, CAT);
  bp.set(2, 1, 2, "loom", { direction: 0 }).set(3, 1, 2, "loom", { direction: 0 });
  for (const [x, c] of [[6, "pink_wool"], [7, "white_wool"], [8, "light_gray_wool"]] as const) bp.set(x, 1, 2, c).set(x, 2, 2, c === "pink_wool" ? "white_wool" : "pink_wool");
  bp.set(8, 1, 6, "chest").set(2, 1, 6, "barrel");
  post(bp, 5, 1, 5, "trader");
  awning(bp, 3, 3, 8, 5, 2, "pink_wool", "white_wool");
  bp.set(3, 1, 9, "cherry_fence").set(7, 1, 9, "cherry_fence").set(3, 2, 9, "cherry_fence").set(7, 2, 9, "cherry_fence");
});

building("catfolk_house", "Cherry House", "catfolk", "A cherry-plank house on a terracotta floor with a flat sunny ledge over the door to sit on. The catfolk home.", (bp) => {
  cottage(bp, 1, 1, 7, 7, 3, CAT);
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest").set(4, 1, 3, "pink_carpet");
  post(bp, 4, 1, 5, "builder");
  for (const x of [2, 3, 4, 5, 6]) bp.slab(x, 3, 8, "cherry_planks", true);
});

const paddock = (bp: Blueprint, rand: () => number, y: number): void => {
  bp.walls(0, y, 0, 9, 1, 9, "oak_fence");
  bp.gate(4, y, 8, "oak", "south");
  bp.set(1, y, 1, "hay_block", { pillar_axis: "y" }).set(2, y, 1, "hay_block", { pillar_axis: "y" }).set(1, y + 1, 1, "hay_block", { pillar_axis: "y" });
  bp.set(7, y, 1, "cauldron").set(7, y, 7, "chest");
  bp.set(6, y, 7, "villages:post", { "villages:people": 0, "villages:job": 1 });
  scatter(bp, rand, 1, y, 1, 7, 7, 5);
};

// ---------------------------------------------------------------------------
// Wolffolk: a long spruce lodge with dark oak corners, snow, a fire pit.
// ---------------------------------------------------------------------------

const WOLF: Cottage = { floor: "stone_bricks", wall: "spruce_planks", corner: "dark_oak_log", roof: "dark_oak_planks", door: "dark_oak", ridge: "dark_oak_log" };

building("wolffolk_lodge", "Lodge", "wolffolk", "One long hall: a fire pit down the middle, benches either side, stores at the back. The whole pack under one roof; the trader's post by the fire.", (bp) => {
  cottage(bp, 1, 1, 13, 7, 4, WOLF);
  bp.fill(6, 1, 3, 3, 1, 3, "polished_deepslate").set(7, 1, 4, "campfire");
  for (const x of [5, 6, 7, 8, 9]) bp.stairs(x, 1, 2, "spruce_planks", "south").stairs(x, 1, 6, "spruce_planks", "north");
  bp.set(2, 1, 2, "chest").set(3, 1, 2, "barrel").set(12, 1, 2, "chest").set(11, 1, 2, "barrel");
  table(bp, 3, 1, 4, "spruce");
  table(bp, 11, 1, 4, "spruce");
  post(bp, 7, 1, 6, "trader");
  bp.set(4, 4, 4, "lantern").set(10, 4, 4, "lantern");
});

building("wolffolk_cabin", "Cabin", "wolffolk", "A spruce cabin with dark oak corners on a stone footing, a barrel of fish by the door. The wolffolk home.", (bp) => {
  cottage(bp, 1, 1, 7, 7, 3, WOLF);
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest").set(6, 1, 6, "barrel");
  post(bp, 4, 1, 5, "builder");
});

building("wolffolk_fishing_hut", "Fishing Hut", "wolffolk", "A hut on a frozen pond with a hole in the ice beside it. The worker's post stands at the hole, the barrel takes the catch.", (bp) => {
  bp.fill(0, 0, 0, 9, 1, 9, "ice");
  bp.set(6, 0, 6, "water").set(7, 0, 6, "water").set(6, 0, 7, "water").set(7, 0, 7, "water");
  bp.fill(1, 0, 1, 5, 1, 5, "spruce_planks");
  bp.walls(1, 1, 1, 5, 3, 5, "spruce_planks");
  for (const [cx, cz] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(cx, 1, cz, 1, 3, 1, "dark_oak_log");
  bp.door(3, 1, 5, "dark_oak", "south");
  bp.set(5, 2, 3, "glass_pane");
  bp.gableRoof(1, 4, 1, 5, 5, "dark_oak_planks", "dark_oak_log");
  bp.set(3, 3, 3, "lantern");
  bp.set(2, 1, 2, "barrel").set(4, 1, 2, "chest");
  bp.set(8, 1, 7, "villages:post", { "villages:people": 0, "villages:job": 1 });
  bp.set(8, 1, 1, "spruce_fence").set(8, 2, 1, "lantern");
  for (const [x, z] of [[0, 8], [8, 8], [0, 0]] as const) bp.set(x, 1, z, "snow_layer", { height: 2, covered_bit: false });
});

building("wolffolk_watchtower", "Watchtower", "wolffolk", "A dark oak tower on a stone footing, snow on the platform. The wolffolk guard post; their villages have more of these than anyone's.", (bp) => {
  tower(bp, "spruce_planks", "dark_oak_log", "stone_bricks", "dark_oak_fence", "dark_oak", 8);
  for (const [x, z] of [[1, 1], [5, 5]] as const) bp.set(x, 10, z, "snow_layer", { height: 1, covered_bit: false });
});

const snowfield = (bp: Blueprint, rand: () => number, y: number): void => {
  tree(bp, 2, y, 2, "spruce_log", "spruce_leaves", 5);
  tree(bp, 6, y, 6, "spruce_log", "spruce_leaves", 4);
  bp.set(6, y, 2, "campfire").set(6, y, 1, "spruce_planks");
  for (let i = 0; i < 8; i++) { const x = Math.floor(rand() * 9), z = Math.floor(rand() * 9); if (bp.at(x, y, z) === undefined) bp.set(x, y, z, "snow_layer", { height: Math.floor(rand() * 3), covered_bit: false }); }
};

// ---------------------------------------------------------------------------
// Rabbitfolk: birch on packed mud, turf warrens, a bake house.
// ---------------------------------------------------------------------------

const RABBIT: Cottage = { floor: "packed_mud", wall: "birch_planks", corner: "birch_log", roof: "birch_planks", door: "birch", ridge: "birch_log" };

building("rabbitfolk_bakehouse", "Bake House", "rabbitfolk", "Two furnaces and a smoker under a birch roof, a chest of wheat, a cake on the table. The worker's post: the baker turns the chest's wheat into bread.", (bp) => {
  cottage(bp, 1, 1, 9, 7, 3, RABBIT);
  bp.set(2, 1, 2, "furnace", { "minecraft:cardinal_direction": "south" }).set(3, 1, 2, "furnace", { "minecraft:cardinal_direction": "south" }).set(4, 1, 2, "smoker", { "minecraft:cardinal_direction": "south" });
  bp.set(8, 1, 2, "chest").set(8, 1, 3, "hay_block", { pillar_axis: "y" });
  table(bp, 6, 1, 4, "birch");
  bp.set(6, 2, 4, "cake");
  post(bp, 4, 1, 5, "worker");
  bp.fill(2, 1, 1, 1, 6, 1, "brick_block");
});

building("rabbitfolk_warren", "Warren", "rabbitfolk", "A birch-framed round door in a turf bank, a window either side, and only a chimney showing on top. The rabbitfolk home; several make a warren.", (bp) => {
  mound(bp, 1, 1, 7, 7, 2, { ...RABBIT, turf: "grass", frame: "birch_log" });
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest");
  post(bp, 4, 1, 5, "builder");
  bp.set(5, 4, 5, "poppy").set(2, 4, 3, "dandelion");
});

const carrotPatch = (bp: Blueprint, rand: () => number, y: number): void => {
  bp.fill(1, y - 1, 1, 7, 1, 7, "farmland", { moisturized_amount: 7 });
  bp.set(4, y - 1, 4, "water");
  for (let x = 1; x < 8; x++) for (let z = 1; z < 8; z++) if (!(x === 4 && z === 4) && bp.at(x, y, z) === undefined) bp.set(x, y, z, "carrots", { growth: rand() < 0.7 ? 7 : 5 });
  bp.set(4, y, 1, "chest");
  bp.set(4, y, 2, "villages:post", { "villages:people": 0, "villages:job": 1 });
  bp.walls(0, y, 0, 9, 1, 9, "birch_fence");
  bp.gate(4, y, 8, "birch", "south");
};

// ---------------------------------------------------------------------------
// Bearfolk: dark oak log lodges under spruce roofs, hives on posts.
// ---------------------------------------------------------------------------

const BEAR: Cottage = { floor: "cobblestone", wall: "dark_oak_log", corner: "dark_oak_log", roof: "spruce_planks", door: "dark_oak", ridge: "dark_oak_log" };

building("bearfolk_great_lodge", "Great Lodge", "bearfolk", "Whole dark oak logs for walls, a wide spruce roof, a fire and honey shelves inside. The biggest hall of any people, for the biggest people; the trader's post.", (bp) => {
  cottage(bp, 1, 1, 11, 9, 5, BEAR);
  bp.fill(5, 1, 4, 3, 1, 3, "polished_deepslate").set(6, 1, 5, "campfire");
  for (const x of [4, 5, 6, 7, 8]) bp.stairs(x, 1, 3, "spruce_planks", "south").stairs(x, 1, 7, "spruce_planks", "north");
  bp.set(2, 1, 2, "chest").set(3, 1, 2, "honey_block").set(10, 1, 2, "chest").set(9, 1, 2, "honeycomb_block");
  bp.set(2, 2, 2, "honeycomb_block").set(10, 2, 2, "honey_block");
  table(bp, 3, 1, 5, "spruce");
  table(bp, 9, 1, 5, "spruce");
  post(bp, 6, 1, 8, "trader");
  bp.set(3, 5, 5, "lantern").set(9, 5, 5, "lantern");
});

building("bearfolk_lodge", "Lodge", "bearfolk", "A log cabin with a spruce roof, tall for its footprint because the people are. The bearfolk home.", (bp) => {
  cottage(bp, 1, 1, 7, 7, 4, BEAR);
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest").set(6, 1, 3, "barrel");
  post(bp, 4, 1, 5, "builder");
});

const apiary = (bp: Blueprint, rand: () => number, y: number): void => {
  for (const [x, z] of [[2, 2], [6, 2], [2, 6], [6, 6]] as const) {
    bp.set(x, y, z, "dark_oak_fence");
    bp.set(x, y + 1, z, "beehive", { direction: 0, honey_level: 5 });
  }
  bp.set(7, y, 4, "chest");
  bp.set(6, y, 4, "villages:post", { "villages:people": 0, "villages:job": 1 });
  for (let i = 0; i < 10; i++) { const x = Math.floor(rand() * 9), z = Math.floor(rand() * 9); if (bp.at(x, y, z) === undefined) bp.set(x, y, z, FLOWERS[Math.floor(rand() * FLOWERS.length)]!); }
};

// ---------------------------------------------------------------------------
// Fennecfolk: sandstone, flat roofs, awnings, a well.
// ---------------------------------------------------------------------------

building("fennecfolk_shade_house", "Shade House", "fennecfolk", "An open hall of sandstone pillars under one wide flat roof, carpets and barrels in the shade, an awning on the sunny side. The centre of a fennecfolk village; the trader's post.", (bp) => {
  bp.fill(1, 0, 1, 9, 1, 9, "sandstone");
  for (const [x, z] of [[1, 1], [5, 1], [9, 1], [1, 5], [9, 5], [1, 9], [5, 9], [9, 9]] as const) bp.fill(x, 1, z, 1, 4, 1, "cut_sandstone");
  flatRoof(bp, 1, 5, 1, 9, 9, "smooth_sandstone", "sandstone_wall");
  bp.fill(2, 1, 2, 7, 1, 7, "orange_carpet");
  bp.set(2, 1, 2, "barrel").set(3, 1, 2, "barrel").set(8, 1, 2, "chest");
  table(bp, 5, 1, 4, "acacia");
  post(bp, 5, 1, 7, "trader");
  bp.set(3, 4, 5, "lantern", { hanging: true }).set(7, 4, 5, "lantern", { hanging: true });
  awning(bp, 2, 3, 10, 7, 2, "orange_wool", "white_wool");
  bp.fill(2, 1, 11, 1, 2, 1, "sandstone_wall").fill(8, 1, 11, 1, 2, 1, "sandstone_wall");
  bp.door(5, 1, 10, "acacia", "south");
});

building("fennecfolk_house", "Sand House", "fennecfolk", "Smooth sandstone walls, a flat roof to sit on at dusk, small windows against the heat. The fennecfolk home.", (bp) => {
  bp.fill(1, 0, 1, 7, 1, 7, "sandstone");
  bp.walls(1, 1, 1, 7, 3, 7, "smooth_sandstone");
  for (const [cx, cz] of [[1, 1], [7, 1], [1, 7], [7, 7]] as const) bp.fill(cx, 1, cz, 1, 3, 1, "cut_sandstone");
  bp.door(4, 1, 7, "acacia", "south");
  bp.set(2, 2, 7, "glass_pane").set(6, 2, 7, "glass_pane").set(1, 2, 4, "glass_pane").set(7, 2, 4, "glass_pane");
  flatRoof(bp, 1, 4, 1, 7, 7, "smooth_sandstone", "sandstone_wall");
  bp.set(4, 3, 4, "lantern", { hanging: true });
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest");
  post(bp, 4, 1, 5, "builder");
  bp.set(3, 5, 4, "orange_carpet").set(5, 5, 4, "white_carpet");
});

building("fennecfolk_tower", "Watch Tower", "fennecfolk", "A sandstone tower with a walled platform, the tallest thing for a long way in the desert. The fennecfolk guard post.", (bp) => {
  tower(bp, "smooth_sandstone", "cut_sandstone", "sandstone", "sandstone_wall", "acacia", 8);
});

building("fennecfolk_well", "Well", "fennecfolk", "A sandstone ring round water under a little awning. The middle of a fennecfolk square.", (bp) => {
  bp.fill(0, 0, 0, 5, 1, 5, "sandstone");
  bp.walls(1, 1, 1, 3, 1, 3, "cut_sandstone");
  bp.set(2, 0, 2, "water");
  for (const [x, z] of [[1, 1], [3, 3], [1, 3], [3, 1]] as const) bp.fill(x, 2, z, 1, 2, 1, "sandstone_wall");
  awning(bp, 1, 4, 1, 3, 3, "orange_wool", "white_wool");
  bp.set(2, 3, 2, "lantern", { hanging: true });
});


const cactusGarden = (bp: Blueprint, rand: () => number, y: number): void => {
  for (const x of [1, 3, 5, 7]) for (const z of [1, 4, 7]) bp.fill(x, y, z, 1, 2 + Math.floor(rand() * 2), 1, "cactus", { age: 0 });
  bp.set(8, y, 5, "chest");
  bp.set(8, y, 4, "villages:post", { "villages:people": 0, "villages:job": 1 });
  for (let i = 0; i < 4; i++) { const x = Math.floor(rand() * 9), z = Math.floor(rand() * 9); if (bp.at(x, y, z) === undefined) bp.set(x, y, z, "deadbush"); }
};

const cactus = (bp: Blueprint, x: number, y: number, z: number): void => {
  bp.fill(x, y, z, 1, 3, 1, "cactus", { age: 0 });
};

// ---------------------------------------------------------------------------
// Mousefolk: houses under and inside giant mushrooms, on mycelium.
// ---------------------------------------------------------------------------

building("mousefolk_toadstool_hall", "Toadstool Hall", "mousefolk", "A giant red mushroom with the hall inside its stem and shroomlights under the cap. The centre of a mousefolk village; the trader's post.", (bp) => {
  bp.fill(2, 0, 2, 7, 1, 7, "mud_bricks");
  wallsWith(bp, 2, 1, 2, 7, 4, 7, "mushroom_stem", STEM);
  bp.door(5, 1, 8, "dark_oak", "south");
  bp.set(3, 2, 8, "glass_pane").set(7, 2, 8, "glass_pane").set(2, 2, 5, "glass_pane").set(8, 2, 5, "glass_pane");
  cap(bp, 5, 5, 5, 5, "red_mushroom_block");
  for (const [x, z] of [[1, 1], [9, 1], [1, 9], [9, 9]] as const) bp.set(x, 4, z, "shroomlight");
  bp.set(3, 1, 3, "chest").set(4, 1, 3, "barrel").set(7, 1, 3, "chest");
  table(bp, 5, 1, 4, "dark_oak");
  post(bp, 5, 1, 6, "trader");
  bp.set(5, 4, 5, "shroomlight");
});

building("mousefolk_cap_house", "Cap House", "mousefolk", "A tiny house under a brown mushroom cap, two blocks to the ceiling. The mousefolk home: the smallest people, the lowest doors.", (bp) => {
  bp.fill(1, 0, 1, 5, 1, 5, "mud_bricks");
  wallsWith(bp, 1, 1, 1, 5, 2, 5, "brown_mushroom_block", CAP);
  for (const [cx, cz] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(cx, 1, cz, 1, 2, 1, "mushroom_stem", STEM);
  bp.door(3, 1, 5, "dark_oak", "south");
  bp.set(1, 2, 3, "glass_pane").set(5, 2, 3, "glass_pane");
  cap(bp, 3, 3, 3, 3, "brown_mushroom_block");
  bed(bp, 2, 1, 2);
  bp.set(4, 1, 2, "chest");
  post(bp, 3, 1, 4, "builder");
  bp.set(3, 2, 3, "shroomlight");
});

const mushroomPatch = (bp: Blueprint, rand: () => number, y: number): void => {
  giantMushroom(bp, 6, y, 6);
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(rand() * 9), z = Math.floor(rand() * 9);
    if (bp.at(x, y, z) === undefined) bp.set(x, y, z, rand() < 0.5 ? "red_mushroom" : "brown_mushroom");
  }
  bp.set(1, y, 2, "chest");
  bp.set(2, y, 2, "villages:post", { "villages:people": 0, "villages:job": 1 });
  bp.set(1, y, 7, "mushroom_stem", STEM).set(1, y + 1, 7, "shroomlight");
};

/** A giant mushroom where a tree would stand: a three-high stem under a two-layer cap. */
function giantMushroom(bp: Blueprint, x: number, y: number, z: number): void {
  bp.fill(x, y, z, 1, 3, 1, "mushroom_stem", STEM);
  for (let i = -2; i <= 2; i++)
    for (let k = -2; k <= 2; k++) {
      if (Math.abs(i) === 2 && Math.abs(k) === 2) continue;
      if (x + i < 0 || z + k < 0 || x + i >= bp.sx || z + k >= bp.sz) continue;
      if (bp.at(x + i, y + 3, z + k) === undefined) bp.set(x + i, y + 3, z + k, "red_mushroom_block", CAP);
    }
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) if (x + i >= 0 && z + k >= 0 && x + i < bp.sx && z + k < bp.sz && bp.at(x + i, y + 4, z + k) === undefined) bp.set(x + i, y + 4, z + k, "red_mushroom_block", CAP);
}

// ---------------------------------------------------------------------------
// Squirrelfolk: platforms on jungle logs five up, leaf domes, cocoa.
// ---------------------------------------------------------------------------

const DECK_H = 5;
const SQUIRREL: Cottage = { floor: "jungle_planks", wall: "jungle_planks", corner: "jungle_log", roof: "jungle_planks", door: "jungle", ridge: "jungle_log" };

building("squirrelfolk_nest_hall", "Nest Hall", "squirrelfolk", "A round-shouldered hall on a jungle-log platform under a dome of leaves. The centre of a squirrelfolk village, up in the canopy; the trader's post.", (bp) => {
  platform(bp, 0, DECK_H, 0, 11, 12, "jungle_log", "jungle_planks");
  bp.walls(1, DECK_H + 1, 1, 9, 3, 9, "jungle_planks");
  for (const [cx, cz] of [[1, 1], [9, 1], [1, 9], [9, 9]] as const) bp.fill(cx, DECK_H + 1, cz, 1, 3, 1, "jungle_log");
  bp.door(5, DECK_H + 1, 9, "jungle", "south");
  for (const [x, z] of [[2, 9], [8, 9], [1, 5], [9, 5], [2, 1], [8, 1]] as const) bp.set(x, DECK_H + 2, z, "glass_pane");
  canopy(bp, 5, DECK_H + 4, 5, 5, "jungle_leaves");
  bp.set(5, DECK_H + 3, 5, "lantern");
  bp.set(2, DECK_H + 1, 2, "chest").set(3, DECK_H + 1, 2, "barrel").set(8, DECK_H + 1, 2, "chest");
  table(bp, 5, DECK_H + 1, 4, "jungle");
  post(bp, 5, DECK_H + 1, 7, "trader");
  for (const x of [0, 10]) for (let z = 0; z < 12; z++) if (z % 4 !== 3) bp.set(x, DECK_H + 1, z, "jungle_fence");
});

building("squirrelfolk_treehouse", "Treehouse", "squirrelfolk", "A jungle-plank house on a platform five blocks up, with a railed deck out front. The squirrelfolk home.", (bp) => {
  platform(bp, 0, DECK_H, 0, 9, 10, "jungle_log", "jungle_planks");
  const c = new Blueprint("tmp", "", [9, 12, 9], "squirrelfolk", "");
  cottage(c, 1, 1, 7, 7, 3, SQUIRREL);
  bp.paste(c, 0, DECK_H, 0);
  bed(bp, 2, DECK_H + 1, 2);
  bp.set(6, DECK_H + 1, 2, "chest");
  post(bp, 4, DECK_H + 1, 5, "builder");
  bp.set(0, DECK_H + 1, 9, "jungle_fence").set(8, DECK_H + 1, 9, "jungle_fence").set(0, DECK_H + 2, 9, "lantern");
});

const cocoaGrove = (bp: Blueprint, _rand: () => number, y: number): void => {
  platform(bp, 0, DECK_H, 0, 9, 9, "jungle_log", "jungle_planks");
  bp.fill(4, y - 1, 4, 1, DECK_H + 5, 1, "jungle_log");
  // Pods on the four faces of the trunk above the deck; `direction` is the log they hang from.
  for (const [dx, dz, dir] of [[0, 1, 0], [-1, 0, 1], [0, -1, 2], [1, 0, 3]] as const) {
    bp.set(4 + dx, DECK_H + 1, 4 + dz, "cocoa", { age: 2, direction: dir });
    bp.set(4 + dx, DECK_H + 3, 4 + dz, "cocoa", { age: 1, direction: dir });
  }
  bp.set(7, DECK_H + 1, 7, "chest");
  bp.set(6, DECK_H + 1, 7, "villages:post", { "villages:people": 0, "villages:job": 1 });
  for (const x of [0, 8]) for (let z = 0; z < 9; z++) if (z % 4 !== 3) bp.set(x, DECK_H + 1, z, "jungle_fence");
  canopy(bp, 4, DECK_H + 5, 4, 2, "jungle_leaves");
};

// ---------------------------------------------------------------------------
// Otterfolk: stripped oak and cobblestone at the tide line, a slipway.
// ---------------------------------------------------------------------------

const OTTER: Cottage = { floor: "cobblestone", wall: "stripped_oak_log", corner: "oak_log", roof: "oak_planks", door: "oak", ridge: "oak_log" };

building("otterfolk_holt", "Holt", "otterfolk", "A low stone lodge, wide and squat against the wind, barrels of fish inside and nets on the wall. The centre of an otterfolk village; the trader's post.", (bp) => {
  bp.fill(1, 0, 1, 9, 1, 7, "cobblestone");
  bp.walls(1, 1, 1, 9, 3, 7, "cobblestone");
  for (const [cx, cz] of [[1, 1], [9, 1], [1, 7], [9, 7]] as const) bp.fill(cx, 1, cz, 1, 3, 1, "oak_log");
  bp.door(5, 1, 7, "oak", "south");
  bp.set(3, 2, 7, "glass_pane").set(7, 2, 7, "glass_pane").set(1, 2, 4, "glass_pane").set(9, 2, 4, "glass_pane");
  bp.hipRoof(1, 4, 1, 9, 7, "oak_planks");
  bp.set(5, 3, 4, "lantern");
  bp.set(2, 1, 2, "barrel").set(3, 1, 2, "barrel").set(8, 1, 2, "chest").set(7, 1, 2, "dried_kelp_block");
  bp.set(5, 1, 3, "campfire");
  post(bp, 5, 1, 5, "trader");
});

building("otterfolk_hut", "Hut", "otterfolk", "Stripped oak on a cobblestone course under an oak roof, a lantern on a post outside. The otterfolk home.", (bp) => {
  cottage(bp, 1, 1, 7, 7, 3, OTTER);
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest").set(6, 1, 3, "barrel");
  post(bp, 4, 1, 5, "builder");
  bp.set(0, 1, 8, "oak_fence").set(0, 2, 8, "lantern");
});

building("otterfolk_slipway", "Slipway", "otterfolk", "A cobblestone ramp down into the water between two lantern posts, a barrel at the top for the catch. The worker's post: the fisher works from here.", (bp) => {
  bp.fill(0, 0, 0, 7, 1, 9, "sand");
  bp.fill(0, 0, 5, 7, 2, 4, "water");
  bp.fill(1, 0, 0, 5, 2, 3, "cobblestone");
  bp.fill(1, 0, 3, 5, 1, 2, "cobblestone");
  for (const x of [1, 2, 3, 4, 5]) bp.stairs(x, 1, 3, "cobblestone", "north").stairs(x, 0, 5, "cobblestone", "north");
  bp.set(0, 2, 0, "oak_fence").set(0, 3, 0, "lantern").set(6, 2, 0, "oak_fence").set(6, 3, 0, "lantern");
  bp.set(1, 2, 1, "barrel");
  post(bp, 3, 2, 1, "worker");
  bp.door(3, 2, 2, "oak", "south");
});

const shingle = (bp: Blueprint, rand: () => number, y: number): void => {
  for (let i = 0; i < 14; i++) { const x = Math.floor(rand() * 9), z = Math.floor(rand() * 9); bp.set(x, y - 1, z, rand() < 0.5 ? "gravel" : "sand"); }
  driftwood(bp, 2, y, 3);
  bp.log(6, y, 6, "stripped_oak_log", "z").log(6, y, 7, "stripped_oak_log", "z");
  for (let i = 0; i < 3; i++) { const x = Math.floor(rand() * 9), z = Math.floor(rand() * 9); if (bp.at(x, y, z) === undefined) bp.set(x, y, z, "deadbush"); }
};

/** Driftwood where a tree would stand: a stripped log lying along x. */
function driftwood(bp: Blueprint, x: number, y: number, z: number): void {
  for (let i = -1; i <= 1; i++) if (x + i >= 0 && x + i < bp.sx) bp.log(x + i, y, z, "stripped_oak_log", "x");
}

// ---------------------------------------------------------------------------
// Deerfolk: an open pillared hall in a clearing, oak and moss.
// ---------------------------------------------------------------------------

const DEER: Cottage = { floor: "mossy_cobblestone", wall: "oak_planks", corner: "oak_log", roof: "oak_planks", door: "oak", ridge: "oak_log" };

building("deerfolk_glade_hall", "Glade Hall", "deerfolk", "A ring of oak pillars under a roof of leaves, open at the sides, a fire in the middle and moss underfoot. The centre of a deerfolk village; the trader's post.", (bp) => {
  bp.fill(1, 0, 1, 11, 1, 9, "mossy_cobblestone");
  bp.fill(3, 0, 3, 7, 1, 5, "moss_block");
  for (const [x, z] of [[1, 1], [6, 1], [11, 1], [1, 5], [11, 5], [1, 9], [6, 9], [11, 9]] as const) bp.fill(x, 1, z, 1, 4, 1, "oak_log");
  for (const x of [2, 3, 4, 5, 7, 8, 9, 10]) bp.set(x, 1, 1, "oak_fence").set(x, 1, 9, "oak_fence");
  for (const z of [2, 3, 4, 6, 7, 8]) bp.set(1, 1, z, "oak_fence").set(11, 1, z, "oak_fence");
  bp.set(6, 1, 9, "air").set(6, 1, 1, "air");
  bp.fill(0, 5, 0, 13, 1, 11, "oak_planks");
  canopy(bp, 6, 6, 5, 6, "oak_leaves");
  bp.set(6, 1, 5, "campfire");
  for (const x of [4, 5, 7, 8]) bp.stairs(x, 1, 3, "oak_planks", "south").stairs(x, 1, 7, "oak_planks", "north");
  bp.set(2, 1, 2, "chest").set(10, 1, 2, "barrel");
  post(bp, 6, 1, 8, "trader");
  bp.set(3, 4, 5, "lantern", { hanging: true }).set(9, 4, 5, "lantern", { hanging: true });
});

building("deerfolk_cabin", "Cabin", "deerfolk", "Oak on a mossy footing, tall doors for a tall people, moss on the roof. The deerfolk home.", (bp) => {
  const top = cottage(bp, 1, 1, 7, 7, 4, DEER);
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest");
  post(bp, 4, 1, 5, "builder");
  for (const [x, z] of [[1, 2], [7, 6], [4, 1]] as const) if (bp.at(x, top, z) === undefined && bp.at(x, top - 1, z) !== undefined) bp.set(x, top, z, "moss_carpet");
});

const gleanersOrchard = (bp: Blueprint, rand: () => number, y: number): void => {
  orchard("oak_log", "oak_leaves")(bp, rand, y);
  if (bp.at(4, y, 8) !== undefined) bp.set(4, y, 8, "air");
  bp.set(5, y, 4, "chest");
  bp.set(4, y, 4, "villages:post", { "villages:people": 0, "villages:job": 1 });
};

const meadow = (log: string, leaves: string) => (bp: Blueprint, rand: () => number, y: number): void => {
  tree(bp, 6, y, 3, log, leaves, 4);
  scatter(bp, rand, 0, y, 0, 9, 9, 3);
};

// ---------------------------------------------------------------------------
// The peoples
// ---------------------------------------------------------------------------

const CONCEPT = { concept: true, emptyLots: 2 } as const;

export const FURFOLK: People[] = [
  {
    ...CONCEPT, key: "foxfolk", title: "Foxfolk", paving: "podzol", verge: "grass", post: "spruce_fence", core: "foxfolk_den",
    houses: [["foxfolk_cabin", 3], ["shared_larder", 1]],
    greens: [["berry_patch", 3, berryPatch], ["grove", 1, grove("spruce_log", "spruce_leaves")]],
    tree: { log: "spruce_log", leaves: "spruce_leaves" },
    watch: "foxfolk_lookout", biomes: ["taiga"], salt: 20260915,
  },
  {
    ...CONCEPT, key: "catfolk", title: "Catfolk", paving: "smooth_stone", verge: "grass", post: "cherry_fence", core: "catfolk_loom_house",
    houses: [["catfolk_house", 3], ["shared_larder", 1], ["shared_inn", 1]],
    greens: [["paddock", 3, paddock], ["garden", 2, meadow("cherry_log", "cherry_leaves")]],
    tree: { log: "cherry_log", leaves: "cherry_leaves" },
    biomes: ["cherry_grove", "flower_forest"], salt: 20260916,
  },
  {
    ...CONCEPT, key: "wolffolk", title: "Wolffolk", paving: "cobblestone", verge: "snow", post: "spruce_fence", core: "wolffolk_lodge",
    houses: [["wolffolk_cabin", 3], ["wolffolk_fishing_hut", 2], ["shared_larder", 1]],
    greens: [["snowfield", 3, snowfield]],
    tree: { log: "spruce_log", leaves: "spruce_leaves" },
    watch: "wolffolk_watchtower", biomes: ["cold"], salt: 20260917,
  },
  {
    ...CONCEPT, key: "rabbitfolk", title: "Rabbitfolk", paving: "packed_mud", verge: "grass", post: "birch_fence", core: "rabbitfolk_bakehouse",
    houses: [["rabbitfolk_warren", 4], ["shared_larder", 1]],
    greens: [["carrot_patch", 3, carrotPatch], ["meadow", 2, meadow("birch_log", "birch_leaves")]],
    tree: { log: "birch_log", leaves: "birch_leaves" },
    biomes: ["birch"], salt: 20260918,
  },
  {
    ...CONCEPT, key: "bearfolk", title: "Bearfolk", paving: "mossy_cobblestone", verge: "grass", post: "dark_oak_fence", core: "bearfolk_great_lodge",
    houses: [["bearfolk_lodge", 3], ["shared_larder", 1]],
    greens: [["apiary", 3, apiary], ["grove", 2, grove("dark_oak_log", "dark_oak_leaves")]],
    tree: { log: "dark_oak_log", leaves: "dark_oak_leaves" },
    biomes: ["roofed"], salt: 20260919,
  },
  {
    ...CONCEPT, key: "fennecfolk", title: "Fennecfolk", paving: "smooth_sandstone", verge: "sand", post: "sandstone_wall", core: "fennecfolk_shade_house",
    houses: [["fennecfolk_house", 3]],
    greens: [["cactus_garden", 3, cactusGarden]],
    tree: { log: "acacia_log", leaves: "acacia_leaves" }, plant: cactus,
    watch: "fennecfolk_tower",
    squareExtra: (bp, side) => {
      const well = BUILDINGS.find((b) => b.key === "fennecfolk_well")!;
      bp.paste(well, Math.floor(side / 2) - Math.floor(well.sx / 2), 0, side - well.sz - 3);
    },
    biomes: ["desert"], salt: 20260920,
  },
  {
    ...CONCEPT, key: "mousefolk", title: "Mousefolk", paving: "mud_bricks", verge: "mycelium", post: "dark_oak_fence", core: "mousefolk_toadstool_hall",
    houses: [["mousefolk_cap_house", 4]],
    greens: [["mushroom_patch", 3, mushroomPatch]],
    tree: { log: "dark_oak_log", leaves: "dark_oak_leaves" }, plant: giantMushroom,
    biomes: ["mushroom_island"], salt: 20260921,
  },
  {
    ...CONCEPT, key: "squirrelfolk", title: "Squirrelfolk", paving: "jungle_planks", verge: "grass", post: "jungle_fence", core: "squirrelfolk_nest_hall",
    houses: [["squirrelfolk_treehouse", 3]],
    greens: [["cocoa_grove", 3, cocoaGrove]],
    tree: { log: "jungle_log", leaves: "jungle_leaves" },
    deck: { height: DECK_H, post: "jungle_log", rail: "jungle_fence", over: "grass" },
    biomes: ["jungle"], salt: 20260922,
  },
  {
    ...CONCEPT, key: "otterfolk", title: "Otterfolk", paving: "gravel", verge: "sand", post: "oak_fence", core: "otterfolk_holt",
    houses: [["otterfolk_hut", 3], ["otterfolk_slipway", 2], ["shared_larder", 1]],
    greens: [["shingle", 3, shingle]],
    tree: { log: "oak_log", leaves: "oak_leaves" }, plant: driftwood,
    biomes: ["beach"], salt: 20260923,
  },
  {
    ...CONCEPT, key: "deerfolk", title: "Deerfolk", paving: "moss_block", verge: "grass", post: "oak_fence", core: "deerfolk_glade_hall",
    houses: [["deerfolk_cabin", 3], ["shared_larder", 1]],
    greens: [["orchard", 3, gleanersOrchard], ["meadow", 2, meadow("oak_log", "oak_leaves")]],
    tree: { log: "oak_log", leaves: "oak_leaves" },
    biomes: ["forest"], salt: 20260924,
  },
];
