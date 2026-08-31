import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  PlayerPermissionLevel,
  system,
  type CustomCommandResult,
} from "@minecraft/server";
import { showReadOnly, showSettings } from "../settings/ui";

type Log = (...parts: unknown[]) => void;

/** Opens the right menu for this player. Must NOT run in read-only mode. */
function openFor(player: Player, log: Log): void {
  try {
    if (player.playerPermissionLevel === PlayerPermissionLevel.Operator) {
      void showSettings(player);
    } else {
      showReadOnly(player);
    }
  } catch (e) {
    log(`settings menu failed: ${e}`);
  }
}

/**
 * Custom commands must be registered during startup, which fires before `world`
 * is usable - so registration and configuration are necessarily separate phases.
 *
 * Important: startup fires when the world loads scripts, NOT on /reload. After a
 * /reload the command stays registered from the original load, but a freshly
 * added command will not appear until the world is exited and re-entered.
 */
export function registerCommands(log: Log): void {
  system.beforeEvents.startup.subscribe((event) => {
    try {
      event.customCommandRegistry.registerCommand(
        {
          // Namespaced, or the engine throws NamespaceNameError.
          name: "qol:settings",
          description: "Open the QOL Times settings menu",
          // Anyone may run it; operator status is checked in openFor so guests
          // get a useful read-only view rather than a bare permission error.
          permissionLevel: CommandPermissionLevel.Any,
          // Defaults to TRUE. On a cheats-off Realm the command would simply not
          // exist - the easiest way to ship a menu nobody can open.
          cheatsRequired: false,
        },
        (origin): CustomCommandResult => {
          const player = origin.sourceEntity;
          if (!(player instanceof Player)) {
            return { status: CustomCommandStatus.Failure, message: "Run this as a player." };
          }
          // Command callbacks run read-only and form.show() is forbidden there.
          system.run(() => openFor(player, log));
          return { status: CustomCommandStatus.Success };
        },
      );
      log("registered /qol:settings");
    } catch (e) {
      // Without this the only symptom is an "unknown command" error in game.
      log(`FAILED to register /qol:settings: ${e}`);
    }
  });
}

/**
 * Fallback: `/scriptevent qol:settings`.
 *
 * scriptEventReceive is subscribed at worldLoad, so unlike a custom command it
 * works immediately after a /reload. Keeps the menu reachable while iterating,
 * and gives a way in if custom-command registration is unavailable.
 */
export function installCommandFallback(log: Log): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "qol:settings") return;
    const player = ev.sourceEntity;
    if (!(player instanceof Player)) {
      log("scriptevent qol:settings: run this as a player");
      return;
    }
    openFor(player, log);
  });
}
