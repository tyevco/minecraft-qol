import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  PlayerPermissionLevel,
  system,
  type CustomCommandResult,
} from "@minecraft/server";
import {
  canChangeOwnMode,
  describeMode,
  MODES,
  parseMode,
  type Mode,
} from "../core/prefs";
import { playerId } from "./identity";
import { reconcile } from "./keep";
import { getMode, isLocked, setLocked, setMode } from "./prefs";
import * as registry from "./registry";

type Log = (...parts: unknown[]) => void;

const ENUM_MODE = "graves:mode_value";
const ENUM_LOCK = "graves:lock_value";

function applyMode(player: Player, mode: Mode): void {
  setMode(player, mode);
  // Flag or unflag what they are carrying now, not on the next sweep.
  reconcile(player);
}

function isOperator(player: Player): boolean {
  return player.playerPermissionLevel === PlayerPermissionLevel.Operator;
}

/** `/graves:mode [off|grave|keep]` - show or set your own mode. */
function ownMode(player: Player, wanted: string | undefined): string {
  if (wanted === undefined) {
    const mode = getMode(player);
    return `§7Your Graves mode: §f${describeMode(mode)}${isLocked() && !isOperator(player) ? " §8(locked by an operator)" : ""}`;
  }
  if (!canChangeOwnMode(isLocked(), isOperator(player))) {
    return "§cGraves modes are locked on this world. Ask an operator to change yours.";
  }
  const mode = parseMode(wanted);
  applyMode(player, mode);
  return `§6Graves mode set:§f ${describeMode(mode)}`;
}

/** `/graves:admin <player> <off|grave|keep>` - set someone else's mode. */
function adminMode(targets: Player[], wanted: string): string {
  const mode = parseMode(wanted);
  for (const p of targets) {
    applyMode(p, mode);
    p.sendMessage(
      `§6An operator set your Graves mode:§f ${describeMode(mode)}`,
    );
  }
  return `§7Set §f${targets.map((p) => p.name).join(", ")}§7 to §f${mode}`;
}

/** `/graves:lock <on|off>` - stop non-operators changing their own mode. */
function lock(on: boolean): string {
  setLocked(on);
  return on
    ? "§7Graves modes are now §flocked§7 for non-operators."
    : "§7Graves modes are now §funlocked§7.";
}

/** `/graves:list` - where your gravestones are. */
function list(player: Player): string {
  const rows = registry.forOwner(playerId(player));
  if (rows.length === 0) return "§7You have no gravestones.";
  const lines = rows.map((r) => {
    const dim = r.dimId.replace("minecraft:", "");
    const age = Math.max(0, Math.round((Date.now() - r.createdMs) / 60000));
    return `§7- §f${r.x} ${r.y} ${r.z}§7 in ${dim}, ${age} min ago`;
  });
  return [`§6Your gravestones:`, ...lines].join("\n");
}

function asPlayer(origin: { sourceEntity?: unknown }): Player | undefined {
  return origin.sourceEntity instanceof Player
    ? origin.sourceEntity
    : undefined;
}

export function registerCommands(log: Log): void {
  system.beforeEvents.startup.subscribe((event) => {
    const reg = event.customCommandRegistry;
    const register = (name: string, fn: () => void) => {
      try {
        fn();
        log(`registered /${name}`);
      } catch (e) {
        // Without this the only symptom is an "unknown command" error in game.
        log(`FAILED to register /${name}: ${e}`);
      }
    };

    register("graves:mode", () => {
      reg.registerEnum(ENUM_MODE, [...MODES]);
      reg.registerCommand(
        {
          name: "graves:mode",
          description: "Show or set what happens to your items when you die",
          permissionLevel: CommandPermissionLevel.Any,
          cheatsRequired: false,
          optionalParameters: [
            { name: ENUM_MODE, type: CustomCommandParamType.Enum },
          ],
        },
        (origin, mode?: string): CustomCommandResult => {
          const player = asPlayer(origin);
          if (!player)
            return {
              status: CustomCommandStatus.Failure,
              message: "Run this as a player.",
            };
          // Callbacks run read-only; property writes go through system.run.
          system.run(() => player.sendMessage(ownMode(player, mode)));
          return { status: CustomCommandStatus.Success };
        },
      );
    });

    register("graves:admin", () => {
      reg.registerCommand(
        {
          name: "graves:admin",
          description: "Set another player's Graves mode",
          permissionLevel: CommandPermissionLevel.GameDirectors,
          cheatsRequired: false,
          mandatoryParameters: [
            { name: "player", type: CustomCommandParamType.PlayerSelector },
            { name: ENUM_MODE, type: CustomCommandParamType.Enum },
          ],
        },
        (origin, targets: Player[], mode: string): CustomCommandResult => {
          const player = asPlayer(origin);
          system.run(() => {
            const msg = adminMode(targets, mode);
            if (player) player.sendMessage(msg);
            else log(msg);
          });
          return { status: CustomCommandStatus.Success };
        },
      );
    });

    register("graves:lock", () => {
      reg.registerEnum(ENUM_LOCK, ["on", "off"]);
      reg.registerCommand(
        {
          name: "graves:lock",
          description: "Lock or unlock players changing their own Graves mode",
          permissionLevel: CommandPermissionLevel.GameDirectors,
          cheatsRequired: false,
          mandatoryParameters: [
            { name: ENUM_LOCK, type: CustomCommandParamType.Enum },
          ],
        },
        (origin, value: string): CustomCommandResult => {
          const player = asPlayer(origin);
          system.run(() => {
            const msg = lock(value === "on");
            if (player) player.sendMessage(msg);
            else log(msg);
          });
          return { status: CustomCommandStatus.Success };
        },
      );
    });

    register("graves:list", () => {
      reg.registerCommand(
        {
          name: "graves:list",
          description: "List your gravestones",
          permissionLevel: CommandPermissionLevel.Any,
          cheatsRequired: false,
        },
        (origin): CustomCommandResult => {
          const player = asPlayer(origin);
          if (!player)
            return {
              status: CustomCommandStatus.Failure,
              message: "Run this as a player.",
            };
          return { status: CustomCommandStatus.Success, message: list(player) };
        },
      );
    });
  });
}

/**
 * Fallback: `/scriptevent graves:mode keep`, `graves:list`, `graves:lock on`.
 *
 * Subscribed at worldLoad, so it works right after a /reload - custom commands
 * added since the world was entered do not exist until re-entry.
 */
export function installCommandFallback(log: Log): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (!ev.id.startsWith("graves:")) return;
    const player =
      ev.sourceEntity instanceof Player ? ev.sourceEntity : undefined;
    const cmd = ev.id.slice("graves:".length);
    const arg = ev.message.trim();

    if (cmd === "mode") {
      if (!player) return log("scriptevent graves:mode: run this as a player");
      player.sendMessage(ownMode(player, arg || undefined));
    } else if (cmd === "list") {
      if (!player) return log("scriptevent graves:list: run this as a player");
      player.sendMessage(list(player));
    } else if (cmd === "lock") {
      if (!player || !isOperator(player))
        return log("scriptevent graves:lock: operators only");
      player.sendMessage(lock(arg === "on"));
    }
  });
}
