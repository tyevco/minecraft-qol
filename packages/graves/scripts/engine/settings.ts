import { world, type Player } from "@minecraft/server";
import { roleOf } from "@qol/shared/engine/roles";
import {
  DEFAULT_POLICY,
  parsePolicy,
  samePolicy,
  type Mode,
  type Policy,
} from "../core/prefs";

export { roleOf };

/**
 * The pack's settings panel, as policy.
 *
 * `world.getPackSettings()` is stable; the change event is beta-only, so this
 * polls and diffs. A poll every few seconds is nothing, and a settings change
 * mid-session takes effect on the next keep-on-death sweep after it.
 */
let current: Policy = DEFAULT_POLICY;

type Log = (...parts: unknown[]) => void;

/** Re-read the panel. Returns true if anything changed. */
export function refresh(log: Log): boolean {
  let raw: Record<string, unknown>;
  try {
    raw = world.getPackSettings();
  } catch (e) {
    log(`getPackSettings failed: ${e}`);
    return false;
  }
  const next = parsePolicy(raw);
  if (samePolicy(current, next)) return false;
  current = next;
  log(
    `settings: visitors=${next.modes.visitor} members=${next.modes.member} operators=${next.modes.operator}` +
      ` announce=${next.announce} public=${next.publicGraves} waypoint=${next.waypoint}`,
  );
  return true;
}

export function policy(): Policy {
  return current;
}

export function modeFor(player: Player): Mode {
  try {
    return current.modes[roleOf(player)];
  } catch {
    return "off";
  }
}
