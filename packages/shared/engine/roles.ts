import { PlayerPermissionLevel, type Player } from "@minecraft/server";
import type { Role } from "../core/roles";

export type { Role } from "../core/roles";
export { ROLES } from "../core/roles";

/**
 * A player's role, as the settings panels understand it.
 *
 * `playerPermissionLevel` is the stable read; anything the engine adds later
 * (there is no fourth level today) falls back to visitor, the most protected
 * role, which is the direction every pack here fails towards.
 */
export function roleOf(player: Player): Role {
  switch (player.playerPermissionLevel) {
    case PlayerPermissionLevel.Operator:
      return "operator";
    case PlayerPermissionLevel.Member:
      return "member";
    default:
      return "visitor";
  }
}
