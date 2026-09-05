/**
 * The buildings of docs/design/settlements.md, authored as blueprints.
 *
 * Each people has a palette and a silhouette: stonefolk in stone brick and
 * deepslate with steep tile roofs; reedfolk in mangrove and bamboo on stilts;
 * tinkers in brick and copper; tallfolk in oak on cobblestone with dark oak
 * roofs. Shared buildings use oak and cobblestone so any settlement can have
 * them. Footprints are small on purpose: a builder places one block every few
 * seconds, and a house of a few hundred blocks is twenty real minutes.
 *
 * Every building faces +z (south): the door is on the south wall. Roofs are
 * stairs with the block behind them, doors, beds, ladders and gates are the
 * real blocks with their states, and a lantern under a block hangs; the
 * states are written to the .mcstructure and drawn by the viewer.
 */
import { Blueprint } from "./blueprint";

interface Cottage {
  floor: string;
  wall: string;
  corner: string;
  roof: string;
  /** Wood of the door: oak, spruce, mangrove, dark_oak, or copper. */
  door: string;
  ridge?: string;
  window?: string;
}

/**
 * A cottage: floor, walls with log corners, a south door, windows, a gable
 * roof overhanging by one, a lantern under the ridge. `x, z` is the wall
 * corner; the blueprint must leave one block around it for the roof.
 */
function cottage(bp: Blueprint, x: number, z: number, w: number, d: number, wallH: number, m: Cottage): number {
  bp.fill(x, 0, z, w, 1, d, m.floor);
  bp.walls(x, 1, z, w, wallH, d, m.wall);
  for (const [cx, cz] of [
    [x, z],
    [x + w - 1, z],
    [x, z + d - 1],
    [x + w - 1, z + d - 1],
  ] as const)
    bp.fill(cx, 1, cz, 1, wallH, 1, m.corner);
  const doorX = x + Math.floor(w / 2);
  bp.door(doorX, 1, z + d - 1, m.door, "south");
  const glass = m.window ?? "glass_pane";
  const wy = Math.min(2, wallH);
  if (w >= 5) {
    bp.set(x + 1, wy, z + d - 1, glass).set(x + w - 2, wy, z + d - 1, glass);
    bp.set(x + 1, wy, z, glass).set(x + w - 2, wy, z, glass);
  }
  if (d >= 5) {
    bp.set(x, wy, z + Math.floor(d / 2), glass).set(x + w - 1, wy, z + Math.floor(d / 2), glass);
  }
  const roofTop = bp.gableRoof(x, 1 + wallH, z, w, d, m.roof, m.ridge);
  bp.set(x + Math.floor(w / 2), wallH, z + Math.floor(d / 2), "lantern");
  return 1 + wallH + roofTop;
}

/** A bed with its head against the north, foot at z + 1. */
function bed(bp: Blueprint, x: number, y: number, z: number): void {
  bp.bed(x, y, z + 1, "north");
}

/**
 * The job post that anchors a building's person (docs/design/villages.md §4):
 * `villages:post` with the job in its state. The people is stamped by
 * villages.ts when the building joins a people's pools; here it is 0.
 */
const JOB_INDEX = { guard: 0, worker: 1, trader: 2, builder: 3 } as const;
function post(bp: Blueprint, x: number, y: number, z: number, job: keyof typeof JOB_INDEX): void {
  bp.set(x, y, z, "villages:post", { "villages:people": 0, "villages:job": JOB_INDEX[job] });
}

/** A table: a fence post with a slab on it, and a chair (stairs) facing it from the south. */
function table(bp: Blueprint, x: number, y: number, z: number, wood: string): void {
  bp.set(x, y, z, `${wood}_fence`).slab(x, y + 1, z, `${wood}_planks`);
  bp.stairs(x, y, z + 1, `${wood}_planks`, "south");
}

export const BUILDINGS: Blueprint[] = [];

/** Author into a roomy box; the saved blueprint is trimmed to what was placed. */
function building(key: string, title: string, people: string, notes: string, author: (bp: Blueprint) => void): void {
  const bp = new Blueprint(key, title, [32, 32, 32], people, notes);
  author(bp);
  BUILDINGS.push(bp.trimmed());
}

// ---------------------------------------------------------------------------
// Stonefolk: stone brick, polished deepslate corners, deepslate tile roofs.
// ---------------------------------------------------------------------------

const STONE: Cottage = { floor: "stone_bricks", wall: "stone_bricks", corner: "polished_deepslate", roof: "deepslate_tiles", door: "spruce", ridge: "polished_deepslate", window: "glass_pane" };

building("stonefolk_hall", "Hill Hall", "stonefolk", "The heart of a stonefolk settlement: a long hall with a hearth ring in the middle and stores along the back wall. The guard post and forge stand beside it.", (bp) => {
  cottage(bp, 1, 1, 11, 9, 4, STONE);
  // Hearth: a ring of stone bricks round a campfire, under the lantern.
  bp.fill(5, 1, 4, 3, 1, 3, "polished_deepslate").set(6, 1, 5, "campfire");
  bp.set(2, 1, 2, "chest").set(10, 1, 2, "chest").set(3, 1, 2, "barrel").set(9, 1, 2, "barrel");
  // Benches round the hearth, facing the fire; a table at each end.
  for (const x of [5, 6, 7]) bp.stairs(x, 1, 3, "spruce_planks", "south").stairs(x, 1, 7, "spruce_planks", "north");
  bp.stairs(4, 1, 5, "spruce_planks", "east").stairs(8, 1, 5, "spruce_planks", "west");
  table(bp, 3, 1, 5, "spruce");
  table(bp, 9, 1, 5, "spruce");
  post(bp, 6, 1, 8, "trader");
  // A second lantern each end.
  bp.set(3, 4, 5, "lantern").set(9, 4, 5, "lantern");
});

