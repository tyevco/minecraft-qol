/**
 * Standing, carried out (docs/design/villages.md §5; the rules are in
 * core/standing.ts). A player's standing with a people is a player dynamic
 * property, read and written here and nowhere else. What moves it:
 *
 * - a gift: interacting with a person while holding an item its people
 *   likes hands one over, +1, once per person per day;
 * - an errand from the village's voice (the trader), +5 on payment
 *   (engine/elder.ts), −2 when one lapses;
 * - a monster killed by the player within reach of a guard, +1;
 * - hitting a person, −5, and the guards within earshot come to the
 *   player: they walk to where the blow landed (nobody targets players,
 *   design §4; "the guards come" is that, on a family Realm);
 * - a trade with the village's trader (engine/elder.ts), +1 for the first
 *   few each day with a people (core.TRADES_PER_DAY), counted here.
 *
 * - breaking a village's block, −1: a block that is not natural, inside
 *   the hull round a village's posts (core.villageOf), and not one the
 *   player placed there this session.
 *
 * And what standing opens here: a village's bed (any bed inside the hull)
 * is the inn, for guests and up; a stranger's use of it is cancelled in
 * the before-event with a word, and a guest's goes through to the game,
 * which sets the respawn point as at any bed.
 *
 * Building for a people (+10) waits for the builder (issue #80).
 *
 * `/scriptevent villages:standing [people [value]]` (operator) reads the
 * caller's standing with every people back, or sets one: the in-game
 * testers' hatch, since standing is never shown as a number.
 */
import { CommandPermissionLevel, EntityComponentTypes, ItemStack, Player, system, world, type Container, type Entity } from "@minecraft/server";
import { PEOPLES, peopleName } from "../core/record";
import * as core from "../core/standing";
import { standingProperty } from "../core/visitors";
import { showElder } from "./elder";
import * as follow from "./follow";
import { PERSON } from "./post";
import { VISITOR_TAG } from "./visitors";
import * as storage from "./storage";
import * as walk from "./walk";

const GIFTS_PROPERTY = "villages:gifts";
/** Position keys of blocks players placed inside a village's hull this session, so taking one's own block back is free. */
const placedInVillage = new Set<string>();
const PLACED_CAP = 4096;
/** The last tick each player was told of a broken block, so a wall coming down is one line, not one a block. */
const toldAt = new Map<string, number>();
const TELL_EVERY = 100;
const keyOf = (at: core.Spot): string => `${at.dimId}:${at.x},${at.y},${at.z}`;
const TRADES_PROPERTY = "villages:trades";
const ERRAND_PROPERTY = "villages:errand.";
const TRADER_JOB = 2;
const GUARD_JOB = 0;
let log: (...parts: unknown[]) => void = () => undefined;

export function standingOf(player: Player, people: number): number {
  const v = player.getDynamicProperty(standingProperty(people));
  return typeof v === "number" ? v : 0;
}

/** Move a player's standing with a people; returns the new value. */
export function addStanding(player: Player, people: number, delta: number): number {
  const next = standingOf(player, people) + delta;
  player.setDynamicProperty(standingProperty(people), next);
  return next;
}

export function openErrand(player: Player, people: number): core.OpenErrand | undefined {
  return core.parseErrand(player.getDynamicProperty(`${ERRAND_PROPERTY}${people}`));
}

export function setErrand(player: Player, people: number, errand: core.OpenErrand | undefined): void {
  player.setDynamicProperty(`${ERRAND_PROPERTY}${people}`, errand ? JSON.stringify(errand) : undefined);
}

/** Count a trade with a people today; returns the standing after it (moved by STANDING_TRADE while under the day's cap). */
export function recordTrade(player: Player, people: number): { standing: number; earned: boolean } {
  const day = world.getDay();
  const { next, earns } = core.countTrade(core.parseTradeDay(player.getDynamicProperty(TRADES_PROPERTY), day), people);
  player.setDynamicProperty(TRADES_PROPERTY, JSON.stringify(next));
  return { standing: earns ? addStanding(player, people, core.STANDING_TRADE) : standingOf(player, people), earned: earns };
}

export function inventoryOf(player: Player): Container | undefined {
  const c = player.getComponent(EntityComponentTypes.Inventory)?.container;
  return c && c.isValid ? c : undefined;
}

