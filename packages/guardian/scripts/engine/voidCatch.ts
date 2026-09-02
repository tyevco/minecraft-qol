import { system, world, type Player } from "@minecraft/server";
import { createGroundTracker, type Vec3 } from "@qol/shared/engine/groundTracker";
import { roleOf } from "@qol/shared/engine/roles";
import { belowWorld, chooseRescue } from "../core/rescue";
import { isProtectedRole } from "../core/rules";
import { policy } from "./settings";
import { markRescued } from "./shield";

/**
 * The void catch.
 *
 * One interval does two things per player: while they stand on something,
 * remember where; when a protected player is below the dimension floor, put
 * them back on the last thing they stood on. The tracker is the one Graves
 * uses to place a gravestone after a void death - the same memory, used a few
 * seconds earlier.
 */
type Log = (...parts: unknown[]) => void;

/** Ticks between samples. A fall from the End's islands to the floor takes ~60. */
export const SWEEP_TICKS = 10;
/** Ticks after a rescue before the same player can be rescued again. */
const COOLDOWN_TICKS = 40;

export const tracker = createGroundTracker();
const cooldownUntil = new Map<string, number>();

export function forget(playerId: string): void {
  tracker.forget(playerId);
  cooldownUntil.delete(playerId);
}

function spawnHere(player: Player): Vec3 | undefined {
  try {
    const sp = player.getSpawnPoint();
    if (!sp || sp.dimension.id !== player.dimension.id) return undefined;
    return { x: sp.x, y: sp.y, z: sp.z };
  } catch {
    return undefined;
  }
}

/** Sample or rescue one player. Returns true if a rescue happened. */
export function check(player: Player, tick: number, log: Log): boolean {
  tracker.sample(player, tick);
  if (!policy().voidCatch || !isProtectedRole(roleOf(player))) return false;

  const range = player.dimension.heightRange;
  if (!belowWorld(player.location.y, range)) return false;
  if ((cooldownUntil.get(player.id) ?? -1) >= tick) return false;

  const rescue = chooseRescue(range, tick, tracker.get(player.id), spawnHere(player));
  if (!rescue) {
    // Nothing to stand them on. Vanilla takes over; Graves is downstream.
    log(`${player.name} is below the world with nowhere known to put them`);
    cooldownUntil.set(player.id, tick + COOLDOWN_TICKS);
    return false;
  }

  try {
    // Forgive the landing before the move, in case the fall distance survives it.
    markRescued(player.id, tick);
    cooldownUntil.set(player.id, tick + COOLDOWN_TICKS);
    player.teleport(rescue.pos, { dimension: player.dimension });
    player.sendMessage(
      rescue.source === "ground"
        ? "§6Guardian caught you.§7 Back where you last stood."
        : "§6Guardian caught you.§7 Back at your spawn point.",
    );
    log(`caught ${player.name} at y=${player.location.y.toFixed(1)} -> ${rescue.source}`);
    return true;
  } catch (e) {
    log(`void catch failed for ${player.name}: ${e}`);
    return false;
  }
}

export function sweep(log: Log): void {
  const tick = system.currentTick;
  for (const player of world.getAllPlayers()) {
    try {
      check(player, tick, log);
    } catch (e) {
      log(`void sweep failed for ${player.name}: ${e}`);
    }
  }
}
