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
