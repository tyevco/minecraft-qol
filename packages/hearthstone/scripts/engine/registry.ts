import { world } from "@minecraft/server";
import type { Anchor } from "../core/anchors";

/**
 * Where anchors are remembered.
 *
 * This is the storage seam. `minecraft:block_entity` with per-block dynamic
 * properties is still EXPERIMENTAL in 26.45 retail - the "no longer requires the
 * toggle" note comes from a 26.50 preview and 26.50 has not shipped - so anchors
 * live in a world dynamic property keyed by position instead. When block
 * entities land in retail, this file is what changes; nothing else knows.
 *
 * Consequence we own until then: config cannot ride along on the dropped item,
 * and we must deregister on break ourselves.
 */

const PROP_ANCHORS = "hs:anchors";
const PROP_SCHEMA = "hs:v";
const SCHEMA = 1;

/** Compact tuple form. Short keys matter: this is one property for every anchor. */
type Row = [dimId: string, x: number, y: number, z: number, seq: number, radius: number];

let cache: Anchor[] | undefined;
let nextSeq = 1;

function persist(anchors: Anchor[]): void {
  const rows: Row[] = anchors.map((a) => [a.dimId, a.x, a.y, a.z, a.seq, a.radius]);
  try {
    world.setDynamicProperty(PROP_ANCHORS, JSON.stringify(rows));
    world.setDynamicProperty(PROP_SCHEMA, SCHEMA);
  } catch (e) {
    console.warn(`[Hearthstone] failed to persist anchors: ${e}`);
  }
}

/** Rehydrate after a world load or /reload, which discard all module state. */
export function load(): void {
  cache = [];
  nextSeq = 1;

  const raw = world.getDynamicProperty(PROP_ANCHORS);
  if (typeof raw !== "string") return;

  // Versioned from the first commit: the block dynamic-property storage format
  // already changed once during its experimental period and destroyed saved
  // data. A schema field is cheap now and impossible to add retroactively.
  const version = world.getDynamicProperty(PROP_SCHEMA);
  if (typeof version === "number" && version > SCHEMA) {
    console.warn(`[Hearthstone] anchor data is schema ${version}, newer than ${SCHEMA}; ignoring`);
    return;
  }

  try {
    const rows = JSON.parse(raw) as Row[];
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const [dimId, x, y, z, seq, radius] = row;
      cache.push({ dimId, x, y, z, seq, radius });
      if (seq >= nextSeq) nextSeq = seq + 1;
    }
  } catch {
    console.warn("[Hearthstone] anchor data corrupt; starting empty");
    cache = [];
  }
}

export function all(): readonly Anchor[] {
  if (!cache) load();
  return cache!;
}

export function add(dimId: string, x: number, y: number, z: number, radius: number): Anchor {
  if (!cache) load();
  const existing = find(dimId, x, y, z);
  if (existing) return existing;

  // seq is assigned once and never reused, so distance ties resolve the same
  // way on every evaluation rather than flickering.
  const anchor: Anchor = { dimId, x, y, z, radius, seq: nextSeq++ };
  cache!.push(anchor);
  persist(cache!);
  return anchor;
}

export function remove(dimId: string, x: number, y: number, z: number): boolean {
  if (!cache) load();
  const before = cache!.length;
  cache = cache!.filter((a) => !(a.dimId === dimId && a.x === x && a.y === y && a.z === z));
  if (cache.length === before) return false;
  persist(cache);
  return true;
}

export function find(dimId: string, x: number, y: number, z: number): Anchor | undefined {
  if (!cache) load();
  return cache!.find((a) => a.dimId === dimId && a.x === x && a.y === y && a.z === z);
}

export function count(): number {
  return all().length;
}
