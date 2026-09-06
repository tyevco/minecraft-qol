/**
 * The builder at work (settlements.md §5.3, §5.4). A job is a record in the
 * "building" or "removing" phase with a timer: every N ticks the next step
 * is decided by core (job.ts) and performed here. Building takes one item
 * from the chest and sets one block in the same step, bottom layer up, far
 * corner toward the door; removing runs the list backwards, putting each
 * block's item in the chest before the block goes.
 *
 * The builder person is a `builder:builder` tagged for its table, spawned by
 * the table when a job starts if none is about. It is sent to each cell by a
 * waypoint (engine/walk.ts); the walk is best effort, so the pace holds
 * whether or not the person gets there - after a couple of beats the block
 * goes down anyway, and nothing waits on pathfinding.
 *
 * Nothing is lost: if the chest has gone, or is short, or full, the job stops
 * where it is and says so; the record keeps its progress, and the form or
 * `builder:resume` picks it up again.
 */
import { BlockPermutation, system, world, type Dimension, type Entity, type Vector3 } from "@minecraft/server";
import { catalogueEntry, itemFor, plainName, type Cell } from "../core/blueprint";
import { nextPlacement, nextRemoval, nextRepair, stillOurs, ticksPerBlock, withinReach, type Step } from "../core/job";
import { companionOf, removalOrder, worldCells } from "../core/order";
import { paletteTable } from "../core/palette";
import { boxOfRecord, type BuildingRecord, type Position } from "../core/record";
import * as chest from "./chest";
import * as outline from "./outline";
import { lookupIn } from "./placing";
import * as settings from "./settings";
import * as storage from "./storage";
import * as structures from "./structures";
import { announce, log } from "./tell";
import * as walk from "./walk";

export const BUILDER = "builder:builder";
/** Beats the builder may take to reach a cell before the block goes down regardless. */
const PATIENCE = 2;

interface Job {
  record: BuildingRecord;
  /** The cells in placement order, and in the order they come down. */
  cells: Cell[];
  removal: Cell[];
  timer: number;
  /** The outline's own beat, a second, whatever the block pace. */
  outline: number;
  ticks: number;
  waited: number;
  builderId?: string;
  /** While repairing: blocks placed, and the cells left because another block holds them (by position, since the list is scanned more than once). */
  placed: number;
  blocked: Set<string>;
}

const jobs = new Map<string, Job>();
const keyOf = (p: Position): string => `${p.dimId}:${p.x},${p.y},${p.z}`;

export const running = (p: Position): boolean => jobs.has(keyOf(p));
export const count = (): number => jobs.size;

export function tableTag(table: Vector3): string {
  return `builder:table:${table.x},${table.y},${table.z}`;
}

function dimensionOf(record: BuildingRecord): Dimension | undefined {
  try {
    return world.getDimension(record.dimId);
  } catch {
    return undefined;
  }
}

/** The table's builder: by tag near the table, or a new one spawned beside it. */
function ensureBuilder(job: Job, dim: Dimension): Entity | undefined {
  if (job.builderId) {
    try {
      const e = world.getEntity(job.builderId);
      if (e && e.isValid) return e;
    } catch {
      /* fall through */
    }
  }
  const t = job.record.table;
  const at = { x: t.x + 0.5, y: t.y, z: t.z + 0.5 };
  try {
    const found = dim.getEntities({ type: BUILDER, tags: [tableTag(t)], location: at, maxDistance: 64 })[0];
    if (found) {
      job.builderId = found.id;
      return found;
    }
    // On the table itself: the one spot beside a table that is known to be free.
    const e = dim.spawnEntity(BUILDER, { x: t.x + 0.5, y: t.y + 1, z: t.z + 0.5 }, { initialPersistence: true });
    e.addTag(tableTag(t));
    e.nameTag = "Builder";
    job.builderId = e.id;
    log(`a builder for the table at ${t.x},${t.y},${t.z} arrives`);
    return e;
  } catch (e) {
    log(`could not find or spawn a builder for the table at ${t.x},${t.y},${t.z}: ${e}`);
    return undefined;
  }
}

function builderOf(job: Job): Entity | undefined {
  if (!job.builderId) return undefined;
  try {
    const e = world.getEntity(job.builderId);
    return e && e.isValid ? e : undefined;
  } catch {
    return undefined;
  }
}

