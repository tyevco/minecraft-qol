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
