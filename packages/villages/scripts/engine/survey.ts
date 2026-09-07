/**
 * Survey (settlements.md §5.4): two `villages:survey_stake` blocks mark a
 * box; the table saves what stands between them as a new blueprint, and the
 * kid gets a blueprint item for it. `structureManager.createFromWorld` is
 * the stable path; the structure is saved to the world under
 * `villages:survey_<n>`, a new identifier every time (a world caches a
 * structure at first use, so a re-survey can never reuse a name). The two
 * stake cells are cleared out of the saved structure, and a saved structure
 * holds air as a block, which the reader (engine/structures.ts) drops.
 *
 * The survey item carries its key in a dynamic property on the stack, since
 * the catalogue's items name theirs by identifier and a survey's is not
 * known until it is taken.
 */
import { BlockVolume, ItemStack, StructureSaveMode, world, type Dimension, type Player, type Vector3 } from "@minecraft/server";
import { catalogueEntry, structureId, SURVEY_ITEM, surveyKey } from "../core/blueprint";
import { surveyBox, surveyRefusal } from "../core/survey";
import { log, tell } from "./tell";

export const STAKE = "villages:survey_stake";
/** The dynamic property on a survey item naming its key. */
export const KEY_PROPERTY = "villages:key";
const COUNTER = "vl:surveys";

export interface Survey {
  key: string;
  size: { x: number; y: number; z: number };
  cells: number;
}

/** The stakes standing within `radius` of a spot. */
export function stakesNear(dim: Dimension, at: Vector3, radius = 24): Vector3[] {
  try {
    const vol = new BlockVolume({ x: at.x - radius, y: at.y - 8, z: at.z - radius }, { x: at.x + radius, y: at.y + 16, z: at.z + radius });
    const out: Vector3[] = [];
    for (const loc of dim.getBlocks(vol, { includeTypes: [STAKE] }, true).getBlockLocationIterator()) out.push({ x: loc.x, y: loc.y, z: loc.z });
    return out;
  } catch (e) {
    log(`could not look for stakes near ${at.x},${at.y},${at.z}: ${e}`);
    return [];
  }
}

/** Save the box between two corners as the next survey. The stakes themselves are left out of it. */
export function survey(dim: Dimension, a: Vector3, b: Vector3): Survey | { refused: string } {
  const box = surveyBox(a, b);
  const refused = surveyRefusal(box);
  if (refused) return { refused };
  const raw = world.getDynamicProperty(COUNTER);
  const n = (typeof raw === "number" ? raw : 0) + 1;
  const key = surveyKey(n);
  try {
    const s = world.structureManager.createFromWorld(structureId(key), dim, box.min, box.max, { includeEntities: false, saveMode: StructureSaveMode.World });
    let cells = 0;
    for (let x = 0; x < box.size.x; x++)
      for (let y = 0; y < box.size.y; y++)
        for (let z = 0; z < box.size.z; z++) {
          const perm = s.getBlockPermutation({ x, y, z });
          if (!perm || perm.type.id === "minecraft:air") continue;
          if (perm.type.id === STAKE) {
            s.setBlockPermutation({ x, y, z }, undefined);
            continue;
          }
          cells++;
        }
    s.saveToWorld();
    world.setDynamicProperty(COUNTER, n);
    log(`surveyed ${structureId(key)}: ${box.size.x}x${box.size.y}x${box.size.z} from ${box.min.x},${box.min.y},${box.min.z}, ${cells} cells`);
    return { key, size: box.size, cells };
  } catch (e) {
    return { refused: `the survey could not be saved (${e})` };
  }
}

/** The blueprint item for a survey, its key on the stack. */
export function surveyItem(s: Survey): ItemStack {
  const item = new ItemStack(SURVEY_ITEM, 1);
  item.setDynamicProperty(KEY_PROPERTY, s.key);
  item.nameTag = `Blueprint: ${catalogueEntry(s.key)?.title ?? s.key}`;
  item.setLore([`${s.size.x} by ${s.size.y} by ${s.size.z}, ${s.cells} blocks`]);
  return item;
}

/** Hand a survey's item to the player; anything that does not fit is dropped at their feet, never lost. */
export function give(player: Player, s: Survey): void {
  const item = surveyItem(s);
  try {
    const container = player.getComponent("minecraft:inventory")?.container;
    const left = container?.addItem(item);
    if (left) player.dimension.spawnItem(left, player.location);
    tell(player, `Surveyed: ${catalogueEntry(s.key)?.title ?? s.key}, ${s.size.x} by ${s.size.y} by ${s.size.z}, ${s.cells} blocks. Hold the blueprint and tap the table to raise a copy.`);
  } catch (e) {
    log(`could not give ${player.name} the survey item: ${e}`);
  }
}

/** The key a blueprint item in hand names: a catalogue item by its identifier, a survey by its property. */
export function surveyKeyOf(item: ItemStack): string | undefined {
  if (item.typeId !== SURVEY_ITEM) return undefined;
  const key = item.getDynamicProperty(KEY_PROPERTY);
  return typeof key === "string" ? key : undefined;
}
