import { world, type Player } from "@minecraft/server";
import { parseMode, type Mode } from "../core/prefs";

/** Player dynamic property: the player's own mode. */
const PROP_MODE = "gv:mode";
/** World dynamic property: whether non-operators may change their own mode. */
const PROP_LOCK = "gv:lock";

export function getMode(player: Player): Mode {
  try {
    return parseMode(player.getDynamicProperty(PROP_MODE));
  } catch {
    return "off";
  }
}

export function setMode(player: Player, mode: Mode): void {
  player.setDynamicProperty(PROP_MODE, mode);
}

export function isLocked(): boolean {
  try {
    return world.getDynamicProperty(PROP_LOCK) === true;
  } catch {
    return false;
  }
}

export function setLocked(locked: boolean): void {
  world.setDynamicProperty(PROP_LOCK, locked);
}
