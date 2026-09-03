/**
 * Hatchling - the pure decisions.
 *
 * Everything an egg or a hatchling does in response to a player is decided
 * here from plain values (what was held, when it was last tended, what the
 * panel says) and carried out by engine/. Nothing in this file imports
 * @minecraft/*, so every branch is under Vitest.
 *
 * The shape of the feature:
 *
 *   egg     warm it with the variant's item, `warmingsToHatch` times, with a
 *           rest between warmings; the shell cracks on the way; then it hatches
 *   pet     the first player to feed it sweet berries bonds with it (that part
 *           is vanilla `minecraft:tameable`, since script cannot tame); every
 *           `feedingsPerStage` feedings after that it grows a size, up to two
 *           sizes; a grown hatchling still enjoys a treat
 */

export type Variant = 0 | 1 | 2;
export type Stage = 0 | 1 | 2;

export interface VariantInfo {
  id: Variant;
  key: "ember" | "moss" | "frost";
  name: string;
  /** The item that places an egg of this variant. */
  eggItem: string;
  /** What warms the egg, and what the crafting recipe is made of. */
  warmItem: string;
  warmItemName: string;
}

export const VARIANTS: readonly VariantInfo[] = [
  {
    id: 0,
    key: "ember",
    name: "Ember",
    eggItem: "hatchling:egg_ember",
    warmItem: "minecraft:coal",
    warmItemName: "coal",
  },
  {
    id: 1,
    key: "moss",
    name: "Moss",
    eggItem: "hatchling:egg_moss",
    warmItem: "minecraft:bone_meal",
    warmItemName: "bone meal",
  },
  {
    id: 2,
    key: "frost",
    name: "Frost",
    eggItem: "hatchling:egg_frost",
    warmItem: "minecraft:snowball",
    warmItemName: "a snowball",
  },
];

/** What a hatchling eats: to bond (vanilla tame item) and to grow (script). */
export const FOOD = "minecraft:sweet_berries";
export const FOOD_NAME = "sweet berries";

export const MAX_CRACKS = 2;
export const MAX_STAGE: Stage = 2;

export function variantById(id: number): VariantInfo | undefined {
  return VARIANTS.find((v) => v.id === id);
}

