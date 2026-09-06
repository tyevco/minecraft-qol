/**
 * Visitors, carried out (docs/design/villages.md §6.1; the decisions are in
 * core/visitors.ts). Every few seconds the time of day is read; at dawn the
 * visitor that is here leaves, and if one is due a new one is spawned at the
 * edge of the kids' settlement whose turn it is. A player who interacts
 * with it gets a form: the errand, "here it is" when the player carries
 * enough, and "stay with us" once three errands have been paid. Paying
 * takes the items out of the player's inventory before the gift and the
 * standing are given (inputs before outputs, CLAUDE.md rule 4); settling
 * walks the visitor to the nearest empty post the kids placed and spawns
 * the settler there (engine/post.ts `settle`).
 *
 * The state (the next day, the familiar faces, the visit in progress) is
 * one world property, `vl:visitors`. A world whose daylight cycle is
 * locked (`world.gameRules.doDayLightCycle` false) has no dawn on its
 * clock, so one is counted every day of ticks on the server's instead
 * (core.lockedDawn), and the world's frozen day is carried forward by
 * the days so counted (core.dayOf). A visitor is a `villages:person` with
 * the `villages:visitor` tag and component group (nothing can hurt it); it
 * is never looked up by a post, since it has no post tag.
 *
 * `/scriptevent villages:visitor <status|arrive|leave|settle>` is the
 * diagnostic hatch: the console, or an operator. `arrive` brings the next
 * visitor now whether or not one is due, `leave` sends it off, `settle`
 * settles it without the form, since a SimulatedPlayer cannot be shown one
 * and the GameTests need the walk and the settling exercised.
 */
import {
  CommandPermissionLevel,
  EntityComponentTypes,
  ItemStack,
  Player,
  system,
  world,
  type Container,
  type Dimension,
  type Entity,
} from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { spawnSpot } from "../core/peopling";
import { PEOPLES, peopleName } from "../core/record";
import * as core from "../core/visitors";
import { KIN_TAG, PERSON, hasPerson, settle as settleOnPost } from "./post";
import * as storage from "./storage";
import * as walk from "./walk";

const PROPERTY = "vl:visitors";
export const VISITOR_TAG = "villages:visitor";
const POLL_TICKS = 20;

let log: (...parts: unknown[]) => void = () => undefined;
let state: core.VisitorsState = core.parseState(undefined);
let lastTimeOfDay = -1;
let settling = false;

function save(): void {
  try {
    world.setDynamicProperty(PROPERTY, JSON.stringify(state));
  } catch (e) {
    log(`could not save the visitors' state: ${e}`);
  }
}

export function install(logger: (...parts: unknown[]) => void): void {
  log = logger;
  try {
    state = core.parseState(world.getDynamicProperty(PROPERTY));
  } catch {
    state = core.parseState(undefined);
  }
  system.runInterval(tick, POLL_TICKS);
  world.afterEvents.playerInteractWithEntity.subscribe((ev) => {
    if (!ev.target || !ev.target.isValid || !ev.target.hasTag(VISITOR_TAG)) return;
    if (!(ev.player instanceof Player)) return;
    void showForm(ev.player, ev.target);
  });
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "villages:visitor") return;
    const src = ev.sourceEntity;
    if (src instanceof Player && src.commandPermissionLevel < CommandPermissionLevel.GameDirectors) return;
    hatch(ev.message.trim());
  });
}

const visitor = (): Entity | undefined => {
  const id = state.visit?.entityId;
  if (!id) return undefined;
  try {
    const e = world.getEntity(id);
    return e && e.isValid ? e : undefined;
  } catch {
    return undefined;
  }
};

function cycleOn(): boolean {
  try {
    return world.gameRules.doDayLightCycle;
  } catch {
    return true;
  }
}

/** The visitors' day: the world's, carried forward by the days counted on a locked clock. */
const today = (): number => core.dayOf(state, world.getDay());

function tick(): void {
  let now: number;
  try {
    now = world.getTimeOfDay();
  } catch {
    return;
  }
  const byTime = lastTimeOfDay >= 0 && core.isDawn(lastTimeOfDay, now);
  lastTimeOfDay = now;
  const locked = core.lockedDawn(state, cycleOn(), system.currentTick);
  if (locked.changed) {
    const was = state.lockedTick;
    state = locked.state;
    save();
    if (was === undefined && state.lockedTick !== undefined) log(`the daylight cycle is locked; dawn is counted every ${core.DAY_TICKS} ticks from now`);
    else if (was !== undefined && state.lockedTick === undefined) log("the daylight cycle runs again; dawn is the time of day");
    else if (locked.dawn) log(`dawn on the locked clock: day ${today()}`);
  }
  if (!byTime && !locked.dawn) return;
  const day = today();
  if (core.leavesAt(state, day)) leave(day);
  arrive(day);
}

