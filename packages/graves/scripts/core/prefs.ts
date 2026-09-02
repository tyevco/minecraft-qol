/**
 * Per-player Graves preferences. Pure - no @minecraft imports.
 *
 * Three modes, chosen per player rather than per world, because the whole point
 * is that the players who find dying frustrating can be protected without
 * changing the game for everyone else.
 *
 *   off    vanilla: items drop where you died and despawn in five minutes
 *   grave  items move into a gravestone at the death site; walk back for them
 *   keep   items stay in your inventory through death, like keepInventory but
 *          for you alone
 */
export type Mode = "off" | "grave" | "keep";

export const MODES: readonly Mode[] = ["off", "grave", "keep"];

/** What a player gets before anyone chooses: nothing changes for them. */
export const DEFAULT_MODE: Mode = "off";

export function parseMode(raw: unknown): Mode {
  return typeof raw === "string" && (MODES as readonly string[]).includes(raw)
    ? (raw as Mode)
    : DEFAULT_MODE;
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

/**
 * Whether this player may change their own mode.
 *
 * A locked world is for parents: the kids' modes are set by an operator and a
 * curious child cannot toggle themselves back to vanilla. Operators are never
 * locked out.
 */
export function canChangeOwnMode(
  locked: boolean,
  isOperator: boolean,
): boolean {
  return !locked || isOperator;
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
