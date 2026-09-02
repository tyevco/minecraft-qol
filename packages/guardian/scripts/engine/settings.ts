import type { Player } from "@minecraft/server";
import { createSettingsPoller } from "@qol/shared/engine/packSettings";
import { roleOf } from "@qol/shared/engine/roles";
import {
  DEFAULT_POLICY,
  describePolicy,
  parsePolicy,
  samePolicy,
  type Policy,
  type Role,
  type Scale,
} from "../core/rules";

export { roleOf };

/**
 * The pack's settings panel, as policy. Polled and diffed, exactly as Graves
 * does it: `world.getPackSettings()` is stable and the change event is not.
 */
let poller: ReturnType<typeof createSettingsPoller<Policy>> | undefined;

type Log = (...parts: unknown[]) => void;

export function install(log: Log): void {
  poller = createSettingsPoller(parsePolicy, samePolicy, DEFAULT_POLICY, log, describePolicy);
  poller.refresh();
}

/** Re-read the panel. Returns true if anything changed. */
export function refresh(): boolean {
  return poller?.refresh() ?? false;
}

export function policy(): Policy {
  return poller?.current() ?? DEFAULT_POLICY;
}

export function scaleFor(player: Player): Scale {
  return policy().scale[roleOf(player)];
}

export function roleAndScale(player: Player): { role: Role; scale: Scale } {
  const role = roleOf(player);
  return { role, scale: policy().scale[role] };
}