building("stonefolk_forge", "Forge", "stonefolk", "Two blast furnaces under a brick chimney, an anvil by the door. The stonefolk worker's job block.", (bp) => {
  const top = cottage(bp, 1, 1, 7, 7, 3, { ...STONE, wall: "brick_block", corner: "stone_bricks", roof: "deepslate_tiles" });
  bp.set(2, 1, 2, "blast_furnace").set(3, 1, 2, "blast_furnace").set(6, 1, 5, "anvil");
  post(bp, 4, 1, 4, "worker");
  // Chimney through the roof above the furnaces.
  bp.fill(2, 1, 1, 2, top + 2, 1, "brick_block");
  bp.fill(2, top + 2, 1, 2, 1, 1, "polished_deepslate");
});

building("stonefolk_watchpost", "Watch Post", "stonefolk", "A cobblestone tower with a parapet. The guard's job block: a guard stands here and patrols to the next post.", (bp) => {
  bp.fill(1, 0, 1, 5, 1, 5, "stone_bricks");
  bp.walls(1, 1, 1, 5, 8, 5, "cobblestone");
  for (const [cx, cz] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(cx, 1, cz, 1, 8, 1, "polished_deepslate");
  bp.door(3, 1, 5, "spruce", "south");
  bp.set(3, 3, 1, "glass_pane").set(1, 5, 3, "glass_pane").set(5, 5, 3, "glass_pane");
  // Platform overhanging by one, with a wall parapet and a lantern.
  bp.fill(0, 9, 0, 7, 1, 7, "stone_bricks");
  bp.walls(0, 10, 0, 7, 1, 7, "cobblestone_wall");
  bp.set(3, 10, 3, "lantern");
  // A ladder up the inside of the north wall to the platform.
  bp.ladder(3, 1, 2, 8, "south");
  post(bp, 3, 1, 3, "guard");
  bp.set(3, 9, 2, "air");
});

building("stonefolk_store", "Storehouse", "stonefolk", "Barrels and chests under a low spruce roof. The larder of a stonefolk settlement.", (bp) => {
  bp.fill(1, 0, 1, 7, 1, 7, "stone_bricks");
  bp.walls(1, 1, 1, 7, 3, 7, "stone_bricks");
  bp.door(4, 1, 7, "spruce", "south");
  bp.hipRoof(1, 4, 1, 7, 7, "spruce_planks");
  for (const x of [2, 3, 5, 6]) bp.set(x, 1, 2, "barrel").set(x, 2, 2, "barrel");
  bp.set(2, 1, 5, "chest").set(6, 1, 5, "chest");
  bp.set(4, 3, 4, "lantern");
  post(bp, 4, 1, 4, "builder");
});

// ---------------------------------------------------------------------------
// Reedfolk: mangrove planks and logs, bamboo, over water on stilts.
// ---------------------------------------------------------------------------

const REED: Cottage = { floor: "mangrove_planks", wall: "mangrove_planks", corner: "mangrove_log", roof: "bamboo_mosaic", door: "mangrove", ridge: "mangrove_log" };

building("reedfolk_stilt_house", "Stilt House", "reedfolk", "A one-room house on mangrove stilts three blocks over the water, with a deck out front. The reedfolk home.", (bp) => {
  bp.fill(0, 0, 0, 9, 1, 11, "water");
  for (const [x, z] of [[1, 1], [7, 1], [1, 7], [7, 7], [4, 1], [4, 7], [1, 4], [7, 4]] as const) bp.fill(x, 0, z, 1, 4, 1, "mangrove_log");
  // Floor at y=4, walls above; cottage() draws from its own y=0, so build by hand.
  bp.fill(1, 4, 1, 7, 1, 7, "mangrove_planks");
  bp.walls(1, 5, 1, 7, 3, 7, "mangrove_planks");
  for (const [cx, cz] of [[1, 1], [7, 1], [1, 7], [7, 7]] as const) bp.fill(cx, 5, cz, 1, 3, 1, "mangrove_log");
  bp.door(4, 5, 7, "mangrove", "south");
  bp.set(2, 6, 7, "glass_pane").set(6, 6, 7, "glass_pane").set(1, 6, 4, "glass_pane").set(7, 6, 4, "glass_pane");
  bp.gableRoof(1, 8, 1, 7, 7, "bamboo_mosaic", "mangrove_log");
  bp.set(4, 7, 4, "lantern");
  // Deck and steps down to the water.
  bp.fill(1, 4, 8, 7, 1, 2, "mangrove_planks");
  for (const x of [3, 4, 5]) bp.stairs(x, 3, 10, "mangrove_planks", "north");
  bp.set(1, 5, 9, "mangrove_fence").set(7, 5, 9, "mangrove_fence").set(1, 6, 9, "lantern");
  bed(bp, 2, 5, 2);
  bp.set(6, 5, 2, "chest");
  post(bp, 4, 5, 4, "trader");
});

building("reedfolk_dock", "Dock", "reedfolk", "A pier on log posts with lanterns, boats tied alongside. The reedfolk worker fishes from here.", (bp) => {
  bp.fill(0, 0, 0, 5, 1, 11, "water");
  for (const z of [1, 5, 9]) bp.fill(1, 0, z, 1, 3, 1, "mangrove_log").fill(3, 0, z, 1, 3, 1, "mangrove_log");
  bp.fill(1, 2, 0, 3, 1, 11, "mangrove_planks");
  bp.set(1, 3, 1, "lantern").set(3, 3, 9, "lantern");
  bp.set(1, 3, 5, "mangrove_fence").set(3, 3, 5, "mangrove_fence");
  bp.set(2, 2, 10, "barrel");
  post(bp, 2, 3, 5, "worker");
});

building("reedfolk_rack", "Drying Rack", "reedfolk", "Fish drying on rails between two posts. Decoration that says what the settlement eats.", (bp) => {
  bp.fill(0, 0, 0, 7, 1, 3, "mud");
  bp.fill(1, 1, 1, 1, 3, 1, "mangrove_log").fill(5, 1, 1, 1, 3, 1, "mangrove_log");
  bp.fill(2, 2, 1, 3, 1, 1, "mangrove_fence").fill(2, 3, 1, 3, 1, 1, "mangrove_fence");
  bp.set(2, 1, 1, "dried_kelp_block").set(4, 1, 1, "dried_kelp_block");
});

building("reedfolk_tower", "Reed Tower", "reedfolk", "A bamboo frame with a lookout platform. The reedfolk guard post; slender, so it reads from across the marsh.", (bp) => {
  bp.fill(1, 0, 1, 5, 1, 5, "mud_bricks");
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(x, 1, z, 1, 9, 1, "bamboo_block");
  for (const y of [4, 7]) bp.walls(1, y, 1, 5, 1, 5, "bamboo_planks");
  bp.fill(3, 1, 3, 1, 9, 1, "scaffolding");
  bp.fill(0, 10, 0, 7, 1, 7, "mangrove_planks");
  bp.walls(0, 11, 0, 7, 1, 7, "mangrove_fence");
  bp.set(3, 11, 3, "lantern");
  bp.hipRoof(2, 12, 2, 3, 3, "bamboo_mosaic");
  post(bp, 3, 1, 4, "guard");
});

// ---------------------------------------------------------------------------
// Tinkers: bricks, copper, glass; chimneys and pipes.
// ---------------------------------------------------------------------------

const TINKER: Cottage = { floor: "brick_block", wall: "brick_block", corner: "copper_block", roof: "cut_copper", door: "copper", ridge: "oxidized_copper", window: "glass" };

building("tinker_workshop", "Workshop", "tinker", "A brick workshop under a copper roof: smoker, smithing table, crafting table, and a chimney that would carry a Fluidworks pipe. The tinker worker's and builder's job block.", (bp) => {
  const top = cottage(bp, 1, 1, 9, 7, 4, TINKER);
  bp.set(2, 1, 2, "smoker").set(3, 1, 2, "smithing_table").set(4, 1, 2, "crafting_table").set(8, 1, 2, "chest");
  bp.set(2, 1, 6, "barrel").set(8, 1, 6, "barrel");
  post(bp, 5, 1, 4, "worker");
  bp.fill(2, 1, 1, 1, top + 2, 1, "copper_block");
  bp.set(2, top + 2, 1, "oxidized_copper");
  // A wide window band on the front.
  bp.fill(3, 2, 7, 2, 1, 1, "glass").fill(6, 2, 7, 2, 1, 1, "glass");
});

building("tinker_still", "Copper Still", "tinker", "A copper tower with a glass band and a weathered dome, steam from the top. The tinker trader's stall stands at its foot.", (bp) => {
  bp.fill(1, 0, 1, 5, 1, 5, "brick_block");
  bp.walls(1, 1, 1, 5, 9, 5, "copper_block");
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(x, 1, z, 1, 9, 1, "cut_copper");
  bp.walls(1, 7, 1, 5, 2, 5, "glass");
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(x, 7, z, 1, 2, 1, "cut_copper");
  bp.door(3, 1, 5, "copper", "south");
  bp.hipRoof(1, 10, 1, 5, 5, "weathered_copper");
  bp.set(3, 5, 3, "lantern");
  post(bp, 3, 1, 3, "guard");
});

building("tinker_stall", "Market Stall", "tinker", "Barrel counters under a striped wool awning on fence posts. The trader's job block for every people; the colours change with the people.", (bp) => {
  bp.fill(0, 0, 0, 7, 1, 7, "brick_block");
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(x, 1, z, 1, 3, 1, "spruce_fence");
  bp.fill(1, 1, 5, 5, 1, 1, "barrel").set(1, 1, 3, "barrel").set(1, 1, 4, "barrel");
  for (let x = 0; x < 7; x++) bp.fill(x, 4, 0, 1, 1, 7, x % 2 === 0 ? "red_wool" : "white_wool");
  bp.set(3, 2, 2, "chest").set(3, 3, 3, "lantern");
  post(bp, 3, 1, 3, "trader");
});

building("tinker_burrow", "Burrow", "tinker", "A half-sunken brick house with turf on top and a round-ish door. The tinker home: small people, low ceilings.", (bp) => {
  bp.fill(1, 0, 1, 7, 1, 7, "brick_block");
  bp.walls(1, 1, 1, 7, 3, 7, "brick_block");
  bp.door(4, 1, 7, "copper", "south").set(3, 2, 7, "copper_block").set(5, 2, 7, "copper_block").set(4, 3, 7, "copper_block");
  bp.set(2, 2, 7, "glass").set(6, 2, 7, "glass");
  bp.fill(0, 4, 0, 9, 1, 9, "grass");
  bp.fill(1, 5, 1, 7, 1, 7, "grass");
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest").set(4, 3, 4, "lantern");
  post(bp, 4, 1, 5, "builder");
});

// ---------------------------------------------------------------------------
// Tallfolk: oak on cobblestone, dark oak roofs, hay and fences.
// ---------------------------------------------------------------------------

const TALL: Cottage = { floor: "cobblestone", wall: "oak_planks", corner: "oak_log", roof: "dark_oak_planks", door: "oak", ridge: "dark_oak_log", window: "glass_pane" };

building("tallfolk_farmhouse", "Farmhouse", "tallfolk", "Oak on a cobblestone course, a dark oak roof, a bed, a table and a chest. The tallfolk home, and the shape the inn scales up from.", (bp) => {
  cottage(bp, 1, 1, 9, 9, 5, TALL);
  // A cobblestone course round the floor; the door goes back in afterwards,
  // since the course runs through the south wall where its lower half is.
  bp.fill(1, 1, 1, 9, 1, 9, "cobblestone");
  bp.fill(2, 1, 2, 7, 1, 7, "oak_planks");
  bp.door(5, 1, 9, "oak", "south");
  bed(bp, 2, 1, 2);
  bp.set(8, 1, 2, "chest").set(7, 1, 2, "crafting_table").set(8, 1, 8, "barrel");
  table(bp, 5, 1, 5, "oak");
  post(bp, 3, 1, 7, "trader");
});

building("tallfolk_barn", "Barn", "tallfolk", "Spruce walls, a wide door, hay bales inside. Sheep and horses live here; the tallfolk worker's job block.", (bp) => {
  cottage(bp, 1, 1, 9, 11, 5, { ...TALL, wall: "spruce_planks", corner: "spruce_log", floor: "coarse_dirt", door: "spruce" });
  bp.fill(4, 1, 11, 3, 3, 1, "air");
  for (const x of [4, 5, 6]) bp.gate(x, 1, 11, "spruce", "south");
  bp.fill(2, 1, 2, 2, 2, 2, "hay_block").fill(7, 1, 2, 2, 1, 2, "hay_block");
  bp.log(2, 2, 2, "hay_block", "x").log(3, 2, 3, "hay_block", "z");
  post(bp, 5, 1, 6, "worker");
  bp.fill(2, 1, 6, 1, 1, 4, "oak_fence").fill(8, 1, 6, 1, 1, 4, "oak_fence");
});

building("tallfolk_field", "Field", "tallfolk", "Rows of wheat either side of a water channel, fenced, with a gate on the street. The farmer's post and a chest for the harvest stand at the end of the channel, inside the gate.", (bp) => {
  bp.fill(0, 0, 0, 9, 1, 9, "grass");
  bp.fill(1, 0, 1, 7, 1, 7, "farmland", { moisturized_amount: 7 });
  bp.fill(4, 0, 1, 1, 1, 4, "water");
  bp.fill(4, 0, 5, 1, 1, 3, "grass_path");
  for (const x of [1, 2, 3, 5, 6, 7]) for (let z = 1; z < 8; z++) bp.set(x, 1, z, "wheat", { growth: 7 });
  bp.set(4, 1, 5, "chest");
  post(bp, 4, 1, 6, "worker");
  bp.walls(0, 1, 0, 9, 1, 9, "oak_fence");
  bp.gate(4, 1, 8, "oak", "south");
});

building("tallfolk_well", "Well", "tallfolk", "A cobblestone ring round water, a little roof on fence posts. The middle of a tallfolk square.", (bp) => {
  bp.fill(0, 0, 0, 5, 1, 5, "cobblestone");
  bp.walls(1, 1, 1, 3, 1, 3, "cobblestone");
  bp.set(2, 0, 2, "water");
  bp.fill(1, 2, 1, 1, 2, 1, "oak_fence").fill(3, 2, 3, 1, 2, 1, "oak_fence").fill(1, 2, 3, 1, 2, 1, "oak_fence").fill(3, 2, 1, 1, 2, 1, "oak_fence");
  bp.hipRoof(1, 4, 1, 3, 3, "dark_oak_planks");
  bp.set(2, 3, 2, "lantern");
});

building("tallfolk_gatehouse", "Gatehouse", "tallfolk", "A log palisade with a gate and a walkway behind. One segment; the wall segment continues it. Guards stand on the walkway.", (bp) => {
  bp.fill(0, 0, 0, 9, 1, 5, "cobblestone");
  bp.fill(0, 1, 1, 9, 4, 1, "oak_log");
  bp.fill(3, 1, 1, 3, 3, 1, "air");
  for (const x of [3, 4, 5]) bp.gate(x, 1, 1, "oak", "south");
  for (const x of [3, 4, 5]) bp.log(x, 4, 1, "oak_log", "x");
  bp.fill(2, 1, 0, 1, 5, 1, "oak_log").fill(6, 1, 0, 1, 5, 1, "oak_log");
  bp.fill(0, 3, 2, 9, 1, 2, "oak_planks");
  bp.fill(0, 4, 3, 9, 1, 1, "oak_fence");
  bp.set(2, 5, 0, "lantern").set(6, 5, 0, "lantern");
  bp.fill(0, 1, 2, 1, 2, 2, "oak_log").fill(8, 1, 2, 1, 2, 2, "oak_log");
  post(bp, 4, 1, 3, "guard");
});

// ---------------------------------------------------------------------------
// Shared: any settlement can have these.
// ---------------------------------------------------------------------------

building("shared_larder", "Larder", "shared", "A stone-floored hut of chests. What the guards eat from and the workers fill; every settlement has one.", (bp) => {
  bp.fill(1, 0, 1, 5, 1, 5, "stone_bricks");
  bp.walls(1, 1, 1, 5, 3, 5, "spruce_planks");
  for (const [cx, cz] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(cx, 1, cz, 1, 3, 1, "spruce_log");
  bp.door(3, 1, 5, "spruce", "south");
  bp.hipRoof(1, 4, 1, 5, 5, "spruce_planks");
  for (const [x, z] of [[2, 2], [3, 2], [4, 2], [2, 4], [4, 4]] as const) bp.set(x, 1, z, "chest");
  bp.set(3, 3, 3, "lantern");
  post(bp, 3, 1, 4, "builder");
});

building("shared_inn", "Inn", "shared", "Two floors, four beds, a table by the door. The innkeeper sets a respawn point here; a Hearthstone in a settlement becomes a place.", (bp) => {
  cottage(bp, 1, 1, 9, 9, 6, { ...TALL, wall: "spruce_planks", corner: "spruce_log", roof: "dark_oak_planks", door: "spruce" });
  bp.fill(2, 4, 2, 7, 1, 7, "oak_planks");
  bp.fill(8, 4, 2, 1, 1, 2, "air");
  bp.ladder(8, 1, 2, 4, "south");
  bed(bp, 2, 5, 2);
  bed(bp, 4, 5, 2);
  bed(bp, 6, 5, 2);
  bed(bp, 2, 5, 7);
  bp.set(2, 1, 8, "crafting_table").set(3, 1, 2, "chest").set(4, 1, 2, "barrel");
  table(bp, 3, 1, 5, "spruce");
  table(bp, 6, 1, 5, "spruce");
  post(bp, 5, 1, 8, "builder");
  bp.set(5, 3, 5, "lantern").set(5, 4, 5, "air");
  bp.set(4, 2, 9, "glass_pane").set(6, 2, 9, "glass_pane");
});

building("shared_bridge", "Bridge Span", "shared", "Three wide and nine long on log ends, fence rails, a lantern each end. Spans join end to end.", (bp) => {
  bp.fill(0, 0, 0, 5, 2, 9, "water");
  bp.fill(1, 0, 0, 3, 3, 1, "oak_log").fill(1, 0, 8, 3, 3, 1, "oak_log");
  bp.fill(1, 2, 1, 3, 1, 7, "oak_planks");
  bp.fill(1, 3, 1, 1, 1, 7, "oak_fence").fill(3, 3, 1, 1, 1, 7, "oak_fence");
  bp.set(1, 3, 0, "lantern").set(3, 3, 8, "lantern");
});

building("shared_wall", "Wall Segment", "shared", "Cobblestone, four high and one thick, with a stone brick walkway behind and battlements on top. Segments join side by side; the gatehouse is the opening.", (bp) => {
  bp.fill(0, 0, 0, 7, 1, 3, "cobblestone");
  // The wall proper: one thick, four high, battlements every other block.
  bp.fill(0, 1, 0, 7, 4, 1, "cobblestone");
  for (let x = 0; x < 7; x += 2) bp.set(x, 5, 0, "cobblestone_wall");
  // The walkway behind it, two wide, on a cobblestone footing, with a rail.
  bp.fill(0, 1, 1, 7, 2, 2, "cobblestone");
  bp.fill(0, 3, 1, 7, 1, 2, "stone_bricks");
  bp.fill(0, 4, 2, 7, 1, 1, "oak_fence");
  bp.set(3, 5, 1, "lantern");
  // Steps up onto the walkway at the east end.
  bp.set(6, 4, 2, "air").stairs(6, 3, 1, "cobblestone", "west").stairs(6, 3, 2, "cobblestone", "west");
});

// ---------------------------------------------------------------------------
// The second four peoples (docs/design/villages.md §3.3): hobbits in hills,
// wood elves in the canopy, high elves in white stone, drow in the dark.
// ---------------------------------------------------------------------------

/** A tree for a building's own garden: a trunk and a two-layer crown, leaves persistent since nothing else holds them. */
function gardenTree(bp: Blueprint, x: number, y: number, z: number, log: string, leaves: string, height = 4): void {
  const L = { persistent_bit: true, update_bit: false };
  bp.fill(x, y, z, 1, height, 1, log);
  const top = y + height;
  for (let i = -2; i <= 2; i++)
    for (let k = -2; k <= 2; k++) {
      if (Math.abs(i) === 2 && Math.abs(k) === 2) continue;
      for (let j = top - 2; j < top; j++) if (x + i >= 0 && z + k >= 0 && bp.at(x + i, j, z + k) === undefined) bp.set(x + i, j, z + k, leaves, L);
    }
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) if (Math.abs(i) + Math.abs(k) < 2 && x + i >= 0 && z + k >= 0) bp.set(x + i, top, z + k, leaves, L);
}

// Hobbits: grass mounds with round oak doors, oak and cobblestone, gardens.

/** A hobbit hole's front: oak planks with a round-ish door ringed in logs and two round windows. */
function holeFront(bp: Blueprint, x: number, y: number, z: number, w: number): void {
  bp.fill(x, y, z, w, 3, 1, "oak_planks");
  const dx = x + Math.floor(w / 2);
  for (const [i, j] of [[dx - 1, 0], [dx + 1, 0], [dx - 1, 1], [dx + 1, 1]] as const) bp.log(i, y + j, z, "stripped_oak_log", "y");
  bp.log(dx, y + 2, z, "stripped_oak_log", "x").log(dx - 1, y + 2, z, "stripped_oak_log", "x").log(dx + 1, y + 2, z, "stripped_oak_log", "x");
  bp.door(dx, y, z, "oak", "south");
  if (w >= 7) bp.set(x + 1, y + 1, z, "glass").set(x + w - 2, y + 1, z, "glass");
}

building("hobbit_hole", "Hobbit Hole", "hobbit", "A grassy mound with a round oak door in its face and two round windows, a bed, a chest and a table inside, flowers on the roof. The hobbit home.", (bp) => {
  bp.fill(0, 0, 0, 9, 1, 7, "grass");
  bp.fill(0, 1, 0, 9, 2, 6, "grass");
  bp.fill(1, 3, 0, 7, 1, 6, "grass");
  bp.fill(2, 4, 1, 5, 1, 4, "grass");
  bp.fill(3, 5, 2, 3, 1, 2, "grass");
  bp.fill(2, 1, 1, 5, 2, 5, "air");
  bp.fill(2, 0, 1, 5, 1, 5, "oak_planks");
  holeFront(bp, 1, 1, 6, 7);
  bp.fill(7, 3, 2, 1, 2, 1, "cobblestone");
  for (const [x, z] of [[0, 2], [8, 4], [1, 5], [3, 1]] as const) bp.set(x, bp.at(x, 3, z) === undefined ? 3 : 4, z, x % 2 ? "poppy" : "dandelion");
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest").set(4, 2, 3, "lantern");
  table(bp, 6, 1, 4, "oak");
  post(bp, 3, 1, 4, "builder");
});

building("hobbit_garden", "Garden", "hobbit", "Carrots one side of the channel, potatoes the other, fenced, with a gate on the street. The farmer's post and a chest stand at the channel's end.", (bp) => {
  bp.fill(0, 0, 0, 9, 1, 9, "grass");
  bp.fill(1, 0, 1, 7, 1, 7, "farmland", { moisturized_amount: 7 });
  bp.fill(4, 0, 1, 1, 1, 4, "water");
  bp.fill(4, 0, 5, 1, 1, 3, "grass_path");
  for (const x of [1, 2, 3]) for (let z = 1; z < 8; z++) bp.set(x, 1, z, "carrots", { growth: 7 });
  for (const x of [5, 6, 7]) for (let z = 1; z < 8; z++) bp.set(x, 1, z, "potatoes", { growth: 7 });
  bp.set(4, 1, 5, "chest");
  post(bp, 4, 1, 6, "worker");
  bp.walls(0, 1, 0, 9, 1, 9, "oak_fence");
  bp.gate(4, 1, 8, "oak", "south");
});

const HOBBIT: Cottage = { floor: "cobblestone", wall: "oak_planks", corner: "oak_log", roof: "spruce_planks", door: "oak", ridge: "oak_log" };

building("hobbit_inn", "Inn", "hobbit", "Oak on cobblestone under a spruce roof, a bar of barrels, tables, a lantern at the door and the bounder's post outside. The heart of a hobbit village.", (bp) => {
  cottage(bp, 1, 1, 11, 9, 3, HOBBIT);
  bp.fill(2, 1, 2, 4, 1, 1, "barrel");
  bp.set(9, 1, 2, "chest").set(10, 1, 2, "chest");
  table(bp, 3, 1, 5, "oak");
  table(bp, 9, 1, 5, "oak");
  bp.set(6, 2, 2, "cake");
  post(bp, 6, 1, 4, "trader");
  bp.set(0, 1, 9, "oak_fence").set(0, 2, 9, "lantern");
  post(bp, 12, 1, 8, "guard");
});

building("hobbit_pantry", "Pantry", "hobbit", "A smaller mound full of chests and barrels behind a round door. The larder of a hobbit village.", (bp) => {
  bp.fill(0, 0, 0, 7, 1, 5, "grass");
  bp.fill(0, 1, 0, 7, 2, 4, "grass");
  bp.fill(1, 3, 0, 5, 1, 4, "grass");
  bp.set(3, 4, 1, "grass");
  bp.fill(1, 1, 1, 5, 2, 3, "air");
  bp.fill(1, 0, 1, 5, 1, 3, "oak_planks");
  holeFront(bp, 1, 1, 4, 5);
  for (const x of [1, 2, 4, 5]) bp.set(x, 1, 1, "chest");
  bp.set(1, 1, 3, "barrel").set(5, 1, 3, "barrel").set(3, 2, 2, "lantern");
  post(bp, 4, 1, 2, "trader");
});

building("hobbit_bounder", "Bounder's Shelter", "hobbit", "Four fence posts and a slab roof with a lantern under it. Where the bounder keeps watch at the end of a lane.", (bp) => {
  bp.fill(0, 0, 0, 5, 1, 5, "grass");
  for (const [x, z] of [[1, 1], [3, 1], [1, 3], [3, 3]] as const) bp.fill(x, 1, z, 1, 2, 1, "oak_fence");
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) bp.slab(x, 3, z, "oak_planks");
  bp.set(2, 2, 0, "lantern");
  post(bp, 2, 1, 2, "guard");
});

