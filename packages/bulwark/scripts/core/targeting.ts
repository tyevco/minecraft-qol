/**
 * Targeting priority. Pure - no @minecraft imports.
 *
 * The design's fifth axis (bulwark-turret.md §4.3): nearest, weakest or
 * strongest, chosen per turret. Measured (`rig_target_*`):
 *
 *  - the order of `nearest_attackable_target.entity_types` entries is NOT a
 *    priority; the nearest match across every entry wins;
 *  - an entry's `actor_health` filter does hold: a selector with only a
 *    wounded-filter entry shoots the wounded far mob and never the healthy
 *    near one;
 *  - a second component group's `nearest_attackable_target` REPLACES the
 *    first's, so a selector can be an additive group on the head.
 *
 * So the engine cannot rank, but it can be told what to consider, and script
 * can change its mind every block tick. "Weakest first" is: while any
 * wounded monster is in range, the head wears the selector that sees only
 * wounded monsters; otherwise the plain one. "Strongest first" the same for
 * healthy monsters. Nearest is the plain selector always. The thresholds are
 * absolute hearts, which is what a filter can test.
 */
import type { Tier } from "./tiers";

export type Priority = "nearest" | "weakest" | "strongest";
export const PRIORITIES: readonly Priority[] = ["nearest", "weakest", "strongest"];

export const PRIORITY_LABEL: Readonly<Record<Priority, string>> = {
  nearest: "Nearest",
  weakest: "Weakest first",
  strongest: "Strongest first",
};

export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}

/** Priorities are stored as small integers in the record row. */
export function priorityFromIndex(i: unknown): Priority {
  return typeof i === "number" && PRIORITIES[i] !== undefined ? PRIORITIES[i]! : "nearest";
}
export function priorityIndex(p: Priority): number {
  return PRIORITIES.indexOf(p);
}

/** A monster at or below this health is "wounded" (three hearts). */
export const WOUNDED_AT = 6;
/** A monster at or above this health is "healthy" (seven and a half hearts). */
export const HEALTHY_AT = 15;

/** Which selector the head should wear: everything, only the wounded, or only the healthy. */
export type Selector = "any" | "wounded" | "healthy";

/** The entity event that puts the head in a selector group for a range. */
export function targetEvent(selector: Selector, range: Tier): string {
  return `bulwark:target_${selector}_g${range}`;
}

/**
 * The selector for a priority, given what is in range right now: `wounded`
 * and `healthy` are counts of monsters at or past the thresholds. A priority
 * that finds nothing to prefer falls back to the plain selector, so a turret
 * never stands idle for want of a preferred target.
 */
export function chooseSelector(priority: Priority, nearby: { wounded: number; healthy: number }): Selector {
  if (priority === "weakest" && nearby.wounded > 0) return "wounded";
  if (priority === "strongest" && nearby.healthy > 0) return "healthy";
  return "any";
}

/** Count monsters by threshold, from their healths. */
export function tally(healths: readonly number[]): { wounded: number; healthy: number } {
  let wounded = 0;
  let healthy = 0;
  for (const h of healths) {
    if (h <= WOUNDED_AT) wounded++;
    if (h >= HEALTHY_AT) healthy++;
  }
  return { wounded, healthy };
}
