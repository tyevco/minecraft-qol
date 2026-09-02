import {
  bucketRule,
  bottleRule,
  dyeRule,
  washRule,
  type Rule,
} from "@qol/shared/core/fluids";

export type {
  ItemRef,
  Output,
  RuleInput,
  RuleResult,
  Rule,
} from "@qol/shared/core/fluids";
export { bucketRule, bottleRule, dyeRule, washRule };

/**
 * Feature id -> rule, for the dispenser. The ids are persisted in world
 * settings, so they are storage keys: never rename one without a migration.
 *
 * Concrete is deliberately absent: a dispenser ejecting concrete powder would
 * place it, not drop it, so the interception model does not apply. Fluidworks
 * handles that recipe from a funnel.
 */
export const RULES: Readonly<Record<string, Rule>> = {
  cauldron_buckets: bucketRule,
  cauldron_bottles: bottleRule,
  cauldron_dye: dyeRule,
  cauldron_wash: washRule,
};