// Wood elves: platforms in the canopy on dark oak trunks, spruce huts under leaf roofs.

const CANOPY = 6;
const LEAF = { persistent_bit: true, update_bit: false };

/** Grass, a two-wide trunk with leaves round it, and a plank platform at CANOPY with a rail (the south middle open). */
function canopy(bp: Blueprint, w: number, d: number, trunk = 2): number {
  bp.fill(0, 0, 0, w, 1, d, "grass");
  const cx = Math.floor((w - trunk) / 2), cz = Math.floor((d - trunk) / 2);
  bp.fill(cx - 2, 3, cz - 2, trunk + 4, 3, trunk + 4, "dark_oak_leaves", LEAF);
  bp.fill(cx, 1, cz, trunk, CANOPY - 1, trunk, "dark_oak_log");
  bp.fill(0, CANOPY, 0, w, 1, d, "dark_oak_planks");
  bp.walls(0, CANOPY + 1, 0, w, 1, d, "dark_oak_fence");
  bp.set(Math.floor(w / 2), CANOPY + 1, d - 1, "air");
  return CANOPY;
}

/** A hut on a platform: spruce walls with log corners, a spruce door south, a leaf roof, a lantern. Returns the floor y. */
function elfHut(bp: Blueprint, x: number, y: number, z: number, w: number, d: number): void {
  bp.walls(x, y + 1, z, w, 2, d, "spruce_planks");
  for (const [cx, cz] of [[x, z], [x + w - 1, z], [x, z + d - 1], [x + w - 1, z + d - 1]] as const) bp.fill(cx, y + 1, cz, 1, 2, 1, "dark_oak_log");
  bp.door(x + Math.floor(w / 2), y + 1, z + d - 1, "spruce", "south");
  bp.set(x, y + 2, z + Math.floor(d / 2), "glass_pane").set(x + w - 1, y + 2, z + Math.floor(d / 2), "glass_pane");
  bp.fill(x - 1, y + 3, z - 1, w + 2, 1, d + 2, "dark_oak_leaves", LEAF);
  bp.fill(x, y + 4, z, w, 1, d, "dark_oak_leaves", LEAF);
  bp.fill(x + 1, y + 5, z + 1, w - 2, 1, d - 2, "dark_oak_leaves", LEAF);
  bp.set(x + Math.floor(w / 2), y + 2, z + Math.floor(d / 2), "lantern");
}

