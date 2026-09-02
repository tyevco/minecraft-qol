/**
 * Graves policy. Pure - no @minecraft imports.
 *
 * Three modes:
 *
 *   off    vanilla: items drop where you died and despawn in five minutes
 *   grave  items move into a gravestone at the death site; walk back for them
 *   keep   items stay in your inventory through death, like keepInventory but
 *          for you alone
 *
 * The mode is chosen per **permission role** in the pack's settings panel.
 * Behaviour-pack settings are per world and cannot name individual players, so
 * the role is the handle: on a Realm every player already has one, set from the
 * member list, which makes this per-player control in practice - the kids are
 * Members, the parents are Operators.
 */
export type Mode = "off" | "grave" | "keep";

export const MODES: readonly Mode[] = ["off", "grave", "keep"];

export type Role = "visitor" | "member" | "operator";

export const ROLES: readonly Role[] = ["visitor", "member", "operator"];

export interface Policy {
  /** Mode per role. */
  modes: Record<Role, Mode>;
  /** Tell a player where their gravestone is when they die. */
  announce: boolean;
  /** Anyone may open any gravestone, not just its owner and operators. */
  publicGraves: boolean;
  /** Mark a player's own gravestones on their locator bar. */
  waypoint: boolean;
}

/**
 * What the panel shows before anyone touches it. Members - the role a Realm
 * gives new players - get a gravestone; operators keep vanilla; visitors, who
 * cannot build anyway, keep everything.
 */
export const DEFAULT_POLICY: Policy = {
  modes: { visitor: "keep", member: "grave", operator: "off" },
  announce: true,
  publicGraves: false,
  waypoint: true,
};

/** Setting names as declared in behavior_pack/manifest.json. */
export const SETTING = {
  visitor: "graves:visitors",
  member: "graves:members",
  operator: "graves:operators",
  announce: "graves:announce",
  publicGraves: "graves:public",
  waypoint: "graves:waypoint",
} as const;

export function parseMode(raw: unknown, fallback: Mode = "off"): Mode {
  return typeof raw === "string" && (MODES as readonly string[]).includes(raw)
    ? (raw as Mode)
    : fallback;
}

/**
 * Build a policy from whatever the engine hands back for the settings panel.
 * A missing or malformed value falls back to its default rather than to
 * vanilla, so a half-loaded settings blob never silently unprotects anyone.
 */
export function parsePolicy(raw: Readonly<Record<string, unknown>>): Policy {
  const modes = {} as Record<Role, Mode>;
  for (const role of ROLES)
    modes[role] = parseMode(raw[SETTING[role]], DEFAULT_POLICY.modes[role]);
  const bool = (key: string, fallback: boolean): boolean =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : fallback;
  return {
    modes,
    announce: bool(SETTING.announce, DEFAULT_POLICY.announce),
    publicGraves: bool(SETTING.publicGraves, DEFAULT_POLICY.publicGraves),
    waypoint: bool(SETTING.waypoint, DEFAULT_POLICY.waypoint),
  };
}

export function samePolicy(a: Policy, b: Policy): boolean {
  return (
    a.announce === b.announce &&
    a.publicGraves === b.publicGraves &&
    a.waypoint === b.waypoint &&
    ROLES.every((r) => a.modes[r] === b.modes[r])
  );
}

/**
 * Whether items should carry the engine's keep-on-death flag.
 *
 * Both non-vanilla modes rely on it: in `keep` it is the whole feature, in
 * `grave` it is what guarantees the inventory is still intact when the death
 * event fires, so the items can be moved rather than chased as drops.
 */
export function keepsItems(mode: Mode): boolean {
  return mode !== "off";
}

export function describeMode(mode: Mode): string {
  switch (mode) {
    case "off":
      return "off - items drop where you die";
    case "grave":
      return "grave - items wait in a gravestone where you died";
    case "keep":
      return "keep - items stay with you through death";
  }
}
