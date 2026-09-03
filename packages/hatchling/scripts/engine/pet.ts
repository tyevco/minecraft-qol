/**
 * The hatchling: bonded by vanilla, fed and grown by script.
 *
 * Bonding is `minecraft:tameable` with sweet berries at probability 1.0, and
 * the interaction is left alone so the engine does it: 2.9.0's
 * EntityTameableComponent is read-only, so script could not tame if it
 * wanted to. Once bonded, the same berries are food: each feeding is decided
 * by `core/rules` (owner, rest, stage) in the before-event and applied on the
 * next tick, growing the hatchling a size every `feedingsPerStage` feedings by
 * swapping its stage component group. Anything that is not food is left to
 * the engine, which is how a sitting hatchling is told to sit or stand.
 */
import {
  EntityComponentTypes,
  system,
  world,
  type Entity,
  type Player,
} from "@minecraft/server";
import {
  describeWait,
  feed,
  FOOD,
  FOOD_NAME,
  MAX_STAGE,
  STAGE_NAMES,
  type PetState,
  type Stage,
} from "../core/rules";
import * as settings from "./settings";
import { consumeOne, intProperty, numberProperty, PET, puff, tell } from "./tend";

const K_FEEDINGS = "hatchling:feedings";
const K_LAST_FED = "hatchling:last_fed";
/** Ticks the happy flag stays up: the flap animation's length, plus a little. */
const HAPPY_TICKS = 14;
const HEAL_PER_FEED = 4;

type Log = (...parts: unknown[]) => void;
let log: Log = () => {};

export function readPet(pet: Entity): PetState {
  const tameable = pet.getComponent(EntityComponentTypes.Tameable);
  return {
    stage: intProperty(pet, "hatchling:stage", 0) as Stage,
    feedings: numberProperty(pet, K_FEEDINGS) ?? 0,
    lastFedAt: numberProperty(pet, K_LAST_FED),
    ownerId: tameable?.isTamed ? tameable.tamedToPlayerId : undefined,
  };
}

export function isBonded(pet: Entity): boolean {
  return pet.getComponent(EntityComponentTypes.Tameable)?.isTamed === true;
}

function happy(pet: Entity): void {
  try {
    pet.setProperty("hatchling:happy", true);
    puff(pet, "minecraft:heart_particle", log, 0.8);
    system.runTimeout(() => {
      if (pet.isValid) pet.setProperty("hatchling:happy", false);
    }, HAPPY_TICKS);
  } catch (e) {
    log(`happy flag failed: ${e}`);
  }
}

function heal(pet: Entity): void {
  const health = pet.getComponent(EntityComponentTypes.Health);
  if (!health) return;
  try {
    health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + HEAL_PER_FEED));
  } catch (e) {
    log(`heal failed: ${e}`);
  }
}

function applyFeeding(pet: Entity, player: Player, now: number): void {
  if (!pet.isValid) return;
  const state = readPet(pet);
  const outcome = feed(state, FOOD, player.id, now, settings.policy());
  if (outcome.kind === "not_food" || outcome.kind === "not_owner" || outcome.kind === "cooldown") return;
  if (!consumeOne(player, FOOD)) return;
  pet.setDynamicProperty(K_LAST_FED, now);
  heal(pet);
  happy(pet);
  const name = pet.nameTag || "Your hatchling";
  switch (outcome.kind) {
    case "treat":
      tell(player, `${name} loves it.`);
      return;
    case "fed":
      pet.setDynamicProperty(K_FEEDINGS, outcome.feedings);
      tell(player, `${name} is growing. ${outcome.toGo} more to the next size.`);
      return;
    case "grow":
      pet.setDynamicProperty(K_FEEDINGS, 0);
      pet.triggerEvent(`hatchling:grow_${outcome.stage}`);
      tell(
        player,
        outcome.stage >= MAX_STAGE
          ? `${name} is fully grown!`
          : `${name} grew! Now ${STAGE_NAMES[outcome.stage]}.`,
      );
  }
}

export function install(logger: Log): void {
  log = logger;

  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.target.typeId !== PET) return;
    const pet = ev.target;
    const player = ev.player;
    const held = ev.itemStack?.typeId;

    // Not bonded yet: the engine's tameable handles berries; say so for anything else.
    if (!isBonded(pet)) {
      if (held !== FOOD) system.run(() => tell(player, `Offer it ${FOOD_NAME} to make friends.`));
      return;
    }

    const now = Date.now();
    const outcome = feed(readPet(pet), held, player.id, now, settings.policy());
    switch (outcome.kind) {
      case "not_food":
        // Sit, stand, name tag, lead: all the engine's.
        return;
      case "not_owner": {
        ev.cancel = true;
        const owner = pet.getComponent(EntityComponentTypes.Tameable)?.tamedToPlayer?.name;
        system.run(() => tell(player, owner ? `That is ${owner}'s hatchling.` : "That is someone else's hatchling."));
        return;
      }
      case "cooldown":
        ev.cancel = true;
        system.run(() => tell(player, `Full for now. Try again in ${describeWait(outcome.remainingMs)}.`));
        return;
      default:
        ev.cancel = true;
        system.run(() => applyFeeding(pet, player, now));
    }
  });
}
