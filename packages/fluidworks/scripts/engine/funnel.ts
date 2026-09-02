import {
  BlockComponentTypes,
  EntityComponentTypes,
  ItemStack,
  system,
  world,
  type Block,
  type Container,
  type Dimension,
} from "@minecraft/server";
import { cropOf, withholdSeed, type Drop } from "@qol/shared/core/crops";
import { CAULDRON_RULES } from "@qol/shared/core/fluids";
import {
  applyCauldron,
  buildOutput,
  planCauldronPermutation,
  writeCauldron,
} from "@qol/shared/engine/cauldron";
import { safeGetBlock } from "@qol/shared/engine/safeBlock";
import { inputOf, outputOf, parseFacing } from "../core/facing";
import { plan, type Endpoint, type Plan } from "../core/machine";
import { FUNNEL } from "../core/pipes";
import type { Settings } from "../core/policy";
import { describeBlock, isOpenSky } from "./endpoints";
import { funnels, type FunnelRow } from "./index";
import * as labels from "./labels";
import { resolveThroughPipes } from "./network";
import { isRaining } from "./weather";

type Log = (...parts: unknown[]) => void;

/** An idle funnel is looked at again after this many cycles. */
const IDLE_CYCLES = 5;
/** Funnels handled between yields. */
const BATCH = 4;

/**
 * One pass over every funnel, as a job so a large factory spreads over ticks.
 *
 * Every funnel is planned and executed independently; a throw in one is logged
 * and the pass continues. The plan is pure and the execution below applies it
 * in an order chosen so that any failure leaves items in the source, never on
 * the floor beside a credited output.
 */
export function* cycle(settings: Settings, log: Log): Generator<void> {
  const now = system.currentTick;
  let n = 0;
  for (const row of [...funnels.all()]) {
    if (row.sleepUntil > now) continue;
    try {
      step(row, settings, now, log);
    } catch (e) {
      log(`funnel ${row.x},${row.y},${row.z} failed: ${e}`);
    }
    if (++n % BATCH === 0) yield;
  }
  labels.sync(settings.labels);
}

function step(row: FunnelRow, settings: Settings, now: number, log: Log): void {
  const dim = world.getDimension(row.dimId);
  const block = safeGetBlock(dim, row);
  if (!block || !block.isValid) return; // unloaded: keep the row, skip this pass

  let facing;
  try {
    if (block.typeId !== FUNNEL) {
      // Pistons, explosions and /fill do not tell us. Evict on sight.
      funnels.remove(row);
      return;
    }
    facing = parseFacing(
      block.permutation.getState("minecraft:facing_direction"),
    );
  } catch {
    return;
  }
  if (!facing) return;

  const mouth = inputOf(row, facing);
  const inRes = resolveThroughPipes(dim, row, mouth, settings.pipes);
  const outRes = resolveThroughPipes(
    dim,
    row,
    outputOf(row, facing),
    settings.pipes,
  );
  const inBlock = inRes.block;
  const outBlock = outRes.block;
  const output = describeBlock(outBlock);
  // Only the block directly at the mouth can be "open"; a pipe run never is.
  const input: Endpoint = inRes.viaPipes
    ? describeBlock(inBlock)
    : describeBlock(inBlock, inBlock?.isAir === true && isOpenSky(dim, mouth));

  if (output.kind === "cauldron" && outBlock)
    labels.want(dim, outRes.pos, output.state);
  if (input.kind === "cauldron" && inBlock)
    labels.want(dim, inRes.pos, input.state);

  const p = plan(
    input,
    output,
    { raining: isRaining(row.dimId), wear: row.wear },
    settings.policy,
    CAULDRON_RULES,
  );
  if (p.kind === "idle") {
    row.sleepUntil = now + settings.cycleTicks * IDLE_CYCLES;
    return;
  }
  execute(p, row, dim, inBlock!, outBlock!, input, mouth, log);
  drip(dim, row, facing);
}

const DRIP_PARTICLE = "fluidworks:drip";

/** Working is visible: a few drops at the spout on every completed operation. */
function drip(
  dim: Dimension,
  row: FunnelRow,
  facing: NonNullable<ReturnType<typeof parseFacing>>,
): void {
  const spout = outputOf(row, facing);
  const at = {
    x: (row.x + spout.x) / 2 + 0.5,
    y: (row.y + spout.y) / 2 + 0.5,
    z: (row.z + spout.z) / 2 + 0.5,
  };
  try {
    dim.spawnParticle(DRIP_PARTICLE, at);
  } catch {
    /* particle spawn is cosmetic; never let it fail the cycle */
  }
}

