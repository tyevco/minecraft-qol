import { bucketRule } from "./buckets";
import { bottleRule } from "./bottles";
import { dyeRule } from "./dye";
import { washRule } from "./wash";
import type { Rule } from "./types";

export * from "./types";
export { bucketRule, bottleRule, dyeRule, washRule };

/**
 * Feature id -> rule. The ids are persisted in world settings, so they are
 * storage keys: never rename one without a migration.
 */
export const RULES: Readonly<Record<string, Rule>> = {
  cauldron_buckets: bucketRule,
  cauldron_bottles: bottleRule,
  cauldron_dye: dyeRule,
  cauldron_wash: washRule,
};
