/**
 * The pack's settings panel, as policy. Pure - no @minecraft imports.
 *
 * Behaviour-pack settings are per world (CLAUDE.md rule 3), so everything
 * here is a Realm-wide switch an operator flips once: how far any turret may
 * reach whatever its range tier says, whether hoppers may feed special ammo
 * at all, and whether upgrades are accepted. The defaults are "everything the
 * pack can do", so a fresh world plays the whole feature; the switches exist
 * for a crowded Realm where thirty-two-block turrets would be a problem.
 */
import { RANGE_BLOCKS, type Tier } from "./tiers";

export type RangeCap = 16 | 24 | 32;
export const RANGE_CAPS: readonly RangeCap[] = [16, 24, 32];

export interface Policy {
  /** No turret reaches further than this, whatever its range tier. */
  rangeCap: RangeCap;
  /** Hoppers may feed tipped arrows, snowballs and splash potions. */
  specialAmmo: boolean;
  /** Turrets accept upgrade materials. */
  upgrades: boolean;
}

export const DEFAULT_POLICY: Readonly<Policy> = { rangeCap: 32, specialAmmo: true, upgrades: true };

/** Setting names, as the manifest's `settings` section declares them. */
export const SETTING = {
  rangeCap: "bulwark:range_cap",
  specialAmmo: "bulwark:special_ammo",
  upgrades: "bulwark:upgrades",
} as const;

export function parseRangeCap(raw: unknown, fallback: RangeCap): RangeCap {
  // A dropdown reports its option name, a string; be kind to a number too.
  const n = typeof raw === "string" ? Number(raw) : raw;
  return (RANGE_CAPS as readonly number[]).includes(n as number) ? (n as RangeCap) : fallback;
}

export function parsePolicy(raw: Readonly<Record<string, unknown>>): Policy {
  const bool = (key: string, fallback: boolean): boolean =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : fallback;
  return {
    rangeCap: parseRangeCap(raw[SETTING.rangeCap], DEFAULT_POLICY.rangeCap),
    specialAmmo: bool(SETTING.specialAmmo, DEFAULT_POLICY.specialAmmo),
    upgrades: bool(SETTING.upgrades, DEFAULT_POLICY.upgrades),
  };
}

export function samePolicy(a: Policy, b: Policy): boolean {
  return a.rangeCap === b.rangeCap && a.specialAmmo === b.specialAmmo && a.upgrades === b.upgrades;
}

export function describePolicy(p: Policy): string {
  return `range cap ${p.rangeCap} special ammo ${p.specialAmmo} upgrades ${p.upgrades}`;
}

/**
 * The range tier a turret actually aims at: its own, brought down to the
 * highest tier the cap allows. Tier 1 is 16 blocks and always fits.
 */
export function effectiveRange(tier: Tier, cap: RangeCap): Tier {
  let best: Tier = 1;
  for (const t of [1, 2, 3] as const) if (RANGE_BLOCKS[t] <= cap && t <= tier) best = t;
  return best;
}
