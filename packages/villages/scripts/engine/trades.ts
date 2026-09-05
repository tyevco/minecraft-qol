/**
 * A worker's trade, carried out: the survey of the blocks round the post,
 * and the work cycles - a lumberjack felling the nearest tree into the
 * nearest chest, a farmer harvesting and replanting, a miner at a vein, a
 * fisher at the water's edge. Every decision is in core/trades.ts; this
 * file reads blocks and makes the changes.
 *
 * Fail towards the player keeping their things (CLAUDE.md rule 4): the chest
 * is checked for room before anything is cut; a log is removed from the
 * world only in the same step that puts it in the chest, and if the chest
 * has gone by then the log is dropped at the stump rather than lost; a
 * harvested tile is replanted before its drops are delivered, the
 * Fluidworks way, so a failure between the two never duplicates.
 *
 * Walking is a short teleport for now (docs/design/villages.md §7 item 6):
 * the person appears beside the tree or row, swings for the duration of
 * the work (`villages:working`), and reappears at its post.
 */
import {
  BlockComponentTypes,
  BlockVolume,
  ItemStack,
  system,
  world,
  type Block,
  type Container,
  type Dimension,
  type Entity,
  type Vector3,
} from "@minecraft/server";
import { cropOf, withholdSeed, type Drop } from "@qol/shared/core/crops";
import { spawnSpot } from "../core/peopling";
import { WORKER, type PostRecord } from "../core/record";
import * as core from "../core/trades";
import { policy } from "./settings";
import * as storage from "./storage";

const log = (...parts: unknown[]): void => console.warn("[Villages]", ...parts);
const FOOD_TAG = "minecraft:is_food";

/** Posts with a cycle in progress, and posts idling after a cycle found nothing to do. Module state: a /reload just stops a cycle. */
const busy = new Set<string>();
const idleUntil = new Map<string, number>();

function volumeAround(pos: Vector3, range: number, below: number, above: number): BlockVolume {
  return new BlockVolume(
    { x: pos.x - range, y: pos.y - below, z: pos.z - range },
    { x: pos.x + range, y: pos.y + above, z: pos.z + range },
  );
}

/** Every block of the given types in the volume. Unloaded chunks are skipped, not fatal: the survey repeats. */
function blocksOf(dim: Dimension, volume: BlockVolume, types: readonly string[]): Block[] {
  const out: Block[] = [];
  try {
    for (const loc of dim.getBlocks(volume, { includeTypes: [...types] }, true).getBlockLocationIterator()) {
      const b = dim.getBlock(loc);
      if (b) out.push(b);
    }
  } catch (e) {
    log(`block scan failed: ${e}`);
  }
  return out;
}

