/**
 * What a funnel does on one cycle. Pure - no @minecraft imports.
 *
 * The engine describes the two blocks at the funnel's mouth and spout as
 * endpoints; this decides the operation and the resulting states. The engine
 * then applies exactly what is returned, so every decision here is testable
 * without a world, and the engine never has to reason about recipes.
 *
 *   Cauldrons are tanks. Funnels are pipes. Dispensers are ports.
 */
import {
  MAX_LEVEL,
  normalise,
  type CauldronState,
  type ItemRef,
  type Rule,
  type RuleResult,
} from "@qol/shared/core/fluids";

export type Endpoint =
  /** A block with an inventory: chest, hopper, dropper, barrel. Slot-indexed. */
  | { kind: "container"; items: readonly (ItemRef | undefined)[] }
  | { kind: "cauldron"; state: CauldronState }
  /** An infinite source block. */
  | { kind: "source"; fluid: "water" | "lava" }
  /** Air. `sky` when nothing solid stands above it in its column. */
  | { kind: "open"; sky: boolean }
  /** A crop block; `mature` when it can be harvested. */
  | { kind: "crop"; mature: boolean }
  | { kind: "other" };

export interface Policy {
  /** Rule id -> enabled, from the settings panel. */
  rules: Readonly<Record<string, boolean>>;
  /** Water source / cauldron-to-cauldron transfer. */
  transfer: boolean;
  /** Fill a cauldron below an upward-facing mouth during rain. */
  rain: boolean;
  /** Harvest and replant a mature crop at the mouth into a container at the spout. */
  harvest: boolean;
  /** Pull dropped items around an open mouth into a container at the spout. */
  collect: boolean;
  /** Units of wear (one per concrete block) before a level is drained. */
  concretePerLevel: number;
}

export interface Context {
  raining: boolean;
  /** Wear this funnel has accumulated against its tank. */
  wear: number;
}

export type Applied = Extract<RuleResult, { kind: "apply" }>;

export type Plan =
  | { kind: "idle" }
  | {
      kind: "process";
      /** Source slot the item comes from. */
      slot: number;
      ruleId: string;
      result: Applied;
      /** Tank state after the rule AND any wear-driven drain. */
      cauldron: CauldronState;
      /** Wear to store on the funnel afterwards. */
      wear: number;
    }
  | { kind: "fill"; dest: CauldronState; sound: string }
  | { kind: "move"; src: CauldronState; dest: CauldronState }
  /** Harvest the crop at the mouth; drops go to the container at the spout. */
  | { kind: "harvest" }
  /** Pull item entities near the mouth into the container at the spout. */
  | { kind: "collect" };

export const IDLE: Plan = { kind: "idle" };

/** +1 level of `fluid` into `dest`, or undefined if it will not take it. */
export function fillOne(
  dest: CauldronState,
  fluid: CauldronState["fluid"],
): CauldronState | undefined {
  if (fluid === "empty") return undefined;
  if (dest.level <= 0 || dest.fluid === "empty") return { fluid, level: 1 };
  if (dest.fluid !== fluid) return undefined;
  if (dest.level >= MAX_LEVEL) return undefined;
  return { fluid, level: dest.level + 1 };
}

/**
 * Apply accumulated wear: once it reaches the threshold, one level goes.
 * Returns the tank after the drain and the wear left over.
 */
export function applyWear(
  cauldron: CauldronState,
  wear: number,
  threshold: number,
): { cauldron: CauldronState; wear: number } {
  const limit = Math.max(1, Math.floor(threshold));
  if (wear < limit) return { cauldron, wear };
  return {
    cauldron: normalise({ fluid: cauldron.fluid, level: cauldron.level - 1 }),
    wear: wear - limit,
  };
}

export function plan(
  input: Endpoint,
  output: Endpoint,
  ctx: Context,
  policy: Policy,
  rules: Readonly<Record<string, Rule>>,
): Plan {
  // A container at the spout takes solid things: a harvest, or what lies around.
  if (output.kind === "container") {
    if (input.kind === "crop")
      return policy.harvest && input.mature ? { kind: "harvest" } : IDLE;
    if (input.kind === "open")
      return policy.collect ? { kind: "collect" } : IDLE;
    return IDLE;
  }
  // Everything else a funnel does ends in a tank.
  if (output.kind !== "cauldron") return IDLE;
  const tank = output.state;

  switch (input.kind) {
    case "container": {
      for (let slot = 0; slot < input.items.length; slot++) {
        const item = input.items[slot];
        if (!item) continue;
        for (const [ruleId, rule] of Object.entries(rules)) {
          if (!policy.rules[ruleId]) continue;
          const result = rule({ item, cauldron: tank });
          if (result.kind !== "apply") continue;
          const worn = applyWear(
            result.cauldron,
            ctx.wear + (result.wear ?? 0),
            policy.concretePerLevel,
          );
          return {
            kind: "process",
            slot,
            ruleId,
            result,
            cauldron: worn.cauldron,
            wear: worn.wear,
          };
        }
      }
      return IDLE;
    }
    case "source": {
      if (!policy.transfer) return IDLE;
      const dest = fillOne(tank, input.fluid);
      if (!dest) return IDLE;
      return {
        kind: "fill",
        dest,
        sound:
          input.fluid === "lava" ? "bucket.empty_lava" : "bucket.empty_water",
      };
    }
    case "cauldron": {
      if (!policy.transfer) return IDLE;
      const src = input.state;
      if (src.level <= 0 || src.fluid === "empty") return IDLE;
      const dest = fillOne(tank, src.fluid);
      if (!dest) return IDLE;
      return {
        kind: "move",
        src: normalise({ fluid: src.fluid, level: src.level - 1 }),
        dest,
      };
    }
    case "open": {
      if (!policy.rain || !input.sky || !ctx.raining) return IDLE;
      const dest = fillOne(tank, "water");
      if (!dest) return IDLE;
      return { kind: "fill", dest, sound: "bucket.empty_water" };
    }
    default:
      return IDLE;
  }
}
