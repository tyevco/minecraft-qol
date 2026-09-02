/**
 * Ammo rules. Pure - no @minecraft imports.
 *
 * The turret keeps a small virtual buffer rather than a real container, because
 * custom blocks cannot have containers on stable APIs yet. The buffer is filled
 * from an adjacent hopper on an interval and topped up by hand, and drained one
 * arrow per shot. A cap keeps a busy turret dependent on its supply line; a
 * hopper and a chest solve that permanently, which is the intended shape.
 */

export const AMMO_ITEM = "minecraft:arrow";
export const AMMO_CAP = 64;

/** One container slot as [typeId, amount], or null when empty. */
export type Slot = readonly [typeId: string, amount: number] | null;

export interface Take {
  slot: number;
  amount: number;
}

export interface PullPlan {
  takes: Take[];
  ammo: number;
}

/**
 * Plan a pull from a container's slots into the buffer.
 *
 * Takes from the lowest slots first until the buffer is full, never splitting
 * differently from how the engine would (whole amounts per slot, partial only
 * for the last slot touched). `maxPerPull` bounds a single pull so a fresh
 * turret next to a full chest-and-hopper does not swallow four stacks at once;
 * the default matches the cap, which is the batch behaviour the design asks
 * for.
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
    if (!s || s[0] !== AMMO_ITEM || s[1] <= 0) continue;
    const amount = Math.min(s[1], room);
    takes.push({ slot: i, amount });
    room -= amount;
  }
  const taken = takes.reduce((n, t) => n + t.amount, 0);
  return { takes, ammo: ammo + taken };
}

export interface Feed {
  /** Arrows taken from the held stack. */
  accepted: number;
  ammo: number;
}

/** Hand-feed from a held stack; only arrows count, and only up to the cap. */
export function acceptFeed(
  ammo: number,
  held: { typeId: string; amount: number } | undefined,
  cap: number = AMMO_CAP,
): Feed {
  if (!held || held.typeId !== AMMO_ITEM || held.amount <= 0) return { accepted: 0, ammo };
  const accepted = Math.min(held.amount, Math.max(0, cap - ammo));
  return { accepted, ammo: ammo + accepted };
}

export function consumeShot(ammo: number): number {
  return Math.max(0, ammo - 1);
}

export function isArmed(ammo: number): boolean {
  return ammo > 0;
}

/** Entity events that swap the attack component group in or out. */
export const EVENT_ARM = "bulwark:arm";
export const EVENT_DISARM = "bulwark:disarm";

/**
 * Which entity event, if any, brings the entity's armed state in line with its
 * ammo. `armed` is the state last written to the entity; unknown means fire
 * whichever is right rather than assume.
 */
export function armEvent(ammo: number, armed: boolean | undefined): string | undefined {
  const want = isArmed(ammo);
  if (armed === want) return undefined;
  return want ? EVENT_ARM : EVENT_DISARM;
}
