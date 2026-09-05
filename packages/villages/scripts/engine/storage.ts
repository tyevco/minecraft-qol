import { createPositionIndex } from "@qol/shared/engine/positionIndex";
import { SCHEMA, packRecord, unpackRecord, type Position, type PostRecord, type Row } from "../core/record";

/**
 * Where post records live: the shared position index (CLAUDE.md rule 6).
 * Registration goes through the block's own custom-component hooks, because
 * `onPlace` also fires for /setblock and structure loads - which is how a
 * generated village's posts get their people (docs/design/villages.md §4).
 */
const index = createPositionIndex<PostRecord, Row>({
  property: "vl:posts",
  schemaProperty: "vl:v",
  schema: SCHEMA,
  pack: packRecord,
  unpack: unpackRecord,
  log: (...parts) => console.warn("[Villages]", ...parts),
});

export function load(): number {
  index.load();
  return index.count();
}
export const get = (pos: Position): PostRecord | undefined => index.find(pos);
export const all = (): readonly PostRecord[] => index.all();
export const count = (): number => index.count();
export const put = (record: PostRecord): void => index.put(record);
export function update(pos: Position, fn: (row: PostRecord) => void): boolean {
  return index.update(pos, fn);
}
export function remove(pos: Position): PostRecord | undefined {
  const record = index.find(pos);
  if (!record) return undefined;
  index.remove(pos);
  return record;
}
