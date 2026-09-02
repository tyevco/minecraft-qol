import { PlayerPermissionLevel, world, type Player } from "@minecraft/server";
import {
  DEFAULT_POLICY,
  parsePolicy,
  samePolicy,
  type Mode,
  type Policy,
  type Role,
} from "../core/prefs";

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
      ` announce=${next.announce} public=${next.publicGraves}`,
  );
  return true;
}

export function policy(): Policy {
  return current;
}

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

export function modeFor(player: Player): Mode {
  try {
    return current.modes[roleOf(player)];
  } catch {
    return "off";
  }
}
