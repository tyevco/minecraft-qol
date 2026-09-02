import { createPositionIndex } from "@qol/shared/engine/positionIndex";
import { SCHEMA, packRecord, unpackRecord, type Position, type Row, type TurretRecord } from "../core/record";

/**
 * Where turret records live: the shared position index, one world dynamic
 * property holding every row, schema-versioned (CLAUDE.md rule 6).
 *
 * This is the storage seam. `minecraft:block_entity` is still experimental in
 * 26.45 retail, so nothing can live on the block itself; when it can, this
 * file is what changes and nothing else knows.
 *
 * Registration and removal go through the block's own custom-component hooks
 * rather than playerPlaceBlock / playerBreakBlock, because `onPlace` also
 * fires for /setblock, /fill and structure loads. Removal paths no hook can
 * see are swept: a row whose block is loaded and not a turret is evicted, an
 * unloaded chunk is skipped (engine/hooks.ts).
 */

const index = createPositionIndex<TurretRecord, Row>({
  property: "bw:turrets",
  schemaProperty: "bw:v",
  schema: SCHEMA,
  pack: packRecord,
  unpack: unpackRecord,
  log: (...parts) => console.warn("[Bulwark]", ...parts),
});

/** Rehydrate after a world load or /reload. Returns the row count. */
export function load(): number {
  index.load();
  return index.count();
}

export function get(pos: Position): TurretRecord | undefined {
  return index.find(pos);
}

export function all(): readonly TurretRecord[] {
  return index.all();
}

export function count(): number {
  return index.count();
}

export function put(record: TurretRecord): void {
  index.put(record);
}

export function remove(pos: Position): TurretRecord | undefined {
  const record = index.find(pos);
  if (!record) return undefined;
  index.remove(pos);
  return record;
}
