import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  PlayerPermissionLevel,
  system,
  type CustomCommandResult,
} from "@minecraft/server";
import { showReadOnly, showSettings } from "../settings/ui";

/**
 * Custom commands must be registered during startup, which runs before `world`
 * is usable - so registration and configuration are necessarily separate phases.
 */
export function registerCommands(log: (...parts: unknown[]) => void): void {
  system.beforeEvents.startup.subscribe((event) => {
    event.customCommandRegistry.registerCommand(
      {
        // Namespaced or the engine throws NamespaceNameError.
        name: "qol:settings",
        description: "Open the QOL Times settings menu",
        // Anyone may run it; operator status is checked below so guests get a
        // useful read-only view instead of a bare permission error.
        permissionLevel: CommandPermissionLevel.Any,
        // Defaults to TRUE. On a Realm with cheats off the command would simply
        // not exist, which is the single easiest way to ship a dead menu.
        cheatsRequired: false,
      },
      (origin): CustomCommandResult => {
        const player = origin.sourceEntity;
        if (!(player instanceof Player)) {
          return { status: CustomCommandStatus.Failure, message: "Run this as a player." };
        }

        const isOperator = player.playerPermissionLevel === PlayerPermissionLevel.Operator;

        // Command callbacks run in read-only mode and form.show() is forbidden
        // there, so defer to the next tick.
        system.run(() => {
          try {
            if (isOperator) void showSettings(player);
            else showReadOnly(player);
          } catch (e) {
            log(`settings menu failed: ${e}`);
          }
        });

        return { status: CustomCommandStatus.Success };
      },
    );
  });
}
