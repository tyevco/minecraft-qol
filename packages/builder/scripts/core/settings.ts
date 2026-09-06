/**
 * The settings panel, as policy. Pure: a missing or malformed value falls
 * back to the default, never to "off" (CLAUDE.md rule 3). Behaviour-pack
 * settings are per world, so who may build is by permission role.
 */
import type { Role } from "@qol/shared/core/roles";

export type WhoMayBuild = "operators" | "members" | "everyone";

export interface Policy {
  /** Seconds between one block and the next. */
  secondsPerBlock: number;
  whoMayBuild: WhoMayBuild;
  /**
   * Buildings are free: the table takes nothing from the chest and needs no
   * chest. A building raised free returns nothing when taken down, so the
   * mode can never mint materials; the record remembers which it was.
   */
  freeBuild: boolean;
}

export const DEFAULT_POLICY: Policy = { secondsPerBlock: 4, whoMayBuild: "members", freeBuild: false };

const WHO: readonly WhoMayBuild[] = ["operators", "members", "everyone"];

export function parsePolicy(raw: Readonly<Record<string, unknown>>): Policy {
  const s = raw["builder:seconds_per_block"];
  const who = raw["builder:who_may_build"];
  const free = raw["builder:free_build"];
  return {
    secondsPerBlock: typeof s === "number" && Number.isFinite(s) ? Math.min(30, Math.max(1, Math.round(s))) : DEFAULT_POLICY.secondsPerBlock,
    whoMayBuild: typeof who === "string" && (WHO as readonly string[]).includes(who) ? (who as WhoMayBuild) : DEFAULT_POLICY.whoMayBuild,
    freeBuild: typeof free === "boolean" ? free : DEFAULT_POLICY.freeBuild,
  };
}

export const samePolicy = (a: Policy, b: Policy): boolean => a.secondsPerBlock === b.secondsPerBlock && a.whoMayBuild === b.whoMayBuild && a.freeBuild === b.freeBuild;
export const describePolicy = (p: Policy): string => `a block every ${p.secondsPerBlock}s, table for ${p.whoMayBuild}${p.freeBuild ? ", buildings free" : ""}`;

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
