/**
 * A worker's trade, carried out: the survey of the blocks round the post,
 * and the work cycles - a lumberjack felling the nearest tree into the
 * nearest chest, a farmer harvesting and replanting, a miner at a vein, a
 * fisher at the water's edge, a rancher shearing its pen's sheep (the
 * sheep's own `minecraft:on_sheared` event, which swaps its component
 * groups exactly as shears do, before its wool is delivered), and the
 * furfolk's seven (docs/design/furfolk.md §5): a forager at the berry
 * bushes, a baker at an oven, a beekeeper at a full hive, a cactus cutter, a
 * mushroom picker, a cocoa picker and a gleaner at a hedge. Every decision
 * is in core/trades.ts; this file reads blocks and makes the changes.
 *
 * A cycle is a walk to the work, the work, and a walk home (engine/walk.ts:
 * real pathing, so the route is the player's to secure). A walk that cannot
 * be made ends the cycle where the person stands; only a walk home that
 * fails falls back to a teleport, so nobody is left in the dark for good.
 *
 * Fail towards the player keeping their things (CLAUDE.md rule 4): the chest
 * is checked for room before anything is cut; a log is removed from the
 * world only in the same step that puts it in the chest, and if the chest
 * has gone by then the log is dropped at the stump rather than lost; a
 * harvested tile is replanted before its drops are delivered, the
 * Fluidworks way, so a failure between the two never duplicates.
 */
import {
  BlockComponentTypes,
  BlockPermutation,
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
import * as walk from "./walk";

const log = (...parts: unknown[]): void => console.warn("[Villages]", ...parts);
const FOOD_TAG = "minecraft:is_food";

/** Posts with a cycle in progress, and posts idling after a cycle found nothing to do. Module state: a /reload just stops a cycle. */
const busy = new Set<string>();
const idleUntil = new Map<string, number>();
/** The last reason each post waited, so a reason is logged when it changes and not every minute. */
const lastWait = new Map<string, string>();

function waitOnce(k: string, record: PostRecord, reason: string): void {
  if (lastWait.get(k) === reason) return;
  lastWait.set(k, reason);
  log(`the ${core.tradeName(record.trade)} at ${record.x},${record.y},${record.z} ${reason}`);
}

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

const typeReader = (dim: Dimension) => (v: core.Vec): string | undefined => {
  try {
    return dim.getBlock(v)?.typeId;
  } catch {
    return undefined;
  }
};

const blockOf = (v: Vector3): core.Vec => ({ x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) });

