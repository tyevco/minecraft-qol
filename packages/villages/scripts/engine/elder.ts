/**
 * The village's voice (docs/design/villages.md §5–6): its trader, since a
 * village has one on its square and the design left "a fifth job, or the
 * trader" open. Interact and a form says where the player stands with the
 * people, offers an errand (one open per player per people, from the same
 * table a visitor draws on), takes its payment, trades the people's wares
 * for emeralds at Guest (a second form; +1 standing for the first few
 * trades a day), sells a job post at Friend and sends a guard to walk
 * with the player for a day, and at Kin names a person of a chosen job
 * to come home with the player (engine/follow.ts). The decisions are in
 * core/standing.ts.
 */
import { Player, world, type Entity } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { peopleName, type PostRecord } from "../core/record";
import * as core from "../core/standing";
import { pickErrand } from "../core/visitors";
import * as follow from "./follow";
import { postTag } from "./post";
import * as standing from "./standing";
import * as storage from "./storage";

const INVITE_RANGE = 64;
const JOBS = ["guard", "worker", "trader", "builder"];

/** The elder's own post, from the tag it carries. */
function postOf(elder: Entity): PostRecord | undefined {
  const tag = elder.getTags().find((t) => t.startsWith("villages:post:"));
  if (!tag) return undefined;
  const [x, y, z] = tag.slice("villages:post:".length).split(",").map(Number);
  if (x === undefined || y === undefined || z === undefined) return undefined;
  const record = storage.get({ dimId: elder.dimension.id, x, y, z });
  return record && postTag(record) === tag ? record : undefined;
}

const describe = (e: { item: string; amount: number }): string => `${e.amount} ${e.item.replace("minecraft:", "").replace(/_/g, " ")}`;

export async function showElder(player: Player, elder: Entity): Promise<void> {
  const people = (elder.getProperty("villages:people") as number | undefined) ?? 0;
  const day = world.getDay();
  let errand = standing.openErrand(player, people);
  const lines: string[] = [];
  if (errand && core.lapsed(errand, day)) {
    const s = standing.addStanding(player, people, core.STANDING_LAPSE);
    standing.setErrand(player, people, undefined);
    lines.push(`You never brought the ${describe(errand)}; it is forgotten, and so is a little of you. (${core.standingWords(people, s)})`);
    errand = undefined;
  }
  const c = standing.inventoryOf(player);
  const carried = errand && c ? standing.countCarried(c, errand.item) : 0;
  const emeralds = c ? standing.countCarried(c, core.EMERALD) : 0;
  const offer = core.elderOffer(people, standing.standingOf(player, people), errand, carried, emeralds);
  lines.unshift(offer.words);
  if (errand) lines.push(`You are bringing ${describe(errand)} (${carried} so far).`);
  const form = new ActionFormData().title(`${elder.nameTag || peopleName(people)}`).body(lines.join(" "));
  const actions: (() => void)[] = [];
  if (offer.canPay && errand) {
    form.button(`Here is the ${describe(errand)}`);
    actions.push(() => pay(player, people, errand!));
  } else if (offer.canTake) {
    form.button("Is there something you need?");
    actions.push(() => take(player, people, day));
  }
  if (offer.canTrade) {
    form.button("What do you have to trade?");
    actions.push(() => void trade(player, elder, people, offer.tier));
  }
  if (offer.canBuy) {
    form.button(`Buy a job post (${core.POST_PRICE} emeralds)`);
    actions.push(() => buy(player, people));
  }
  if (offer.canEscort && !follow.escortOf(player)) {
    form.button("Would a guard walk with me?");
    actions.push(() => escortWith(player, elder, people));
  }
  if (offer.canInvite) {
    form.button("Invite someone home");
    actions.push(() => void invite(player, elder, people));
  }
  form.button("Not now");
  actions.push(() => undefined);
  try {
    const r = await form.show(player);
    if (r.canceled || r.selection === undefined) return;
    actions[r.selection]?.();
  } catch (e) {
    console.warn("[Villages]", `the elder's form failed: ${e}`);
  }
}

function take(player: Player, people: number, day: number): void {
  const errand = { ...pickErrand(people, Math.random), day };
  standing.setErrand(player, people, errand);
  player.sendMessage(`The ${peopleName(people)} could use ${describe(errand)}. Bring it within ${core.ERRAND_DAYS} days.`);
}

function pay(player: Player, people: number, errand: core.OpenErrand): void {
  const c = standing.inventoryOf(player);
  if (!c) return;
  if (standing.countCarried(c, errand.item) < errand.amount) {
    player.sendMessage("Not enough, on a second count.");
    return;
  }
  const taken = standing.takeCarried(c, errand.item, errand.amount);
  if (taken < errand.amount) {
    if (taken > 0) standing.give(player, errand.item, taken);
    player.sendMessage("Not enough, on a second count.");
    return;
  }
  standing.setErrand(player, people, undefined);
  const s = standing.addStanding(player, people, core.STANDING_ERRAND);
  player.sendMessage(`The ${peopleName(people)} thank you. ${core.standingWords(people, s)}`);
  console.warn("[Villages]", `${player.name} paid the ${peopleName(people)}'s errand (${describe(errand)}): standing ${s}`);
}

