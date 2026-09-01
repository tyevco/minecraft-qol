/**
 * Lens tiers. Pure - no @minecraft imports, so it unit-tests in plain Node.
 *
 * Bedrock cannot define custom enchantments (closed registry, no definition
 * schema, `new EnchantmentType(id)` throws on unknown ids), so the tier is not
 * an enchantment. It lives as a dynamic property on the item instance and is
 * displayed as a lore line - which is what every addon advertising "custom
 * enchantments" actually does.
 */

export type Tier = 1 | 2;

export const MIN_TIER: Tier = 1;
export const MAX_TIER: Tier = 2;

/** Dynamic-property key. This is storage, so renaming it needs a migration. */
export const TIER_KEY = "lens:tier";

/** Coerce anything read back from storage into a legal tier. */
export function clampTier(value: unknown): Tier {
  const n = typeof value === "number" ? Math.floor(value) : MIN_TIER;
  if (!Number.isFinite(n) || n < MIN_TIER) return MIN_TIER;
  return n >= MAX_TIER ? MAX_TIER : MIN_TIER;
}

export function nextTier(tier: Tier): Tier | undefined {
  return tier >= MAX_TIER ? undefined : ((tier + 1) as Tier);
}

const ROMAN: Record<Tier, string> = { 1: "I", 2: "II" };

/** "I" / "II" - used in messages as well as lore. */
export function tierLabel(tier: Tier): string {
  return ROMAN[tier];
}

/**
 * Lore lines shown on the item.
 *
 * Kept within the engine's limits deliberately: at most 20 lines, at most 50
 * characters each, or setLore throws.
 */
export function loreForTier(tier: Tier): string[] {
  const lines = [`§7Spawn Sight ${ROMAN[tier]}`];
  lines.push(
    tier >= 2
      ? "§8Marks spawn spots and suggests torch places"
      : "§8Marks where hostile mobs can spawn",
  );
  return lines;
}

/** Only tier 2 computes and shows lighting suggestions. */
export function tierSuggestsLighting(tier: Tier): boolean {
  return tier >= 2;
}

/**
 * Pick the best of several carried Lenses.
 *
 * Highest tier wins; input order breaks ties only. Taking the first match
 * instead would mean a spare tier 1 worn on the head silently overrides a tier 2
 * held in the hand - which is a downgrade for carrying more.
 */
export function bestByTier<T extends { tier: Tier }>(found: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const item of found) {
    if (!best || item.tier > best.tier) best = item;
  }
  return best;
}
