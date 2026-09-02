/**
 * The Guardian damage table. Pure - no @minecraft imports.
 *
 * Difficulty is a world setting, so the only vanilla lever is to make the
 * whole realm easier for everyone. Guardian makes how much damage a player
 * takes a per-role choice instead - `(role, cause) -> vanilla | scale | immune`
 * - which is a decision table with the engine kept out of it, the same shape
 * as the cauldron rules and the Lens spawn predicate. It tests exhaustively
 * over every damage cause and every role.
 *
 * Design stance, enforced by the types: Guardian only ever REDUCES what would
 * have happened. Scales are at most 100%, nothing here can raise a number,
 * and a role at 100% with no switches on is never touched at all.
 */
import { ROLES, type Role } from "@qol/shared/core/roles";

export type { Role } from "@qol/shared/core/roles";
export { ROLES } from "@qol/shared/core/roles";

/**
 * Percent of vanilla damage that lands. A dropdown rather than a slider so the
 * choices read as sentences ("Members take half damage") and stay to a small,
 * tested set. 0 is "no damage at all".
 */
export type Scale = 100 | 75 | 50 | 25 | 0;

export const SCALES: readonly Scale[] = [100, 75, 50, 25, 0];

/**
 * Every damage cause in `EntityDamageCause` as of @minecraft/server 2.9.0,
 * spelled as the engine spells them. Listed here rather than imported so the
 * table stays pure; `tests/rules.test.ts` walks all of them.
 *
 * Note what is NOT here: there is no `void` cause in 2.9.0. Falling out of the
 * world cannot be matched by cause, which is why the void catch is a teleport
 * and a separate switch.
 */
export const CAUSES = [
  "anvil",
  "blockExplosion",
  "campfire",
  "charging",
  "contact",
  "drowning",
  "entityAttack",
  "entityExplosion",
  "fall",
  "fallingBlock",
  "fire",
  "fireTick",
  "fireworks",
  "flyIntoWall",
  "freezing",
  "lava",
  "lightning",
  "maceSmash",
  "magic",
  "magma",
  "none",
  "override",
  "piston",
  "projectile",
  "ramAttack",
  "selfDestruct",
  "sonicBoom",
  "soulCampfire",
  "stalactite",
  "stalagmite",
  "starve",
  "suffocation",
  "temperature",
  "thorns",
  "wither",
] as const;

export type Cause = (typeof CAUSES)[number];

/** The deaths that hurt most, each behind its own switch on the panel. */
export type Hazard = "fall" | "burn" | "drown";

export const HAZARDS: readonly Hazard[] = ["fall", "burn", "drown"];

/**
 * Which causes each switch covers.
 *
 * "fall" includes the two other ways of hitting something hard: landing on a
 * stalagmite and an elytra crash. "burn" is every way of being on or in
 * something hot; standing on magma is the one people forget.
 */
export const HAZARD_CAUSES: Readonly<Record<Hazard, readonly Cause[]>> = {
  fall: ["fall", "stalagmite", "flyIntoWall"],
  burn: ["fire", "fireTick", "lava", "magma", "campfire", "soulCampfire"],
  drown: ["drowning"],
};

/**
 * Causes Guardian never touches, whatever the panel says.
 *
 * `override` is the /kill and /damage commands: an operator who runs them
 * means it. `none` is damage with no attributable cause, which is where an
 * unmodelled source such as the void may land; cancelling it for a player
 * falling through the End would leave them falling forever, and the void
 * catch is that case's cover.
 */
export const PASS_THROUGH: readonly Cause[] = ["override", "none"];

export interface Policy {
  /** Percent of vanilla damage each role takes. */
  scale: Record<Role, Scale>;
  /** Hazard immunities. Apply to protected roles only - see `isProtectedRole`. */
  immune: Record<Hazard, boolean>;
  /** Put a player who falls out of the world back where they last stood. */
  voidCatch: boolean;
  /** Show a brief action-bar line when a hit was softened or cancelled. */
  announce: boolean;
}

/**
 * The panel before anyone touches it. Members - the role a Realm gives a new
 * player - take half; visitors, who cannot build anyway, a quarter; operators
 * play vanilla. Falls and burns are the two deaths that end a kid's session,
 * so those switches start on; drowning is rarer and starts off.
 */
export const DEFAULT_POLICY: Policy = {
  scale: { visitor: 25, member: 50, operator: 100 },
  immune: { fall: true, burn: true, drown: false },
  voidCatch: true,
  announce: false,
};

/** Setting names as declared in behavior_pack/manifest.json. */
export const SETTING = {
  visitor: "guardian:visitors",
  member: "guardian:members",
  operator: "guardian:operators",
  fall: "guardian:no_fall",
  burn: "guardian:no_burn",
  drown: "guardian:no_drown",
  voidCatch: "guardian:void_catch",
  announce: "guardian:announce",
} as const;

/**
 * Whether a role gets the hazard switches and the void catch.
 *
 * The panel says "Visitors and Members" and means it: operators are the
 * adults, and an adult who wants less damage sets their own dropdown. Keeping
 * the switches off operators regardless of their scale is what makes "set
 * Operators to 50%" a one-line change rather than a surprise.
 */
