/**
 * Generate the .mcstructure files the GameTest pack needs.
 *
 *   npm run structures
 *
 * One air structure per size; the tests build their own rigs. Names must
 * match `structureName("qol:<name>")` in packages/gametest/scripts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Blueprint } from "./blueprint";
import { BUILDINGS } from "./buildings";
import { uniformStructure } from "./mcstructure";
import { PEOPLES, villagePreview, villageSet, villageWorldgen } from "./villages";

const ROOT = resolve(__dirname, "../..");
const OUT = resolve(ROOT, "packages/gametest/behavior_pack/structures/qol");

const STRUCTURES: Record<string, [number, number, number]> = {
  arena: [8, 8, 8],
  // For a building wider than eight: the inn and the larder (suites/builder.ts).
  arena16: [16, 16, 16],
};

mkdirSync(OUT, { recursive: true });
for (const [name, size] of Object.entries(STRUCTURES)) {
  writeFileSync(resolve(OUT, `${name}.mcstructure`), uniformStructure(size));
  console.log(
    `packages/gametest/behavior_pack/structures/qol/${name}.mcstructure  ${size.join("x")} air`,
  );
}

// Concept buildings (docs/design/settlements.md): the .mcstructure a builder
// would place, and a preview the viewer draws. Nothing ships these.
const CONCEPTS = resolve(ROOT, "concepts/structures");
mkdirSync(CONCEPTS, { recursive: true });
for (const bp of BUILDINGS) {
  writeFileSync(resolve(CONCEPTS, `${bp.key}.mcstructure`), bp.toMcstructure());
  writeFileSync(resolve(CONCEPTS, `${bp.key}.json`), JSON.stringify(bp.toPreview()) + "\n");
  const blocks = bp.blocks().filter((b) => b.name !== "minecraft:water").length;
  console.log(`concepts/structures/${bp.key}  ${bp.size.join("x")}  ${blocks} blocks`);
}

// The builder prototype (docs/design/settlements.md §5, §9 step 2): the
// three blueprints a builder raises from the table, shipped in the builder
// pack as `builder:<key>`. Small, and no stand-ins; the rest of the
// catalogue follows once the placer is measured against these.
export const BUILDER_KEYS = ["tallfolk_well", "shared_larder", "shared_wall", "tallfolk_gatehouse", "tallfolk_farmhouse", "tallfolk_barn", "shared_inn", "tinker_stall"] as const;
const BUILDER = resolve(ROOT, "packages/builder/behavior_pack/structures/builder");
mkdirSync(BUILDER, { recursive: true });
for (const key of BUILDER_KEYS) {
  const bp = builderBlueprint(key);
  writeFileSync(resolve(BUILDER, `${key}.mcstructure`), bp.toMcstructure());
  console.log(`packages/builder/behavior_pack/structures/builder/${key}.mcstructure  ${bp.size.join("x")}  ${bp.blocks().length} cells`);
}

/**
 * A catalogue building as the builder pack ships it: the job post left out,
 * since the post is the villages pack's block and the builder stands alone
 * for now (a block the world does not know is dropped from a structure on
 * load, silently). The post comes back when the builder moves into villages.
 */
export function builderBlueprint(key: string): Blueprint {
  const src = BUILDINGS.find((b) => b.key === key);
  if (!src) throw new Error(`no building ${key} for the builder pack`);
  const out = new Blueprint(src.key, src.title, src.size, src.people, src.notes);
  for (const b of src.blocks()) if (b.name !== "villages:post") out.set(b.x, b.y, b.z, b.name, b.states);
  for (const [x, y, z] of src.waterloggedCells()) out.waterlog(x, y, z);
  return out;
}


// The jigsaw probe (docs/design/villages.md §7.1, issue #38): the tallfolk
// well on a pad, with one emerald block in the pad so a scan can find every
// copy the world generator placed. Lives in the probe pack, which never ships.
const PROBE = resolve(ROOT, "packages/probe/structures/qolprobe");
mkdirSync(PROBE, { recursive: true });
{
  const bp = new Blueprint("well", "Probe Well", [5, 8, 5], "probe", "");
  bp.fill(0, 0, 0, 5, 1, 5, "stone_bricks").set(0, 0, 0, "emerald_block");
  bp.fill(0, 1, 0, 5, 1, 5, "cobblestone");
  bp.walls(1, 2, 1, 3, 1, 3, "cobblestone");
  bp.set(2, 1, 2, "water");
  for (const [x, z] of [[1, 1], [3, 3], [1, 3], [3, 1]] as const) bp.fill(x, 3, z, 1, 2, 1, "oak_fence");
  bp.hipRoof(1, 5, 1, 3, 3, "dark_oak_planks");
  bp.set(2, 4, 2, "lantern");
  const well = bp.trimmed();
  writeFileSync(resolve(PROBE, "well.mcstructure"), well.toMcstructure());
  console.log(`packages/probe/structures/qolprobe/well.mcstructure  ${well.size.join("x")}`);
}