building("wood_elf_platform_house", "Platform House", "wood_elf", "A spruce hut under a leaf roof on a plank platform six blocks up a dark oak trunk, a rail round the edge. The wood elf home.", (bp) => {
  const y = canopy(bp, 7, 7);
  elfHut(bp, 1, y, 1, 5, 5);
  bed(bp, 2, y + 1, 2);
  bp.set(4, y + 1, 2, "chest");
  post(bp, 4, y + 1, 4, "builder");
});

building("wood_elf_hearth", "Hearth Tree", "wood_elf", "A wide platform round a great dark oak, a fire ring, lanterns under the crown, the trader's and the guard's posts. The heart of a wood elf village.", (bp) => {
  bp.fill(0, 0, 0, 11, 1, 11, "grass");
  bp.fill(2, 3, 2, 7, 3, 7, "dark_oak_leaves", LEAF);
  bp.fill(0, CANOPY, 0, 11, 1, 11, "dark_oak_planks");
  bp.walls(0, CANOPY + 1, 0, 11, 1, 11, "dark_oak_fence");
  bp.set(5, CANOPY + 1, 10, "air");
  bp.fill(4, 1, 4, 3, 13, 3, "dark_oak_log");
  bp.fill(1, 11, 1, 9, 2, 9, "dark_oak_leaves", LEAF);
  bp.fill(2, 13, 2, 7, 1, 7, "dark_oak_leaves", LEAF);
  bp.fill(4, 14, 4, 3, 1, 3, "dark_oak_leaves", LEAF);
  for (const [x, z] of [[1, 1], [9, 1], [1, 9], [9, 9]] as const) bp.set(x, 10, z, "lantern");
  bp.set(2, CANOPY + 1, 8, "campfire");
  bp.fill(1, CANOPY + 1, 7, 1, 1, 3, "cobblestone").fill(2, CANOPY + 1, 9, 2, 1, 1, "cobblestone");
  bp.set(8, CANOPY + 1, 1, "chest").set(9, CANOPY + 1, 1, "barrel");
  post(bp, 8, CANOPY + 1, 8, "trader");
  post(bp, 2, CANOPY + 1, 2, "guard");
});

