import { Player, system, world } from "@minecraft/server";
import { roleOf } from "@qol/shared/engine/roles";
import { adjust, announcement, decide, type Verdict } from "../core/rules";
import { policy } from "./settings";

/**
 * The whole feature is one before-event.
 *
 * `world.beforeEvents.entityHurt` exposes `damageSource.cause`, a writable
 * `damage` and `cancel`, and those two writes are the only thing a before-event
 * handler is allowed to do - which is all we need. The engine filter keeps
 * every non-player hit (mobs fighting, a cow falling, cactus) out of script
 * altogether, so the common case costs nothing.
 *
 * `damage` is the engine's proposed amount at the point the event fires.
 * Whether that is before or after armour is one of the things the probe pack
 * measures (`qolprobe:hurt`); the table is the same either way, only the
 * meaning of "50%" moves. See the pack README.
 */
type Log = (...parts: unknown[]) => void;

/** Tick until which each recently rescued player's landing is forgiven. */
const rescuedUntil = new Map<string, number>();
/** Last tick an action-bar line was shown per player, so fire ticks do not flicker it. */
const lastAnnounced = new Map<string, number>();

/** How long after a void catch a fall is cancelled regardless of the panel. */
export const RESCUE_GRACE_TICKS = 60;
const ANNOUNCE_EVERY_TICKS = 20;

export function markRescued(playerId: string, tick: number): void {
  rescuedUntil.set(playerId, tick + RESCUE_GRACE_TICKS);
}

export function forget(playerId: string): void {
  rescuedUntil.delete(playerId);
  lastAnnounced.delete(playerId);
}

/** The verdict for one hit on one player, with the engine context filled in. */
export function verdictFor(player: Player, cause: string, tick: number): Verdict {
  const justRescued = (rescuedUntil.get(player.id) ?? -1) >= tick;
  return decide(roleOf(player), cause, policy(), { justRescued });
}

export function install(log: Log): void {
  world.beforeEvents.entityHurt.subscribe(
    (ev) => {
      const player = ev.hurtEntity;
      // The filter should guarantee this; the check is what keeps a filter
      // that silently did not apply from turning into a table applied to mobs.
      if (!(player instanceof Player)) return;

      try {
        const tick = system.currentTick;
        const verdict = verdictFor(player, ev.damageSource.cause, tick);
        if (verdict.kind === "vanilla") return;

        const out = adjust(ev.damage, verdict);
        if (out.cancel) ev.cancel = true;
        else ev.damage = out.damage;

        if (policy().announce) announce(player, verdict, tick);
      } catch (e) {
        // A throw here leaves the hit as the engine proposed it, which is
        // vanilla - the safe failure. Log so it is not silent. (Not touching
        // the player again here: it may be what threw.)
        log(`hurt handler failed: ${e}`);
      }
    },
    { entityFilter: { type: "minecraft:player" } },
  );
}

function announce(player: Player, verdict: Verdict, tick: number): void {
  const text = announcement(verdict);
  if (!text) return;
  if (tick - (lastAnnounced.get(player.id) ?? -ANNOUNCE_EVERY_TICKS) < ANNOUNCE_EVERY_TICKS) return;
  lastAnnounced.set(player.id, tick);
  // Before-events run read-only; the HUD write is deferred a tick.
  system.run(() => {
    try {
      if (player.isValid) player.onScreenDisplay.setActionBar(text);
    } catch {
      /* the message is decoration; never let it matter */
    }
  });
}
