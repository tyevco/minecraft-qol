/**
 * `/scriptevent hatchling:debug` - what the pack thinks, for the nearest egg
 * and hatchling. Diagnostics only; the panel configures everything.
 */
import { EntityComponentTypes, Player, system, type Entity } from "@minecraft/server";
import {
  cooldownRemaining,
  describePolicy,
  describeWait,
  STAGE_NAMES,
  variantById,
} from "../core/rules";
import { readEgg } from "./egg";
import { readPet } from "./pet";
import * as settings from "./settings";
import { EGG, PET } from "./tend";

const RADIUS = 12;

function nearest(player: Player, type: string): Entity | undefined {
  return player.dimension.getEntities({ type, location: player.location, maxDistance: RADIUS, closest: 1 })[0];
}

export function install(): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "hatchling:debug") return;
    const player = ev.sourceEntity;
    if (!(player instanceof Player)) return;
    const policy = settings.policy();
    const now = Date.now();
    player.sendMessage(`§7panel: §f${describePolicy(policy)}`);

    const egg = nearest(player, EGG);
    if (egg) {
      const s = readEgg(egg);
      const wait = cooldownRemaining(s.lastWarmAt, now, policy.warmCooldownMs);
      player.sendMessage(
        `§7egg: §f${variantById(s.variant)?.key ?? s.variant}§7, warmings ${s.warmings}/${policy.warmingsToHatch}, ` +
          `cracks ${String(egg.getProperty("hatchling:cracks"))}, hatching ${String(egg.getProperty("hatchling:hatching"))}, ` +
          (wait > 0 ? `rest ${describeWait(wait)}` : "ready"),
      );
    } else player.sendMessage(`§7egg: §8none within ${RADIUS}`);

    const pet = nearest(player, PET);
    if (pet) {
      const s = readPet(pet);
      const tameable = pet.getComponent(EntityComponentTypes.Tameable);
      const scale = pet.getComponent(EntityComponentTypes.Scale)?.value;
      const wait = cooldownRemaining(s.lastFedAt, now, policy.feedCooldownMs);
      player.sendMessage(
        `§7hatchling: §f${variantById(Number(pet.getProperty("hatchling:variant")))?.key}§7 ` +
          `${STAGE_NAMES[s.stage]} (scale ${scale ?? "?"}), feedings ${s.feedings}/${policy.feedingsPerStage}, ` +
          `owner ${tameable?.isTamed ? (tameable.tamedToPlayer?.name ?? s.ownerId) : "none (wild)"}, ` +
          (wait > 0 ? `rest ${describeWait(wait)}` : "hungry"),
      );
    } else player.sendMessage(`§7hatchling: §8none within ${RADIUS}`);
  });
}