building("wood_elf_lookout", "Lookout", "wood_elf", "A single trunk with a railed nest at the top, above the leaves, a lantern on one corner. The guard's post at the end of a walkway.", (bp) => {
  bp.fill(0, 0, 0, 5, 1, 5, "grass");
  bp.fill(0, 5, 0, 5, 4, 5, "dark_oak_leaves", LEAF);
  bp.fill(2, 1, 2, 1, 9, 1, "dark_oak_log");
  bp.fill(1, 10, 1, 3, 1, 3, "dark_oak_planks");
  bp.walls(1, 11, 1, 3, 1, 3, "dark_oak_fence");
  bp.set(2, 11, 2, "air").set(2, 11, 3, "air");
  bp.set(1, 12, 1, "lantern");
  post(bp, 2, 11, 2, "guard");
});

building("wood_elf_bower", "Bower", "wood_elf", "An open platform under a leaf roof on fence posts: a crafting table, a fletching table, a barrel and a chest. The wood elf worker's post.", (bp) => {
  const y = canopy(bp, 7, 7);
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(x, y + 1, z, 1, 2, 1, "dark_oak_fence");
  bp.fill(0, y + 3, 0, 7, 1, 7, "dark_oak_leaves", LEAF);
  bp.fill(1, y + 4, 1, 5, 1, 5, "dark_oak_leaves", LEAF);
  bp.set(2, y + 1, 1, "crafting_table").set(4, y + 1, 1, "fletching_table");
  bp.set(1, y + 1, 3, "barrel").set(5, y + 1, 3, "chest");
  bp.set(3, y + 2, 4, "lantern");
  post(bp, 3, y + 1, 2, "worker");
});

