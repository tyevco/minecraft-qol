import { bucketRule } from "./buckets";
import { bottleRule } from "./bottles";
import { concreteRule } from "./concrete";
import { dyeRule } from "./dye";
import { washRule } from "./wash";
import type { Rule } from "./types";

export * from "./types";
export * from "./cauldron";
export * from "./items";
export { bucketRule, bottleRule, concreteRule, dyeRule, washRule };

/**
 * Every cauldron rule, by a stable id. Packs pick the subset they expose and
 * gate each behind their own setting; the ids are what those settings are
 * keyed by, so never rename one without a migration.
 */
export const CAULDRON_RULES: Readonly<Record<string, Rule>> = {
  cauldron_buckets: bucketRule,
  cauldron_bottles: bottleRule,
  cauldron_dye: dyeRule,
  cauldron_wash: washRule,
  cauldron_concrete: concreteRule,
};