/** Start (or resume) the job a record describes. `ticks` overrides the panel's pace; the hatch uses it. */
export function start(record: BuildingRecord, ticks?: number): boolean {
  const key = keyOf(record);
  if (jobs.has(key)) return false;
  const b = structures.building(record.key);
  if (!b) {
    log(`cannot start on ${record.key} at ${record.x},${record.y},${record.z}: no such structure`);
    return false;
  }
  const cells = worldCells(b.cells, b.size, record.rotation, record, paletteTable(record.key, record.palette));
  const job: Job = { record, cells, removal: removalOrder(cells), timer: 0, outline: 0, ticks: ticks ?? ticksPerBlock(settings.policy().secondsPerBlock), waited: 0, placed: 0, blocked: new Set() };
  job.timer = system.runInterval(() => tick(job), job.ticks);
  const dim = dimensionOf(record);
  if (dim) job.outline = system.runInterval(() => outline.pulse(dim, boxOfRecord(job.record)), 20);
  jobs.set(key, job);
  log(`${record.phase} the ${record.key} at ${record.x},${record.y},${record.z}: ${record.done}/${cells.length} done, a block every ${job.ticks} ticks`);
  return true;
}

/** Turn a built record into a removal job. */
export function startRemoval(record: BuildingRecord, ticks?: number): boolean {
  if (running(record)) return false;
  storage.update(record, (row) => {
    row.phase = "removing";
    row.done = 0;
  });
  const fresh = storage.get(record);
  return fresh ? start(fresh, ticks) : false;
}

/** Turn a built record into a repair job: the gaps filled from the chest, in placement order. */
export function startRepair(record: BuildingRecord, ticks?: number): boolean {
  if (running(record)) return false;
  storage.update(record, (row) => {
    row.phase = "repairing";
    row.done = 0;
  });
  const fresh = storage.get(record);
  return fresh ? start(fresh, ticks) : false;
}

/** Drop a record and any job on it, leaving the world as it is: the test harness's sweep, and an operator's way out. */
export function forget(record: BuildingRecord): void {
  const job = jobs.get(keyOf(record));
  if (job) {
    system.clearRun(job.timer);
    system.clearRun(job.outline);
    jobs.delete(keyOf(record));
    walk.halt(builderOf(job));
  }
  storage.remove(record);
}

/** Every job the world was saved mid-way through picks up where it stopped. */
export function resume(): number {
  let n = 0;
  for (const r of storage.all()) if (r.phase !== "built" && start(r)) n++;
  return n;
}

function stop(job: Job, why: string): void {
  system.clearRun(job.timer);
  system.clearRun(job.outline);
  jobs.delete(keyOf(job.record));
  const b = builderOf(job);
  walk.halt(b);
  try {
    b?.triggerEvent("builder:work_off");
  } catch {
    /* gone */
  }
  const dim = dimensionOf(job.record);
  const title = catalogueEntry(job.record.key)?.title ?? job.record.key;
  if (dim) announce(dim, job.record, `The builder stops on the ${title} at ${job.record.x},${job.record.y},${job.record.z}: ${why}.`);
}

function finish(job: Job): void {
  system.clearRun(job.timer);
  system.clearRun(job.outline);
  jobs.delete(keyOf(job.record));
  const b = builderOf(job);
  walk.halt(b);
  try {
    b?.triggerEvent("builder:work_off");
  } catch {
    /* gone */
  }
  const dim = dimensionOf(job.record);
  const title = catalogueEntry(job.record.key)?.title ?? job.record.key;
  if (job.record.phase === "removing") {
    storage.remove(job.record);
    if (dim) announce(dim, job.record, `The ${title} at ${job.record.x},${job.record.y},${job.record.z} is down; everything is back in the chest.`);
  } else if (job.record.phase === "repairing") {
    storage.update(job.record, (row) => void (row.phase = "built"));
    if (dim) announce(dim, job.record, `The ${title} at ${job.record.x},${job.record.y},${job.record.z} is repaired: ${job.placed} block(s) put back${job.blocked.size ? `, ${job.blocked.size} cell(s) left as they are because something else stands there` : ""}.`);
  } else {
    storage.update(job.record, (row) => void (row.phase = "built"));
    if (dim) announce(dim, job.record, `The ${title} at ${job.record.x},${job.record.y},${job.record.z} is finished.`);
  }
}

function tick(job: Job): void {
  const record = storage.get(job.record);
  if (!record) return stop(job, "its record is gone");
  job.record = record;
  const dim = dimensionOf(record);
  if (!dim) return stop(job, "its dimension cannot be found");
  const step = nextStep(job, record.done, dim);
  if (step.kind === "done") return finish(job);

  const builder = ensureBuilder(job, dim);
  if (builder) {
    walk.sendTo(builder, step.cell);
    const near = withinReach(builder.location, step.cell);
    if (!near && job.waited < PATIENCE) {
      job.waited++;
      return;
    }
  }
  job.waited = 0;
  const done = step.kind === "place" ? place(job, dim, step) : take(job, dim, step);
  if (!done) return;
  if (record.phase === "repairing") job.placed++;
  // `done` is how far the phase's list has got: the step's own index, passed.
  storage.update(record, (row) => void (row.done = step.index + 1));
  try {
    builder?.triggerEvent("builder:work_on");
  } catch {
    /* gone */
  }
  // A step is a cell placed or taken: the next beat sends the builder on.
  const next = nextStep(job, step.index + 1, dim);
  if (next.kind !== "done" && builder) walk.sendTo(builder, next.cell);
}