function arrive(day: number, force = false): void {
  const all = core.settlements(storage.all());
  const plan = core.planArrival(force ? { ...state, nextDay: 0 } : state, day, all, Math.random);
  if (plan.kind === "none") {
    if (force) log(`no visitor comes: ${plan.reason}${plan.reason === "no settlement" ? ` (${all.length} settlement(s); one needs ${core.SETTLEMENT_MIN_POSTS} posts a player placed within ${core.SETTLEMENT_RANGE} blocks)` : ""}`);
    return;
  }
  let dim: Dimension;
  try {
    dim = world.getDimension(plan.settlement.dimId);
  } catch {
    return;
  }
  // The ground under the spot; an unloaded edge means nobody comes this dawn.
  const ground = dim.getTopmostBlock({ x: plan.spot.x, z: plan.spot.z });
  if (!ground) {
    log(`the visitor's spot at ${plan.spot.x},${plan.spot.z} is not loaded; nobody comes this dawn`);
    return;
  }
  const at = { x: plan.spot.x + 0.5, y: ground.y + 1, z: plan.spot.z + 0.5 };
  let entity: Entity;
  try {
    entity = dim.spawnEntity(PERSON, at, { initialPersistence: true });
    entity.triggerEvent(`villages:people_${plan.people}`);
    entity.triggerEvent("villages:job_2");
    entity.triggerEvent("villages:visitor");
    entity.addTag(VISITOR_TAG);
    entity.nameTag = core.visitorName(plan.face, plan.people);
  } catch (e) {
    log(`could not spawn the visitor: ${e}`);
    return;
  }
  state = core.arrived(state, plan, day);
  state.visit!.entityId = entity.id;
  save();
  log(`${entity.nameTag} arrives at ${Math.floor(at.x)},${Math.floor(at.y)},${Math.floor(at.z)} (settlement ${plan.settlement.key}, ${plan.settlement.posts.length} posts): ${core.greeting(plan.face, plan.people)}`);
}

