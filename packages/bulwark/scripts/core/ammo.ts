/**
 * Ammo rules. Pure - no @minecraft imports.
 *
 * Two kinds of supply, because of one measured constraint. Script cannot
 * construct a tipped arrow (no aux value on ItemStack, no arrow delivery in
 * the Potions registry - docs/bulwark-ammo-results.md), so a buffered count of
 * tipped arrows could never be given back on break. Therefore:
 *
 *  - **Plain arrows are buffered.** A small virtual buffer, filled from an
 *    adjacent hopper on an interval and topped up by hand, drained one arrow
 *    per shot, returned as items when the block breaks. A cap keeps a busy
 *    turret dependent on its supply line.
 *  - **Everything else is hopper-direct.** Tipped arrows, snowballs and splash
 *    potions are never taken from the world; the head's shooter group follows
 *    the first special stack in a feeding hopper, and each shot decrements
 *    that stack where it lies. Breaking the turret then has nothing to
 *    return, and a hopper of tipped arrows stays a hopper of tipped arrows.
 *
 * What a stack is, is decided here from what the engine can read of it: the
 * type id, and for a tipped arrow its `localizationKey` (the only field that
 * names the tint), for a splash potion its potion effect id.
 */

export const AMMO_ITEM = "minecraft:arrow";
export const AMMO_CAP = 64;

/**
 * Every projectile a turret can fire. `arrow` is the buffered one; the rest
 * are drawn straight from a hopper. Each has a component group on the head.
 */
export type Kind =
  | "arrow"
  | "slowness"
  | "weakness"
  | "decay"
  | "snowball"
  | "splash_slowness"
  | "splash_weakness"
  | "splash_decay";

export const KINDS: readonly Kind[] = [
  "arrow",
  "slowness",
  "weakness",
  "decay",
  "snowball",
  "splash_slowness",
  "splash_weakness",
  "splash_decay",
];

/** Entity events that swap the ammo component group; one per kind. */
export const KIND_EVENT: Readonly<Record<Kind, string>> = {
  arrow: "bulwark:ammo_arrow",
  slowness: "bulwark:ammo_slowness",
  weakness: "bulwark:ammo_weakness",
  decay: "bulwark:ammo_decay",
  snowball: "bulwark:ammo_snowball",
  splash_slowness: "bulwark:ammo_splash_slowness",
  splash_weakness: "bulwark:ammo_splash_weakness",
  splash_decay: "bulwark:ammo_splash_decay",
};

/** What the status text calls each kind. */
export const KIND_LABEL: Readonly<Record<Kind, string>> = {
  arrow: "arrows",
  slowness: "arrows of slowness",
  weakness: "arrows of weakness",
  decay: "arrows of decay",
  snowball: "snowballs",
  splash_slowness: "splash potions of slowness",
  splash_weakness: "splash potions of weakness",
  splash_decay: "splash potions of decay",
};

/** The projectile entity each kind spawns; what shot attribution watches for. */
export const KIND_PROJECTILE: Readonly<Record<Kind, string>> = {
  arrow: "minecraft:arrow",
  slowness: "minecraft:arrow",
  weakness: "minecraft:arrow",
  decay: "minecraft:arrow",
  snowball: "minecraft:snowball",
  splash_slowness: "minecraft:splash_potion",
  splash_weakness: "minecraft:splash_potion",
  splash_decay: "minecraft:splash_potion",
};

export const PROJECTILES: ReadonlySet<string> = new Set(Object.values(KIND_PROJECTILE));

export function isKind(value: unknown): value is Kind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}

/**
 * What the engine can tell us about one stack. `localizationKey` is
 * `item.arrow.name` for a plain arrow and `tipped_arrow.effect.<effect>` for
 * a tipped one (measured); `potionEffectId` is the potion component's effect
 * for potions and splash potions, `minecraft:` prefixed, with `long_` and
 * `strong_` variants.
 */
export interface StackView {
  typeId: string;
  amount: number;
  localizationKey?: string;
  potionEffectId?: string;
}

