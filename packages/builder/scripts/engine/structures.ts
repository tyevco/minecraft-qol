/**
 * The shipped blueprints, read from their `.mcstructure` files through the
 * stable structure API and cached as plain cells for core/ to work on.
 *
 * Measured (docs/settlements-results.md): `Structure.getBlockPermutation`
 * returns every cell of a shipped structure with all its states, the
 * generator's own included and the engine's aliases besides (a chest reads
 * `minecraft:cardinal_direction` and `facing_direction`, a door both
 * `minecraft:cardinal_direction` and `direction`); air cells read undefined;
 * `getIsWaterlogged` reads the second layer.
 */
import { world } from "@minecraft/server";
import { structureId, type Building, type Cell } from "../core/blueprint";

const cache = new Map<string, Building>();
let log: (...parts: unknown[]) => void = () => undefined;

export function install(logger: (...parts: unknown[]) => void): void {
  log = logger;
  cache.clear();
}

/** The building for a catalogue key, or undefined if the structure is not in the world's packs. */
export function building(key: string): Building | undefined {
  const hit = cache.get(key);
  if (hit) return hit;
  let s;
  try {
    s = world.structureManager.get(structureId(key));
  } catch (e) {
    log(`could not read ${structureId(key)}: ${e}`);
    return undefined;
  }
  if (!s) return undefined;
  const size = { x: s.size.x, y: s.size.y, z: s.size.z };
  const cells: Cell[] = [];
  for (let x = 0; x < size.x; x++)
    for (let y = 0; y < size.y; y++)
      for (let z = 0; z < size.z; z++) {
        const perm = s.getBlockPermutation({ x, y, z });
        if (!perm) continue;
        const cell: Cell = { x, y, z, name: perm.type.id, states: perm.getAllStates() };
        if (s.getIsWaterlogged({ x, y, z })) cell.waterlogged = true;
        cells.push(cell);
      }
  const b: Building = { key, size, cells };
  cache.set(key, b);
  log(`read ${structureId(key)}: ${size.x}x${size.y}x${size.z}, ${cells.length} cells`);
  return b;
}