/** The veins the miner may work: in a cave or a mine, not out in the open. The others are named once so the player knows why. */
function enclosedVeins(dim: Dimension, record: PostRecord, say: boolean): { pos: core.Vec; ore: unknown }[] {
  const level = volumeAround(record, core.SURVEY_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  const typeAt = typeReader(dim);
  const out: { pos: core.Vec; ore: unknown }[] = [];
  for (const b of blocksOf(dim, level, [core.VEIN])) {
    const pos = { x: b.x, y: b.y, z: b.z };
    if (core.veinEnclosed(pos, record, typeAt)) out.push({ pos, ore: b.permutation.getState(core.ORE_STATE as never) });
    else if (say) log(`the vein at ${pos.x},${pos.y},${pos.z} is out in the open; a miner works a vein in a cave or a mine, under a roof`);
  }
  return out;
}

/** The sheep within `range` of the post, as the core sees them. */
function flockOf(dim: Dimension, record: PostRecord, range: number): core.Sheep[] {
  try {
    return dim.getEntities({ type: "minecraft:sheep", location: { x: record.x + 0.5, y: record.y, z: record.z + 0.5 }, maxDistance: range }).map((e) => ({
      id: e.id,
      pos: blockOf(e.location),
      color: e.getComponent(EntityComponentTypes.Color)?.value ?? 0,
      sheared: e.getComponent(EntityComponentTypes.IsSheared) !== undefined,
      baby: e.getComponent(EntityComponentTypes.IsBaby) !== undefined,
    }));
  } catch (e) {
    log(`sheep scan failed: ${e}`);
    return [];
  }
}

/** A numeric block state, or 0 when the block has no such state. */
function stateNumber(block: Block, state: string): number {
  const v = block.permutation.getState(state as never);
  return typeof v === "number" ? v : 0;
}

/** A block with the one state a trade reads, as the core sees it. */
function stateBlocks(blocks: readonly Block[], state: string): core.StateBlock[] {
  return blocks.map((b) => ({ pos: { x: b.x, y: b.y, z: b.z }, typeId: b.typeId, state: stateNumber(b, state) }));
}

/** A hedge: oak leaves somebody placed (`persistent_bit`), as against a tree's, which decay once the trunk is gone. */
function hedgeOf(dim: Dimension, record: PostRecord, range: number): Block[] {
  const level = volumeAround(record, range, core.SURVEY_BELOW, core.SURVEY_BELOW);
  return blocksOf(dim, level, [core.OAK_LEAVES]).filter((b) => b.permutation.getState(core.PERSISTENT_STATE as never) === true);
}

/** Small mushrooms standing on mycelium: the mice's beds, not a stray one under a tree. */
function mushroomsOf(dim: Dimension, record: PostRecord, range: number): core.Vec[] {
  const level = volumeAround(record, range, core.SURVEY_BELOW, core.SURVEY_BELOW);
  return blocksOf(dim, level, core.MUSHROOM_TYPES)
    .filter((b) => dim.getBlock({ x: b.x, y: b.y - 1, z: b.z })?.typeId === core.MYCELIUM)
    .map((b) => ({ x: b.x, y: b.y, z: b.z }));
}

function survey(dim: Dimension, record: PostRecord): core.Survey {
  const wide = volumeAround(record, core.SURVEY_RANGE, core.SURVEY_BELOW, core.SURVEY_ABOVE);
  const level = volumeAround(record, core.SURVEY_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  const ovens = volumeAround(record, core.OVEN_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  return {
    farmland: blocksOf(dim, level, [core.FARMLAND]).length,
    logs: blocksOf(dim, wide, core.LOG_TYPES).length,
    leaves: blocksOf(dim, wide, core.LEAF_TYPES).length,
    veins: enclosedVeins(dim, record, true).length,
    water: blocksOf(dim, level, core.WATER_TYPES).length,
    sheep: flockOf(dim, record, core.SURVEY_RANGE).filter((s) => !s.baby).length,
    bushes: blocksOf(dim, level, [core.BERRY_BUSH]).length,
    ovens: blocksOf(dim, ovens, core.OVEN_TYPES).length,
    hives: blocksOf(dim, level, core.HIVE_TYPES).length,
    cactus: blocksOf(dim, level, [core.CACTUS]).length,
    mushrooms: mushroomsOf(dim, record, core.SURVEY_RANGE).length,
    pods: blocksOf(dim, wide, [core.COCOA_POD]).length,
    hedge: hedgeOf(dim, record, core.SURVEY_RANGE).length,
  };
}

const describeSurvey = (s: core.Survey): string =>
  `farmland ${s.farmland}, logs ${s.logs}, leaves ${s.leaves}, veins ${s.veins}, water ${s.water}, sheep ${s.sheep}, ` +
  `bushes ${s.bushes}, ovens ${s.ovens}, hives ${s.hives}, cactus ${s.cactus}, mushrooms ${s.mushrooms}, pods ${s.pods}, hedge ${s.hedge}`;

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

/** Take `n` of `typeId` out of the chest, across slots. Returns how many were taken: fewer means the chest ran short. */
function takeItems(container: Container, typeId: string, n: number): number {
  let taken = 0;
  while (taken < n && container.isValid) {
    const i = core.pickItem(viewOf(container).slots, typeId);
    if (i === undefined) break;
    takeOne(container, i);
    taken++;
  }
  return taken;
}

/** Swings on the spot, then `after`. The pacing every worker with nothing to carry uses (miner, fisher, beekeeper, gleaner). */
function swing(person: Entity, after: () => void): void {
  pace(core.TICKS_PER_SWING, Array.from({ length: core.WORK_SWINGS }, () => () => person.isValid), after);
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

function setWorking(person: Entity, working: boolean): void {
  try {
    if (person.isValid) person.triggerEvent(working ? "villages:work_on" : "villages:work_off");
  } catch (e) {
    log(`could not set the worker's state: ${e}`);
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
// The jobs: where to stand, and what to do once there
// ---------------------------------------------------------------------------

interface Job {
  /** The block the person stands on to work. */
  spot: core.Vec;
  work(done: (worked: boolean) => void): void;
}

function fellJob(dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  const wide = volumeAround(record, core.SURVEY_RANGE, core.SURVEY_BELOW, core.SURVEY_ABOVE);
  const logs = blocksOf(dim, wide, core.LOG_TYPES).map((b) => ({ pos: { x: b.x, y: b.y, z: b.z }, typeId: b.typeId }));
  const leaves = new Set(blocksOf(dim, wide, core.LEAF_TYPES).map((b) => core.key(b)));
  const tree = core.nearestTree(core.findTrees(logs, leaves), record);
  if (!tree) return undefined;
  return {
    spot: blockOf(core.standingSpot(tree.base, record)),
    work(done) {
      const ground = dim.getBlock({ x: tree.base.x, y: tree.base.y - 1, z: tree.base.z })?.typeId ?? "";
      const plan = core.fellPlan(tree, ground, Math.random);
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
        done(true);
      });
    },
  };
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

function farmJob(dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  const field = volumeAround(record, core.FARM_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  const tiles: core.CropTile[] = blocksOf(dim, field, core.FARM_CROPS).map((b) => {
    const crop = cropOf(b.typeId);
    const age = crop ? b.permutation.getState(crop.ageState as never) : undefined;
    return { pos: { x: b.x, y: b.y, z: b.z }, typeId: b.typeId, age: typeof age === "number" ? age : 0 };
  });
  const plan = core.harvestPlan(tiles, record);
  const first = plan[0];
  if (!first) return undefined;
  return {
    spot: first.pos,
    work(done) {
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
      pace(core.TICKS_PER_CROP, steps, () => done(true));
    },
  };
}

/**
 * The miner: swings at the nearest enclosed vein for a while, then the
 * vein's yield appears in the chest. The vein is a fixture and is never
 * changed; what limits it is the allowance counted on the post
 * (core.veinAllowance), checked before the walk so a spent vein means an
 * idle miner, not a fruitless trip.
 */
function mineJob(dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  const vein = core.nearestOf(enclosedVeins(dim, record, false), record);
  if (!vein) return undefined;
  const allowance = core.veinAllowance(record, system.currentTick);
  if (!allowance.allowed) return undefined;
  return {
    spot: blockOf(core.standingSpot(vein.pos, record)),
    work(done) {
      storage.update(record, (row) => {
        row.veinAt = allowance.veinAt;
        row.veinCycles = allowance.veinCycles;
      });
      const produce = core.mineYield(vein.ore);
      swing(person, () => {
        if (!person.isValid) return done(false);
        deliver(chest, new ItemStack(produce.typeId, produce.amount), dim, vein.pos);
        done(true);
      });
    },
  };
}

/** The fisher: stands at the water's edge (or on a deck over it) for a while, then the catch appears in the chest. */
function fishJob(dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  const level = volumeAround(record, core.FARM_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  const waters = blocksOf(dim, level, core.WATER_TYPES).map((b) => ({ x: b.x, y: b.y, z: b.z }));
  const spot = core.fishingSpot(waters, typeReader(dim), record);
  if (!spot) return undefined;
  return {
    spot: spot.stand,
    work(done) {
      swing(person, () => {
        if (!person.isValid) return done(false);
        for (const c of core.catchPlan(Math.random)) deliver(chest, new ItemStack(c.typeId, c.amount), dim, spot.stand);
        done(true);
      });
    },
  };
}

/**
 * The rancher: stands by the nearest woolly sheep and shears the pen one
 * sheep at a time. The sheep is marked shorn by its own event first (the
 * game then regrows the wool when it eats grass, as after a player's
 * shears), and its wool goes to the chest in the same step.
 */
function ranchJob(dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  const plan = core.shearPlan(flockOf(dim, record, core.RANCH_RANGE), record);
  const first = plan[0];
  if (!first) return undefined;
  return {
    spot: blockOf(core.standingSpot(first.pos, record)),
    work(done) {
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
      pace(core.TICKS_PER_SHEEP, steps, () => done(person.isValid));
    },
  };
}

// ---------------------------------------------------------------------------
// The furfolk's trades (docs/design/furfolk.md §5)
// ---------------------------------------------------------------------------

/** The forager: picks each ripe bush back to its unripe state, the berries to the chest. The bush stands and regrows. */
function forageJob(dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  const level = volumeAround(record, core.FARM_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  const plan = core.foragePlan(stateBlocks(blocksOf(dim, level, [core.BERRY_BUSH]), core.BERRY_STATE), record);
  const first = plan[0];
  if (!first) return undefined;
  return {
    spot: blockOf(core.standingSpot(first.pos, record)),
    work(done) {
      const steps = plan.map((b) => () => {
        if (!person.isValid) return false;
        const block = dim.getBlock(b.pos);
        if (!block || block.typeId !== core.BERRY_BUSH || stateNumber(block, core.BERRY_STATE) < core.BERRY_RIPE) return true;
        block.setPermutation(block.permutation.withState(core.BERRY_STATE as never, core.BERRY_PICKED as never));
        deliver(chest, new ItemStack(core.BERRIES, core.berryYield(Math.random)), dim, b.pos);
        return true;
      });
      pace(core.TICKS_PER_BUSH, steps, () => done(true));
    },
  };
}

/**
 * The baker: three wheat from the chest become a loaf, up to eight a cycle,
 * with the oven lit for the duration (an empty, unlit one only; a kid's
 * oven with something in it is left as it is). Wheat is taken before the
 * bread is put, so a chest that empties mid-cycle costs nothing.
 */
function bakeJob(dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  const near = volumeAround(record, core.OVEN_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  const oven = core.nearestOven(stateBlocks(blocksOf(dim, near, core.OVEN_TYPES), core.OVEN_FACING), record);
  if (!oven) return undefined;
  if (core.bakePlan(viewOf(chest.container).slots).loaves === 0) return undefined;
  return {
    spot: blockOf(core.standingSpot(oven.pos, record)),
    work(done) {
      const { loaves } = core.bakePlan(viewOf(chest.container).slots);
      const block = dim.getBlock(oven.pos);
      let lit: string | undefined;
      if (block && core.OVEN_TYPES.includes(block.typeId)) {
        const inv = block.getComponent(BlockComponentTypes.Inventory)?.container;
        const empty = inv !== undefined && inv.isValid && inv.emptySlotsCount === inv.size;
        lit = core.litSwap(block.typeId, empty);
        if (lit) {
          try {
            block.setPermutation(lightOven(block, lit));
          } catch (e) {
            log(`could not light the oven at ${oven.pos.x},${oven.pos.y},${oven.pos.z}: ${e}`);
            lit = undefined;
          }
        }
      }
      const steps = Array.from({ length: loaves }, () => () => {
        if (!person.isValid) return false;
        if (takeItems(chest.container, core.WHEAT, core.WHEAT_PER_LOAF) < core.WHEAT_PER_LOAF) return false; // the chest ran short; what was taken is at most two wheat
        deliver(chest, new ItemStack(core.BREAD, 1), dim, oven.pos);
        return true;
      });
      pace(core.TICKS_PER_LOAF, steps, () => {
        if (lit) {
          const b = dim.getBlock(oven.pos);
          if (b && b.typeId === lit) {
            try {
              b.setPermutation(lightOven(b, core.UNLIT_OF[lit]!));
            } catch (e) {
              log(`could not put the oven out at ${oven.pos.x},${oven.pos.y},${oven.pos.z}: ${e}`);
            }
          }
        }
        done(true);
      });
    },
  };
}

/** The oven's lit (or unlit) twin, facing the same way. */
function lightOven(block: Block, typeId: string): BlockPermutation {
  const facing = block.permutation.getState(core.OVEN_FACING as never);
  return BlockPermutation.resolve(typeId, facing === undefined ? {} : { [core.OVEN_FACING]: facing as string });
}

/** The beekeeper: a glass bottle from the chest, the nearest full hive set back to empty, a honey bottle to the chest. One hive a cycle. */
function beekeepJob(dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  const level = volumeAround(record, core.FARM_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  const hive = core.hivePlan(stateBlocks(blocksOf(dim, level, core.HIVE_TYPES), core.HONEY_STATE), record);
  if (!hive) return undefined;
  if (core.pickItem(viewOf(chest.container).slots, core.GLASS_BOTTLE) === undefined) return undefined;
  return {
    spot: blockOf(core.standingSpot(hive.pos, record)),
    work(done) {
      swing(person, () => {
        if (!person.isValid) return done(false);
        const block = dim.getBlock(hive.pos);
        if (!block || !core.HIVE_TYPES.includes(block.typeId) || stateNumber(block, core.HONEY_STATE) < core.HONEY_FULL) return done(true);
        if (takeItems(chest.container, core.GLASS_BOTTLE, 1) < 1) return done(true);
        block.setPermutation(block.permutation.withState(core.HONEY_STATE as never, 0 as never));
        deliver(chest, new ItemStack(core.HONEY_BOTTLE, 1), dim, hive.pos);
        done(true);
      });
    },
  };
}

/** The cactus cutter: every block above a column's base, top down, one cactus item each. The base regrows the column. */
function cutJob(dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  const level = volumeAround(record, core.FARM_RANGE, core.SURVEY_BELOW, core.SURVEY_BELOW);
  const plan = core.cutPlan(blocksOf(dim, level, [core.CACTUS]).map((b) => ({ x: b.x, y: b.y, z: b.z })), record);
  const first = plan[0];
  if (!first) return undefined;
  return {
    spot: blockOf(core.standingSpot({ x: first.x, y: first.y - 1, z: first.z }, record)),
    work(done) {
      const steps = plan.map((c) => () => {
        if (!person.isValid) return false;
        const block = dim.getBlock(c);
        if (!block || block.typeId !== core.CACTUS) return true;
        if (dim.getBlock({ x: c.x, y: c.y + 1, z: c.z })?.typeId === core.CACTUS) return true; // something grew back above; leave the column
        block.setType("minecraft:air");
        deliver(chest, new ItemStack(core.CACTUS, 1), dim, c);
        return true;
      });
      pace(core.TICKS_PER_CUT, steps, () => done(true));
    },
  };
}

/** The mushroom picker: the nearest mushrooms on mycelium, a cycle's worth, four always left to spread from. */
function pickJob(dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  const plan = core.pickPlan(mushroomsOf(dim, record, core.FARM_RANGE), record);
  const first = plan[0];
  if (!first) return undefined;
  return {
    spot: blockOf(core.standingSpot(first, record)),
    work(done) {
      const steps = plan.map((m) => () => {
        if (!person.isValid) return false;
        const block = dim.getBlock(m);
        if (!block || !core.MUSHROOM_TYPES.includes(block.typeId)) return true;
        const typeId = block.typeId;
        block.setType("minecraft:air");
        deliver(chest, new ItemStack(typeId, 1), dim, m);
        return true;
      });
      pace(core.TICKS_PER_MUSHROOM, steps, () => done(true));
    },
  };
}

/** The cocoa picker: each ripe pod harvested and replanted from its own beans, the farmer's tile rule, on the pod's log. */
function cocoaJob(dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  const wide = volumeAround(record, core.FARM_RANGE, core.SURVEY_BELOW, core.SURVEY_ABOVE);
  const crop = cropOf(core.COCOA_POD);
  if (!crop) return undefined;
  const plan = core.cocoaPlan(stateBlocks(blocksOf(dim, wide, [core.COCOA_POD]), crop.ageState), record);
  const first = plan[0];
  if (!first) return undefined;
  return {
    spot: blockOf(core.standingSpot(first.pos, record)),
    work(done) {
      const steps = plan.map((p) => () => {
        if (!person.isValid) return false;
        const block = dim.getBlock(p.pos);
        if (!block || block.typeId !== core.COCOA_POD) return true;
        try {
          harvestTile(dim, block, chest);
        } catch (e) {
          log(`cocoa at ${p.pos.x},${p.pos.y},${p.pos.z} failed: ${e}`);
        }
        return true;
      });
      pace(core.TICKS_PER_CROP, steps, () => done(true));
    },
  };
}

/** The gleaner: stands at the hedge for a while, and an apple per eight leaves (up to four) appears in the chest. No leaf is touched. */
function gleanJob(dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  const leaves = hedgeOf(dim, record, core.FARM_RANGE).map((b) => ({ pos: { x: b.x, y: b.y, z: b.z } }));
  const apples = core.gleanPlan(leaves.length);
  const nearest = core.nearestOf(leaves, record);
  if (apples === 0 || !nearest) return undefined;
  return {
    spot: blockOf(core.standingSpot(nearest.pos, record)),
    work(done) {
      swing(person, () => {
        if (!person.isValid) return done(false);
        deliver(chest, new ItemStack(core.APPLE, apples), dim, nearest.pos);
        done(true);
      });
    },
  };
}

function jobFor(trade: number, dim: Dimension, record: PostRecord, person: Entity, chest: Chest): Job | undefined {
  switch (trade) {
    case core.LUMBERJACK: return fellJob(dim, record, person, chest);
    case core.FARMER: return farmJob(dim, record, person, chest);
    case core.MINER: return mineJob(dim, record, person, chest);
    case core.FISHER: return fishJob(dim, record, person, chest);
    case core.RANCHER: return ranchJob(dim, record, person, chest);
    case core.FORAGER: return forageJob(dim, record, person, chest);
    case core.BAKER: return bakeJob(dim, record, person, chest);
    case core.BEEKEEPER: return beekeepJob(dim, record, person, chest);
    case core.CUTTER: return cutJob(dim, record, person, chest);
    case core.PICKER: return pickJob(dim, record, person, chest);
    case core.COCOA: return cocoaJob(dim, record, person, chest);
    case core.GLEANER: return gleanJob(dim, record, person, chest);
    default: return undefined;
  }
}

// ---------------------------------------------------------------------------
// The post's call
// ---------------------------------------------------------------------------

/**
 * Called by the post each block tick while its person is present. Surveys
 * when due, then starts a cycle when one is due and the chest allows it:
 * walk out, work, walk home.
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
    waitOnce(k, record, `waits: ${verdict.kind === "wait" ? verdict.reason : "no chest"}`);
    idleUntil.set(k, now + core.IDLE_TICKS);
    return;
  }
  const job = jobFor(record.trade, dim, record, person, chest);
  if (!job) {
    waitOnce(k, record, "found nothing to do");
    idleUntil.set(k, now + core.IDLE_TICKS);
    return;
  }
  lastWait.delete(k);
  if (!walk.canStart(record)) {
    idleUntil.set(k, now + core.WALK_RETRY_TICKS); // a neighbour is on the road; wait for them
    return;
  }

  busy.add(k);
  const home = blockOf(spawnSpot(record));
  const finish = (worked: boolean): void => {
    busy.delete(k);
    if (!worked) {
      idleUntil.set(k, now + core.WALK_RETRY_TICKS);
      return;
    }
    payWage(chest, record.trade);
    storage.update(record, (row) => void (row.cycleAt = system.currentTick));
  };
  const goHome = (worked: boolean): void => {
    walk.walk(dim, person, home, (arrived) => {
      if (!arrived) {
        // The last resort: nobody is left out in the dark for good.
        try {
          if (person.isValid) person.teleport(spawnSpot(record));
        } catch (e) {
          log(`could not bring the worker home: ${e}`);
        }
      }
      finish(worked);
    });
  };
  walk.walk(dim, person, job.spot, (arrived) => {
    if (!arrived) return goHome(false);
    setWorking(person, true);
    try {
      job.work((worked) => {
        setWorking(person, false);
        goHome(worked);
      });
    } catch (e) {
      log(`work at ${record.x},${record.y},${record.z} failed: ${e}`);
      setWorking(person, false);
      goHome(false);
    }
  });
}

/** For the debug listing. */
export function status(record: PostRecord): string {
  const k = core.key(record);
  if (busy.has(k)) return "working";
  if ((idleUntil.get(k) ?? 0) > system.currentTick) return "idle";
  return "";
}
