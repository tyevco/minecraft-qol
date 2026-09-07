/**
 * Upgrade tiers. Pure - no @minecraft imports.
 *
 * Four axes, three tiers each, as the design asked (docs/design/
 * bulwark-turret.md §4.2, kept by decision in bulwark-ammo-and-upgrades.md
 * §4.5). Every axis starts at tier 1 and is raised one tier at a time by
 * feeding the turret one item, the tier's own material: the base tier is
 * the first material's name (iron, redstone, ender pearl, arrow) and costs
 * nothing.
 *
 *  - damage  iron -> diamond -> netherite      a script multiplier on the hit
 *  - rate    redstone -> redstone block -> quartz   the aim group's interval
 *  - range   ender pearl -> eye of ender -> ender chest   the aim group's radius
 *  - gate    arrow -> fire charge -> dragon's breath   which ammo kinds the
 *            hopper may feed: plain, then tipped, then snowballs and potions
 *
 * Rate and range share one component (`ranged_attack`), so they are one
 * "aim" group per pair, nine in all; damage is script; the gate is a rule
 * here. Fed materials are remembered as the tiers themselves and given back
 * on break (rule 4): tier N on an axis is N-1 items.
 */
import type { Kind } from "./ammo";

export type Axis = "damage" | "rate" | "range" | "gate";
export const AXES: readonly Axis[] = ["damage", "rate", "range", "gate"];

export type Tier = 1 | 2 | 3;
export const MAX_TIER: Tier = 3;

export interface Tiers {
  damage: Tier;
  rate: Tier;
  range: Tier;
  gate: Tier;
}

export const BASE_TIERS: Readonly<Tiers> = { damage: 1, rate: 1, range: 1, gate: 1 };

export function isTier(value: unknown): value is Tier {
  return value === 1 || value === 2 || value === 3;
}

/** The item that raises an axis to tier 2, and the one that raises it to 3. */
export const MATERIALS: Readonly<Record<Axis, readonly [string, string]>> = {
  damage: ["minecraft:diamond", "minecraft:netherite_ingot"],
  rate: ["minecraft:redstone_block", "minecraft:quartz"],
  range: ["minecraft:ender_eye", "minecraft:ender_chest"],
  gate: ["minecraft:fire_charge", "minecraft:dragon_breath"],
};

export const AXIS_LABEL: Readonly<Record<Axis, string>> = {
  damage: "damage",
  rate: "fire rate",
  range: "range",
  gate: "ammo",
};

export const TIER_NAME: Readonly<Record<Tier, string>> = { 1: "I", 2: "II", 3: "III" };

/** What each tier does, for the status text and the docs. */
export const RATE_INTERVAL: Readonly<Record<Tier, readonly [min: number, max: number]>> = {
  1: [1.0, 2.0],
  2: [0.6, 1.2],
  3: [0.3, 0.6],
};
export const RANGE_BLOCKS: Readonly<Record<Tier, number>> = { 1: 16, 2: 24, 3: 32 };
export const DAMAGE_MULTIPLIER: Readonly<Record<Tier, number>> = { 1: 1, 2: 1.5, 3: 2 };

export function damageMultiplier(tier: Tier): number {
  return DAMAGE_MULTIPLIER[tier];
}

/** The entity event that puts the head in the aim group for a rate and range. */
export function aimEvent(rate: Tier, range: Tier): string {
  return `bulwark:aim_r${rate}_g${range}`;
}

/** The entity event that sets the head's `bulwark:tier` property (its texture). */
export function tierEvent(damage: Tier): string {
  return `bulwark:tier_${damage}`;
}

/** Which axis and tier one item buys, whatever the turret's state. */
export function upgradeFor(typeId: string): { axis: Axis; tier: Tier } | undefined {
  for (const axis of AXES) {
    const [second, third] = MATERIALS[axis];
    if (typeId === second) return { axis, tier: 2 };
    if (typeId === third) return { axis, tier: 3 };
  }
  return undefined;
}

export type FeedVerdict =
  | { kind: "upgrade"; axis: Axis; tier: Tier }
  | { kind: "maxed"; axis: Axis }
  /** The right axis, the wrong step: `needs` is the item for the next tier. */
  | { kind: "order"; axis: Axis; needs: string }
  | { kind: "not_material" };

/** Whether one item raises a turret at `tiers`, and if not, why not. */
export function feedUpgrade(tiers: Readonly<Tiers>, typeId: string): FeedVerdict {
  const buys = upgradeFor(typeId);
  if (!buys) return { kind: "not_material" };
  const have = tiers[buys.axis];
  if (have >= MAX_TIER) return { kind: "maxed", axis: buys.axis };
  if (buys.tier === have + 1) return { kind: "upgrade", axis: buys.axis, tier: buys.tier };
  if (buys.tier <= have) return { kind: "maxed", axis: buys.axis };
  // Only tier 1 can be skipped past: the next step is always the first material.
  return { kind: "order", axis: buys.axis, needs: MATERIALS[buys.axis][0] };
}

export function withTier(tiers: Readonly<Tiers>, axis: Axis, tier: Tier): Tiers {
  return { ...tiers, [axis]: tier };
}

/** Every item fed to reach these tiers, one per tier above the base. */
export function materialsToReturn(tiers: Readonly<Tiers>): string[] {
  const out: string[] = [];
  for (const axis of AXES) {
    const [second, third] = MATERIALS[axis];
    if (tiers[axis] >= 2) out.push(second);
    if (tiers[axis] >= 3) out.push(third);
  }
  return out;
}

/** The gate tier each ammo kind needs: plain, then tints, then the rest. */
export const GATE_FOR: Readonly<Record<Kind, Tier>> = {
  arrow: 1,
  slowness: 2,
  weakness: 2,
  decay: 2,
  snowball: 3,
  splash_slowness: 3,
  splash_weakness: 3,
  splash_decay: 3,
};

/** Which ammo kinds a gate tier lets the hopper feed. */
export function gateAllows(gate: Tier, kind: Kind): boolean {
  return gate >= GATE_FOR[kind];
}

/** The gate tier a kind needs, for the message when it is refused. */
export function gateFor(kind: Kind): Tier {
  return GATE_FOR[kind];
}

export function describeTiers(tiers: Readonly<Tiers>): string {
  return AXES.map((a) => `${AXIS_LABEL[a]} ${TIER_NAME[tiers[a]]}`).join(", ");
}
