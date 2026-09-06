import { createSettingsPoller } from "@qol/shared/engine/packSettings";
import { DEFAULT_POLICY, describePolicy, parsePolicy, samePolicy, type Policy } from "../core/settings";

/** The panel, polled and diffed: `world.getPackSettings()` is stable, the change event is not. */
let poller: ReturnType<typeof createSettingsPoller<Policy>> | undefined;

export function install(log: (...parts: unknown[]) => void): void {
  poller = createSettingsPoller(parsePolicy, samePolicy, DEFAULT_POLICY, log, describePolicy);
  poller.refresh();
}

export function refresh(): boolean {
  return poller?.refresh() ?? false;
}

export function policy(): Policy {
  return poller?.current() ?? DEFAULT_POLICY;
}