/** The phase's next step from `from`: the next cell to place, take, or fill. */
function nextStep(job: Job, from: number, dim: Dimension): Step {
  switch (job.record.phase) {
    case "removing":
      return nextRemoval(job.removal, from);
    case "repairing": {
      const lookup = lookupIn(dim);
      const r = nextRepair(job.cells, from, (c) => lookup(c.x, c.y, c.z));
      for (const c of r.blocked) job.blocked.add(`${c.x},${c.y},${c.z}`);
      return r.step;
    }
    default:
      return nextPlacement(job.cells, from);
  }
}

/** Take the item, then set the block; if the block cannot be set, the item goes back. Returns whether the step counts. */
function place(job: Job, dim: Dimension, step: Extract<Step, { kind: "place" }>): boolean {
  // A free building costs nothing and needs no chest.
  const item = job.record.free ? undefined : step.item;
  const c = item ? chest.chestBeside(dim, job.record.table) : undefined;
  if (item && !c) {
    stop(job, "the chest beside the table is gone");
    return false;
  }
  const block = dim.getBlock(step.cell);
  if (!block) {
    stop(job, `${step.cell.x},${step.cell.y},${step.cell.z} is not loaded`);
    return false;
  }
  if (item && c && !chest.takeOne(c, item)) {
    stop(job, `the chest is out of ${plainName(item)}`);
    return false;
  }
  try {
    block.setPermutation(BlockPermutation.resolve(step.cell.name, step.cell.states));
    if (step.cell.waterlogged) block.setWaterlogged(true);
  } catch (e) {
    if (item && c) chest.giveOne(c, item);
    stop(job, `${plainName(step.cell.name)} could not be placed at ${step.cell.x},${step.cell.y},${step.cell.z} (${e})`);
    return false;
  }
  return true;
}

/**
 * Put the item in the chest, then take the block; a block that is not the
 * building's any more is left alone and skipped. A two-block thing (a door,
 * a bed) comes down as a pair in one tick, its one item banked first: taking
 * one half alone lets the game pop the other as a drop (measured: a door
 * taken upper half first came back as no door), and the other half's own
 * step later finds air and skips.
 */
function take(job: Job, dim: Dimension, step: Extract<Step, { kind: "take" }>): boolean {
  const block = dim.getBlock(step.cell);
  if (!block) {
    stop(job, `${step.cell.x},${step.cell.y},${step.cell.z} is not loaded`);
    return false;
  }
  if (!stillOurs(step.cell, block.typeId)) return true; // somebody else's now: skip, count the step
  const partnerAt = companionOf(step.cell);
  const partnerCell = partnerAt ? job.cells.find((c) => c.x === partnerAt.x && c.y === partnerAt.y && c.z === partnerAt.z) : undefined;
  const partner = partnerCell ? dim.getBlock(partnerCell) : undefined;
  const pair = partnerCell && partner && stillOurs(partnerCell, partner.typeId) ? { cell: partnerCell, block: partner } : undefined;
  const item = step.item ?? (pair ? itemFor(pair.cell) : undefined);
  // A building raised free gives nothing back: nothing was taken for it.
  if (item && !job.record.free) {
    const c = chest.chestBeside(dim, job.record.table);
    if (!c) {
      stop(job, "the chest beside the table is gone");
      return false;
    }
    if (!chest.giveOne(c, item)) {
      stop(job, "the chest is full");
      return false;
    }
  }
  try {
    // The half that carries the item goes first, then the other, in one tick.
    if (pair && itemFor(pair.cell) && !step.item) {
      pair.block.setType("minecraft:air");
      block.setType("minecraft:air");
    } else {
      block.setType("minecraft:air");
      pair?.block.setType("minecraft:air");
    }
  } catch (e) {
    stop(job, `${plainName(step.cell.name)} at ${step.cell.x},${step.cell.y},${step.cell.z} would not come down (${e})`);
    return false;
  }
  return true;
}

/** For the debug listing. */
export function describe(): string[] {
  return [...jobs.values()].map((j) => `${j.record.phase} ${j.record.key} at ${j.record.x},${j.record.y},${j.record.z}: ${j.record.done}/${j.cells.length}, every ${j.ticks} ticks, builder ${j.builderId ?? "none yet"}`);
}
