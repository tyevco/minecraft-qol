/**
 * A worker's trade, carried out: the survey of the blocks (and sheep) round
 * the post, and the work cycles - a lumberjack felling the nearest tree
 * into the nearest chest, a farmer harvesting and replanting, a rancher
 * shearing its pen's sheep. Every decision is in
 * core/trades.ts; this file reads blocks and makes the changes.
 *
 * Fail towards the player keeping their things (CLAUDE.md rule 4): the chest
 * is checked for room before anything is cut; a log is removed from the
 * world only in the same step that puts it in the chest, and if the chest
 * has gone by then the log is dropped at the stump rather than lost; a
 * harvested tile is replanted before its drops are delivered, the
 * Fluidworks way, so a failure between the two never duplicates; a sheep is
 * marked shorn (the game's own `minecraft:on_sheared` event, which swaps its
 * component groups exactly as shears do) before its wool is delivered.
 *
 * Walking is a short teleport for now (docs/design/villages.md §7 item 6):
 * the person appears beside the tree or row, swings for the duration of
 * the work (`villages:working`), and reappears at its post.
 */
import {
  BlockComponentTypes,
  BlockVolume,
  EntityComponentTypes,
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

/** The sheep within `range` of the post, as the core sees them. */
function flockOf(dim: Dimension, record: PostRecord, range: number): core.Sheep[] {
  try {
    return dim.getEntities({ type: "minecraft:sheep", location: { x: record.x + 0.5, y: record.y, z: record.z + 0.5 }, maxDistance: range }).map((e) => ({
      id: e.id,
      pos: { x: Math.floor(e.location.x), y: Math.floor(e.location.y), z: Math.floor(e.location.z) },
      color: e.getComponent(EntityComponentTypes.Color)?.value ?? 0,
      sheared: e.getComponent(EntityComponentTypes.IsSheared) !== undefined,
      baby: e.getComponent(EntityComponentTypes.IsBaby) !== undefined,
    }));
  } catch (e) {
    log(`sheep scan failed: ${e}`);
    return [];
  }
}

function survey(dim: Dimension, record: PostRecord): core.Survey {
  const wide = volumeAround(record, core.SURVEY_RANGE, core.SURVEY_BELOW, core.SURVEY_ABOVE);
  return {
    farmland: blocksOf(dim, volumeAround(record, core.SURVEY_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW), [core.FARMLAND]).length,
    logs: blocksOf(dim, wide, core.LOG_TYPES).length,
    leaves: blocksOf(dim, wide, core.LEAF_TYPES).length,
    sheep: flockOf(dim, record, core.SURVEY_RANGE).filter((s) => !s.baby).length,
  };
}

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
    if (core.PAID_TRADES.includes(trade)) log(`${core.tradeName(trade)} worked unpaid: the chest emptied during the cycle`);
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
 * A rancher's cycle: the grown, unshorn sheep nearest the post, one every
 * TICKS_PER_SHEEP. The sheep is shorn by its own event first (the game then
 * regrows the wool when it eats grass, as after a player's shears), and its
 * wool goes to the chest in the same step.
 */
function ranch(dim: Dimension, record: PostRecord, person: Entity, chest: Chest, finish: (worked: boolean) => void): void {
  const plan = core.shearPlan(flockOf(dim, record, core.RANCH_RANGE), record);
  const first = plan[0];
  if (!first) return finish(false);

  moveTo(person, core.standingSpot(first.pos, record), true);
  const steps = plan.map((s) => () => {
    if (!person.isValid) return false;
    const sheep = dim.getEntities({ type: "minecraft:sheep", location: { x: s.pos.x + 0.5, y: s.pos.y, z: s.pos.z + 0.5 }, maxDistance: core.RANCH_RANGE }).find((e) => e.id === s.id);
    if (!sheep || !sheep.isValid || sheep.getComponent(EntityComponentTypes.IsSheared) || sheep.getComponent(EntityComponentTypes.IsBaby)) return true;
    const color = sheep.getComponent(EntityComponentTypes.Color)?.value ?? s.color;
    try {
      sheep.triggerEvent("minecraft:on_sheared");
    } catch (e) {
      log(`could not shear a sheep at ${s.pos.x},${s.pos.y},${s.pos.z}: ${e}`);
      return true;
    }
    deliver(chest, new ItemStack(core.woolOf(color), core.shearYield(Math.random)), dim, s.pos);
    return true;
  });
  pace(core.TICKS_PER_SHEEP, steps, () => finish(true));
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
    if (trade !== record.trade) log(`the worker at ${record.x},${record.y},${record.z} is now a ${core.tradeName(trade)} (farmland ${s.farmland}, logs ${s.logs}, leaves ${s.leaves}, sheep ${s.sheep})`);
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
    if (record.trade === core.LUMBERJACK) fell(dim, record, person, chest, finish);
    else if (record.trade === core.RANCHER) ranch(dim, record, person, chest, finish);
    else farm(dim, record, person, chest, finish);
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
