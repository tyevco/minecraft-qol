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
 * Every building faces +z (south): the door is on the south wall. Beds are a
 * stand-in (red wool on white wool) until the blueprint placer handles block
 * states; the design doc says so.
 */
import { Blueprint } from "./blueprint";

interface Cottage {
  floor: string;
  wall: string;
  corner: string;
  roof: string;
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
  bp.fill(doorX, 1, z + d - 1, 1, 2, 1, "air");
  const glass = m.window ?? "glass_pane";
  const wy = Math.min(2, wallH);
  if (w >= 5) {
    bp.set(x + 1, wy, z + d - 1, glass).set(x + w - 2, wy, z + d - 1, glass);
    bp.set(x + 1, wy, z, glass).set(x + w - 2, wy, z, glass);
  }
  if (d >= 5) {
    bp.set(x, wy, z + Math.floor(d / 2), glass).set(x + w - 1, wy, z + Math.floor(d / 2), glass);
  }
  const roofTop = bp.gableRoof(x, 1 + wallH, z, w, d, m.roof, m.ridge ?? m.roof);
  bp.set(x + Math.floor(w / 2), wallH, z + Math.floor(d / 2), "lantern");
  return 1 + wallH + roofTop;
}

function bed(bp: Blueprint, x: number, y: number, z: number): void {
  bp.set(x, y, z, "white_wool").set(x, y, z + 1, "red_wool");
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

const STONE: Cottage = { floor: "stone_bricks", wall: "stone_bricks", corner: "polished_deepslate", roof: "deepslate_tiles", ridge: "polished_deepslate", window: "glass_pane" };

building("stonefolk_hall", "Hill Hall", "stonefolk", "The heart of a stonefolk settlement: a long hall with a hearth ring in the middle and stores along the back wall. The guard post and forge stand beside it.", (bp) => {
  cottage(bp, 1, 1, 11, 9, 4, STONE);
  // Hearth: a ring of stone bricks round a campfire, under the lantern.
  bp.fill(5, 1, 4, 3, 1, 3, "polished_deepslate").set(6, 1, 5, "campfire");
  bp.set(2, 1, 2, "chest").set(10, 1, 2, "chest").set(3, 1, 2, "barrel").set(9, 1, 2, "barrel");
  // A second lantern each end.
  bp.set(3, 4, 5, "lantern").set(9, 4, 5, "lantern");
});

building("stonefolk_forge", "Forge", "stonefolk", "Two blast furnaces under a brick chimney, an anvil by the door. The stonefolk worker's job block.", (bp) => {
  const top = cottage(bp, 1, 1, 7, 7, 3, { ...STONE, wall: "bricks", corner: "stone_bricks", roof: "deepslate_tiles" });
  bp.set(2, 1, 2, "blast_furnace").set(3, 1, 2, "blast_furnace").set(6, 1, 5, "anvil");
  // Chimney through the roof above the furnaces.
  bp.fill(2, 1, 1, 2, top + 2, 1, "bricks");
  bp.fill(2, top + 2, 1, 2, 1, 1, "polished_deepslate");
});

building("stonefolk_watchpost", "Watch Post", "stonefolk", "A cobblestone tower with a parapet. The guard's job block: a guard stands here and patrols to the next post.", (bp) => {
  bp.fill(1, 0, 1, 5, 1, 5, "stone_bricks");
  bp.walls(1, 1, 1, 5, 8, 5, "cobblestone");
  for (const [cx, cz] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(cx, 1, cz, 1, 8, 1, "polished_deepslate");
  bp.fill(3, 1, 5, 1, 2, 1, "air");
  bp.set(3, 3, 1, "glass_pane").set(1, 5, 3, "glass_pane").set(5, 5, 3, "glass_pane");
  // Platform overhanging by one, with a wall parapet and a lantern.
  bp.fill(0, 9, 0, 7, 1, 7, "stone_bricks");
  bp.walls(0, 10, 0, 7, 1, 7, "cobblestone_wall");
  bp.set(3, 10, 3, "lantern");
  // Ladder shaft stand-in: a column of scaffolding.
  bp.fill(2, 1, 2, 1, 8, 1, "scaffolding");
});

building("stonefolk_store", "Storehouse", "stonefolk", "Barrels and chests under a low spruce roof. The larder of a stonefolk settlement.", (bp) => {
  bp.fill(1, 0, 1, 7, 1, 7, "stone_bricks");
  bp.walls(1, 1, 1, 7, 3, 7, "stone_bricks");
  bp.fill(4, 1, 7, 1, 2, 1, "air");
  bp.hipRoof(1, 4, 1, 7, 7, "spruce_planks");
  for (const x of [2, 3, 5, 6]) bp.set(x, 1, 2, "barrel").set(x, 2, 2, "barrel");
  bp.set(2, 1, 5, "chest").set(6, 1, 5, "chest");
  bp.set(4, 3, 4, "lantern");
});

// ---------------------------------------------------------------------------
// Reedfolk: mangrove planks and logs, bamboo, over water on stilts.
// ---------------------------------------------------------------------------

const REED: Cottage = { floor: "mangrove_planks", wall: "mangrove_planks", corner: "mangrove_log", roof: "bamboo_mosaic", ridge: "mangrove_log" };

building("reedfolk_stilt_house", "Stilt House", "reedfolk", "A one-room house on mangrove stilts three blocks over the water, with a deck out front. The reedfolk home.", (bp) => {
  bp.fill(0, 0, 0, 9, 1, 11, "water");
  for (const [x, z] of [[1, 1], [7, 1], [1, 7], [7, 7], [4, 1], [4, 7], [1, 4], [7, 4]] as const) bp.fill(x, 0, z, 1, 4, 1, "mangrove_log");
  // Floor at y=4, walls above; cottage() draws from its own y=0, so build by hand.
  bp.fill(1, 4, 1, 7, 1, 7, "mangrove_planks");
  bp.walls(1, 5, 1, 7, 3, 7, "mangrove_planks");
  for (const [cx, cz] of [[1, 1], [7, 1], [1, 7], [7, 7]] as const) bp.fill(cx, 5, cz, 1, 3, 1, "mangrove_log");
  bp.fill(4, 5, 7, 1, 2, 1, "air");
  bp.set(2, 6, 7, "glass_pane").set(6, 6, 7, "glass_pane").set(1, 6, 4, "glass_pane").set(7, 6, 4, "glass_pane");
  bp.gableRoof(1, 8, 1, 7, 7, "bamboo_mosaic", "mangrove_log");
  bp.set(4, 7, 4, "lantern");
  // Deck and steps down to the water.
  bp.fill(1, 4, 8, 7, 1, 2, "mangrove_planks");
  bp.fill(3, 3, 10, 3, 1, 1, "mangrove_planks");
  bp.set(1, 5, 9, "mangrove_fence").set(7, 5, 9, "mangrove_fence").set(1, 6, 9, "lantern");
  bed(bp, 2, 5, 2);
  bp.set(6, 5, 2, "chest");
});

building("reedfolk_dock", "Dock", "reedfolk", "A pier on log posts with lanterns, boats tied alongside. The reedfolk worker fishes from here.", (bp) => {
  bp.fill(0, 0, 0, 5, 1, 11, "water");
  for (const z of [1, 5, 9]) bp.fill(1, 0, z, 1, 3, 1, "mangrove_log").fill(3, 0, z, 1, 3, 1, "mangrove_log");
  bp.fill(1, 2, 0, 3, 1, 11, "mangrove_planks");
  bp.set(1, 3, 1, "lantern").set(3, 3, 9, "lantern");
  bp.set(1, 3, 5, "mangrove_fence").set(3, 3, 5, "mangrove_fence");
  bp.set(2, 2, 10, "barrel");
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
});

// ---------------------------------------------------------------------------
// Tinkers: bricks, copper, glass; chimneys and pipes.
// ---------------------------------------------------------------------------

const TINKER: Cottage = { floor: "bricks", wall: "bricks", corner: "copper_block", roof: "cut_copper", ridge: "oxidized_copper", window: "glass" };

building("tinker_workshop", "Workshop", "tinker", "A brick workshop under a copper roof: smoker, smithing table, crafting table, and a chimney that would carry a Fluidworks pipe. The tinker worker's and builder's job block.", (bp) => {
  const top = cottage(bp, 1, 1, 9, 7, 4, TINKER);
  bp.set(2, 1, 2, "smoker").set(3, 1, 2, "smithing_table").set(4, 1, 2, "crafting_table").set(8, 1, 2, "chest");
  bp.set(2, 1, 6, "barrel").set(8, 1, 6, "barrel");
  bp.fill(2, 1, 1, 1, top + 2, 1, "copper_block");
  bp.set(2, top + 2, 1, "oxidized_copper");
  // A wide window band on the front.
  bp.fill(3, 2, 7, 5, 1, 1, "glass").set(5, 2, 7, "air").set(5, 1, 7, "air");
});

building("tinker_still", "Copper Still", "tinker", "A copper tower with a glass band and a weathered dome, steam from the top. The tinker trader's stall stands at its foot.", (bp) => {
  bp.fill(1, 0, 1, 5, 1, 5, "bricks");
  bp.walls(1, 1, 1, 5, 9, 5, "copper_block");
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(x, 1, z, 1, 9, 1, "cut_copper");
  bp.walls(1, 7, 1, 5, 2, 5, "glass");
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(x, 7, z, 1, 2, 1, "cut_copper");
  bp.fill(3, 1, 5, 1, 2, 1, "air");
  bp.hipRoof(1, 10, 1, 5, 5, "weathered_copper");
  bp.set(3, 13, 3, "oxidized_copper");
  bp.set(3, 5, 3, "lantern");
});

building("tinker_stall", "Market Stall", "tinker", "Barrel counters under a striped wool awning on fence posts. The trader's job block for every people; the colours change with the people.", (bp) => {
  bp.fill(0, 0, 0, 7, 1, 7, "bricks");
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(x, 1, z, 1, 3, 1, "spruce_fence");
  bp.fill(1, 1, 5, 5, 1, 1, "barrel").set(1, 1, 3, "barrel").set(1, 1, 4, "barrel");
  for (let x = 0; x < 7; x++) bp.fill(x, 4, 0, 1, 1, 7, x % 2 === 0 ? "red_wool" : "white_wool");
  bp.set(3, 2, 2, "chest").set(3, 3, 3, "lantern");
});

building("tinker_burrow", "Burrow", "tinker", "A half-sunken brick house with turf on top and a round-ish door. The tinker home: small people, low ceilings.", (bp) => {
  bp.fill(1, 0, 1, 7, 1, 7, "bricks");
  bp.walls(1, 1, 1, 7, 3, 7, "bricks");
  bp.fill(4, 1, 7, 1, 2, 1, "air").set(3, 2, 7, "copper_block").set(5, 2, 7, "copper_block").set(4, 3, 7, "copper_block");
  bp.set(2, 2, 7, "glass").set(6, 2, 7, "glass");
  bp.fill(0, 4, 0, 9, 1, 9, "grass_block");
  bp.fill(1, 5, 1, 7, 1, 7, "grass_block");
  bed(bp, 2, 1, 2);
  bp.set(6, 1, 2, "chest").set(4, 3, 4, "lantern");
});

// ---------------------------------------------------------------------------
// Tallfolk: oak on cobblestone, dark oak roofs, hay and fences.
// ---------------------------------------------------------------------------

const TALL: Cottage = { floor: "cobblestone", wall: "oak_planks", corner: "oak_log", roof: "dark_oak_planks", ridge: "dark_oak_log", window: "glass_pane" };

building("tallfolk_farmhouse", "Farmhouse", "tallfolk", "Oak on a cobblestone course, a dark oak roof, a bed, a table and a chest. The tallfolk home, and the shape the inn scales up from.", (bp) => {
  cottage(bp, 1, 1, 9, 9, 5, TALL);
  bp.fill(1, 1, 1, 9, 1, 9, "cobblestone");
  bp.fill(2, 1, 2, 7, 1, 7, "oak_planks");
  bed(bp, 2, 1, 2);
  bp.set(8, 1, 2, "chest").set(7, 1, 2, "crafting_table").set(8, 1, 8, "barrel");
});

building("tallfolk_barn", "Barn", "tallfolk", "Spruce walls, a wide door, hay bales inside. Sheep and horses live here; the tallfolk worker's job block.", (bp) => {
  cottage(bp, 1, 1, 9, 11, 5, { ...TALL, wall: "spruce_planks", corner: "spruce_log", floor: "coarse_dirt" });
  bp.fill(4, 1, 11, 3, 3, 1, "air");
  bp.fill(2, 1, 2, 2, 2, 2, "hay_block").fill(7, 1, 2, 2, 1, 2, "hay_block");
  bp.fill(2, 1, 6, 1, 1, 4, "oak_fence").fill(8, 1, 6, 1, 1, 4, "oak_fence");
});

building("tallfolk_well", "Well", "tallfolk", "A cobblestone ring round water, a little roof on fence posts. The middle of a tallfolk square.", (bp) => {
  bp.fill(0, 0, 0, 5, 1, 5, "cobblestone");
  bp.walls(1, 1, 1, 3, 1, 3, "cobblestone");
  bp.set(2, 0, 2, "water");
  bp.fill(1, 2, 1, 1, 2, 1, "oak_fence").fill(3, 2, 3, 1, 2, 1, "oak_fence").fill(1, 2, 3, 1, 2, 1, "oak_fence").fill(3, 2, 1, 1, 2, 1, "oak_fence");
  // A small roof: a 3x3 slab and a single cap, no overhang, so it stays a well and not a tower.
  bp.fill(1, 4, 1, 3, 1, 3, "dark_oak_planks");
  bp.set(2, 5, 2, "dark_oak_log");
  bp.set(2, 3, 2, "lantern");
});

building("tallfolk_gatehouse", "Gatehouse", "tallfolk", "A log palisade with a gate and a walkway behind. One segment; the wall segment continues it. Guards stand on the walkway.", (bp) => {
  bp.fill(0, 0, 0, 9, 1, 5, "cobblestone");
  bp.fill(0, 1, 1, 9, 4, 1, "oak_log");
  bp.fill(3, 1, 1, 3, 3, 1, "air");
  bp.fill(3, 4, 1, 3, 1, 1, "oak_planks");
  bp.fill(2, 1, 0, 1, 5, 1, "oak_log").fill(6, 1, 0, 1, 5, 1, "oak_log");
  bp.fill(0, 3, 2, 9, 1, 2, "oak_planks");
  bp.fill(0, 4, 3, 9, 1, 1, "oak_fence");
  bp.set(2, 5, 0, "lantern").set(6, 5, 0, "lantern");
  bp.fill(0, 1, 2, 1, 2, 2, "oak_log").fill(8, 1, 2, 1, 2, 2, "oak_log");
});

// ---------------------------------------------------------------------------
// Shared: any settlement can have these.
// ---------------------------------------------------------------------------

building("shared_larder", "Larder", "shared", "A stone-floored hut of chests. What the guards eat from and the workers fill; every settlement has one.", (bp) => {
  bp.fill(1, 0, 1, 5, 1, 5, "stone_bricks");
  bp.walls(1, 1, 1, 5, 3, 5, "spruce_planks");
  for (const [cx, cz] of [[1, 1], [5, 1], [1, 5], [5, 5]] as const) bp.fill(cx, 1, cz, 1, 3, 1, "spruce_log");
  bp.fill(3, 1, 5, 1, 2, 1, "air");
  bp.hipRoof(1, 4, 1, 5, 5, "spruce_planks");
  for (const [x, z] of [[2, 2], [3, 2], [4, 2], [2, 4], [4, 4]] as const) bp.set(x, 1, z, "chest");
  bp.set(3, 3, 3, "lantern");
});

building("shared_inn", "Inn", "shared", "Two floors, four beds, a table by the door. The innkeeper sets a respawn point here; a Hearthstone in a settlement becomes a place.", (bp) => {
  cottage(bp, 1, 1, 9, 9, 6, { ...TALL, wall: "spruce_planks", corner: "spruce_log", roof: "dark_oak_planks" });
  bp.fill(2, 4, 2, 7, 1, 7, "oak_planks");
  bp.fill(8, 4, 2, 1, 1, 2, "air");
  bp.fill(8, 1, 2, 1, 3, 1, "scaffolding");
  bed(bp, 2, 5, 2);
  bed(bp, 4, 5, 2);
  bed(bp, 6, 5, 2);
  bed(bp, 2, 5, 7);
  bp.set(2, 1, 8, "crafting_table").set(3, 1, 2, "chest").set(4, 1, 2, "barrel");
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
});
