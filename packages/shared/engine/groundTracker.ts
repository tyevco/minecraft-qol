import { world, type Player } from "@minecraft/server";
import type { GroundSample } from "../core/ground";

export type { GroundSample, Vec3 } from "../core/ground";

/**
 * Remembers where each player last stood on the ground.
 *
 * Sampling is a read of `isOnGround` and `location` per player on an interval
 * the pack chooses; a handful of players makes it free. `isOnGround` is
 * documented as unreliable for entities without gravity and always true on
 * the first tick after a spawn, neither of which matters for a player who has
 * been walking around.
 *
 * Module state, so a /reload starts empty - which is why consumers treat a
 * missing sample as "unknown" rather than as an error.
 */
export interface GroundTracker {
  /** Record this player's position if they are standing on something. */
  sample(player: Player, tick: number): void;
  /** `sample` for every online player. */
  sampleAll(tick: number): void;
  get(playerId: string): GroundSample | undefined;
  forget(playerId: string): void;
}

export function createGroundTracker(): GroundTracker {
  const last = new Map<string, GroundSample>();
  return {
    sample(player, tick) {
      try {
        if (player.isOnGround) last.set(player.id, { pos: player.location, tick });
      } catch {
        /* player mid-transfer; skip this sample */
      }
    },
    sampleAll(tick) {
      for (const player of world.getAllPlayers()) this.sample(player, tick);
    },
    get: (playerId) => last.get(playerId),
    forget: (playerId) => {
      last.delete(playerId);
    },
  };
}
