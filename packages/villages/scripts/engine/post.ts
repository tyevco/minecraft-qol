/**
 * The job post block: the anchor of one person.
 *
 * Custom Components V2, registered at startup and attached in the block JSON
 * as `"villages:post": {}`. `onPlace` fires for player placement, /setblock
 * and structure loads alike, so a post the world generator put in a village
 * registers the moment its chunk first ticks; `onTick` (the block's own
 * `minecraft:tick`) then keeps its person: spawns one if there is none, and
 * replaces a lost one a day later (core/peopling.ts decides).
 *
 * The person is spawned plainly and then given its people and job by event -
 * never by spawnEvent, which would replace entity_spawned (docs/README.md
 * corrections). Its `minecraft:home` is wherever it spawned, so it stays by
 * its post.
 */
import { system, world, type Block, type BlockCustomComponent, type Dimension, type Entity } from "@minecraft/server";
import { decide, spawnSpot } from "../core/peopling";
import { JOBS, PEOPLES, type Position, type PostRecord } from "../core/record";
import * as storage from "./storage";

export const COMPONENT_ID = "villages:post";
export const PERSON = "villages:person";
const TAG = "[Villages]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

function positionOf(block: Block): Position {
  return { dimId: block.dimension.id, x: block.location.x, y: block.location.y, z: block.location.z };
}

function stateOf(block: Block, name: string): number {
  const v = block.permutation.getState(name as never);
  return typeof v === "number" ? v : 0;
}

/** The tag a person carries for its post, so the two can find each other without the id. */
export function postTag(pos: Position): string {
  return `villages:post:${pos.x},${pos.y},${pos.z}`;
}

/**
 * The post's person: by the recorded id first, then by tag among the persons
 * near the post. The id lookup fails whenever the person is in a chunk that
 * is not loaded, and a post whose chunk ticks while its person's does not
 * would otherwise count the person lost and, a day later, spawn a second one.
 * A person found by tag is adopted: the record takes its id.
 */
function personOf(dim: Dimension, record: PostRecord): Entity | undefined {
  if (record.entityId) {
    try {
      const e = world.getEntity(record.entityId);
      if (e && e.isValid && e.typeId === PERSON) return e;
    } catch {
      /* fall through to the tag */
    }
  }
  try {
    const tagged = dim.getEntities({ type: PERSON, tags: [postTag(record)], location: spawnSpot(record), maxDistance: 48 });
    const e = tagged[0];
    if (e && e.id !== record.entityId) storage.update(record, (row) => void (row.entityId = e.id));
    return e;
  } catch {
    return undefined;
  }
}

function spawn(dim: Dimension, record: PostRecord): Entity | undefined {
  try {
    const entity = dim.spawnEntity(PERSON, spawnSpot(record), { initialPersistence: true });
    entity.triggerEvent(`villages:people_${record.people}`);
    entity.triggerEvent(`villages:job_${record.job}`);
    entity.addTag(postTag(record));
    return entity;
  } catch (e) {
    log(`could not spawn a ${PEOPLES[record.people]} ${JOBS[record.job]} at ${record.x},${record.y},${record.z}: ${e}`);
    return undefined;
  }
}

/** Register the post if it is new, then keep its person. */
function tick(block: Block): void {
  const pos = positionOf(block);
  let record = storage.get(pos);
  if (!record) {
    record = { ...pos, people: stateOf(block, "villages:people"), job: stateOf(block, "villages:job"), spawnedAt: 0 };
    storage.put(record);
  }
  const verdict = decide(record, personOf(block.dimension, record) !== undefined, system.currentTick);
  if (verdict.kind !== "spawn") return;
  // A spawn that fails (the spot is in a chunk that is not loaded yet - a
  // post at a chunk edge on a world's first boot; measured) leaves the
  // record as it was, so the next tick tries again rather than waiting a day.
  const entity = spawn(block.dimension, record);
  if (!entity) return;
  storage.update(pos, (row) => {
    row.entityId = entity.id;
    row.spawnedAt = system.currentTick;
  });
}

/** The post is gone: so is its person (the design: take the block away and the person leaves). */
function retire(dim: Dimension, pos: Position): void {
  const record = storage.remove(pos);
  if (!record) return;
  const person = personOf(dim, record);
  if (person) {
    try {
      person.remove();
    } catch (e) {
      log(`could not remove person ${record.entityId} of the post at ${pos.x},${pos.y},${pos.z}: ${e}`);
    }
  }
}

export const postComponent: BlockCustomComponent = {
  onPlace(ev) {
    tick(ev.block);
  },
  onTick(ev) {
    tick(ev.block);
  },
  onPlayerBreak(ev) {
    retire(ev.dimension, positionOf(ev.block));
  },
  onBreak(ev) {
    retire(ev.dimension, positionOf(ev.block));
  },
};