/** One container slot, or null when empty. */
export type Slot = StackView | null;

const PLAIN_ARROW_KEY = "item.arrow.name";
const TIP_PREFIX = "tipped_arrow.effect.";

/** Tint keys the turret will fire. Poison and harming do nothing to the undead. */
const TIP_KINDS: Readonly<Record<string, Kind>> = {
  moveSlowdown: "slowness",
  weakness: "weakness",
  wither: "decay",
};

/** Splash effects the turret will throw, by the id's base name. */
const SPLASH_KINDS: Readonly<Record<string, Kind>> = {
  slowness: "splash_slowness",
  weakness: "splash_weakness",
  wither: "splash_decay",
};

function baseEffect(id: string): string {
  return id.replace(/^minecraft:/, "").replace(/^(long|strong)_/, "");
}

/**
 * Decide what a stack is to the turret, or undefined for anything it will not
 * fire. An arrow with no readable key is treated as tipped-unknown, never as
 * plain: pulling it into the buffer would silently lose a tint.
 */
export function classify(stack: StackView | undefined): Kind | undefined {
  if (!stack || stack.amount <= 0) return undefined;
  if (stack.typeId === AMMO_ITEM) {
    const key = stack.localizationKey;
    if (key === undefined || key === PLAIN_ARROW_KEY) return key === undefined ? undefined : "arrow";
    if (key.startsWith(TIP_PREFIX)) return TIP_KINDS[key.slice(TIP_PREFIX.length)];
    return undefined;
  }
  if (stack.typeId === "minecraft:snowball") return "snowball";
  if (stack.typeId === "minecraft:splash_potion" && stack.potionEffectId) {
    return SPLASH_KINDS[baseEffect(stack.potionEffectId)];
  }
  return undefined;
}

export const isSpecial = (kind: Kind | undefined): kind is Exclude<Kind, "arrow"> =>
  kind !== undefined && kind !== "arrow";

export interface Take {
  slot: number;
  amount: number;
}

export interface PullPlan {
  takes: Take[];
  ammo: number;
}

/**
 * Plan a pull of plain arrows from a container's slots into the buffer.
 *
 * Takes from the lowest slots first until the buffer is full, never splitting
 * differently from how the engine would (whole amounts per slot, partial only
 * for the last slot touched). `maxPerPull` bounds a single pull so a fresh
 * turret next to a full chest-and-hopper does not swallow four stacks at once;
 * the default matches the cap, which is the batch behaviour the design asks
 * for. Only stacks that classify as `arrow` are touched: a tipped arrow is
 * left where it is, for the hopper-direct path.
 */
export function planPull(
  ammo: number,
  slots: readonly Slot[],
  cap: number = AMMO_CAP,
  maxPerPull: number = cap,
): PullPlan {
  let room = Math.min(Math.max(0, cap - ammo), Math.max(0, maxPerPull));
  const takes: Take[] = [];
  for (let i = 0; i < slots.length && room > 0; i++) {
    const s = slots[i];
    if (!s || classify(s) !== "arrow") continue;
    const amount = Math.min(s.amount, room);
    takes.push({ slot: i, amount });
    room -= amount;
  }
  const taken = takes.reduce((n, t) => n + t.amount, 0);
  return { takes, ammo: ammo + taken };
}

export interface Special {
  slot: number;
  kind: Exclude<Kind, "arrow">;
}

/**
 * The first special stack in a container that `allowed` lets through (the
 * upgrade gate, core/tiers.ts), lowest slot first.
 */
export function findSpecial(
  slots: readonly Slot[],
  allowed: (kind: Kind) => boolean = () => true,
): Special | undefined {
  for (let i = 0; i < slots.length; i++) {
    const kind = classify(slots[i] ?? undefined);
    if (isSpecial(kind) && allowed(kind)) return { slot: i, kind };
  }
  return undefined;
}