// The water probe (settlements.md §8.5): a pond three wide with a fence post
// standing in the middle cell, waterlogged in the structure's second layer,
// and a stair on the bank over water. Placed by `qolprobe:blueprint` to see
// whether `place` honours the waterlogged layer and whether a block set over
// water by script keeps the water beside it.
{
  const bp = new Blueprint("pool", "Probe Pool", [5, 3, 5], "probe", "");
  bp.fill(0, 0, 0, 5, 1, 5, "stone_bricks");
  bp.fill(1, 1, 1, 3, 1, 3, "water");
  bp.set(2, 1, 2, "oak_fence").waterlog(2, 1, 2);
  bp.stairs(1, 1, 1, "cobblestone", "south").waterlog(1, 1, 1);
  bp.set(0, 1, 0, "emerald_block");
  writeFileSync(resolve(PROBE, "pool.mcstructure"), bp.toMcstructure());
  console.log(`packages/probe/structures/qolprobe/pool.mcstructure  ${bp.size.join("x")}  ${bp.waterlogged.size} waterlogged`);
}

// The marker probe (villages.md §7.2): a pad with a jigsaw on its east edge
// asking for the well-socket pool, and the well with a jigsaw on its west
// edge answering it. Measured joining (docs/villages-jigsaw-results.md).
{
  const pad = new Blueprint("pad", "Probe Pad", [7, 2, 7], "probe", "");
  pad.fill(0, 0, 0, 7, 1, 7, "stone_bricks").set(0, 0, 0, "lapis_block");
  pad.jigsaw(6, 1, 3, { facing: "east", name: "qolprobe:out", target: "qolprobe:in", pool: "qolprobe:well_socket", final: "gold_block" });
  const socket = new Blueprint("well_socket", "Probe Well Socket", [5, 8, 5], "probe", "");
  socket.fill(0, 0, 0, 5, 1, 5, "stone_bricks").set(0, 0, 0, "emerald_block");
  socket.fill(0, 1, 0, 5, 1, 5, "cobblestone");
  socket.walls(1, 2, 1, 3, 1, 3, "cobblestone");
  socket.set(2, 1, 2, "water");
  for (const [x, z] of [[1, 1], [3, 3], [1, 3], [3, 1]] as const) socket.fill(x, 3, z, 1, 2, 1, "oak_fence");
  socket.hipRoof(1, 5, 1, 3, 3, "dark_oak_planks");
  socket.set(2, 4, 2, "lantern");
  socket.jigsaw(0, 1, 2, { facing: "west", name: "qolprobe:in", target: "qolprobe:out", pool: "minecraft:empty", final: "diamond_block" });
  // A job post in the child piece: does a custom block survive being joined
  // (rotated and attached) rather than placed as the start piece?
  socket.set(4, 1, 4, "villages:post", { "villages:people": 3, "villages:job": 1 });
  for (const bp of [pad, socket]) writeFileSync(resolve(PROBE, `${bp.key}.mcstructure`), bp.toMcstructure());
  console.log("packages/probe/structures/qolprobe/{pad,well_socket}.mcstructure");
}

// Villages (docs/design/villages.md): the pieces and pools for each people go
// into the villages pack; the squares and streets get previews beside the
// buildings, and one whole village per people is grown by the offline
// expander for the viewer.
const VILLAGES = resolve(ROOT, "concepts/villages");
mkdirSync(VILLAGES, { recursive: true });
// A concept people's pieces (a `People` with `concept` on, docs/design/
// furfolk.md §3) go to the probe pack, which never ships, as the four's did
// before the villages pack existed; none is a concept at the moment.
for (const people of PEOPLES) {
  const set = villageSet(people);
  const pack = people.concept ? "packages/probe" : "packages/villages/behavior_pack";
  const dir = resolve(ROOT, pack, "structures/villages", people.key);
  mkdirSync(dir, { recursive: true });
  for (const piece of set.pieces.values()) {
    writeFileSync(resolve(dir, `${piece.key}.mcstructure`), piece.toMcstructure());
    if (piece.key.startsWith(`${people.key}_`)) writeFileSync(resolve(CONCEPTS, `${piece.key}.json`), JSON.stringify(piece.toPreview()) + "\n");
  }
  for (const [file, json] of Object.entries(villageWorldgen(set))) {
    const path = resolve(ROOT, pack, file);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  }
  const { expansion, blueprint } = villagePreview(set, 1);
  writeFileSync(resolve(VILLAGES, `${people.key}.json`), JSON.stringify(blueprint.toPreview()) + "\n");
  console.log(`concepts/villages/${people.key}  ${blueprint.size.join("x")}  ${expansion.placements.length} pieces, ${expansion.open.length} open`);
}

// The processor probe (docs/villages-jigsaw-results.md): a pad with a
// lodestone that a processor list turns into a job post, a post written
// directly, and a jigsaw whose final block is a post. All three survived.
{
  const pad = new Blueprint("proc_pad", "Probe Processor Pad", [5, 2, 5], "probe", "");
  pad.fill(0, 0, 0, 5, 1, 5, "stone_bricks").set(0, 0, 0, "emerald_block");
  pad.set(1, 1, 1, "lodestone");
  pad.set(3, 1, 1, "villages:post", { "villages:people": 3, "villages:job": 1 });
  pad.jigsaw(2, 1, 3, { facing: "south", name: "qolprobe:x", target: "qolprobe:y", pool: "minecraft:empty", final: "villages:post" });
  writeFileSync(resolve(PROBE, "proc_pad.mcstructure"), pad.toMcstructure());
  console.log("packages/probe/structures/qolprobe/proc_pad.mcstructure");
}