export function countCarried(c: Container, typeId: string): number {
  let n = 0;
  for (let i = 0; i < c.size; i++) {
    const s = c.getItem(i);
    if (s?.typeId === typeId) n += s.amount;
  }
  return n;
}

/** Take `n` of `typeId` out of the inventory, the selected slot first. Returns how many were taken. */
export function takeCarried(c: Container, typeId: string, n: number, first = -1): number {
  let left = n;
  const order = [first, ...Array.from({ length: c.size }, (_, i) => i)].filter((i, k, a) => i >= 0 && i < c.size && a.indexOf(i) === k);
  for (const i of order) {
    if (left <= 0) break;
    const s = c.getItem(i);
    if (s?.typeId !== typeId) continue;
    const take = Math.min(left, s.amount);
    c.setItem(i, s.amount > take ? new ItemStack(s.typeId, s.amount - take) : undefined);
    left -= take;
  }
  return n - left;
}

export function give(player: Player, typeId: string, amount: number): void {
  const stack = new ItemStack(typeId, amount);
  let leftover: ItemStack | undefined = stack;
  const c = inventoryOf(player);
  if (c) leftover = c.addItem(stack);
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}

const peopleOf = (e: Entity): number => {
  const p = e.getProperty("villages:people");
  return typeof p === "number" ? p : 0;
};
const jobOf = (e: Entity): number => {
  const j = e.getProperty("villages:job");
  return typeof j === "number" ? j : 1;
};

/** A gift: one of the held item, if the person's people likes it and this person has not been given to today. Returns whether it was one. */
function gift(player: Player, person: Entity, held: ItemStack | undefined): boolean {
  if (!held) return false;
  const people = peopleOf(person);
  if (!core.likes(people).includes(held.typeId)) return false;
  const day = world.getDay();
  const gifts = core.parseGiftDay(player.getDynamicProperty(GIFTS_PROPERTY), day);
  const after = core.acceptGift(gifts, person.id);
  if (!after) {
    player.sendMessage(`${person.nameTag || peopleName(people)} has had a gift from you today.`);
    return true;
  }
  const c = inventoryOf(player);
  if (!c || takeCarried(c, held.typeId, 1, player.selectedSlotIndex) < 1) return false;
  player.setDynamicProperty(GIFTS_PROPERTY, JSON.stringify(after));
  const standing = addStanding(player, people, core.STANDING_GIFT);
  player.sendMessage(`${person.nameTag || peopleName(people)} takes the ${held.typeId.replace("minecraft:", "").replace(/_/g, " ")}. ${core.standingWords(people, standing)}`);
  log(`${player.name} gave ${held.typeId} to ${person.nameTag}: standing with ${peopleName(people)} ${standing}`);
  return true;
}

