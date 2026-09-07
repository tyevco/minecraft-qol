/**
 * The showcase: every people in one small field, so they can all be looked
 * at at once. A grid of fenced plots, one per people in PEOPLES order (read
 * left to right, north to south), each on the people's own ground with its
 * lamp post, its plant where it has one instead of a tree, and four job
 * posts, one per job, so a guard, a worker, a trader and a builder of that
 * people stand in it. The pack peoples the plots on its own once the
 * structure is placed (`/place structure villages:showcase`), the way it
 * peoples a village; the fences keep each people to its plot, since a
 * person strolls ten blocks from where it spawned.
 *
 * Nothing here starts a trade: no trees (four logs with leaves within sixteen
 * blocks make a lumberjack, and the plots are twelve apart), no water, no
 * crops, no cactus (a cactus hurts whoever brushes it, and a plot is small),
 * so every worker just lives there in its hat. A trade in the showcase would
 * be work with no chest to put it in.
 *
 * The twentieth slot is a lookout: a stone stand with steps, above head
 * height, to see the whole field from.
 */
import { Blueprint, type Facing } from "./blueprint";
import { scatter } from "./greenery";
import { prng } from "./jigsaw";
import { PEOPLES, postStates, type People } from "./villages";

/** Jobs in the order of `villages:job` (packages/villages/scripts/core/record.ts JOBS). */
export const SHOWCASE_JOBS = ["guard", "worker", "trader", "builder"] as const;

export const PLOT = 9;
/** The plot's inner cells run 1..INNER within the fence ring at 0 and PLOT - 1. */
export const INNER = PLOT - 2;
export const GAP = 3;
export const MARGIN = 1;
export const COLS = 4;
export const ROWS = 5;
export const WALK = "stone_bricks";
/**
 * The ground level: the verges and walkways sit on a base layer of WALK,
 * one block under them, so a sand or gravel verge never has air under it
 * (measured: placed forty blocks up, the three sand-floored plots lost
 * their ground and their persons; the same would happen on uneven ground
 * or over a cave), and a field placed on a slope stands on a plinth
 * rather than floating.
 */
export const G = 1;
export const HEIGHT = 9;

export const SHOWCASE_SIZE: readonly [number, number, number] = [
  MARGIN * 2 + COLS * PLOT + (COLS - 1) * GAP,
  HEIGHT,
  MARGIN * 2 + ROWS * PLOT + (ROWS - 1) * GAP,
];

/** Where a plot's north-west corner is, for the i-th slot. */
export function plotOrigin(i: number): [number, number] {
  return [MARGIN + (i % COLS) * (PLOT + GAP), MARGIN + Math.floor(i / COLS) * (PLOT + GAP)];
}

/** The four posts of a plot, in job order, in plot-local cells beside the paving cross. */
export const POST_CELLS: readonly [number, number][] = [[3, 3], [5, 3], [3, 5], [5, 5]];

/**
 * A people's fence: its own lamp-post block where that is a fence or a
 * wall (a person cannot jump one), and the gate's wood. The high elves'
 * post is a quartz pillar, a full block a person steps over, so their
 * plot is walled in diorite, the stone of their paving.
 */
export function ring(p: People): { fence: string; gate: string } {
  const m = /^(\w+)_fence$/.exec(p.post);
  if (m) return { fence: p.post, gate: m[1]! };
  if (/_wall$/.test(p.post)) return { fence: p.post, gate: p.key === "drow" ? "dark_oak" : p.key === "fennecfolk" ? "acacia" : "spruce" };
  return { fence: "diorite_wall", gate: "birch" };
}

/** Whether a people's plant is a cactus: painted into a scratch box and looked at, since the drovers' is a wrapper. */
function isCactus(plant: NonNullable<People["plant"]>): boolean {
  const scratch = new Blueprint("scratch", "", [7, 7, 7], "", "");
  plant(scratch, 3, 1, 3);
  return "minecraft:cactus" in scratch.materials();
}

