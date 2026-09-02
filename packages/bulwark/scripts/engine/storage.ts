import { world } from "@minecraft/server";
import {
  decodeRecord,
  encodeRecord,
  isRecordKey,
  parseRecordKey,
  recordKey,
  type Position,
  type TurretRecord,
} from "../core/record";

/**
 * Where turret records live.
 *
 * This is the storage seam. `minecraft:block_entity` with per-block dynamic
 * properties is still EXPERIMENTAL in 26.45 retail (docs/README.md), so each
 * turret is one world dynamic property keyed by its position. When block
 * entities reach retail, this file is what changes; nothing else knows.
 *
 * One property per turret rather than a single index: an index holding every
 * turret would hit the per-property size cap at roughly the scale the design
 * targets. Enumeration is `getDynamicPropertyIds()` filtered by prefix, which
 * runs once per load.
 */

const TAG = "[Bulwark]";

const cache = new Map<string, TurretRecord>();
let loaded = false;

export interface LoadReport {
  loaded: number;
  corrupt: number;
  newer: number;
}

/** Rehydrate after a world load or /reload, which discard all module state. */
export function load(): LoadReport {
  cache.clear();
  loaded = true;
  const report: LoadReport = { loaded: 0, corrupt: 0, newer: 0 };

  let ids: string[];
  try {
    ids = world.getDynamicPropertyIds();
  } catch (e) {
    console.warn(`${TAG} could not enumerate world properties: ${e}`);
    return report;
  }

  for (const key of ids) {
    if (!isRecordKey(key)) continue;
    const pos = parseRecordKey(key);
    if (!pos) {
      report.corrupt++;
      console.warn(`${TAG} unreadable turret key ${key}; leaving it alone`);
      continue;
    }
    const decoded = decodeRecord(pos, world.getDynamicProperty(key));
    if (!decoded.ok) {
      // Never delete what we cannot read. A block at this position will write
      // a fresh record over it on its next tick; a block that is gone leaves
      // the property behind, which is harmless.
      if (decoded.reason === "newer-schema") report.newer++;
      else report.corrupt++;
      console.warn(`${TAG} turret record at ${key} is ${decoded.reason}; ignoring`);
      continue;
    }
    cache.set(key, decoded.record);
    report.loaded++;
  }
  return report;
}

function ensure(): void {
  if (!loaded) load();
}

export function get(pos: Position): TurretRecord | undefined {
  ensure();
  return cache.get(recordKey(pos));
}

export function all(): TurretRecord[] {
  ensure();
  return [...cache.values()];
}

export function count(): number {
  ensure();
  return cache.size;
}

export function put(record: TurretRecord): void {
  ensure();
  const key = recordKey(record);
  cache.set(key, record);
  try {
    world.setDynamicProperty(key, encodeRecord(record));
  } catch (e) {
    console.warn(`${TAG} failed to persist turret at ${key}: ${e}`);
  }
}

export function remove(pos: Position): TurretRecord | undefined {
  ensure();
  const key = recordKey(pos);
  const record = cache.get(key);
  if (!record) return undefined;
  cache.delete(key);
  try {
    world.setDynamicProperty(key, undefined);
  } catch (e) {
    console.warn(`${TAG} failed to forget turret at ${key}: ${e}`);
  }
  return record;
}