building("wood_elf_larder", "Larder", "wood_elf", "A hut of barrels and chests on its platform. What the wood elves gather, and the builder's post.", (bp) => {
  const y = canopy(bp, 7, 7);
  elfHut(bp, 1, y, 1, 5, 5);
  bp.set(2, y + 1, 2, "chest").set(3, y + 1, 2, "chest").set(4, y + 1, 2, "barrel");
  post(bp, 4, y + 1, 4, "builder");
});

// High elves: quartz and diorite, prismarine roofs, sea lanterns, cherry trees.

const HIGH: Cottage = { floor: "polished_diorite", wall: "quartz_block", corner: "quartz_pillar", roof: "prismarine_bricks", door: "birch", ridge: "smooth_quartz", window: "light_blue_stained_glass_pane" };

building("high_elf_hall", "Hall of Arches", "high_elf", "A long quartz hall under a prismarine roof: pillars, a fountain in the middle, sea lanterns in the walls, the trader's and the guard's posts. The heart of a high elf village.", (bp) => {
  cottage(bp, 1, 1, 13, 9, 4, HIGH);
  for (const [x, z] of [[3, 3], [11, 3], [3, 7], [11, 7]] as const) bp.fill(x, 1, z, 1, 4, 1, "quartz_pillar");
  bp.fill(6, 1, 4, 3, 1, 3, "smooth_quartz");
  bp.set(7, 1, 5, "water").set(7, 2, 5, "quartz_pillar").set(7, 3, 5, "sea_lantern");
  bp.set(1, 4, 5, "sea_lantern").set(13, 4, 5, "sea_lantern").set(7, 4, 1, "sea_lantern");
  for (const x of [3, 5, 9, 11]) bp.set(x, 2, 9, "light_blue_stained_glass_pane").set(x, 3, 9, "light_blue_stained_glass_pane");
  bp.set(2, 1, 2, "chest").set(12, 1, 2, "chest");
  post(bp, 10, 1, 7, "trader");
  post(bp, 4, 1, 7, "guard");
});

