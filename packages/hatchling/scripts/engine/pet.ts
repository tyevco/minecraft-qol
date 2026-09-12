/**
 * The hatchling: bonded by vanilla, fed and grown by script.
 *
 * Bonding is `minecraft:tameable` with sweet berries at probability 1.0, and
 * the interaction is left alone so the engine does it - the hatch and the
 * bond being two moments rather than one. (`EntityTameableComponent.tame()`
 * does exist in 2.9.0, unlike what the docs used to say; nothing here needs
 * it.) The pack records WHO bonded it itself (`hatchling:owner`, an entity
 * dynamic property, with the name beside it): the tame event swaps the
 * `hatchling:wild` group away and `minecraft:tameable` with it, so a bonded
 * hatchling has no `tamedToPlayerId` to read (issue #98). The moment is the
 * berry offer's before-event, which carries the player; the record is
 * written on the ticks after, once `minecraft:is_tamed` has appeared.
 * Once bonded, the same berries are food: each feeding is decided
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
import { isPlayer } from "@qol/shared/engine/players";
import * as settings from "./settings";
import { consumeOne, intProperty, numberProperty, PET, puff, stringProperty, tell } from "./tend";

const K_FEEDINGS = "hatchling:feedings";
const K_LAST_FED = "hatchling:last_fed";
/** The bonded player's id, recorded by the pack at the bond (issue #98). */
export const K_OWNER = "hatchling:owner";
/** The bonded player's name at the bond, for "That is X's hatchling" while X is away. */
export const K_OWNER_NAME = "hatchling:owner_name";
/** Ticks after a berry offer during which the bond is looked for, one check a tick. */
const BOND_WATCH_TICKS = 10;
/** Ticks the happy flag stays up: the flap animation's length, plus a little. */
const HAPPY_TICKS = 14;
const HEAL_PER_FEED = 4;

type Log = (...parts: unknown[]) => void;
let log: Log = () => {};

export function readPet(pet: Entity): PetState {
  // The pack's own record first: the tameable component leaves with the wild
  // group at the bond (see `isBonded`), so `tamedToPlayerId` is only a
  // fallback for an engine build where it survives. A bonded hatchling with
  // neither - one bonded before the pack recorded owners - reads as nobody's
  // in particular, and `feed` lets anyone tend it.
  const tameable = pet.getComponent(EntityComponentTypes.Tameable);
  return {
    stage: intProperty(pet, "hatchling:stage", 0) as Stage,
    feedings: numberProperty(pet, K_FEEDINGS) ?? 0,
    lastFedAt: numberProperty(pet, K_LAST_FED),
    ownerId: stringProperty(pet, K_OWNER) ?? (tameable?.isTamed ? tameable.tamedToPlayerId : undefined),
  };
}

/** The recorded owner's name: the player if online, else the name written at the bond. */
export function ownerName(pet: Entity): string | undefined {
  const id = readPet(pet).ownerId;
  if (id === undefined) return undefined;
  try {
    const online = world.getEntity(id);
    if (isPlayer(online)) return online.name;
  } catch {
    /* not in the world */
  }
  return stringProperty(pet, K_OWNER_NAME) ?? pet.getComponent(EntityComponentTypes.Tameable)?.tamedToPlayer?.name;
}

/**
 * A berry offer to a wild hatchling is about to reach the engine: watch the
 * next few ticks for the bond, and write the offerer down as the owner the
 * moment `minecraft:is_tamed` appears. Ten ticks is generous - the tame is
 * applied with the interaction, so the first check should see it - and an
 * offer that did not land (the reach missed) simply records nothing.
 */
function recordOwnerOnBond(pet: Entity, player: Player): void {
  let ticks = 0;
  const check = (): void => {
    if (!pet.isValid || !player.isValid) return;
    if (isBonded(pet)) {
      if (stringProperty(pet, K_OWNER) !== undefined) return; // somebody else's already
      try {
        pet.setDynamicProperty(K_OWNER, player.id);
        pet.setDynamicProperty(K_OWNER_NAME, player.name);
        log(`${pet.nameTag || "a hatchling"} bonded to ${player.name} (${player.id})`);
      } catch (e) {
        log(`could not record the owner: ${e}`);
      }
      return;
    }
    if (++ticks < BOND_WATCH_TICKS) system.run(check);
  };
  system.run(check);
}

/**
 * Bonded, i.e. somebody's hatchling rather than a wild one.
 *
 * Read from the `minecraft:is_tamed` MARKER, not from the tameable component:
 * `hatchling:on_tame` removes the `hatchling:wild` group, and
 * `minecraft:tameable` is inside it, so a bonded hatchling has no tameable
 * component at all. Measured in the suite (`hatchling_tames_with_berries`):
 * tameable=true / is_tamed=false before the berries, tameable=false /
 * is_tamed=true after. Asking the tameable component said "still wild" for
 * every bonded hatchling, which is what stopped feeding - and so growth -
 * working once it was somebody's.
 *
 * The tameable component is still consulted, for the case where it survives
 * the swap on some future engine build.
 */
export function isBonded(pet: Entity): boolean {
  return (
    pet.getComponent(EntityComponentTypes.IsTamed) !== undefined ||
    pet.getComponent(EntityComponentTypes.Tameable)?.isTamed === true
  );
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
    // A SimulatedPlayer marshals as undefined into this event on a headless
    // server (docs/README.md corrections); the engine still tames for it,
    // there is just nobody to write down or talk to. Said once per offer
    // so a headless run shows why a bond went unrecorded.
    if (!isPlayer(player)) {
      if (!isBonded(pet)) log(`an offer of ${held ?? "nothing"} to a wild hatchling from no player (${player === undefined ? "undefined" : typeof player}); a bond would go unrecorded`);
      return;
    }

    // Not bonded yet: the engine's tameable handles berries, and the pack
    // writes down who offered them; say so for anything else.
    if (!isBonded(pet)) {
      if (held === FOOD) recordOwnerOnBond(pet, player);
      else system.run(() => tell(player, `Offer it ${FOOD_NAME} to make friends.`));
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
        const owner = ownerName(pet);
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
