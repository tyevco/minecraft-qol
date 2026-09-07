/**
 * The pet shield: the deaths a player did not choose, for the animals they
 * bonded with.
 *
 * A second subscription to `entityHurt` rather than a wider filter on the
 * player one: the player handler is filtered to `minecraft:player` in the
 * engine, which is what keeps every mob fight out of script, and that filter
 * is worth keeping. This one is filtered to the causes the pet rules can act
 * on (`PET_CAUSES`), and its first line is a boolean read of the panel, so
 * with the pet switches off it costs nothing.
 *
 * What counts as a pet: the `minecraft:is_tamed` marker, or a `tameable`
 * component that says it is tamed. The marker has to come first, because for
 * a hatchling it is the ONLY one - `hatchling:on_tame` removes the group that
 * holds `minecraft:tameable`, so a bonded hatchling has no tameable component
 * to ask (measured in the GameTest suite; see the hatchling pack README).
 * Vanilla pets carry the marker too.
 *
 * A wild mob is never touched, and neither is a hostile mob's blow: see
 * `decidePet`.
 */
import {
  Entity,
  EntityComponentTypes,
  Player,
  world,
  type EntityDamageCause,
} from "@minecraft/server";
import { decidePet, PET_CAUSES, type PetVerdict } from "../core/rules";
import { policy } from "./settings";

type Log = (...parts: unknown[]) => void;

/** Somebody's pet, rather than a wild animal. */
export function isOwnedPet(entity: Entity): boolean {
  if (entity.getComponent(EntityComponentTypes.IsTamed) !== undefined) return true;
  const tameable = entity.getComponent(EntityComponentTypes.Tameable);
  return tameable?.isTamed === true;
}

/** The verdict for one hit on one pet, for the shield and for `guardian:debug`. */
export function verdictFor(cause: string, byPlayer: boolean): PetVerdict {
  return decidePet(cause, byPlayer, policy());
}

export function install(log: Log): void {
  world.beforeEvents.entityHurt.subscribe(
    (ev) => {
      const pets = policy().pets;
      if (!pets.hazards && !pets.fromPlayers) return;

      const pet = ev.hurtEntity;
      // Two things are not a pet, and one of them is not even an object: a
      // SimulatedPlayer marshals as `undefined` into every pack that does not
      // bind @minecraft/server-gametest (issue #31), and reading a component
      // off it threw twice in a headless suite run before this line existed.
      // Players proper are the other subscription's business - theirs is a
      // table, not a switch, and running both over one hit would double-count
      // it.
      if (!(pet instanceof Entity) || pet instanceof Player) return;

      try {
        if (!isOwnedPet(pet)) return;
        const byPlayer = ev.damageSource.damagingEntity instanceof Player;
        if (verdictFor(ev.damageSource.cause, byPlayer).kind === "immune") ev.cancel = true;
      } catch (e) {
        // As in the player handler: a throw leaves the hit exactly as the
        // engine proposed it, which is vanilla - the safe failure.
        log(`pet shield failed: ${e}`);
      }
    },
    { allowedDamageCauses: PET_CAUSES as unknown as EntityDamageCause[] },
  );
}
