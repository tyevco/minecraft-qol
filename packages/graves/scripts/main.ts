/**
 * Graves - item preservation on death, chosen per player role.
 *
 * Some players on a family realm find dying frustrating; others want the
 * vanilla stakes. So the mode is set per permission role in the pack's
 * settings panel - visitors, members, operators each get one of:
 *
 *   off     vanilla, items drop where you died
 *   grave   items wait in a gravestone where you died; interact to take them
 *   keep    items stay in your inventory through death
 *
 * No commands. Everything is configured from the panel; the only script-event
 * is `graves:debug`, which prints what the pack thinks the panel says.
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
import { createGroundTracker } from "@qol/shared/engine/groundTracker";
import { describeMode } from "./core/prefs";
import { playerId } from "./engine/identity";
import {
  isGrave,
  mayOpen,
  ownerNameOf,
  placeGrave,
  retrieve,
} from "./engine/grave";
import { reconcile, sweep } from "./engine/keep";
import * as registry from "./engine/registry";
import * as settings from "./engine/settings";

const TAG = "[Graves]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

/** Ticks between keep-on-death sweeps. A handful of players; trivially cheap. */
const SWEEP_TICKS = 20;
/** Ticks between ground samples, for placing a stone after a fall or void death. */
const GROUND_TICKS = 10;
/** Ticks between settings-panel polls. The change event is beta-only. */
const SETTINGS_TICKS = 100;

/** Where each player last stood, shared with Guardian's void catch. */
const ground = createGroundTracker();

world.afterEvents.worldLoad.subscribe(() => {
  registry.load();
  settings.refresh(log);

  system.runInterval(() => {
    // A changed panel takes effect on the very next sweep, not the one after.
    if (settings.refresh(log)) sweep(log);
  }, SETTINGS_TICKS);
  system.runInterval(() => sweep(log), SWEEP_TICKS);

  system.runInterval(() => ground.sampleAll(system.currentTick), GROUND_TICKS);

  world.afterEvents.entityDie.subscribe((ev) => {
    const dead = ev.deadEntity;
    if (!(dead instanceof Player)) {
      // A gravestone destroyed by /kill: drop it from the directory. Vanilla
      // spills an entity inventory on death, so the items are on the ground.
      if (isGrave(dead) && registry.remove(dead.id))
        log(`gravestone ${dead.id} destroyed`);
      return;
    }
    if (settings.modeFor(dead) !== "grave") return;

    try {
      const grave = placeGrave(dead, ground.get(dead.id), log);
      if (!grave || !settings.policy().announce) return;
      const p = grave.location;
      dead.sendMessage(
        `§6Your items are waiting in a gravestone at §f${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}§6.` +
          ` §7Interact with it to take them back.`,
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

  world.afterEvents.playerLeave.subscribe((ev) => ground.forget(ev.playerId));

  // Diagnostics, in the same shape as the other packs: /reload-safe because
  // scriptEventReceive is subscribed here rather than at startup.
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "graves:debug") return;
    const player = ev.sourceEntity;
    if (!(player instanceof Player)) return;
    const pol = settings.policy();
    player.sendMessage(
      `§7panel: visitors=§f${pol.modes.visitor}§7 members=§f${pol.modes.member}§7 operators=§f${pol.modes.operator}` +
        `§7 announce=§f${pol.announce}§7 public=§f${pol.publicGraves}`,
    );
    player.sendMessage(
      `§7you: role §f${settings.roleOf(player)}§7 -> ${describeMode(settings.modeFor(player))}`,
    );
    const mine = registry.forOwner(playerId(player));
    player.sendMessage(
      `§7gravestones: §f${registry.all().length}§7 indexed, §f${mine.length}§7 yours`,
    );
    for (const g of mine)
      player.sendMessage(
        `§7- §f${g.x} ${g.y} ${g.z}§7 in ${g.dimId.replace("minecraft:", "")}`,
      );
  });

  log(
    `ready at tick ${system.currentTick}, ${registry.all().length} gravestone(s) indexed`,
  );
});
