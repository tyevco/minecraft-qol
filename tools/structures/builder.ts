/**
 * A catalogue building as the villages pack ships it for the blueprint
 * table (issue #80 brought the builder in). Every block as authored, its
 * job post included (the post the builder places is the kids' own,
 * engine/jobs.ts), but not the water a building on stilts stands in: the
 * river is where the blueprint is placed, not part of the building, so the
 * builder neither charges for it nor pours it. The well's and the field's
 * water stay: a well is dug and a channel is cut. A post is stamped with
 * the people the building was authored for, as the village pieces stamp
 * theirs, so the shipped file matches what the builder places for that
 * people (a shared building's post stays as authored).
 */
import { Blueprint } from "./blueprint";
import { BUILDINGS } from "./buildings";
import { PEOPLES, postStates } from "./villages";

/** The buildings that stand in water (settlements.md §5.2, "water for stilts"); their footing may rest on water, never on air. */
export const STILTS: ReadonlySet<string> = new Set(["shared_bridge"]);

export function builderBlueprint(key: string): Blueprint {
  const src = BUILDINGS.find((b) => b.key === key);
  if (!src) throw new Error(`no building ${key} for the blueprints`);
  const out = new Blueprint(src.key, src.title, src.size, src.people, src.notes);
  const river = STILTS.has(key);
  const people = PEOPLES.findIndex((p) => p.key === src.people);
  for (const b of src.blocks()) {
    if (river && b.name === "minecraft:water") continue;
    if (b.name === "villages:post" && people >= 0) out.set(b.x, b.y, b.z, b.name, { ...b.states, ...postStates(people) });
    else out.set(b.x, b.y, b.z, b.name, b.states);
  }
  for (const [x, y, z] of src.waterloggedCells()) if (!river) out.waterlog(x, y, z);
  return out;
}
