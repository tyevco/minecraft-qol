import { createSettingsPoller } from "@qol/shared/engine/packSettings";
import {
  DEFAULT_POLICY,
  describePolicy,
  parsePolicy,
  samePolicy,
  type Policy,
} from "../core/rules";

/**
 * The pack's settings panel, as policy. Polled and diffed, as Graves and
 * Guardian do it: `world.getPackSettings()` is stable, the change event is not.
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