building("high_elf_house", "House", "high_elf", "Quartz on diorite under a prismarine roof, light blue glass, a bed, a chest and a flower pot. The high elf home.", (bp) => {
  cottage(bp, 1, 1, 7, 7, 3, HIGH);
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest").set(2, 1, 6, "flower_pot");
  post(bp, 5, 1, 5, "builder");
});

building("high_elf_library", "Library", "high_elf", "Bookshelves to the ceiling on three walls, a lectern, candles. The builder's post; the high elves keep what they know.", (bp) => {
  cottage(bp, 1, 1, 9, 9, 4, HIGH);
  bp.fill(2, 1, 2, 7, 3, 1, "bookshelf");
  bp.fill(2, 1, 3, 1, 3, 5, "bookshelf").fill(8, 1, 3, 1, 3, 5, "bookshelf");
  bp.set(5, 1, 5, "lectern").set(3, 1, 7, "candle").set(7, 1, 7, "candle");
  post(bp, 4, 1, 6, "builder");
});

building("high_elf_garden", "Cherry Garden", "high_elf", "Two cherry trees inside a low quartz wall, petals on the grass, a diorite path to a chest and the worker's post.", (bp) => {
  bp.fill(0, 0, 0, 9, 1, 9, "grass");
  bp.walls(0, 1, 0, 9, 1, 9, "quartz_slab");
  bp.set(4, 1, 8, "air");
  for (let z = 4; z < 9; z++) bp.set(4, 0, z, "polished_diorite");
  gardenTree(bp, 2, 1, 2, "cherry_log", "cherry_leaves", 4);
  gardenTree(bp, 6, 1, 2, "cherry_log", "cherry_leaves", 4);
  for (const [x, z] of [[1, 5], [7, 6], [2, 7], [6, 4]] as const) if (bp.at(x, 1, z) === undefined) bp.set(x, 1, z, "pink_petals", { growth: 3 });
  bp.set(4, 1, 5, "chest");
  post(bp, 4, 1, 6, "worker");
});