export function isProtectedRole(role: Role): boolean {
  return role !== "operator";
}

export function parseScale(raw: unknown, fallback: Scale): Scale {
  // Dropdowns read back as their option NAME, which is a string; accept a
  // number too so nothing depends on which the engine chooses.
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && (SCALES as readonly number[]).includes(n)
    ? (n as Scale)
    : fallback;
}

/**
 * Build a policy from whatever the engine hands back for the settings panel.
 * A missing or malformed value falls back to its default rather than to
 * vanilla, so a half-loaded settings blob never silently unprotects anyone.
 */
export function parsePolicy(raw: Readonly<Record<string, unknown>>): Policy {
  const scale = {} as Record<Role, Scale>;
  for (const role of ROLES)
    scale[role] = parseScale(raw[SETTING[role]], DEFAULT_POLICY.scale[role]);
  const bool = (key: string, fallback: boolean): boolean =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : fallback;
  const immune = {} as Record<Hazard, boolean>;
  for (const hazard of HAZARDS)
    immune[hazard] = bool(SETTING[hazard], DEFAULT_POLICY.immune[hazard]);
  return {
    scale,
    immune,
    voidCatch: bool(SETTING.voidCatch, DEFAULT_POLICY.voidCatch),
    announce: bool(SETTING.announce, DEFAULT_POLICY.announce),
  };
}

export function samePolicy(a: Policy, b: Policy): boolean {
  return (
    a.voidCatch === b.voidCatch &&
    a.announce === b.announce &&
    ROLES.every((r) => a.scale[r] === b.scale[r]) &&
    HAZARDS.every((h) => a.immune[h] === b.immune[h])
  );
}

export function describePolicy(p: Policy): string {
  const on = HAZARDS.filter((h) => p.immune[h]).join("+") || "none";
  return (
    `visitors=${p.scale.visitor}% members=${p.scale.member}% operators=${p.scale.operator}%` +
    ` immune=${on} void=${p.voidCatch} announce=${p.announce}`
  );
}

export function hazardOf(cause: string): Hazard | undefined {
  for (const hazard of HAZARDS)
    if ((HAZARD_CAUSES[hazard] as readonly string[]).includes(cause)) return hazard;
  return undefined;
}

export type Verdict =
  /** Leave the hit exactly as the engine computed it. */
  | { kind: "vanilla" }
  /** Cancel the hit. `why` names the switch or scale responsible. */
  | { kind: "immune"; why: Hazard | "scale" | "rescued" }
  /** Multiply the damage. Always strictly between 0 and 1. */
  | { kind: "scale"; multiplier: number };

export interface Context {
  /**
   * The player was just pulled out of the void. A teleport is meant to reset
   * fall distance, but if it does not, the landing must not be the thing that
   * hurts them - so falls are cancelled for a moment after a rescue whatever
   * the panel says.
   */
  justRescued?: boolean;
}

/**
 * What to do about one hit.
 *
 * Order matters and is deliberate: pass-through first, so nothing below can
 * touch a command or an unattributed source; then a recent rescue; then the
 * hazard switches, which are the specific promise ("never falls to their
 * death") and must hold even at 100%; then the role's scale.
 */
export function decide(
  role: Role,
  cause: string,
  policy: Policy,
  ctx: Context = {},
): Verdict {
  if ((PASS_THROUGH as readonly string[]).includes(cause)) return { kind: "vanilla" };

  const hazard = hazardOf(cause);
  if (isProtectedRole(role)) {
    if (ctx.justRescued && hazard === "fall") return { kind: "immune", why: "rescued" };
    if (hazard && policy.immune[hazard]) return { kind: "immune", why: hazard };
  }

  const scale = policy.scale[role];
  if (scale >= 100) return { kind: "vanilla" };
  if (scale <= 0) return { kind: "immune", why: "scale" };
  return { kind: "scale", multiplier: scale / 100 };
}

/**
 * Apply a verdict to the number the engine proposed. Never returns more than
 * it was given, and never a negative or non-finite amount.
 */
export function adjust(damage: number, verdict: Verdict): { cancel: boolean; damage: number } {
  if (verdict.kind === "immune") return { cancel: true, damage: 0 };
  if (verdict.kind === "vanilla" || !Number.isFinite(damage) || damage <= 0)
    return { cancel: false, damage };
  return { cancel: false, damage: damage * verdict.multiplier };
}

/** One short line for the action bar, or nothing when the hit was untouched. */
export function announcement(verdict: Verdict): string | undefined {
  switch (verdict.kind) {
    case "vanilla":
      return undefined;
    case "scale":
      return `§7Guardian softened that. §8(${Math.round(verdict.multiplier * 100)}%)`;
    case "immune":
      return verdict.why === "scale" || verdict.why === "rescued"
        ? "§7Guardian took that hit."
        : `§7Guardian took that hit. §8(${SWITCH_LABEL[verdict.why]})`;
  }
}

const SWITCH_LABEL: Readonly<Record<Hazard, string>> = {
  fall: "no fall damage",
  burn: "no fire damage",
  drown: "no drowning",
};
