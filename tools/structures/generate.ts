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
  for (const bp of [pad, socket]) writeFileSync(resolve(PROBE, `${bp.key}.mcstructure`), bp.toMcstructure());
  console.log("packages/probe/structures/qolprobe/{pad,well_socket}.mcstructure");
}

// Villages (docs/design/villages.md): the pieces and pools for each people go
// into the probe pack for now, under a `villages` namespace, so a village can
// be placed on the plain-world server and looked at; the squares and streets
// get previews beside the buildings, and one whole village per people is
// grown by the offline expander for the viewer.
const VILLAGES = resolve(ROOT, "concepts/villages");
mkdirSync(VILLAGES, { recursive: true });
for (const people of PEOPLES) {
  const set = villageSet(people);
  const dir = resolve(ROOT, "packages/probe/structures/villages", people.key);
  mkdirSync(dir, { recursive: true });
  for (const piece of set.pieces.values()) {
    writeFileSync(resolve(dir, `${piece.key}.mcstructure`), piece.toMcstructure());
    if (piece.key.startsWith(`${people.key}_`)) writeFileSync(resolve(CONCEPTS, `${piece.key}.json`), JSON.stringify(piece.toPreview()) + "\n");
  }
  for (const [file, json] of Object.entries(villageWorldgen(set))) {
    const path = resolve(ROOT, "packages/probe", file);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  }
  const { expansion, blueprint } = villagePreview(set, 1);
  writeFileSync(resolve(VILLAGES, `${people.key}.json`), JSON.stringify(blueprint.toPreview()) + "\n");
  console.log(`concepts/villages/${people.key}  ${blueprint.size.join("x")}  ${expansion.placements.length} pieces, ${expansion.open.length} open`);
}
