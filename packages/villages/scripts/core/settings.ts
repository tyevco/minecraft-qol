/**
 * The settings panel, as policy. Pure: the parser falls back to the defaults
 * for a missing or malformed value, never to "off" (CLAUDE.md rule 3).
 */
import type { Role } from "@qol/shared/core/roles";

export type WhoMayBuild = "operators" | "members" | "everyone";

export interface Policy {
  /** Minutes between one worker's cycles. */
  cycleMinutes: number;
  /** Whether a cycle costs the worker one food item from its chest. */
  wages: boolean;
  /** The builder: seconds between one block and the next. */
  secondsPerBlock: number;
  /** Who may use the blueprint table, by permission role (behaviour-pack settings are per world). */
  whoMayBuild: WhoMayBuild;
  /**
   * Buildings are free: the table takes nothing from the chest and needs no
   * chest. A building raised free returns nothing when taken down, so the
   * mode can never mint materials; the record remembers which it was.
   */
  freeBuild: boolean;
}

export const DEFAULT_POLICY: Policy = { cycleMinutes: 10, wages: true, secondsPerBlock: 4, whoMayBuild: "members", freeBuild: false };
const WHO: readonly WhoMayBuild[] = ["operators", "members", "everyone"];

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
    secondsPerBlock: slider(raw, "villages:seconds_per_block", 1, 30, DEFAULT_POLICY.secondsPerBlock),
    whoMayBuild: (() => {
      const who = raw["villages:who_may_build"];
      return typeof who === "string" && (WHO as readonly string[]).includes(who) ? (who as WhoMayBuild) : DEFAULT_POLICY.whoMayBuild;
    })(),
    freeBuild: toggle(raw, "villages:free_build", DEFAULT_POLICY.freeBuild),
  };
}

export const samePolicy = (a: Policy, b: Policy): boolean =>
  a.cycleMinutes === b.cycleMinutes && a.wages === b.wages && a.secondsPerBlock === b.secondsPerBlock && a.whoMayBuild === b.whoMayBuild && a.freeBuild === b.freeBuild;
export const describePolicy = (p: Policy): string =>
  `a cycle every ${p.cycleMinutes} min, wages ${p.wages ? "on" : "off"}; a block every ${p.secondsPerBlock}s, table for ${p.whoMayBuild}${p.freeBuild ? ", buildings free" : ""}`;

export function mayBuild(role: Role, policy: Policy): boolean {
  switch (policy.whoMayBuild) {
    case "everyone":
      return true;
    case "members":
      return role === "member" || role === "operator";
    default:
      return role === "operator";
  }
}
