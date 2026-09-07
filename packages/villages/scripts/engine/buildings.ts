import { createPositionIndex } from "@qol/shared/engine/positionIndex";
import { SCHEMA, packRecord, unpackRecord, type BuildingRecord, type Position } from "../core/building";

/**
 * Where building records live: the shared position index (CLAUDE.md rule 6),
 * one row per placed building keyed by its origin. Rows are registered when
 * a job starts and removed when a building has been taken down.
 */
const index = createPositionIndex<BuildingRecord, ReturnType<typeof packRecord>>({
  property: "vl:buildings",
  schemaProperty: "vl:bv",
  schema: SCHEMA,
  pack: packRecord,
  unpack: unpackRecord,
  log: (...parts) => console.warn("[Villages]", ...parts),
});

export function load(): number {
  index.load();
  return index.count();
}
export const get = (pos: Position): BuildingRecord | undefined => index.find(pos);
export const all = (): readonly BuildingRecord[] => index.all();
export const count = (): number => index.count();
export const put = (record: BuildingRecord): void => index.put(record);
export const update = (pos: Position, fn: (row: BuildingRecord) => void): boolean => index.update(pos, fn);
export const remove = (pos: Position): boolean => index.remove(pos);
