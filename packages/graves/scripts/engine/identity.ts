import type { Player } from "@minecraft/server";

/**
 * A stable id per player.
 *
 * `Player.persistentId` is beta-only, so we mint one into a player dynamic
 * property the first time we see them and read it back forever after. Player
 * dynamic properties persist across sessions, which is what makes this stable.
 */
const PROP_PID = "gv:pid";

export function playerId(player: Player): string {
  const existing = player.getDynamicProperty(PROP_PID);
  if (typeof existing === "string" && existing.length > 0) return existing;
  const minted = `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
  player.setDynamicProperty(PROP_PID, minted);
  return minted;
}