export function variantOfEggItem(itemId: string | undefined): VariantInfo | undefined {
  return itemId === undefined ? undefined : VARIANTS.find((v) => v.eggItem === itemId);
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export interface Policy {
  warmingsToHatch: number;
  warmCooldownMs: number;
  feedingsPerStage: number;
  feedCooldownMs: number;
  /** Off: only the owner may feed a bonded hatchling. Eggs are always shared. */
  anyoneCanTend: boolean;
}

const MINUTE_MS = 60_000;

export const DEFAULT_POLICY: Policy = {
  warmingsToHatch: 3,
  warmCooldownMs: 10 * MINUTE_MS,
  feedingsPerStage: 4,
  feedCooldownMs: 15 * MINUTE_MS,
  anyoneCanTend: true,
};

function slider(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toggle(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

/** Missing or malformed values fall back to the defaults, never to "off". */
export function parsePolicy(raw: Readonly<Record<string, unknown>>): Policy {
  return {
    warmingsToHatch: slider(raw["hatchling:warmings"], DEFAULT_POLICY.warmingsToHatch, 1, 6),
    warmCooldownMs:
      slider(raw["hatchling:warm_cooldown"], DEFAULT_POLICY.warmCooldownMs / MINUTE_MS, 0, 60) *
      MINUTE_MS,
    feedingsPerStage: slider(raw["hatchling:feedings"], DEFAULT_POLICY.feedingsPerStage, 1, 10),
    feedCooldownMs:
      slider(raw["hatchling:feed_cooldown"], DEFAULT_POLICY.feedCooldownMs / MINUTE_MS, 0, 60) *
      MINUTE_MS,
    anyoneCanTend: toggle(raw["hatchling:anyone_tends"], DEFAULT_POLICY.anyoneCanTend),
  };
}

export function samePolicy(a: Policy, b: Policy): boolean {
  return (
    a.warmingsToHatch === b.warmingsToHatch &&
    a.warmCooldownMs === b.warmCooldownMs &&
    a.feedingsPerStage === b.feedingsPerStage &&
    a.feedCooldownMs === b.feedCooldownMs &&
    a.anyoneCanTend === b.anyoneCanTend
  );
}

export function describePolicy(p: Policy): string {
  return (
    `hatch after ${p.warmingsToHatch} warming(s), ${p.warmCooldownMs / MINUTE_MS} min apart; ` +
    `grow every ${p.feedingsPerStage} feeding(s), ${p.feedCooldownMs / MINUTE_MS} min apart; ` +
    (p.anyoneCanTend ? "anyone tends" : "owner feeds")
  );
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Milliseconds still to wait, or 0. A missing `lastAt` means never tended. */
export function cooldownRemaining(
  lastAt: number | undefined,
  now: number,
  cooldownMs: number,
): number {
  if (lastAt === undefined || cooldownMs <= 0) return 0;
  // A clock that went backwards (world restored from backup) must not lock the
  // egg forever: treat the future as "just now".
  const elapsed = Math.max(0, now - lastAt);
  return Math.max(0, cooldownMs - elapsed);
}

export function describeWait(ms: number): string {
  const minutes = Math.ceil(ms / MINUTE_MS);
  if (minutes <= 1) return "a minute";
  return `${minutes} minutes`;
}

// ---------------------------------------------------------------------------
// The egg
// ---------------------------------------------------------------------------

export interface EggState {
  variant: Variant;
  /** Warmings so far. */
  warmings: number;
  lastWarmAt: number | undefined;
}

export type WarmOutcome =
  | { kind: "not_warm_item"; wants: string }
  | { kind: "cooldown"; remainingMs: number }
  | { kind: "warmed"; warmings: number; cracks: number }
  | { kind: "hatch" };

/** How cracked an egg looks after `warmings` of `toHatch`: 0, then 1, then 2. */
export function cracksFor(warmings: number, toHatch: number): number {
  if (toHatch <= 0) return MAX_CRACKS;
  return Math.min(MAX_CRACKS, Math.ceil((warmings * MAX_CRACKS) / toHatch));
}

export function warm(
  state: EggState,
  heldItem: string | undefined,
  now: number,
  policy: Policy,
): WarmOutcome {
  const variant = variantById(state.variant) ?? VARIANTS[0]!;
  if (heldItem !== variant.warmItem) return { kind: "not_warm_item", wants: variant.warmItemName };
  const remainingMs = cooldownRemaining(state.lastWarmAt, now, policy.warmCooldownMs);
  if (remainingMs > 0) return { kind: "cooldown", remainingMs };
  const warmings = state.warmings + 1;
  if (warmings >= policy.warmingsToHatch) return { kind: "hatch" };
  return { kind: "warmed", warmings, cracks: cracksFor(warmings, policy.warmingsToHatch) };
}

// ---------------------------------------------------------------------------
// The hatchling
// ---------------------------------------------------------------------------

export interface PetState {
  stage: Stage;
  /** Feedings towards the next stage. */
  feedings: number;
  lastFedAt: number | undefined;
  /** The bonded player, from the vanilla tameable component. */
  ownerId: string | undefined;
}

export type FeedOutcome =
  | { kind: "not_food" }
  | { kind: "not_owner" }
  | { kind: "cooldown"; remainingMs: number }
  | { kind: "fed"; feedings: number; toGo: number }
  | { kind: "grow"; stage: Stage }
  | { kind: "treat" };

export function feed(
  state: PetState,
  heldItem: string | undefined,
  tenderId: string,
  now: number,
  policy: Policy,
): FeedOutcome {
  if (heldItem !== FOOD) return { kind: "not_food" };
  if (!policy.anyoneCanTend && state.ownerId !== undefined && state.ownerId !== tenderId)
    return { kind: "not_owner" };
  const remainingMs = cooldownRemaining(state.lastFedAt, now, policy.feedCooldownMs);
  if (remainingMs > 0) return { kind: "cooldown", remainingMs };
  if (state.stage >= MAX_STAGE) return { kind: "treat" };
  const feedings = state.feedings + 1;
  if (feedings >= policy.feedingsPerStage) return { kind: "grow", stage: (state.stage + 1) as Stage };
  return { kind: "fed", feedings, toGo: policy.feedingsPerStage - feedings };
}

export const STAGE_NAMES: readonly string[] = ["hatchling", "young", "grown"];