/** The first special stack a gate refuses, for the status text. */
export function findGated(slots: readonly Slot[], allowed: (kind: Kind) => boolean): Special | undefined {
  for (let i = 0; i < slots.length; i++) {
    const kind = classify(slots[i] ?? undefined);
    if (isSpecial(kind) && !allowed(kind)) return { slot: i, kind };
  }
  return undefined;
}

/** The first stack of exactly `kind`, to charge a shot against. */
export function findKind(slots: readonly Slot[], kind: Kind): number | undefined {
  for (let i = 0; i < slots.length; i++) {
    if (classify(slots[i] ?? undefined) === kind) return i;
  }
  return undefined;
}

export interface Feed {
  /** Arrows taken from the held stack. */
  accepted: number;
  ammo: number;
  /** A special kind the player offered by hand, which only a hopper can feed. */
  refused?: Kind;
}

/** Hand-feed from a held stack; only plain arrows count, and only up to the cap. */
export function acceptFeed(ammo: number, held: StackView | undefined, cap: number = AMMO_CAP): Feed {
  const kind = classify(held);
  if (kind === undefined) return { accepted: 0, ammo };
  if (kind !== "arrow") return { accepted: 0, ammo, refused: kind };
  const accepted = Math.min(held!.amount, Math.max(0, cap - ammo));
  return { accepted, ammo: ammo + accepted };
}

export function consumeShot(ammo: number): number {
  return Math.max(0, ammo - 1);
}

export function isArmed(ammo: number): boolean {
  return ammo > 0;
}

/**
 * What the head should be wearing: armed or not, in which aim group (the
 * rate/range pair, core/tiers.ts), and firing what.
 */
export interface Arming {
  armed: boolean;
  kind: Kind;
  /** The aim group's entity event; `EVENT_ARM` is the base one. */
  aim: string;
  /** The target selector group's entity event (core/targeting.ts). */
  target: string;
}

/**
 * Special ammo in a hopper takes priority over the buffer, because a tipped
 * arrow in the hopper is a deliberate choice; the buffer is the fallback.
 */
export function arming(
  ammo: number,
  special: Kind | undefined,
  aim: string = EVENT_ARM,
  target: string = EVENT_TARGET,
): Arming {
  if (isSpecial(special)) return { armed: true, kind: special, aim, target };
  return { armed: isArmed(ammo), kind: "arrow", aim, target };
}

/**
 * Entity events that swap the attack component group in or out. Arming is
 * one aim group of nine (`bulwark:aim_r<rate>_g<range>`); this is the base.
 */
export const EVENT_ARM = "bulwark:aim_r1_g1";
/** The base target selector: every monster, at the base range. */
export const EVENT_TARGET = "bulwark:target_any_g1";
export const EVENT_DISARM = "bulwark:disarm";

/**
 * Which entity events, in order, bring the entity's groups in line with
 * `want`. `have` is the state last written to the entity; unknown means fire
 * whichever is right rather than assume. Every aim event removes the other
 * aim groups and the disarmed group; disarming drops every aim and ammo
 * group, so a disarmed head's kind and aim are not tracked.
 */
export function groupEvents(
  want: Arming,
  have: { armed?: boolean; kind?: Kind; aim?: string; target?: string },
): string[] {
  const events: string[] = [];
  if (!want.armed) {
    if (have.armed !== false) events.push(EVENT_DISARM);
    return events;
  }
  const arming = have.armed !== true;
  if (arming || have.aim !== want.aim) events.push(want.aim);
  if (arming || have.target !== want.target) events.push(want.target);
  if (arming || have.kind !== want.kind) events.push(KIND_EVENT[want.kind]);
  return events;
}

/**
 * The single event that brings a head in line with a plain-arrow count. Kept
 * for the Phase 2 callers and tests; `groupEvents` is the general form.
 */
export function armEvent(ammo: number, armed: boolean | undefined): string | undefined {
  const want = isArmed(ammo);
  if (armed === want) return undefined;
  return want ? EVENT_ARM : EVENT_DISARM;
}
