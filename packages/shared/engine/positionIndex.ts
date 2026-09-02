import { world } from "@minecraft/server";

/**
 * A world-level index of blocks we placed, keyed by dimension and position.
 *
 * This is the storage seam every block-based pack needs while
 * `minecraft:block_entity` stays experimental: rows live in one world dynamic
 * property, versioned from the first commit because the block dynamic-property
 * format already changed once during its experimental period and destroyed
 * saved data.
 *
 * Rows are plain objects; the caller supplies pack/unpack so the on-disk form
 * stays compact (one property holds every row). Chunk keying and a tick budget
 * - the two things docs/backlog.md asks for - are still to come; today a pack
 * with a few hundred blocks is well inside the per-property cap.
 */
export interface Position {
  dimId: string;
  x: number;
  y: number;
  z: number;
}

export interface PositionIndex<Row extends Position> {
  load(): void;
  all(): readonly Row[];
  find(pos: Position): Row | undefined;
  /** Insert or replace the row at its position. */
  put(row: Row): void;
  remove(pos: Position): boolean;
  /** Mutate one row in place and persist. */
  update(pos: Position, fn: (row: Row) => void): boolean;
  count(): number;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.dimId === b.dimId && a.x === b.x && a.y === b.y && a.z === b.z;
}

export function createPositionIndex<Row extends Position, Packed>(opts: {
  /** World dynamic property holding the rows. */
  property: string;
  /** World dynamic property holding the schema version. */
  schemaProperty: string;
  schema: number;
  pack: (row: Row) => Packed;
  unpack: (packed: unknown) => Row | undefined;
  log: (...parts: unknown[]) => void;
}): PositionIndex<Row> {
  let cache: Row[] | undefined;

  function persist(): void {
    try {
      world.setDynamicProperty(
        opts.property,
        JSON.stringify((cache ?? []).map(opts.pack)),
      );
      world.setDynamicProperty(opts.schemaProperty, opts.schema);
    } catch (e) {
      opts.log(`failed to persist ${opts.property}: ${e}`);
    }
  }

  function load(): void {
    cache = [];
    const raw = world.getDynamicProperty(opts.property);
    if (typeof raw !== "string") return;
    const version = world.getDynamicProperty(opts.schemaProperty);
    if (typeof version === "number" && version > opts.schema) {
      opts.log(
        `${opts.property} is schema ${version}, newer than ${opts.schema}; ignoring`,
      );
      return;
    }
    try {
      const rows = JSON.parse(raw) as unknown;
      if (!Array.isArray(rows)) return;
      for (const packed of rows) {
        const row = opts.unpack(packed);
        if (row) cache.push(row);
      }
    } catch {
      opts.log(`${opts.property} corrupt; starting empty`);
      cache = [];
    }
  }

  const rows = (): Row[] => {
    if (!cache) load();
    return cache!;
  };

  return {
    load,
    all: () => rows(),
    find: (pos) => rows().find((r) => samePosition(r, pos)),
    put(row) {
      cache = rows().filter((r) => !samePosition(r, row));
      cache.push(row);
      persist();
    },
    remove(pos) {
      const before = rows().length;
      cache = rows().filter((r) => !samePosition(r, pos));
      if (cache.length === before) return false;
      persist();
      return true;
    },
    update(pos, fn) {
      const row = rows().find((r) => samePosition(r, pos));
      if (!row) return false;
      fn(row);
      persist();
      return true;
    },
    count: () => rows().length,
  };
}
