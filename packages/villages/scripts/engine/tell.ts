import { type Dimension, type Player, type Vector3 } from "@minecraft/server";

export const TAG = "[Villages]";
export const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

export function tell(player: Player | undefined, message: string): void {
  try {
    player?.sendMessage(`§e${message}`);
  } catch {
    /* gone */
  }
}

/** Say something to everyone near a spot: how a builder reports without a player to answer. */
export function announce(dim: Dimension, at: Vector3, message: string): void {
  try {
    for (const p of dim.getPlayers({ location: at, maxDistance: 48 })) p.sendMessage(`§e${message}`);
  } catch {
    /* no players */
  }
  log(message);
}