function leave(day: number): void {
  const e = visitor();
  const name = e?.nameTag ?? "the visitor";
  try {
    e?.remove();
  } catch {
    /* gone already */
  }
  state = core.left(state, day, Math.random);
  save();
  log(`${name} leaves; the next visitor comes on day ${state.nextDay}`);
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

function inventoryOf(player: Player): Container | undefined {
  const c = player.getComponent(EntityComponentTypes.Inventory)?.container;
  return c && c.isValid ? c : undefined;
}

function countCarried(c: Container, typeId: string): number {
  let n = 0;
  for (let i = 0; i < c.size; i++) {
    const s = c.getItem(i);
    if (s?.typeId === typeId) n += s.amount;
  }
  return n;
}

/** Take `n` of `typeId` out of the inventory. Returns how many were taken. */
function takeCarried(c: Container, typeId: string, n: number): number {
  let left = n;
  for (let i = 0; i < c.size && left > 0; i++) {
    const s = c.getItem(i);
    if (s?.typeId !== typeId) continue;
    const take = Math.min(left, s.amount);
    c.setItem(i, s.amount > take ? new ItemStack(s.typeId, s.amount - take) : undefined);
    left -= take;
  }
  return n - left;
}

function give(player: Player, gift: core.Gift): void {
  const stack = new ItemStack(gift.item, gift.amount);
  let leftover: ItemStack | undefined = stack;
  const c = inventoryOf(player);
  if (c) leftover = c.addItem(stack);
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}

async function showForm(player: Player, target: Entity): Promise<void> {
  const visit = state.visit;
  if (!visit || visit.entityId !== target.id) return;
  const face = state.faces[String(visit.people)];
  if (!face) return;
  const c = inventoryOf(player);
  const carried = c ? countCarried(c, face.errand.item) : 0;
  const form = new ActionFormData().title(core.visitorName(face, visit.people)).body(`${core.greeting(face, visit.people)}${face.paid > 0 ? ` You have helped me ${face.paid} time${face.paid === 1 ? "" : "s"}.` : ""}`);
  const buttons: (() => void)[] = [];
  if (carried >= face.errand.amount) {
    form.button("Here it is");
    buttons.push(() => pay(player, target));
  } else {
    form.button(`I will find some (${carried} of ${face.errand.amount})`);
    buttons.push(() => undefined);
  }
  if (core.mayStay(face)) {
    form.button("Stay with us");
    buttons.push(() => settle(player));
  }
  form.button("Not now");
  buttons.push(() => undefined);
  try {
    const r = await form.show(player);
    if (r.canceled || r.selection === undefined) return;
    buttons[r.selection]?.();
  } catch (e) {
    log(`the visitor's form failed: ${e}`);
  }
}

function pay(player: Player, target: Entity): void {
  const visit = state.visit;
  if (!visit || visit.entityId !== target.id) return;
  const face = state.faces[String(visit.people)];
  const c = inventoryOf(player);
  if (!face || !c) return;
  const verdict = core.deliver(face, visit.people, countCarried(c, face.errand.item));
  if (verdict.kind === "short") {
    player.sendMessage(`${face.name} counts: ${verdict.have} of ${verdict.need}. Not yet.`);
    return;
  }
  // The items leave the player first; a short take (the stack moved mid-form) means nothing else happens.
  const taken = takeCarried(c, face.errand.item, face.errand.amount);
  if (taken < face.errand.amount) {
    if (taken > 0) give(player, { item: face.errand.item, amount: taken });
    player.sendMessage(`${face.name} counts again: not enough.`);
    return;
  }
  const property = core.standingProperty(visit.people);
  const before = player.getDynamicProperty(property);
  const standing = (typeof before === "number" ? before : 0) + verdict.standing;
  player.setDynamicProperty(property, standing);
  give(player, verdict.gift);
  state.faces[String(visit.people)] = core.afterPayment(face, visit.people, Math.random);
  save();
  const next = state.faces[String(visit.people)]!;
  player.sendMessage(`${face.name} thanks you and gives you ${verdict.gift.amount} ${verdict.gift.item.replace("minecraft:", "").replace(/_/g, " ")}. The ${peopleName(visit.people)} think ${standing} of you.${verdict.settles ? ` ${face.name} would stay, if you asked.` : ""}`);
  log(`${core.visitorName(face, visit.people)} paid ${face.errand.amount} ${face.errand.item} by ${player.name}: standing ${standing}, ${next.paid} paid, next errand ${next.errand.amount} ${next.errand.item}`);
}

/** The visitor settles on the nearest empty post the kids placed in its settlement; walks there, and is put there if the walk fails. */
function settle(player?: Player): void {
  const visit = state.visit;
  const e = visitor();
  if (!visit || !e || settling) return;
  const face = state.faces[String(visit.people)];
  const settlement = core.settlements(storage.all()).find((s) => s.key === visit.settlement);
  if (!face || !settlement) return;
  const dim = e.dimension;
  const target = core.settleTarget(settlement, e.location, (post) => !hasPerson(dim, post));
  if (!target) {
    player?.sendMessage(`${face.name} looks about: every post here has someone. Place another.`);
    log(`${e.nameTag} cannot settle: no empty post the kids placed in ${settlement.key}`);
    return;
  }
  settling = true;
  const people = visit.people, name = face.name;
  const finish = (walked: boolean): void => {
    settling = false;
    const settler = settleOnPost(dim, target, people, name);
    if (!settler) {
      log(`${name} could not settle at ${target.x},${target.y},${target.z}: the post was taken meanwhile`);
      return;
    }
    settler.addTag(KIN_TAG);
    const gone = visitor();
    try {
      gone?.remove();
    } catch {
      /* gone */
    }
    delete state.faces[String(people)];
    state = core.left(state, today(), Math.random);
    save();
    player?.sendMessage(`${name} settles at the post at ${target.x},${target.y},${target.z}.`);
    log(`${name} the ${peopleName(people)} settled at ${target.x},${target.y},${target.z}${walked ? "" : " (the walk failed; put there)"}; the next ${PEOPLES[people]} visitor will be a new face`);
  };
  const spot = spawnSpot(target);
  walk.walk(dim, e, { x: Math.floor(spot.x), y: spot.y, z: Math.floor(spot.z) }, (arrivedThere) => finish(arrivedThere));
}

// ---------------------------------------------------------------------------
// The hatch
// ---------------------------------------------------------------------------

function hatch(command: string): void {
  const day = today();
  switch (command) {
    case "arrive":
      arrive(day, true);
      return;
    case "leave":
      if (state.visit) leave(day);
      else log("no visitor to send off");
      return;
    case "settle":
      if (state.visit) settle();
      else log("no visitor to settle");
      return;
    default: {
      const all = core.settlements(storage.all());
      const e = visitor();
      log(
        `visitors: day ${day}${state.lockedTick !== undefined ? ` (the daylight cycle is locked: ${state.extraDays} day(s) counted on the clock, the next dawn in ${core.ticksToLockedDawn(state, system.currentTick)} ticks)` : ""}, next on day ${state.nextDay}; ${all.length} settlement(s): ${all.map((s) => `${s.key} (${s.posts.length} posts)`).join(", ") || "none"}; ` +
          (state.visit ? `${e?.nameTag ?? "a visitor (entity not found)"} here since day ${state.visit.day} in ${state.visit.settlement}` : "nobody visiting") +
          `; faces: ${Object.entries(state.faces).map(([p, f]) => `${PEOPLES[Number(p)]} ${f.name} (${f.paid} paid, wants ${f.errand.amount} ${f.errand.item})`).join(", ") || "none"}`,
      );
    }
  }
}

/** For the debug listing. */
export function status(): string {
  return state.visit ? `a visitor is here (${visitor()?.nameTag ?? "entity not found"})` : `next visitor on day ${state.nextDay}`;
}
