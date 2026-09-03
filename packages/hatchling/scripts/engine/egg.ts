/**
 * The egg: placed from its item, warmed by hand, hatched into a hatchling.
 *
 * Placement is the item's custom component (`hatchling:egg_item`, onUseOn):
 * an egg goes on top of the block it was used on, as a spawn egg would put a
 * mob there, and the item is consumed. Warming and pick-up are the
 * `playerInteractWithEntity` before-event: the decision is made there, from
 * `core/rules`, and the mutation runs on the next tick because a before-event
 * may not change the world.
 *
 * Hatching is an entity event, `hatchling:hatch`, and the pack acts on it
 * from `dataDrivenEntityTrigger` rather than from the interaction that caused
 * it. That is what lets the probe pack and the GameTests hatch an egg with
 * `triggerEvent` and exercise the same path a warming does: spawn the
 * hatchling, then remove the egg, in that order, so a failed spawn leaves the
 * egg where it was.
 */
import {
  Direction,
  ItemStack,
  Player,
  system,
  world,
  type Entity,
  type ItemComponentUseOnEvent,
  type ItemCustomComponent,
} from "@minecraft/server";
import {
  describeWait,
  variantById,
  variantOfEggItem,
  warm,
  type EggState,
  type Variant,
} from "../core/rules";
import * as settings from "./settings";
import { consumeOne, EGG, intProperty, numberProperty, PET, puff, tell } from "./tend";

export const ITEM_COMPONENT = "hatchling:egg_item";

/** Dynamic properties on the egg entity. */
const K_WARMINGS = "hatchling:warmings";
const K_LAST_WARM = "hatchling:last_warm";
const K_HATCH_SCHEDULED = "hatchling:hatch_scheduled";

/** Ticks between the hatch event and the hatchling appearing: the animation's length. */
export const HATCH_TICKS = 24;

type Log = (...parts: unknown[]) => void;
let log: Log = () => {};

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export const eggItemComponent: ItemCustomComponent = {
  onUseOn(ev: ItemComponentUseOnEvent): void {
    const player = ev.source;
    if (!(player instanceof Player)) return;
    const variant = variantOfEggItem(ev.itemStack.typeId);
    if (!variant) return;
    if (ev.blockFace !== Direction.Up) {
      tell(player, "Put the egg down on top of a block.");
      return;
    }
    const b = ev.block;
    const at = { x: b.x + 0.5, y: b.y + 1, z: b.z + 0.5 };
    const itemId = ev.itemStack.typeId;
    system.run(() => {
      try {
        const egg = b.dimension.spawnEntity(EGG, at, {
          spawnEvent: `hatchling:variant_${variant.id}`,
        });
        egg.setDynamicProperty(K_WARMINGS, 0);
        // Spawned before it is consumed: a failed spawn costs nothing.
        consumeOne(player, itemId);
        tell(player, `An ${variant.name.toLowerCase()} egg. Warm it with ${variant.warmItemName}.`);
      } catch (e) {
        log(`egg placement failed at ${at.x},${at.y},${at.z}: ${e}`);
      }
    });
  },
};

// ---------------------------------------------------------------------------
// Warming and pick-up
// ---------------------------------------------------------------------------

export function readEgg(egg: Entity): EggState {
  return {
    variant: intProperty(egg, "hatchling:variant", 0) as Variant,
    warmings: numberProperty(egg, K_WARMINGS) ?? 0,
    lastWarmAt: numberProperty(egg, K_LAST_WARM),
  };
}

function pickUp(egg: Entity, player: Player): void {
  if (!egg.isValid) return;
  const state = readEgg(egg);
  const variant = variantById(state.variant);
  if (!variant) return;
  const stack = new ItemStack(variant.eggItem, 1);
  // Give first, then remove: an egg that cannot be given back stays put.
  try {
    const container = player.getComponent("minecraft:inventory")?.container;
    const leftover = container?.addItem(stack);
    if (leftover) egg.dimension.spawnItem(leftover, player.location);
  } catch (e) {
    log(`could not return the egg to ${player.name}: ${e}`);
    return;
  }
  egg.remove();
  tell(player, state.warmings > 0 ? "Picked up. The warmth is lost." : "Picked up.");
}

