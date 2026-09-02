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
import { Player, WaypointTexture, system, world } from "@minecraft/server";
import { createGroundTracker } from "@qol/shared/engine/groundTracker";
import * as waypoints from "@qol/shared/engine/waypoints";
import { graveMarkers, isGraveKey } from "./core/markers";
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
/** Ticks between locator-bar syncs. Cheap: a registry filter per player. */
const WAYPOINT_TICKS = 40;

/** Where each player last stood, shared with Guardian's void catch. */
const ground = createGroundTracker();

/** A red circle: a warning, and the one marker you most want to spot. */
const GRAVE_STYLE: waypoints.WaypointStyle = {
  color: { red: 0.9, green: 0.25, blue: 0.25 },
  texture: WaypointTexture.Circle,
};

/**
 * Mark the player's own gravestones on their locator bar - the ones in the
 * registry, in their current dimension, if the panel allows. The registry is
 * the whole input, so a stone placed or emptied by any path shows or clears
 * on the next sync without a second bookkeeping trail.
 */
function syncWaypoints(player: Player): void {
  const wanted = graveMarkers(
    registry.all(),
    playerId(player),
    player.dimension.id,
    settings.policy().waypoint,
  );
  waypoints.sync(
    player,
    wanted.map((m) => ({ key: m.key, target: m, style: GRAVE_STYLE })),
    isGraveKey,
    log,
  );
}

function syncAllWaypoints(): void {
  for (const player of world.getAllPlayers()) {
    try {
      syncWaypoints(player);
    } catch (e) {
      log(`waypoint sync failed: ${e}`);
    }
  }
}

world.afterEvents.worldLoad.subscribe(() => {
  registry.load();
  settings.refresh(log);

  // A /reload discards our waypoint handles but not, necessarily, the waypoints.
  // Sweep whatever this pack left on each bar before the first sync rebuilds it.
  for (const player of world.getAllPlayers()) waypoints.reset(player, log);

  system.runInterval(() => {
    // A changed panel takes effect on the very next sweep, not the one after.
    if (settings.refresh(log)) {
      sweep(log);
      syncAllWaypoints();
    }
  }, SETTINGS_TICKS);
  system.runInterval(() => sweep(log), SWEEP_TICKS);
  system.runInterval(syncAllWaypoints, WAYPOINT_TICKS);

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
      if (remaining === 0) {
        player.sendMessage(
          `§6Recovered ${taken} stack(s).§7 The gravestone crumbles.`,
        );
        // The stone is gone from the registry; drop its marker now rather
        // than on the next sync. (An operator emptying someone else's stone
        // clears the owner's marker on their next sync.)
        syncWaypoints(player);
      }
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
      try {
        // A joining player's handles went with their last session, and the
        // bar may or may not have kept the waypoints; start clean. A respawn
        // after death is where a freshly placed stone first shows.
        if (ev.initialSpawn) waypoints.reset(ev.player, log);
        syncWaypoints(ev.player);
      } catch (e) {
        log(`spawn waypoint sync failed: ${e}`);
      }
    });
  });

  world.afterEvents.playerDimensionChange.subscribe((ev) => {
    system.run(() => {
      try {
        syncWaypoints(ev.player);
      } catch (e) {
        log(`dimension waypoint sync failed: ${e}`);
      }
    });
  });

  world.afterEvents.playerLeave.subscribe((ev) => {
    ground.forget(ev.playerId);
    waypoints.forget(ev.playerId);
  });

  // Diagnostics, in the same shape as the other packs: /reload-safe because
  // scriptEventReceive is subscribed here rather than at startup.
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "graves:debug") return;
    const player = ev.sourceEntity;
    if (!(player instanceof Player)) return;
    const pol = settings.policy();
    player.sendMessage(
      `§7panel: visitors=§f${pol.modes.visitor}§7 members=§f${pol.modes.member}§7 operators=§f${pol.modes.operator}` +
        `§7 announce=§f${pol.announce}§7 public=§f${pol.publicGraves}§7 waypoint=§f${pol.waypoint}`,
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
    player.sendMessage(
      `§7waypoints: §f${waypoints.describe(player.id)}§7 ` +
        `(bar ${player.locatorBar.count}/${player.locatorBar.maxCount})`,
    );
  });

  log(
    `ready at tick ${system.currentTick}, ${registry.all().length} gravestone(s) indexed`,
  );
});
