/**
 * A catalogue building as the builder pack ships it (packages/builder). Two
 * things are left out of the villages' structure:
 *
 * - the job post: it is the villages pack's block, the builder stands alone
 *   for now, and a block the world does not know is dropped from a structure
 *   on load, silently. The post comes back when the builder moves into
 *   villages;
 * - the water a building on stilts stands in: the river is where the
 *   blueprint is placed, not part of the building, so the builder neither
 *   charges for it nor pours it. The well's and the field's water stay: a
 *   well is dug and a channel is cut.
 */
import { Blueprint } from "./blueprint";
import { BUILDINGS } from "./buildings";

/** The buildings that stand in water (settlements.md §5.2, "water for stilts"); their footing may rest on water, never on air. */
export const STILTS: ReadonlySet<string> = new Set(["shared_bridge"]);

export function builderBlueprint(key: string): Blueprint {
  const src = BUILDINGS.find((b) => b.key === key);
  if (!src) throw new Error(`no building ${key} for the builder pack`);
  const out = new Blueprint(src.key, src.title, src.size, src.people, src.notes);
  const river = STILTS.has(key);
  for (const b of src.blocks()) {
    if (b.name === "villages:post") continue;
    if (river && b.name === "minecraft:water") continue;
    out.set(b.x, b.y, b.z, b.name, b.states);
  }
  for (const [x, y, z] of src.waterloggedCells()) if (!river) out.waterlog(x, y, z);
  return out;
}
