/**
 * The settings panel, as policy. Pure: the parser falls back to the defaults
 * for a missing or malformed value, never to "off" (CLAUDE.md rule 3).
 */
export interface Policy {
  /** Minutes between one worker's cycles. */
  cycleMinutes: number;
  /** Whether a cycle costs the worker one food item from its chest. */
  wages: boolean;
}

export const DEFAULT_POLICY: Policy = { cycleMinutes: 10, wages: true };

function slider(raw: Readonly<Record<string, unknown>>, name: string, min: number, max: number, fallback: number): number {
  const v = raw[name];
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function toggle(raw: Readonly<Record<string, unknown>>, name: string, fallback: boolean): boolean {
  const v = raw[name];
  return typeof v === "boolean" ? v : fallback;
}

export function parsePolicy(raw: Readonly<Record<string, unknown>>): Policy {
  return {
    cycleMinutes: slider(raw, "villages:cycle_minutes", 1, 60, DEFAULT_POLICY.cycleMinutes),
    wages: toggle(raw, "villages:wages", DEFAULT_POLICY.wages),
  };
}

export const samePolicy = (a: Policy, b: Policy): boolean => a.cycleMinutes === b.cycleMinutes && a.wages === b.wages;
export const describePolicy = (p: Policy): string => `a cycle every ${p.cycleMinutes} min, wages ${p.wages ? "on" : "off"}`;