function plot(bp: Blueprint, p: People, index: number, rand: () => number): void {
  const [px, pz] = plotOrigin(index);
  const { fence, gate } = ring(p);
  // The ground: the people's verge inside the ring, a paving cross through
  // the middle and out through the gate.
  bp.fill(px, G, pz, PLOT, 1, PLOT, p.verge);
  for (let i = 1; i <= INNER; i++) bp.set(px + 4, G, pz + i, p.paving).set(px + i, G, pz + 4, p.paving);
  bp.set(px + 4, G, pz + PLOT - 1, p.paving);
  // The ring, with the gate in the middle of the south side.
  bp.walls(px, G + 1, pz, PLOT, 1, PLOT, fence);
  bp.gate(px + 4, G + 1, pz + PLOT - 1, gate, "south");
  // The lamp in the north-west corner; the plant, where the people has one
  // that is not a cactus, by the south-east corner, on the row behind the
  // posts' persons: a post spawns its person one block south of itself
  // (core/peopling.ts spawnSpot), so nothing stands on z = 4 or z = 6.
  bp.set(px + 1, G + 1, pz + 1, p.post).set(px + 1, G + 2, pz + 1, p.lamp ?? "lantern");
  if (p.plant && !isCactus(p.plant)) p.plant(bp, px + 6, G + 1, pz + 7);
  // One post per job.
  SHOWCASE_JOBS.forEach((_, job) => {
    const [cx, cz] = POST_CELLS[job]!;
    bp.set(px + cx, G + 1, pz + cz, "villages:post", { ...postStates(PEOPLES.indexOf(p)), "villages:job": job });
  });
  // Flowers and grass, or dead bushes on sand, on what is left of the verge,
  // but not where a person is spawned.
  scatter(bp, rand, px + 1, G + 1, pz + 1, INNER, INNER, 3, p.flora);
  for (const [cx, cz] of POST_CELLS) bp.set(px + cx, G + 1, pz + cz + 1, "air");
}

/** The lookout in the last slot: a stand three high with steps up its south side. */
function lookout(bp: Blueprint, index: number): void {
  const [px, pz] = plotOrigin(index);
  bp.fill(px, G, pz, PLOT, 1, PLOT, "grass");
  bp.fill(px + 2, G + 1, pz + 1, 5, 3, 5, WALK);
  bp.walls(px + 2, G + 4, pz + 1, 5, 1, 5, "stone_brick_wall");
  bp.set(px + 4, G + 4, pz + 5, "air");
  const up: Facing = "north";
  bp.stairs(px + 4, G + 1, pz + 8, WALK, up);
  bp.fill(px + 4, G + 1, pz + 7, 1, 1, 1, WALK).stairs(px + 4, G + 2, pz + 7, WALK, up);
  bp.fill(px + 4, G + 1, pz + 6, 1, 2, 1, WALK).stairs(px + 4, G + 3, pz + 6, WALK, up);
  for (const [x, z] of [[px + 1, pz + 1], [px + 7, pz + 1]] as const) bp.set(x, G + 1, z, "oak_fence").set(x, G + 2, z, "lantern");
}

/** The whole showcase as one blueprint. */
export function showcase(): Blueprint {
  if (PEOPLES.length > COLS * ROWS - 1) throw new Error(`the showcase has ${COLS * ROWS - 1} plots for ${PEOPLES.length} peoples`);
  const bp = new Blueprint("showcase", "Showcase", SHOWCASE_SIZE, "villages", "Every people in one field: a fenced plot each, with a guard, a worker, a trader and a builder, and a lookout to see them all from.");
  const rand = prng(19);
  bp.fill(0, 0, 0, bp.sx, G + 1, bp.sz, WALK);
  PEOPLES.forEach((p, i) => plot(bp, p, i, rand));
  lookout(bp, COLS * ROWS - 1);
  // Lamps along the outer edge, one at each corner of the field.
  for (const [x, z] of [[0, 0], [bp.sx - 1, 0], [0, bp.sz - 1], [bp.sx - 1, bp.sz - 1]] as const) bp.set(x, G + 1, z, "stone_brick_wall").set(x, G + 2, z, "lantern");
  return bp.trimmed();
}
