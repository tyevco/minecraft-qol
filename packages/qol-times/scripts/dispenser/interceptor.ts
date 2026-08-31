import {
  BlockComponentTypes,
  EntityComponentTypes,
  EntityInitializationCause,
  world,
  type Block,
  type Entity,
  type EntitySpawnAfterEvent,
  type ItemStack,
} from "@minecraft/server";
import { ALL_CLAIMED } from "../core/items";
import { RULES, type DispenseResult, type ItemRef } from "../core/rules";
import { isEnabled } from "../settings/store";
import { findSourceDispenser } from "./geometry";
import {
  applyCauldron,
  buildResidue,
  planCauldronPermutation,
  readCauldron,
  readItemColor,
  readPotionEffectId,
} from "./io";
import { proveDispense, registerRig, snapshotContainer, type Slots } from "./rigRegistry";

const CLAIMED = new Set(ALL_CLAIMED);

/**
 * entity.remove() synchronously dispatches entityRemove, so a handler could
 * otherwise observe half-applied state. Script execution is single-threaded on
 * the host, so this guards reentrancy, not concurrency.
 */
let inTransaction = false;

/** Items we are about to delete, so a player cannot grab one first. */
const pendingRemoval = new Set<string>();

let installed = false;

export function install(log: (...parts: unknown[]) => void): void {
  if (installed) return;
  installed = true;

  world.afterEvents.entitySpawn.subscribe((ev) => onItemSpawn(ev, log));

  // Deterministically closes the pickup race instead of relying on timing.
  world.beforeEvents.entityItemPickup.subscribe((ev) => {
    if (pendingRemoval.has(ev.item.id)) ev.cancel = true;
  });
}

function onItemSpawn(ev: EntitySpawnAfterEvent, log: (...parts: unknown[]) => void): void {
  if (inTransaction) return;

  // --- Tier 0: free rejections. Nearly every item spawn in the world exits here.
  let entity: Entity;
  try {
    entity = ev.entity;
  } catch {
    return;
  }
  if (entity.typeId !== "minecraft:item") return;
  // A chunk-load rehydration of a pre-existing item is never a fresh dispense.
  // This is the ONLY discrimination `cause` offers - the enum has no
  // "Dispensed" member, so everything else reports Spawned.
  if (ev.cause === EntityInitializationCause.Loaded) return;
  if (!entity.isValid) return;

  let stack: ItemStack | undefined;
  try {
    stack = entity.getComponent(EntityComponentTypes.Item)?.itemStack;
  } catch {
    return;
  }
  if (!stack || !CLAIMED.has(stack.typeId)) return;

  // A dispenser dispenses exactly ONE item. Without this, a thrown stack of 64
  // glass bottles would convert wholesale for one cauldron's worth of water.
  if (stack.amount !== 1) return;

  // --- Tier 1: exact geometric attribution. Ambiguity fails closed.
  const dim = entity.dimension;
  const source = findSourceDispenser(dim, entity.location);
  if (!source) return;

  // --- Tier 2: the target must admit a legal transition.
  const cauldron = readCauldron(source.target);
  const item: ItemRef = {
    typeId: stack.typeId,
    amount: stack.amount,
    colorRgb: readItemColor(stack),
    potionEffectId: readPotionEffectId(stack),
  };

  let featureId: string | undefined;
  let result: DispenseResult | undefined;
  for (const [id, rule] of Object.entries(RULES)) {
    if (!isEnabled(id)) continue;
    const r = rule({ item, cauldron });
    if (r.kind === "apply") {
      featureId = id;
      result = r;
      break;
    }
  }
  if (!result || result.kind !== "apply" || !featureId) return;

  // --- Tier 3: causal proof. Everything above is circumstantial.
  const now = snapshotContainer(source.dispenser);
  if (!now) return;

  const sourceSlot = proveDispense(dim.id, source.dispenser, stack.typeId, now);
  if (sourceSlot === undefined) {
    // First sighting of this rig: register it and let vanilla have this one.
    // Costs one missed activation per rig, ever, and closes the free-mint hole.
    registerRig(dim.id, source.dispenser);
    return;
  }

  commit(entity, stack, source.dispenser, source.target, result, sourceSlot, now, log);
}

function commit(
  entity: Entity,
  ejected: ItemStack,
  dispenser: Block,
  cauldronBlock: Block,
  result: Extract<DispenseResult, { kind: "apply" }>,
  sourceSlot: number,
  now: Slots,
  log: (...parts: unknown[]) => void,
): void {
  // ---- Plan everything before mutating anything. --------------------------
  // Resolving the permutation here means an illegal state combination throws
  // during planning rather than between two writes.
  const permutation = planCauldronPermutation(result.cauldron);
  const container = dispenser.getComponent(BlockComponentTypes.Inventory)?.container;
  if (!container || !container.isValid) return;

  const residue = buildResidue(result.residue, ejected);

  // Write the residue into the slot the item just left. It is known free, and a
  // fixed index is exactly invertible - unlike addItem, whose placement we
  // could not undo precisely if the cauldron write then failed.
  let residueSlot = sourceSlot;
  if (residue) {
    const occupant = sourceSlot < now.length ? now[sourceSlot] : null;
    if (occupant !== null) {
      const free = container.firstEmptySlot();
      if (free === undefined) return; // nowhere to put it: let vanilla keep the item
      residueSlot = free;
    }
  }

  inTransaction = true;
  pendingRemoval.add(entity.id);
  try {
    // ---- Step 1: removal first. -------------------------------------------
    // It is the step most likely to fail, and the only one whose failure would
    // leave a real item on the floor beside a credited residue - a clean dupe.
    // Measured as SUCCEEDED, but verify rather than assume.
    entity.remove();
    if (entity.isValid) {
      log("removal did not take effect; aborting before any mutation");
      return;
    }

    // ---- Step 2: residue back into the dispenser. -------------------------
    if (residue) container.setItem(residueSlot, residue);

    // ---- Step 3: the cauldron. --------------------------------------------
    try {
      applyCauldron(cauldronBlock, result.cauldron, permutation, result.addDye);
    } catch (e) {
      if (residue) container.setItem(residueSlot, undefined); // exact compensation
      throw e;
    }

    if (result.sound) {
      cauldronBlock.dimension.playSound(result.sound, cauldronBlock.center());
    }
  } catch (e) {
    log(`dispense aborted: ${e}`);
  } finally {
    pendingRemoval.delete(entity.id);
    inTransaction = false;
  }
}
