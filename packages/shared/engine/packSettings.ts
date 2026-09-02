import { world } from "@minecraft/server";

/**
 * The pack's settings panel, read as typed policy.
 *
 * `world.getPackSettings()` is stable; the change event is beta-only, so this
 * polls and diffs. Callers give it a parser (which must fall back to defaults
 * for missing or malformed values, never to "off") and an equality test, and
 * get back a `refresh()` that reports whether anything changed.
 */
export interface SettingsPoller<T> {
  /** Re-read the panel. Returns true if the policy changed. */
  refresh(): boolean;
  current(): T;
}

export function createSettingsPoller<T>(
  parse: (raw: Readonly<Record<string, unknown>>) => T,
  same: (a: T, b: T) => boolean,
  initial: T,
  log: (...parts: unknown[]) => void,
  describe?: (policy: T) => string,
): SettingsPoller<T> {
  let current = initial;
  return {
    refresh(): boolean {
      let raw: Record<string, unknown>;
      try {
        raw = world.getPackSettings();
      } catch (e) {
        log(`getPackSettings failed: ${e}`);
        return false;
      }
      const next = parse(raw);
      if (same(current, next)) return false;
      current = next;
      if (describe) log(`settings: ${describe(next)}`);
      return true;
    },
    current: () => current,
  };
}