export function install(logger: (...parts: unknown[]) => void): void {
  log = logger;
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "villages:standing") return;
    const player = ev.sourceEntity;
    if (!(player instanceof Player) || player.commandPermissionLevel < CommandPermissionLevel.GameDirectors) return;
    const [who, value] = ev.message.trim().split(/\s+/).filter((w) => w.length > 0);
    const people = who === undefined ? -1 : /^\d+$/.test(who) ? Number(who) : PEOPLES.indexOf(who as (typeof PEOPLES)[number]);
    if (who !== undefined && (people < 0 || people >= PEOPLES.length)) {
      player.sendMessage(`[Villages] no people "${who}"; one of ${PEOPLES.join(", ")} or its index.`);
      return;
    }
    if (people >= 0 && value !== undefined && Number.isFinite(Number(value))) {
      player.setDynamicProperty(standingProperty(people), Math.trunc(Number(value)));
      log(`${player.name}'s standing with ${peopleName(people)} set to ${Math.trunc(Number(value))} by hand`);
    }
    const lines = PEOPLES.map((_, i) => i).filter((i) => people < 0 || i === people).map((i) => {
      const s = standingOf(player, i);
      return `${PEOPLES[i]} ${s} (${core.TIERS[core.tierOf(s)]})`;
    });
    player.sendMessage(`[Villages] ${player.name}'s standing: ${lines.join("; ")}`);
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.isFirstEvent || !ev.block.isValid || ev.block.typeId !== core.BED) return;
    const player = ev.player;
    if (!(player instanceof Player)) return;
    const at = { dimId: ev.block.dimension.id, x: ev.block.x, y: ev.block.y, z: ev.block.z };
    const village = core.villageOf(storage.all(), at);
    if (!village) return;
    const s = standingOf(player, village.people);
    if (core.mayRest(core.tierOf(s))) return;
    ev.cancel = true;
    system.run(() => {
      player.sendMessage(core.restWords(village.people, s));
      log(`${player.name} was turned away from a bed of the ${peopleName(village.people)}: standing ${s}`);
    });
  });
  world.afterEvents.playerPlaceBlock.subscribe((ev) => {
    const at = { dimId: ev.dimension.id, x: ev.block.location.x, y: ev.block.location.y, z: ev.block.location.z };
    if (!core.villageOf(storage.all(), at)) return;
    if (placedInVillage.size >= PLACED_CAP) placedInVillage.delete(placedInVillage.values().next().value!);
    placedInVillage.add(keyOf(at));
  });
  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    const player = ev.player;
    if (!(player instanceof Player)) return;
    const typeId = ev.brokenBlockPermutation.type.id;
    if (core.isNatural(typeId)) return;
    const at = { dimId: ev.dimension.id, x: ev.block.location.x, y: ev.block.location.y, z: ev.block.location.z };
    if (placedInVillage.delete(keyOf(at))) return;
    const village = core.villageOf(storage.all(), at);
    if (!village) return;
    const before = standingOf(player, village.people);
    const s = addStanding(player, village.people, core.STANDING_BREAK);
    const name = typeId.replace("minecraft:", "").replace(/_/g, " ");
    const dropped = core.tierOf(s) < core.tierOf(before);
    const last = toldAt.get(player.id) ?? -Infinity;
    if (dropped || system.currentTick - last >= TELL_EVERY) {
      toldAt.set(player.id, system.currentTick);
      player.sendMessage(`The ${peopleName(village.people)} see their ${name} broken. ${core.standingWords(village.people, s)}`);
    }
    log(`${player.name} broke ${typeId} at ${at.x},${at.y},${at.z} in the ${peopleName(village.people)}' village: standing ${s}`);
  });
  world.afterEvents.playerInteractWithEntity.subscribe((ev) => {
    const person = ev.target;
    if (!person || !person.isValid || person.typeId !== PERSON || person.hasTag(VISITOR_TAG)) return;
    if (!(ev.player instanceof Player)) return;
    if (gift(ev.player, person, ev.itemStack)) return;
    if (person.hasTag(follow.ESCORT_TAG)) {
      void follow.dismissForm(ev.player, person);
      return;
    }
    if (jobOf(person) === TRADER_JOB) void showElder(ev.player, person);
  });

  // A blow on a person: standing falls, and the guards come to where it landed.
  world.afterEvents.entityHurt.subscribe((ev) => {
    // A SimulatedPlayer marshals as undefined here too, as the hurt entity (measured, issue #31).
    const person = ev.hurtEntity;
    const player = ev.damageSource.damagingEntity;
    if (!person || !person.isValid || person.typeId !== PERSON || !(player instanceof Player)) return;
    const people = peopleOf(person);
    const standing = addStanding(player, people, core.STANDING_HIT);
    player.sendMessage(`${core.standingWords(people, standing)}`);
    log(`${player.name} hit ${person.nameTag}: standing with ${peopleName(people)} ${standing}`);
    const at = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
    for (const guard of person.dimension.getEntities({ type: PERSON, location: person.location, maxDistance: core.ROUSE_RANGE })) {
      if (jobOf(guard) !== GUARD_JOB || guard.hasTag(VISITOR_TAG)) continue;
      if (walk.canStart(at)) walk.walk(person.dimension, guard, at, () => undefined);
    }
  });

  // A monster the player kills within reach of a guard is the village's defence.
  world.afterEvents.entityDie.subscribe((ev) => {
    const player = ev.damageSource.damagingEntity;
    const dead = ev.deadEntity;
    if (!dead || !(player instanceof Player) || !dead.matches({ families: ["monster"] })) return;
    let guard: Entity | undefined;
    try {
      guard = dead.dimension.getEntities({ type: PERSON, location: dead.location, maxDistance: core.DEFENCE_RANGE, closest: 1 }).find((g) => jobOf(g) === GUARD_JOB && !g.hasTag(VISITOR_TAG));
    } catch {
      return;
    }
    if (!guard) return;
    const people = peopleOf(guard);
    const standing = addStanding(player, people, core.STANDING_DEFENCE);
    log(`${player.name} killed ${dead.typeId} by a ${peopleName(people)} guard: standing ${standing}`);
  });
}
