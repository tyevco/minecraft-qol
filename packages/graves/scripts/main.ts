/**
 * Graves - per-player item preservation on death.
 *
 * Some players on a family realm find dying frustrating; others want the
 * vanilla stakes. So this is chosen per player, not per world:
 *
 *   /graves:mode off|grave|keep     your own setting
 *   /graves:admin <player> <mode>   an operator sets someone else's
 *   /graves:lock on|off             stop non-operators changing their own
 *   /graves:list                    where your gravestones are
 *
 * The substrate is `ItemStack.keepOnDeath`, a stable flag the engine honours:
 * a flagged stack never drops. A sweep keeps every carried stack flagged to
 * match its carrier's mode. `keep` is nothing more than that. `grave` adds one
 * step at death: with the inventory guaranteed intact, move it into a
 * gravestone entity at the death site, which the owner empties by interacting.
 *
 * Every failure path lands on "the player keeps the item". Nothing here can
 * lose an item that vanilla would have kept.
 */
import { Player, system, world } from "@minecraft/server";
import type { GroundSample } from "./core/placement";
import { getMode } from "./engine/prefs";
import { installCommandFallback, registerCommands } from "./engine/commands";
import {
  isGrave,
  mayOpen,
  ownerNameOf,
  placeGrave,
  retrieve,
} from "./engine/grave";
import { reconcile, sweep } from "./engine/keep";
import * as registry from "./engine/registry";

const TAG = "[Graves]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

/** Ticks between keep-on-death sweeps. A handful of players; trivially cheap. */
const SWEEP_TICKS = 20;
/** Ticks between ground samples, for placing a stone after a fall or void death. */
const GROUND_TICKS = 10;

const lastGround = new Map<string, GroundSample>();

registerCommands(log);

world.afterEvents.worldLoad.subscribe(() => {
  registry.load();
  installCommandFallback(log);

  system.runInterval(() => sweep(log), SWEEP_TICKS);

  system.runInterval(() => {
    const tick = system.currentTick;
    for (const player of world.getAllPlayers()) {
      try {
        if (player.isOnGround)
          lastGround.set(player.id, { pos: player.location, tick });
      } catch {
        /* player mid-transfer; skip this sample */
      }
    }
  }, GROUND_TICKS);

  world.afterEvents.entityDie.subscribe((ev) => {
    const dead = ev.deadEntity;
    if (!(dead instanceof Player)) {
      // A gravestone destroyed by /kill: drop it from the directory. Vanilla
      // spills an entity inventory on death, so the items are on the ground.
      if (isGrave(dead) && registry.remove(dead.id))
        log(`gravestone ${dead.id} destroyed`);
      return;
    }
    if (getMode(dead) !== "grave") return;

    try {
      const grave = placeGrave(dead, lastGround.get(dead.id), log);
      if (!grave) return;
      const p = grave.location;
      dead.sendMessage(
        `§6Your items are waiting in a gravestone at §f${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}§6.` +
          ` §7Interact with it to take them back. §8(/graves:list)`,
      );
    } catch (e) {
      // keepOnDeath is still set on everything, so they simply keep it all.
      log(`placeGrave failed for ${dead.name}: ${e}`);
    }
  });

  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (!isGrave(ev.target)) return;
    ev.cancel = true;
    const { player, target } = ev;
    system.run(() => {
      if (!target.isValid) return;
      if (!mayOpen(player, target)) {
        player.sendMessage(`§7This is §f${ownerNameOf(target)}'s§7 grave.`);
        return;
      }
      const { taken, remaining } = retrieve(player, target, log);
      if (remaining === 0)
        player.sendMessage(
          `§6Recovered ${taken} stack(s).§7 The gravestone crumbles.`,
        );
      else if (taken > 0)
        player.sendMessage(
          `§6Recovered ${taken} stack(s);§7 ${remaining} still in the stone. Make room and try again.`,
        );
      else player.sendMessage("§7Your inventory is full.");
    });
  });

  // Newly arrived players get their carried stacks flagged straight away rather
  // than up to a sweep later; a death in that first second would otherwise drop.
  world.afterEvents.playerSpawn.subscribe((ev) => {
    system.run(() => {
      try {
        reconcile(ev.player);
      } catch (e) {
        log(`spawn reconcile failed: ${e}`);
      }
    });
  });

  world.afterEvents.playerLeave.subscribe((ev) =>
    lastGround.delete(ev.playerId),
  );

  log(
    `ready at tick ${system.currentTick}, ${registry.all().length} gravestone(s) indexed`,
  );
});