function survey(dim: Dimension, record: PostRecord): core.Survey {
  const wide = volumeAround(record, core.SURVEY_RANGE, core.SURVEY_BELOW, core.SURVEY_ABOVE);
  const level = volumeAround(record, core.SURVEY_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  return {
    farmland: blocksOf(dim, level, [core.FARMLAND]).length,
    logs: blocksOf(dim, wide, core.LOG_TYPES).length,
    leaves: blocksOf(dim, wide, core.LEAF_TYPES).length,
    veins: blocksOf(dim, level, [core.VEIN]).length,
    water: blocksOf(dim, level, core.WATER_TYPES).length,
  };
}

const describeSurvey = (s: core.Survey): string =>
  `farmland ${s.farmland}, logs ${s.logs}, leaves ${s.leaves}, veins ${s.veins}, water ${s.water}`;

interface Chest {
  block: Block;
  container: Container;
}

function nearestChest(dim: Dimension, record: PostRecord): Chest | undefined {
  const chests = blocksOf(dim, volumeAround(record, core.CHEST_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW), core.CHEST_TYPES);
  let best: Chest | undefined;
  let bestD = Infinity;
  for (const block of chests) {
    const container = block.getComponent(BlockComponentTypes.Inventory)?.container;
    if (!container || !container.isValid) continue;
    const d = (block.x - record.x) ** 2 + (block.y - record.y) ** 2 + (block.z - record.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { block, container };
    }
  }
  return best;
}

function viewOf(container: Container): core.ChestView {
  const slots: (core.Slot | undefined)[] = [];
  for (let i = 0; i < container.size; i++) {
    const s = container.getItem(i);
    // The `minecraft:is_food` item tag, not ItemComponentTypes.Food: measured
    // on BDS 1.26.45, the component exists only on data-driven foods (an
    // apple); bread and cooked beef have no components at all, but every
    // food carries the tag (docs/villages-jigsaw-results.md).
    slots.push(s ? { typeId: s.typeId, amount: s.amount, food: s.hasTag(FOOD_TAG) } : undefined);
  }
  return { emptySlots: container.emptySlotsCount, slots };
}

/** Put a stack in the chest; what does not fit is dropped at `fallback`, never lost. */
function deliver(chest: Chest, stack: ItemStack, dim: Dimension, fallback: Vector3): void {
  let leftover: ItemStack | undefined = stack;
  try {
    if (chest.container.isValid) leftover = chest.container.addItem(stack);
  } catch (e) {
    log(`deliver failed: ${e}`);
  }
  if (leftover) {
    try {
      dim.spawnItem(leftover, { x: fallback.x + 0.5, y: fallback.y + 0.5, z: fallback.z + 0.5 });
    } catch (e) {
      log(`could not even drop ${leftover.typeId} x${leftover.amount}: ${e}`);
    }
  }
}

/** Take one item out of slot `i`. */
function takeOne(container: Container, i: number): void {
  const s = container.getItem(i);
  if (!s) return;
  container.setItem(i, s.amount > 1 ? new ItemStack(s.typeId, s.amount - 1) : undefined);
}

function payWage(chest: Chest, trade: number): void {
  if (!policy().wages || !chest.container.isValid) return;
  const i = core.pickWage(viewOf(chest.container).slots);
  if (i === undefined) {
    if (core.paid(trade)) log(`${core.tradeName(trade)} worked unpaid: the chest emptied during the cycle`);
    return;
  }
  takeOne(chest.container, i);
}

function moveTo(person: Entity, spot: Vector3, working: boolean): void {
  try {
    if (!person.isValid) return;
    person.teleport(spot, { keepVelocity: false });
    person.triggerEvent(working ? "villages:work_on" : "villages:work_off");
  } catch (e) {
    log(`could not move the worker: ${e}`);
  }
}

/** Run `steps` one every `every` ticks, then `done`. Stops early if a step returns false. */
function pace(every: number, steps: (() => boolean)[], done: () => void): void {
  let i = 0;
  const id = system.runInterval(() => {
    if (i >= steps.length || !steps[i++]!()) {
      system.clearRun(id);
      done();
    }
  }, every);
}

// ---------------------------------------------------------------------------
// The cycles
// ---------------------------------------------------------------------------

function fell(dim: Dimension, record: PostRecord, person: Entity, chest: Chest, finish: (worked: boolean) => void): void {
  const wide = volumeAround(record, core.SURVEY_RANGE, core.SURVEY_BELOW, core.SURVEY_ABOVE);
  const logs = blocksOf(dim, wide, core.LOG_TYPES).map((b) => ({ pos: { x: b.x, y: b.y, z: b.z }, typeId: b.typeId }));
  const leaves = new Set(blocksOf(dim, wide, core.LEAF_TYPES).map((b) => core.key(b)));
  const tree = core.nearestTree(core.findTrees(logs, leaves), record);
  if (!tree) return finish(false);
  const ground = dim.getBlock({ x: tree.base.x, y: tree.base.y - 1, z: tree.base.z })?.typeId ?? "";
  const plan = core.fellPlan(tree, ground, Math.random);

  moveTo(person, core.standingSpot(tree.base, record), true);
  const steps = plan.order.map((l) => () => {
    if (!person.isValid) return false;
    const block = dim.getBlock(l.pos);
    if (!block || block.typeId !== l.typeId) return true; // someone got there first; that is fine
    block.setType("minecraft:air");
    deliver(chest, new ItemStack(l.typeId, 1), dim, tree.base);
    return true;
  });
  pace(core.TICKS_PER_LOG, steps, () => {
    const stump = dim.getBlock(tree.base);
    if (plan.plant && stump && stump.typeId === "minecraft:air") {
      try {
        stump.setType(tree.sapling);
      } catch (e) {
        log(`could not plant ${tree.sapling}: ${e}`);
        deliver(chest, new ItemStack(tree.sapling, 1), dim, tree.base);
      }
    } else if (!plan.plant) {
      deliver(chest, new ItemStack(tree.sapling, 1), dim, tree.base);
    }
    if (plan.spare) deliver(chest, new ItemStack(tree.sapling, 1), dim, tree.base);
    finish(true);
  });
}

/** One tile: loot, withhold a seed (or take one from the chest), replant or clear, deliver. The Fluidworks harvester's order. */
function harvestTile(dim: Dimension, block: Block, chest: Chest): void {
  const crop = cropOf(block.typeId);
  if (!crop) return;
  const loot = world.getLootTableManager().generateLootFromBlock(block) ?? [];
  const drops: Drop[] = loot.map((s) => ({ typeId: s.typeId, amount: s.amount }));
  let { drops: kept, replant } = withholdSeed(drops, crop);
  if (!replant && chest.container.isValid) {
    const i = core.pickSeed(viewOf(chest.container).slots, crop.seed);
    if (i !== undefined) {
      takeOne(chest.container, i);
      replant = true;
    }
  }
  if (replant) block.setPermutation(block.permutation.withState(crop.ageState as never, 0 as never));
  else block.setType("minecraft:air");
  for (const d of kept) deliver(chest, new ItemStack(d.typeId, d.amount), dim, block);
}

function farm(dim: Dimension, record: PostRecord, person: Entity, chest: Chest, finish: (worked: boolean) => void): void {
  const field = volumeAround(record, core.FARM_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  const tiles: core.CropTile[] = blocksOf(dim, field, core.FARM_CROPS).map((b) => {
    const crop = cropOf(b.typeId);
    const age = crop ? b.permutation.getState(crop.ageState as never) : undefined;
    return { pos: { x: b.x, y: b.y, z: b.z }, typeId: b.typeId, age: typeof age === "number" ? age : 0 };
  });
  const plan = core.harvestPlan(tiles, record);
  const first = plan[0];
  if (!first) return finish(false);

  moveTo(person, { x: first.pos.x + 0.5, y: first.pos.y, z: first.pos.z + 0.5 }, true);
  const steps = plan.map((t) => () => {
    if (!person.isValid) return false;
    const block = dim.getBlock(t.pos);
    if (!block || block.typeId !== t.typeId) return true;
    try {
      harvestTile(dim, block, chest);
    } catch (e) {
      log(`harvest at ${t.pos.x},${t.pos.y},${t.pos.z} failed: ${e}`);
    }
    return true;
  });
  pace(core.TICKS_PER_CROP, steps, () => finish(true));
}

/**
 * The miner: swings at the nearest vein for a while, then the vein's yield
 * appears in the chest. The vein is a fixture and is never changed; what
 * limits it is the allowance counted on the post (core.veinAllowance),
 * checked before the walk so a spent vein means an idle miner, not a
 * fruitless trip.
 */
function mine(dim: Dimension, record: PostRecord, person: Entity, chest: Chest, finish: (worked: boolean) => void): void {
  const level = volumeAround(record, core.SURVEY_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  const veins = blocksOf(dim, level, [core.VEIN]).map((b) => ({ pos: { x: b.x, y: b.y, z: b.z }, ore: b.permutation.getState(core.ORE_STATE as never) }));
  const vein = core.nearestOf(veins, record);
  if (!vein) return finish(false);
  const allowance = core.veinAllowance(record, system.currentTick);
  if (!allowance.allowed) return finish(false);
  storage.update(record, (row) => {
    row.veinAt = allowance.veinAt;
    row.veinCycles = allowance.veinCycles;
  });
  const produce = core.mineYield(vein.ore);

  moveTo(person, core.standingSpot(vein.pos, record), true);
  const steps = Array.from({ length: core.WORK_SWINGS }, () => () => person.isValid);
  pace(core.TICKS_PER_SWING, steps, () => {
    if (!person.isValid) return finish(false);
    deliver(chest, new ItemStack(produce.typeId, produce.amount), dim, vein.pos);
    finish(true);
  });
}

/** The fisher: stands at the water's edge (or on a deck over it) for a while, then the catch appears in the chest. */
function fish(dim: Dimension, record: PostRecord, person: Entity, chest: Chest, finish: (worked: boolean) => void): void {
  const level = volumeAround(record, core.FARM_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  const waters = blocksOf(dim, level, core.WATER_TYPES).map((b) => ({ x: b.x, y: b.y, z: b.z }));
  const typeAt = (v: core.Vec): string | undefined => {
    try {
      return dim.getBlock(v)?.typeId;
    } catch {
      return undefined;
    }
  };
  const spot = core.fishingSpot(waters, typeAt, record);
  if (!spot) return finish(false);

  moveTo(person, { x: spot.stand.x + 0.5, y: spot.stand.y, z: spot.stand.z + 0.5 }, true);
  const steps = Array.from({ length: core.WORK_SWINGS }, () => () => person.isValid);
  pace(core.TICKS_PER_SWING, steps, () => {
    if (!person.isValid) return finish(false);
    for (const c of core.catchPlan(Math.random)) deliver(chest, new ItemStack(c.typeId, c.amount), dim, spot.stand);
    finish(true);
  });
}

// ---------------------------------------------------------------------------
// The post's call
// ---------------------------------------------------------------------------

/**
 * Called by the post each block tick while its person is present. Surveys
 * when due, then starts a cycle when one is due and the chest allows it.
 */
export function tick(block: Block, record: PostRecord, person: Entity, now: number): void {
  if (record.job !== WORKER) return;
  const k = core.key(record);
  if (busy.has(k)) return;
  if ((idleUntil.get(k) ?? 0) > now) return;
  const dim = block.dimension;

  if (core.surveyDue(record, now)) {
    const s = survey(dim, record);
    const trade = core.chooseTrade(s);
    if (trade !== record.trade) log(`the worker at ${record.x},${record.y},${record.z} is now a ${core.tradeName(trade)} (${describeSurvey(s)})`);
    storage.update(record, (row) => {
      row.trade = trade;
      row.surveyedAt = now;
    });
    record.trade = trade;
  }
  if (record.trade === core.NONE) return;
  if (!core.cycleDue(record, now, core.minutesToTicks(policy().cycleMinutes))) return;

  const chest = nearestChest(dim, record);
  const verdict = core.canWork(record.trade, chest ? viewOf(chest.container) : undefined, policy().wages);
  if (verdict.kind === "wait" || !chest) {
    log(`the ${core.tradeName(record.trade)} at ${record.x},${record.y},${record.z} waits: ${verdict.kind === "wait" ? verdict.reason : "no chest"}`);
    idleUntil.set(k, now + core.IDLE_TICKS);
    return;
  }

  busy.add(k);
  const finish = (worked: boolean): void => {
    busy.delete(k);
    moveTo(person, spawnSpot(record), false);
    if (!worked) {
      log(`the ${core.tradeName(record.trade)} at ${record.x},${record.y},${record.z} found nothing to do`);
      idleUntil.set(k, now + core.IDLE_TICKS);
      return;
    }
    payWage(chest, record.trade);
    storage.update(record, (row) => void (row.cycleAt = system.currentTick));
  };
  try {
    switch (record.trade) {
      case core.LUMBERJACK: fell(dim, record, person, chest, finish); break;
      case core.FARMER: farm(dim, record, person, chest, finish); break;
      case core.MINER: mine(dim, record, person, chest, finish); break;
      case core.FISHER: fish(dim, record, person, chest, finish); break;
      default: finish(false);
    }
  } catch (e) {
    log(`cycle at ${record.x},${record.y},${record.z} failed to start: ${e}`);
    finish(false);
  }
}

/** For the debug listing. */
export function status(record: PostRecord): string {
  const k = core.key(record);
  if (busy.has(k)) return "working";
  if ((idleUntil.get(k) ?? 0) > system.currentTick) return "idle";
  return "";
}