function applyWarming(egg: Entity, player: Player, itemId: string, now: number): void {
  if (!egg.isValid) return;
  const state = readEgg(egg);
  const outcome = warm(state, itemId, now, settings.policy());
  if (outcome.kind === "not_warm_item" || outcome.kind === "cooldown") return;
  // Consume before the egg changes: consumption can fail (hand switched), the
  // egg's own writes cannot.
  if (!consumeOne(player, itemId)) return;
  egg.setDynamicProperty(K_LAST_WARM, now);
  if (outcome.kind === "hatch") {
    egg.setDynamicProperty(K_WARMINGS, state.warmings + 1);
    egg.triggerEvent("hatchling:hatch");
    tell(player, "It's hatching!");
    return;
  }
  egg.setDynamicProperty(K_WARMINGS, outcome.warmings);
  egg.triggerEvent(`hatchling:crack_${outcome.cracks}`);
  puff(egg, "minecraft:crop_growth_emitter", log);
  const toGo = settings.policy().warmingsToHatch - outcome.warmings;
  tell(player, toGo === 1 ? "The shell is cracking. One more warming." : `Warmer. ${toGo} more warmings.`);
}

// ---------------------------------------------------------------------------
// Hatching
// ---------------------------------------------------------------------------

function hatch(egg: Entity): void {
  if (!egg.isValid) return;
  const state = readEgg(egg);
  const at = egg.location;
  let pet: Entity;
  try {
    pet = egg.dimension.spawnEntity(PET, at, {
      spawnEvent: `hatchling:variant_${state.variant}`,
    });
  } catch (e) {
    // Fail towards the player: the egg stays, un-hatched, and can be warmed again.
    log(`hatch spawn failed at ${at.x},${at.y},${at.z}: ${e}`);
    egg.setDynamicProperty(K_HATCH_SCHEDULED, undefined);
    egg.setDynamicProperty(K_WARMINGS, Math.max(0, state.warmings - 1));
    egg.setProperty("hatchling:hatching", false);
    return;
  }
  puff(egg, "minecraft:egg_destroy_emitter", log);
  egg.remove();
  log(`hatched a ${variantById(state.variant)?.key ?? state.variant} hatchling (${pet.id})`);
}

export function install(logger: Log): void {
  log = logger;

  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.target.typeId !== EGG) return;
    const egg = ev.target;
    const player = ev.player;
    const held = ev.itemStack?.typeId;

    if (player.isSneaking && held === undefined) {
      ev.cancel = true;
      system.run(() => pickUp(egg, player));
      return;
    }

    const now = Date.now();
    const outcome = warm(readEgg(egg), held, now, settings.policy());
    switch (outcome.kind) {
      case "not_warm_item":
        system.run(() => tell(player, `Warm it with ${outcome.wants}. Sneak to pick it up.`));
        return;
      case "cooldown":
        ev.cancel = true;
        system.run(() => tell(player, `Still warm. Try again in ${describeWait(outcome.remainingMs)}.`));
        return;
      default:
        ev.cancel = true;
        system.run(() => applyWarming(egg, player, held!, now));
    }
  });

  world.afterEvents.dataDrivenEntityTrigger.subscribe(
    (ev) => {
      const egg = ev.entity;
      if (!egg.isValid || egg.typeId !== EGG) return;
      if (egg.getDynamicProperty(K_HATCH_SCHEDULED) === true) return;
      egg.setDynamicProperty(K_HATCH_SCHEDULED, true);
      system.runTimeout(() => hatch(egg), HATCH_TICKS);
    },
    { entityTypes: [EGG], eventTypes: ["hatchling:hatch"] },
  );

  // An egg that was mid-hatch when the world closed: finish the job on load.
  world.afterEvents.entityLoad.subscribe((ev) => {
    const egg = ev.entity;
    if (egg.typeId !== EGG) return;
    if (egg.getProperty("hatchling:hatching") === true) system.runTimeout(() => hatch(egg), HATCH_TICKS);
  });
}