building("high_elf_spire", "Spire", "high_elf", "A slender quartz tower with a prismarine cap and a sea lantern at its point. The guard's post at the end of a street.", (bp) => {
  bp.fill(0, 0, 0, 5, 1, 5, "polished_diorite");
  bp.fill(1, 1, 1, 3, 8, 3, "quartz_block");
  bp.fill(2, 2, 2, 1, 7, 1, "air");
  for (const y of [3, 6]) bp.set(2, y, 3, "light_blue_stained_glass_pane").set(2, y, 1, "light_blue_stained_glass_pane");
  bp.set(2, 9, 2, "sea_lantern");
  bp.hipRoof(1, 10, 1, 3, 3, "prismarine_bricks");
  post(bp, 2, 1, 4, "guard");
});

// Drow: deepslate and blackstone, purple glass, soul lanterns, webs.

const DROW: Cottage = { floor: "deepslate_tiles", wall: "deepslate_bricks", corner: "polished_blackstone", roof: "polished_blackstone_bricks", door: "dark_oak", ridge: "crying_obsidian", window: "purple_stained_glass_pane" };

building("drow_sanctum", "Sanctum", "drow", "A hall of deepslate brick on blackstone pillars, an amethyst altar between crying obsidian, soul lanterns and webs in the corners. The heart of a drow village.", (bp) => {
  cottage(bp, 1, 1, 11, 11, 5, DROW);
  bp.set(6, 5, 6, "soul_lantern");
  for (const [x, z] of [[3, 3], [9, 3], [3, 9], [9, 9]] as const) bp.fill(x, 1, z, 1, 5, 1, "polished_blackstone");
  bp.fill(5, 1, 3, 3, 1, 1, "crying_obsidian");
  bp.set(6, 1, 3, "amethyst_block").set(6, 2, 3, "amethyst_block");
  for (const [x, z] of [[2, 2], [10, 2], [2, 10], [10, 10]] as const) bp.set(x, 4, z, "web");
  bp.set(2, 1, 6, "soul_lantern").set(10, 1, 6, "soul_lantern");
  bp.set(2, 1, 2, "chest").set(10, 1, 2, "chest");
  post(bp, 8, 1, 8, "trader");
  post(bp, 4, 1, 8, "guard");
});

building("drow_house", "House", "drow", "Deepslate brick under a blackstone roof, purple glass, a soul lantern, a web in the corner. The drow home.", (bp) => {
  cottage(bp, 1, 1, 7, 7, 3, DROW);
  bp.set(4, 3, 4, "soul_lantern");
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest").set(2, 3, 2, "web");
  post(bp, 5, 1, 5, "builder");
});

building("drow_spinnery", "Spinnery", "drow", "Looms and webs under a blackstone roof: where the drow spin their silk. The trader's post.", (bp) => {
  cottage(bp, 1, 1, 7, 7, 3, DROW);
  bp.set(4, 3, 4, "soul_lantern");
  bp.set(2, 1, 2, "loom").set(3, 1, 2, "loom").set(6, 1, 2, "chest");
  bp.set(6, 3, 6, "web").set(2, 2, 5, "web");
  post(bp, 5, 1, 5, "trader");
});

building("drow_web_tower", "Web Tower", "drow", "A blackstone brick tower hung with webs, a soul lantern on its roof. The guard's post at the end of a street.", (bp) => {
  bp.fill(0, 0, 0, 5, 1, 5, "deepslate_tiles");
  bp.fill(1, 1, 1, 3, 7, 3, "polished_blackstone_bricks");
  bp.fill(2, 2, 2, 1, 6, 1, "air");
  for (const y of [3, 6]) bp.set(2, y, 3, "purple_stained_glass_pane");
  bp.set(0, 3, 2, "web").set(4, 5, 2, "web").set(2, 4, 0, "web");
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) bp.slab(x, 8, z, "polished_blackstone_bricks");
  bp.set(2, 9, 2, "soul_lantern");
  post(bp, 2, 1, 4, "guard");
});

building("drow_larder", "Larder", "drow", "Chests and barrels under a blackstone roof, a soul lantern over them. What the drow bring in; the builder's post.", (bp) => {
  cottage(bp, 1, 1, 7, 7, 3, DROW);
  bp.set(4, 3, 4, "soul_lantern");
  for (const x of [2, 3, 5, 6]) bp.set(x, 1, 2, "chest");
  bp.set(2, 1, 4, "barrel").set(6, 1, 4, "barrel");
  post(bp, 4, 1, 5, "builder");
});
