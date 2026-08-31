import { world } from "@minecraft/server";

const PROP = "qol_times:settings";

/**
 * Feature ids double as storage keys, so renaming one needs a migration.
 * Defaults live here rather than in the stored blob: a feature added later
 * simply has no key yet, so it picks up its default with no migration at all.
 */
export const FEATURE_DEFAULTS: Readonly<Record<string, boolean>> = {
  cauldron_buckets: true,
  cauldron_bottles: true,
  cauldron_dye: true,
  cauldron_wash: true,
};

let cache: Record<string, boolean> = { ...FEATURE_DEFAULTS };

export function load(): void {
  cache = { ...FEATURE_DEFAULTS };
  const raw = world.getDynamicProperty(PROP);
  if (typeof raw !== "string") return;
  try {
    const stored = JSON.parse(raw) as Record<string, unknown>;
    // Only adopt keys we still know about, so deleted features do not linger.
    for (const key of Object.keys(FEATURE_DEFAULTS)) {
      if (typeof stored[key] === "boolean") cache[key] = stored[key] as boolean;
    }
  } catch {
    // Corrupt blob: fall back to defaults rather than disabling everything.
  }
}

export function isEnabled(featureId: string): boolean {
  return cache[featureId] ?? true;
}

export function setEnabled(featureId: string, value: boolean): void {
  cache[featureId] = value;
  try {
    world.setDynamicProperty(PROP, JSON.stringify(cache));
  } catch {
    /* non-fatal */
  }
}

export function snapshot(): Readonly<Record<string, boolean>> {
  return { ...cache };
}
