/**
 * Diff a `qolprobe:blueprint` run against the generator's own rotation.
 *
 *   npx ts-node -P tools/tsconfig.json tools/structures/probe-rotation.ts dist/bds/last-run.log
 *
 * The probe places a building turned 90, 180 and 270 with `structureManager
 * .place` and logs, per rotation, where the copy landed and one line per
 * block that carries a direction-style state. This reads those lines and
 * compares them with `Blueprint.rotated(t)` (tools/structures/blueprint.ts,
 * `turnStates`) laid at the same corner: every block whose position or
 * states differ is printed, and a table says per state name whether the
 * generator's assumed rotation table agrees with the game's. That table is
 * what the builder's `core/rotate.ts` is built from.
 */
import { readFileSync } from "node:fs";
import { BUILDINGS } from "./buildings";
import type { Blueprint, States } from "./blueprint";

const file = process.argv[2];
if (!file) {
  console.error("usage: probe-rotation.ts <content log>");
  process.exit(2);
}

interface Placed {
  x: number;
  y: number;
  z: number;
  name: string;
  states: States;
}
interface Run {
  id: string;
  rot: number;
  origin: [number, number, number];
  min: [number, number, number];
  blocks: Placed[];
}

const runs = new Map<string, Run>();
for (const raw of readFileSync(file, "utf8").split("\n")) {
  const line = raw.replace(/^.*\[QOLPROBE\]\s*/, "");
  const head = /^B3 (\S+) (None|Rotate90|Rotate180|Rotate270) placed with origin (-?\d+),(-?\d+),(-?\d+): (\d+) blocks, extents (-?\d+),(-?\d+),(-?\d+)\.\./.exec(line);
  if (head) {
    const rot = { None: 0, Rotate90: 1, Rotate180: 2, Rotate270: 3 }[head[2]!]!;
    runs.set(`${head[1]}|${rot}`, { id: head[1]!, rot, origin: [+head[3]!, +head[4]!, +head[5]!], min: [+head[7]!, +head[8]!, +head[9]!], blocks: [] });
    continue;
  }
  const block = /^B3 (\S+) rot=(\d) (-?\d+),(-?\d+),(-?\d+) (\S+) (\{.*\})$/.exec(line);
  if (block) {
    const run = runs.get(`${block[1]}|${block[2]}`);
    if (!run) continue;
    run.blocks.push({ x: +block[3]!, y: +block[4]!, z: +block[5]!, name: `minecraft:${block[6]}`.replace("minecraft:minecraft:", "minecraft:"), states: JSON.parse(block[7]!) as States });
  }
}
if (!runs.size) {
  console.error("no B3 lines in the log");
  process.exit(1);
}

const sortKeys = (s: States): string => JSON.stringify(Object.fromEntries(Object.entries(s).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
const DIRECTIONAL = ["weirdo_direction", "direction", "facing_direction", "minecraft:cardinal_direction", "pillar_axis", "wall_connection_type_north", "wall_connection_type_east", "wall_connection_type_south", "wall_connection_type_west"];

const agree = new Map<string, { same: number; differ: number; examples: string[] }>();
const tally = (state: string, same: boolean, example: string): void => {
  const row = agree.get(state) ?? { same: 0, differ: 0, examples: [] };
  if (same) row.same++;
  else {
    row.differ++;
    if (row.examples.length < 4) row.examples.push(example);
  }
  agree.set(state, row);
};

for (const run of runs.values()) {
  const key = run.id.replace(/^[^:]+:/, "");
  const src: Blueprint | undefined = BUILDINGS.find((b) => b.key === key);
  if (!src) {
    console.log(`${run.id}: no such building in the generator`);
    continue;
  }
  const turned = src.rotated(run.rot);
  const predicted = new Map<string, { name: string; states: States }>();
  for (const b of turned.blocks()) {
    if (b.name === "villages:post") continue;
    if (!DIRECTIONAL.some((d) => d in b.states)) continue;
    predicted.set(`${run.min[0] + b.x},${run.min[1] + b.y},${run.min[2] + b.z}`, { name: b.name, states: b.states });
  }
  let positionMisses = 0;
  let stateMisses = 0;
  const notes: string[] = [];
  for (const p of run.blocks) {
    const at = `${p.x},${p.y},${p.z}`;
    const want = predicted.get(at);
    if (!want) {
      positionMisses++;
      if (notes.length < 8) notes.push(`  nothing predicted at ${at}, found ${p.name} ${sortKeys(p.states)}`);
      continue;
    }
    predicted.delete(at);
    for (const state of DIRECTIONAL) {
      if (!(state in want.states) && !(state in p.states)) continue;
      const same = String(want.states[state]) === String(p.states[state]);
      tally(state, same, `${run.id} rot=${run.rot} at ${at}: predicted ${String(want.states[state])}, game ${String(p.states[state])}`);
      if (!same) stateMisses++;
    }
    if (want.name !== p.name && notes.length < 8) notes.push(`  ${at}: predicted ${want.name}, found ${p.name}`);
  }
  for (const [at, want] of predicted) {
    positionMisses++;
    if (notes.length < 8) notes.push(`  predicted ${want.name} at ${at}, nothing directional found there`);
  }
  console.log(`${run.id} rot=${run.rot}: origin ${run.origin.join(",")}, landed at ${run.min.join(",")} (offset ${run.min.map((v, i) => v - run.origin[i]!).join(",")}); ${run.blocks.length} directional blocks, ${positionMisses} position misses, ${stateMisses} state misses`);
  for (const n of notes) console.log(n);
}

console.log("\nstate                         agree  differ");
for (const [state, row] of [...agree].sort()) {
  console.log(`${state.padEnd(30)}${String(row.same).padStart(5)}  ${String(row.differ).padStart(6)}`);
  for (const e of row.examples) console.log(`    ${e}`);
}
