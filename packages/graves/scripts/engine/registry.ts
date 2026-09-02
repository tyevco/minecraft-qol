import { world } from "@minecraft/server";

/**
 * Index of gravestones, so `/graves:list` can point a player at theirs without
 * scanning the world. The gravestone entity itself is the source of truth for
 * ownership and contents; this is only a directory, and a stale row costs a
 * player one wasted walk, not any items.
 */
export interface GraveRow {
  /** Entity id of the gravestone. */
  id: string;
  owner: string;
  ownerName: string;
  dimId: string;
  x: number;
  y: number;
  z: number;
  /** Wall-clock ms at creation, for display. */
  createdMs: number;
}

const PROP_GRAVES = "gv:graves";
const PROP_SCHEMA = "gv:v";
const SCHEMA = 1;

type Row = [
  id: string,
  owner: string,
  ownerName: string,
  dimId: string,
  x: number,
  y: number,
  z: number,
  createdMs: number,
];

let cache: GraveRow[] | undefined;

function persist(rows: GraveRow[]): void {
  const packed: Row[] = rows.map((r) => [
    r.id,
    r.owner,
    r.ownerName,
    r.dimId,
    r.x,
    r.y,
    r.z,
    r.createdMs,
  ]);
  try {
    world.setDynamicProperty(PROP_GRAVES, JSON.stringify(packed));
    world.setDynamicProperty(PROP_SCHEMA, SCHEMA);
  } catch (e) {
    console.warn(`[Graves] failed to persist grave index: ${e}`);
  }
}

export function load(): void {
  cache = [];
  const raw = world.getDynamicProperty(PROP_GRAVES);
  if (typeof raw !== "string") return;
  const version = world.getDynamicProperty(PROP_SCHEMA);
  if (typeof version === "number" && version > SCHEMA) {
    console.warn(
      `[Graves] grave index is schema ${version}, newer than ${SCHEMA}; ignoring`,
    );
    return;
  }
  try {
    const rows = JSON.parse(raw) as Row[];
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 8) continue;
      const [id, owner, ownerName, dimId, x, y, z, createdMs] = row;
      cache.push({ id, owner, ownerName, dimId, x, y, z, createdMs });
    }
  } catch {
    console.warn("[Graves] grave index corrupt; starting empty");
    cache = [];
  }
}

export function all(): readonly GraveRow[] {
  if (!cache) load();
  return cache!;
}

export function add(row: GraveRow): void {
  if (!cache) load();
  cache = cache!.filter((r) => r.id !== row.id);
  cache.push(row);
  persist(cache);
}

export function remove(id: string): boolean {
  if (!cache) load();
  const before = cache!.length;
  cache = cache!.filter((r) => r.id !== id);
  if (cache.length === before) return false;
  persist(cache);
  return true;
}

export function forOwner(owner: string): GraveRow[] {
  return all().filter((r) => r.owner === owner);
}