function execute(
  p: Plan,
  row: FunnelRow,
  dim: Dimension,
  inBlock: Block,
  outBlock: Block,
  input: Endpoint,
  mouth: { x: number; y: number; z: number },
  log: Log,
): void {
  switch (p.kind) {
    case "harvest": {
      harvest(inBlock, outBlock, dim, log);
      return;
    }
    case "collect": {
      collect(mouth, outBlock, dim, log);
      return;
    }
    case "fill": {
      writeCauldron(outBlock, p.dest);
      dim.playSound(p.sound, outBlock.center());
      return;
    }
    case "move": {
      if (input.kind !== "cauldron") return;
      writeCauldron(inBlock, p.src);
      try {
        writeCauldron(outBlock, p.dest);
      } catch (e) {
        writeCauldron(inBlock, input.state); // exact compensation
        throw e;
      }
      return;
    }
    case "process": {
      const source = inBlock.getComponent(
        BlockComponentTypes.Inventory,
      )?.container;
      if (!source || !source.isValid) return;
      const stack = source.getItem(p.slot);
      if (!stack) return; // changed since it was described; next pass will see it

      // Plan the permutation first: an illegal state throws before any mutation.
      const permutation = planCauldronPermutation(p.cauldron);

      // 1. Consume one item from the source.
      const remaining = stack.amount > 1 ? stack.clone() : undefined;
      if (remaining) remaining.amount = stack.amount - 1;
      source.setItem(p.slot, remaining);

      // 2. The tank. On failure, put the item back exactly where it was.
      try {
        applyCauldron(outBlock, p.cauldron, permutation, p.result.effects);
      } catch (e) {
        source.setItem(p.slot, stack);
        throw e;
      }

      // 3. The output. Produced after the input is gone, so it can never dupe;
      //    delivered with a drop as the last resort, so it can never vanish.
      const single = stack.clone();
      single.amount = 1;
      const out = buildOutput(p.result.output, single);
      if (out) deliver(out, outBlock, source, dim, log);

      funnels.update(row, (r) => {
        r.wear = p.wear;
      });
      if (p.result.sound) dim.playSound(p.result.sound, outBlock.center());
      return;
    }
    default:
      return;
  }
}

/**
 * Harvest the crop at the mouth into the container at the spout, replanting
 * from its own drops. Same drops, same seeds as breaking it by hand: loot
 * comes from the engine's own table, one seed is withheld to replant, and a
 * roll with no seed leaves the tile bare exactly as a hand would.
 */
function harvest(
  cropBlock: Block,
  outBlock: Block,
  dim: Dimension,
  log: Log,
): void {
  const crop = cropOf(cropBlock.typeId);
  const target = outBlock.getComponent(
    BlockComponentTypes.Inventory,
  )?.container;
  if (!crop || !target || !target.isValid) return;

  const loot =
    world.getLootTableManager().generateLootFromBlock(cropBlock) ?? [];
  const drops: Drop[] = loot.map((s) => ({
    typeId: s.typeId,
    amount: s.amount,
  }));
  const { drops: kept, replant } = withholdSeed(drops, crop);

  // Replant (or clear) first, then deliver: a failure between the two leaves
  // the crop harvested and the drops in the loot list, never duplicated.
  const kept_states: Record<string, string | number | boolean> = {};
  for (const name of crop.keepStates ?? []) {
    const v = cropBlock.permutation.getState(name as never);
    if (v !== undefined) kept_states[name] = v;
  }
  if (replant) {
    let perm = cropBlock.permutation.withState(
      crop.ageState as never,
      0 as never,
    );
    for (const [name, v] of Object.entries(kept_states))
      perm = perm.withState(name as never, v as never);
    cropBlock.setPermutation(perm);
  } else {
    cropBlock.setType("minecraft:air");
  }

  const above = outBlock.center();
  for (const d of kept) {
    let leftover: ItemStack | undefined = new ItemStack(d.typeId, d.amount);
    try {
      leftover = target.addItem(leftover);
    } catch (e) {
      log(`harvest deliver failed: ${e}`);
    }
    if (leftover)
      dim.spawnItem(leftover, { x: above.x, y: above.y + 0.8, z: above.z });
  }
  dim.playSound("block.sweet_berry_bush.pick", cropBlock.center());
}

/** Radius around the mouth in which dropped items are pulled in. */
const COLLECT_RADIUS = 2.5;

/**
 * Pull dropped items near the mouth into the container at the spout. An
 * item entity is only removed once the container has taken all of it; a
 * partial fit re-drops the remainder in its place, so nothing is lost.
 */
function collect(
  mouth: { x: number; y: number; z: number },
  outBlock: Block,
  dim: Dimension,
  log: Log,
): void {
  const target = outBlock.getComponent(
    BlockComponentTypes.Inventory,
  )?.container;
  if (!target || !target.isValid) return;
  const center = { x: mouth.x + 0.5, y: mouth.y + 0.5, z: mouth.z + 0.5 };
  let entities;
  try {
    entities = dim.getEntities({
      type: "minecraft:item",
      location: center,
      maxDistance: COLLECT_RADIUS,
    });
  } catch {
    return;
  }
  for (const e of entities) {
    try {
      const stack = e.getComponent(EntityComponentTypes.Item)?.itemStack;
      if (!stack) continue;
      const leftover = target.addItem(stack);
      if (leftover && leftover.amount === stack.amount) continue; // nothing fitted
      const at = e.location;
      e.remove();
      if (leftover) dim.spawnItem(leftover, at);
    } catch (err) {
      log(`collect failed: ${err}`);
    }
  }
}

/**
 * Products leave the tank through its bottom: into a container directly below
 * the cauldron. Failing that, back into the source (so an empty bucket returns
 * to the hopper that fed it), and failing that, dropped on top of the tank.
 */
function deliver(
  item: ItemStack,
  cauldron: Block,
  source: Container,
  dim: Dimension,
  log: Log,
): void {
  let leftover: ItemStack | undefined = item;
  try {
    const below = cauldron
      .below()
      ?.getComponent(BlockComponentTypes.Inventory)?.container;
    if (below && below.isValid) leftover = below.addItem(leftover);
  } catch (e) {
    log(`deliver below failed: ${e}`);
  }
  if (!leftover) return;
  try {
    leftover = source.addItem(leftover);
  } catch (e) {
    log(`deliver to source failed: ${e}`);
  }
  if (!leftover) return;
  const c = cauldron.center();
  dim.spawnItem(leftover, { x: c.x, y: c.y + 0.8, z: c.z });
}
