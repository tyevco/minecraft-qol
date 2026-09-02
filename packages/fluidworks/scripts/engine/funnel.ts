import {
  BlockComponentTypes,
  ItemStack,
  system,
  world,
  type Block,
  type Container,
  type Dimension,
} from "@minecraft/server";
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

  const inBlock = safeGetBlock(dim, inputOf(row, facing));
  const outBlock = safeGetBlock(dim, outputOf(row, facing));
  const output = describeBlock(outBlock);
  const input: Endpoint =
    facing === "down" && inBlock?.isAir && isOpenSky(dim, row)
      ? { kind: "sky" }
      : describeBlock(inBlock);

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
  execute(p, row, dim, inBlock!, outBlock!, input, log);
}

function execute(
  p: Plan,
  row: FunnelRow,
  dim: Dimension,
  inBlock: Block,
  outBlock: Block,
  input: Endpoint,
  log: Log,
): void {
  switch (p.kind) {
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
