/**
 * What a funnel does on one cycle. Pure - no @minecraft imports.
 *
 * The engine describes the two blocks at the funnel's mouth and spout as
 * endpoints; this decides the operation and the resulting states. The engine
 * then applies exactly what is returned, so every decision here is testable
 * without a world, and the engine never has to reason about recipes.
 *
 * An idle plan says why. The reason is what the player is shown, and it
 * separates a funnel that is merely waiting (empty hopper, full tank) from
 * one whose build is wrong (nothing at the spout, lava into water), which is
 * the difference between silence and a puff of smoke.
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

/**
 * Why a funnel did nothing this cycle.
 *
 * The first group is waiting: the build is right and the world has not
 * caught up. The second is stuck: something about the build is wrong, and
 * no amount of waiting fixes it. `isStuck` draws the line.
 */
export type IdleReason =
  /** The container at the mouth has nothing in it. */
  | "mouth_empty"
  /** The container has items, but no enabled rule takes any of them with the tank as it is. */
  | "nothing_applies"
  | "tank_full"
  /** The tank at the mouth is empty. */
  | "source_empty"
  | "not_raining"
  | "crop_growing"
  /** The spout is not at a tank or a container. */
  | "no_tank"
  /** The block at the mouth is not something this spout can take from. */
  | "no_input"
  /** The mouth offers one fluid and the tank holds another. */
  | "fluid_mismatch"
  /** The machine this build needs is switched off in the panel. */
  | "disabled"
  /** An open mouth under a roof: rain cannot reach it. */
  | "roofed";

const STUCK: ReadonlySet<IdleReason> = new Set<IdleReason>([
  "no_tank",
  "no_input",
  "fluid_mismatch",
  "disabled",
  "roofed",
]);

/** True when the build is wrong, as opposed to merely waiting. */
export function isStuck(reason: IdleReason): boolean {
  return STUCK.has(reason);
}

/** One short line per reason, for the debug readout. */
export const REASON_TEXT: Readonly<Record<IdleReason, string>> = {
  mouth_empty: "nothing in the container at the mouth",
  nothing_applies: "nothing in the container applies to this tank",
  tank_full: "the tank at the spout is full",
  source_empty: "the tank at the mouth is empty",
  not_raining: "waiting for rain",
  crop_growing: "the crop at the mouth is not mature",
  no_tank: "the spout is not at a tank or a container",
  no_input: "the block at the mouth is not something this spout can use",
  fluid_mismatch: "the mouth and the tank hold different fluids",
  disabled: "this machine is switched off in the panel",
  roofed: "the mouth is under a roof, so rain cannot reach it",
};

export type Plan =
  | { kind: "idle"; reason: IdleReason }
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

const idle = (reason: IdleReason): Plan => ({ kind: "idle", reason });

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

/** Why `fillOne` refused: the only two ways it can. */
function fillFailure(
  dest: CauldronState,
  fluid: CauldronState["fluid"],
): IdleReason {
  const empty = dest.level <= 0 || dest.fluid === "empty";
  return !empty && dest.fluid !== fluid ? "fluid_mismatch" : "tank_full";
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
    if (input.kind === "crop") {
      if (!policy.harvest) return idle("disabled");
      return input.mature ? { kind: "harvest" } : idle("crop_growing");
    }
    if (input.kind === "open")
      return policy.collect ? { kind: "collect" } : idle("disabled");
    return idle("no_input");
  }
  // Everything else a funnel does ends in a tank.
  if (output.kind !== "cauldron") return idle("no_tank");
  const tank = output.state;

  switch (input.kind) {
    case "container": {
      let sawItem = false;
      let heldBack = false; // a switched-off rule would have taken something
      for (let slot = 0; slot < input.items.length; slot++) {
        const item = input.items[slot];
        if (!item) continue;
        sawItem = true;
        for (const [ruleId, rule] of Object.entries(rules)) {
          const result = rule({ item, cauldron: tank });
          if (result.kind !== "apply") continue;
          if (!policy.rules[ruleId]) {
            heldBack = true;
            continue;
          }
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
      if (heldBack) return idle("disabled");
      return idle(sawItem ? "nothing_applies" : "mouth_empty");
    }
    case "source": {
      if (!policy.transfer) return idle("disabled");
      const dest = fillOne(tank, input.fluid);
      if (!dest) return idle(fillFailure(tank, input.fluid));
      return {
        kind: "fill",
        dest,
        sound:
          input.fluid === "lava" ? "bucket.empty_lava" : "bucket.empty_water",
      };
    }
    case "cauldron": {
      if (!policy.transfer) return idle("disabled");
      const src = input.state;
      if (src.level <= 0 || src.fluid === "empty") return idle("source_empty");
      const dest = fillOne(tank, src.fluid);
      if (!dest) return idle(fillFailure(tank, src.fluid));
      return {
        kind: "move",
        src: normalise({ fluid: src.fluid, level: src.level - 1 }),
        dest,
      };
    }
    case "open": {
      if (!policy.rain) return idle("disabled");
      if (!input.sky) return idle("roofed");
      if (!ctx.raining) return idle("not_raining");
      const dest = fillOne(tank, "water");
      if (!dest) return idle(fillFailure(tank, "water"));
      return { kind: "fill", dest, sound: "bucket.empty_water" };
    }
    default:
      return idle("no_input");
  }
}
