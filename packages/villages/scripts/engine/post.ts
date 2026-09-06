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
 * its post. A worker's post also runs its trade each tick (engine/trades.ts).
 */
import { system, world, type Block, type BlockCustomComponent, type Dimension, type Entity } from "@minecraft/server";
import { decide, spawnSpot } from "../core/peopling";
import { FRESH, JOBS, PAGE_STATE, PEOPLE_STATE, PEOPLES, PLACED_BY_PLAYER, PLACED_BY_WORLD, peopleIndex, peopleName, type Position, type PostRecord } from "../core/record";
import * as follow from "./follow";
import * as storage from "./storage";
import * as trades from "./trades";

export const COMPONENT_ID = "villages:post";
export const PERSON = "villages:person";
/** The tag a person carries when it lives on a post the kids placed: a settler, not a villager. */
export const KIN_TAG = "villages:kin";
const TAG = "[Villages]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

/**
 * Posts a player placed, by position key, noted by `playerPlaceBlock` in
 * main.ts. The block's own `onPlace` fires for a player's placement, for
 * /setblock and for a structure load alike, so the player event is what
 * tells the kids' posts from a village's. Whichever of the two arrives
 * first: the event marks a record that exists, or leaves the key here for
 * the registration to read.
 */
const placedByPlayer = new Set<string>();
const keyOf = (pos: Position): string => `${pos.dimId}:${pos.x},${pos.y},${pos.z}`;

/** A player placed a post here (main.ts). Returns whether a record already existed, for the measurement of which event comes first. */
export function markPlacedByPlayer(pos: Position): boolean {
  const record = storage.get(pos);
  if (record) {
    storage.update(pos, (row) => void (row.placedBy = PLACED_BY_PLAYER));
    return true;
  }
  placedByPlayer.add(keyOf(pos));
  return false;
}

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
export function personOf(dim: Dimension, record: PostRecord): Entity | undefined {
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

function spawn(dim: Dimension, record: PostRecord, name = peopleName(record.people)): Entity | undefined {
  try {
    const entity = dim.spawnEntity(PERSON, spawnSpot(record), { initialPersistence: true });
    entity.triggerEvent(`villages:people_${record.people}`);
    entity.triggerEvent(`villages:job_${record.job}`);
    entity.addTag(postTag(record));
    if (record.placedBy === PLACED_BY_PLAYER) entity.addTag(KIN_TAG);
    // Named for its people. `minecraft:nameable` with no `always_show`
    // draws the name only while a player looks at the person, as a
    // name-tagged villager's is; a player's own name tag replaces it.
    entity.nameTag = name;
    return entity;
  } catch (e) {
    log(`could not spawn a ${PEOPLES[record.people]} ${JOBS[record.job]} at ${record.x},${record.y},${record.z}: ${e}`);
    return undefined;
  }
}

/** Whether the post's person is about (by id, then by tag). */
export const hasPerson = (dim: Dimension, record: PostRecord): boolean => personOf(dim, record) !== undefined;

/**
 * A visitor settles on a post the kids placed (villages.md §6.1): the post
 * takes the visitor's people and name. `minecraft:home` is fixed at spawn
 * and the stable API cannot move it, so the settler is spawned fresh at the
 * post (the same face: people and name) and the visitor is the caller's to
 * remove. Returns the settler, or undefined if the post is not free.
 */
export function settle(dim: Dimension, record: PostRecord, people: number, name: string): Entity | undefined {
  if (record.placedBy !== PLACED_BY_PLAYER || personOf(dim, record)) return undefined;
  storage.update(record, (row) => void (row.people = people));
  const entity = spawn(dim, { ...record, people }, name);
  if (!entity) return undefined;
  storage.update(record, (row) => {
    row.entityId = entity.id;
    row.spawnedAt = system.currentTick;
  });
  return entity;
}

/**
 * Register the post if it is new, then keep its person. A placement over an
 * existing record means the old post went without us hearing (a structure
 * load, /fill): that post's person is retired and the record starts over,
 * with the people, job and trade of the block that is there now.
 */
function tick(block: Block, placed = false): void {
  const pos = positionOf(block);
  let record = storage.get(pos);
  if (record && placed) {
    // The kids' own post with its plaque turned (turnPlaque sets the job on
    // the record, then the block, so the two agree here): the same post.
    const same = record.placedBy === PLACED_BY_PLAYER && record.job === stateOf(block, "villages:job") && record.people === peopleIndex(stateOf(block, PEOPLE_STATE), stateOf(block, PAGE_STATE));
    if (same) return;
    retire(block.dimension, pos);
    record = undefined;
  }
  if (!record) {
    const byPlayer = placedByPlayer.delete(keyOf(pos));
    record = { ...pos, people: peopleIndex(stateOf(block, PEOPLE_STATE), stateOf(block, PAGE_STATE)), job: stateOf(block, "villages:job"), ...FRESH, placedBy: byPlayer ? PLACED_BY_PLAYER : PLACED_BY_WORLD };
    storage.put(record);
    // Registration only: the first spawn waits for the block's own tick, so
    // a `playerPlaceBlock` that follows this `onPlace` in the same tick can
    // still mark the post the kids' before anyone is spawned at it.
    if (placed) return;
  }
  const person = personOf(block.dimension, record);
  const verdict = decide(record, person !== undefined, system.currentTick);
  if (verdict.kind === "keep" && person) {
    trades.tick(block, record, person, system.currentTick);
    return;
  }
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

/**
 * A kid's post is placed with the block's default states (the item cannot
 * choose them), so its job is chosen afterwards by tapping it: each tap
 * turns the plaque to the next job while the post has nobody. A tap with an
 * invited person of the post's job within reach settles them instead
 * (engine/follow.ts). A village's post is never turned.
 */
function turnPlaque(block: Block, record: PostRecord): void {
  if (record.placedBy !== PLACED_BY_PLAYER || personOf(block.dimension, record)) return;
  const job = (record.job + 1) % JOBS.length;
  storage.update(record, (row) => void (row.job = job));
  try {
    block.setPermutation(block.permutation.withState("villages:job" as never, job as never));
  } catch (e) {
    log(`could not turn the plaque at ${record.x},${record.y},${record.z}: ${e}`);
    storage.update(record, (row) => void (row.job = record.job));
  }
}

export const postComponent: BlockCustomComponent = {
  onPlace(ev) {
    tick(ev.block, true);
  },
  onPlayerInteract(ev) {
    const record = storage.get(positionOf(ev.block));
    if (!record) return;
    if (follow.settleAt(ev.block.dimension, record, ev.player)) return;
    turnPlaque(ev.block, record);
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