function buy(player: Player, people: number): void {
  const c = standing.inventoryOf(player);
  if (!c || standing.countCarried(c, core.EMERALD) < core.POST_PRICE) {
    player.sendMessage(`That is ${core.POST_PRICE} emeralds.`);
    return;
  }
  const taken = standing.takeCarried(c, core.EMERALD, core.POST_PRICE);
  if (taken < core.POST_PRICE) {
    if (taken > 0) standing.give(player, core.EMERALD, taken);
    return;
  }
  standing.give(player, core.POST_ITEM, 1);
  player.sendMessage(`A job post of the ${peopleName(people)}. Place it in your settlement; someone will come to it.`);
}

/** The people's wares, one button each; a pick takes the emeralds, hands over the goods and counts the trade. */
async function trade(player: Player, elder: Entity, people: number, tier: number): Promise<void> {
  const wares = core.wares(people, tier);
  if (wares.length === 0) return;
  const c = standing.inventoryOf(player);
  const emeralds = c ? standing.countCarried(c, core.EMERALD) : 0;
  const form = new ActionFormData().title(`${elder.nameTag || peopleName(people)}'s wares`).body(`You carry ${emeralds} emerald${emeralds === 1 ? "" : "s"}.`);
  for (const w of wares) form.button(`${describe(w)} for ${w.price} emerald${w.price === 1 ? "" : "s"}`);
  form.button("Nothing today");
  let r;
  try {
    r = await form.show(player);
  } catch (e) {
    console.warn("[Villages]", `the wares form failed: ${e}`);
    return;
  }
  if (r.canceled || r.selection === undefined || r.selection >= wares.length) return;
  const w = wares[r.selection]!;
  const inv = standing.inventoryOf(player);
  if (!inv || standing.countCarried(inv, core.EMERALD) < w.price) {
    player.sendMessage(`That is ${w.price} emerald${w.price === 1 ? "" : "s"}.`);
    return;
  }
  // Consume before producing: the emeralds first, and back if they came up short.
  const taken = standing.takeCarried(inv, core.EMERALD, w.price);
  if (taken < w.price) {
    if (taken > 0) standing.give(player, core.EMERALD, taken);
    player.sendMessage("Not enough, on a second count.");
    return;
  }
  standing.give(player, w.item, w.amount);
  const after = standing.recordTrade(player, people);
  player.sendMessage(after.earned ? `${describe(w)}, yours. ${core.standingWords(people, after.standing)}` : `${describe(w)}, yours.`);
  console.warn("[Villages]", `${player.name} bought ${describe(w)} from the ${peopleName(people)} for ${w.price}: standing ${after.standing}${after.earned ? "" : " (the day's trades are counted)"}`);
}

/** A guard of the elder's village walks with the player for a day (design §5, Friend). */
function escortWith(player: Player, elder: Entity, people: number): void {
  const post = postOf(elder);
  if (!post) {
    player.sendMessage("The elder looks about, and cannot say who.");
    return;
  }
  const dim = elder.dimension;
  const candidate = core.escortCandidate(storage.all(), post, INVITE_RANGE, (p) => follow.presentAt(dim, p));
  if (!candidate) {
    player.sendMessage(`No guard of the ${peopleName(people)} can be spared here.`);
    return;
  }
  const guard = follow.escort(dim, candidate, player);
  if (!guard) {
    player.sendMessage("Nobody answered.");
    return;
  }
  player.sendMessage(`${guard.nameTag} will walk with you until the day is up. Tap them to send them home sooner.`);
}

async function invite(player: Player, elder: Entity, people: number): Promise<void> {
  const form = new ActionFormData().title("Who should come?").body(`Which of the ${peopleName(people)} would you have home with you?`);
  for (const job of JOBS) form.button(`A ${job}`);
  form.button("Nobody");
  let r;
  try {
    r = await form.show(player);
  } catch {
    return;
  }
  if (r.canceled || r.selection === undefined || r.selection >= JOBS.length) return;
  const post = postOf(elder);
  if (!post) {
    player.sendMessage("The elder looks about, and cannot say who.");
    return;
  }
  const dim = elder.dimension;
  const candidate = core.inviteCandidate(storage.all(), post, r.selection, INVITE_RANGE, (p) => follow.presentAt(dim, p));
  if (!candidate) {
    player.sendMessage(`No ${JOBS[r.selection]} of the ${peopleName(people)} can be spared here.`);
    return;
  }
  const named = follow.invite(dim, candidate, player);
  if (!named) {
    player.sendMessage("Nobody answered.");
    return;
  }
  player.sendMessage(`${named.nameTag} will come with you. Use a ${JOBS[r.selection]}'s post you placed and they will settle there.`);
}
