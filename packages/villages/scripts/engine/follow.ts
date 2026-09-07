/**
 * Inviting a person home (docs/design/villages.md §6). The elder names a
 * person of the job asked for (engine/elder.ts); it leaves its post and
 * follows the player until the player uses a post of the same job that the
 * player placed, where it settles as that post's person. Its village post
 * counts it lost and spawns a new person a day later.
 *
 * Following is the walk's mechanism turned continuous: a `villages:waypoint`
 * kept at the player's feet, which the `villages:walking` group follows
 * (measured, engine/walk.ts); the waypoint is removed while the follower is
 * close, and replaced before its ninety-second timer runs out. The stable
 * API has no owner bond to hand a person from script (the tameable
 * component is read-only), so this is the bond. A follower is a person with
 * the `villages:invited` tag; a /reload forgets who it follows, and the
 * hatch or the elder can name it again.
 *
 * A guard hired at Friend (design §5) follows the same way for a day,
 * with the `villages:escort` tag and its post kept: the post still finds
 * it by id, so nobody is spawned in its place while it is away. When the
 * day is up, the player sends it home from its own form, or the clock
 * restarts, it walks back to its post (engine/walk.ts; put there if the
 * walk fails) and is a guard of the village again. A /reload forgets an
 * escort as it forgets an invite; a tagged guard nobody remembers goes
 * home at the next tap on it (its post tag says where), and a follower
 * that dies is forgotten at once.
 *
 * `/scriptevent villages:invite x y z` invites the person at that post with
 * nobody to follow; `villages:escort x y z` hires the guard there the same
 * way, and `villages:escort home` sends every escort home; `villages:follow
 * x y z` gives every follower a spot to go to instead of a player - the
 * hatches the GameTests drive, since a SimulatedPlayer is no player to the
 * pack.
 */
import { CommandPermissionLevel, Player, system, world, type Dimension, type Entity, type Vector3 } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { spawnSpot } from "../core/peopling";
import { PEOPLES, PLACED_BY_PLAYER, peopleName, type PostRecord } from "../core/record";
import * as core from "../core/standing";
import { KIN_TAG, PERSON, hasPerson, personOf, postOf, postTag, settle as settleOnPost } from "./post";
import * as storage from "./storage";
import * as walk from "./walk";

export const INVITED_TAG = "villages:invited";
export const ESCORT_TAG = "villages:escort";
const WAYPOINT = "villages:waypoint";
const POLL_TICKS = 10;
const WAYPOINT_LIFE = 1200;
const NEAR = 3;
const SETTLE_RANGE = 8;

interface Follower {
  entityId: string;
  job: number;
  people: number;
  name: string;
  playerId?: string;
  at?: Vector3;
  waypoint?: Entity;
  waypointBorn: number;
  /** An escort keeps its post and goes back to it; an invited person has left its post for good. */
  post?: PostRecord;
  since: number;
}
const followers = new Map<string, Follower>();
let log: (...parts: unknown[]) => void = () => undefined;

/** Whether the post's person is about and free: an escort keeps its post's id while it is away, so the id alone would name it. */
export function presentAt(dim: Dimension, post: PostRecord): boolean {
  const person = personOf(dim, post);
  return person !== undefined && !followers.has(person.id);
}

const jobOf = (e: Entity): number => {
  const j = e.getProperty("villages:job");
  return typeof j === "number" ? j : 1;
};
const peopleOf = (e: Entity): number => {
  const p = e.getProperty("villages:people");
  return typeof p === "number" ? p : 0;
};

/** The person at `post` leaves it and follows `player` (or nobody, from the hatch). Returns the person. */
export function invite(dim: Dimension, post: PostRecord, player: Player | undefined): Entity | undefined {
  const person = personOf(dim, post);
  if (!person) return undefined;
  try {
    person.removeTag(postTag(post));
    person.addTag(INVITED_TAG);
  } catch (e) {
    log(`could not invite the person at ${post.x},${post.y},${post.z}: ${e}`);
    return undefined;
  }
  // The post counts its person lost from here: a day on, it spawns another (core/peopling.ts).
  storage.update(post, (row) => void (row.entityId = undefined));
  followers.set(person.id, { entityId: person.id, job: jobOf(person), people: peopleOf(person), name: person.nameTag || peopleName(peopleOf(person)), playerId: player?.id, waypointBorn: 0, since: system.currentTick });
  log(`${person.nameTag} of the ${PEOPLES[peopleOf(person)]} leaves the post at ${post.x},${post.y},${post.z} to follow ${player?.name ?? "nobody yet"}`);
  return person;
}

/** The player's escort, if a guard walks with them now. */
export function escortOf(player: Player): Follower | undefined {
  for (const f of followers.values()) if (f.post && f.playerId === player.id) return f;
  return undefined;
}

/** The guard at `post` walks with `player` (or nobody, from the hatch) for a day, keeping its post. Returns the guard. */
export function escort(dim: Dimension, post: PostRecord, player: Player | undefined): Entity | undefined {
  const person = personOf(dim, post);
  if (!person || followers.has(person.id)) return undefined;
  try {
    person.addTag(ESCORT_TAG);
  } catch (e) {
    log(`could not send the guard at ${post.x},${post.y},${post.z} along: ${e}`);
    return undefined;
  }
  followers.set(person.id, { entityId: person.id, job: jobOf(person), people: peopleOf(person), name: person.nameTag || peopleName(peopleOf(person)), playerId: player?.id, waypointBorn: 0, post, since: system.currentTick });
  log(`${person.nameTag} of the ${PEOPLES[peopleOf(person)]} walks with ${player?.name ?? "nobody yet"} for a day, from the post at ${post.x},${post.y},${post.z}`);
  return person;
}

/** An escort's day is over (or the player sends it): it walks back to its post, or is put there if the walk fails. */
function sendHome(f: Follower, why: string): void {
  const post = f.post;
  if (!post) return;
  removeWaypoint(f);
  followers.delete(f.entityId);
  let person: Entity | undefined;
  try {
    person = world.getEntity(f.entityId);
  } catch {
    person = undefined;
  }
  if (!person || !person.isValid) {
    // Unloaded, or dead. The tag stays on an unloaded guard; a tap on it once it is about again brings it home (dismissForm).
    log(`${f.name} is not about to be sent home (${why})`);
    return;
  }
  const dim = person.dimension;
  const guard = person;
  try {
    guard.removeTag(ESCORT_TAG);
    // Out of the walking group now: the walk home puts it back, and a guard
    // put home without one would follow the next waypoint within reach.
    guard.triggerEvent("villages:halt");
  } catch {
    /* gone */
  }
  // Somebody else at the post by now (the post lost sight of it in an unloaded chunk and spawned another): the escort goes home by going.
  const there = personOf(dim, post);
  if (there && there.id !== guard.id) {
    try {
      guard.remove();
    } catch {
      /* gone */
    }
    log(`${f.name} goes home (${why}); the post at ${post.x},${post.y},${post.z} has someone else now`);
    return;
  }
  const home = spawnSpot(post);
  const put = (): void => {
    try {
      if (guard.isValid) guard.teleport(home);
    } catch {
      /* gone */
    }
  };
  if (dim.id !== post.dimId) put();
  else walk.walk(dim, guard, { x: post.x, y: post.y, z: post.z + 1 }, (arrived) => void (arrived || put()));
  log(`${f.name} goes home to the post at ${post.x},${post.y},${post.z} (${why})`);
  if (f.playerId) {
    try {
      const p = world.getEntity(f.playerId);
      if (p instanceof Player) p.sendMessage(`${f.name} goes home.`);
    } catch {
      /* gone */
    }
  }
}

/**
 * A guard with the escort tag that nobody here remembers hiring: a /reload
 * or a restart emptied the map, or it was sent home while its chunk was
 * not loaded. Its post tag says where home is; without a post it is an
 * ordinary person again.
 */
function stray(guard: Entity): Follower | undefined {
  const post = postOf(guard);
  if (!post) {
    try {
      guard.removeTag(ESCORT_TAG);
    } catch {
      /* gone */
    }
    log(`${guard.nameTag} wore the escort tag with no post to go home to; the tag is taken off`);
    return undefined;
  }
  return { entityId: guard.id, job: jobOf(guard), people: peopleOf(guard), name: guard.nameTag || peopleName(peopleOf(guard)), waypointBorn: 0, post, since: 0 };
}

/** The escort's own form (a tap on the guard): keep walking, or go home. */
export async function dismissForm(player: Player, guard: Entity): Promise<void> {
  const f = followers.get(guard.id);
  if (!f) {
    const lost = stray(guard);
    if (lost) sendHome(lost, "nobody remembers who it walked with");
    return;
  }
  if (!f.post) return;
  if (f.playerId !== player.id) {
    player.sendMessage(`${f.name} walks with someone else today.`);
    return;
  }
  const form = new ActionFormData().title(f.name).body(`${f.name} of the ${peopleName(f.people)} walks with you until the day is up.`);
  form.button("Stay with me");
  form.button("Thank you; go home");
  try {
    const r = await form.show(player);
    if (r.canceled || r.selection !== 1) return;
  } catch {
    return;
  }
  sendHome(f, "sent home");
}

function removeWaypoint(f: Follower): void {
  try {
    if (f.waypoint?.isValid) f.waypoint.remove();
  } catch {
    /* gone */
  }
  f.waypoint = undefined;
}

function targetOf(f: Follower): Vector3 | undefined {
  if (f.at) return f.at;
  if (!f.playerId) return undefined;
  try {
    const p = world.getEntity(f.playerId);
    return p && p.isValid ? p.location : undefined;
  } catch {
    return undefined;
  }
}

function tick(): void {
  const tickNow = system.currentTick;
  for (const f of [...followers.values()]) {
    if (f.post && core.escortOver(f.since, tickNow)) {
      sendHome(f, tickNow < f.since ? "the clock restarted" : "the day is up");
      continue;
    }
    let person: Entity | undefined;
    try {
      person = world.getEntity(f.entityId);
    } catch {
      person = undefined;
    }
    if (!person || !person.isValid) {
      removeWaypoint(f);
      continue; // unloaded, or gone; it keeps its tag, and can be named again
    }
    const target = targetOf(f);
    if (!target) {
      removeWaypoint(f);
      continue;
    }
    const d = Math.hypot(person.location.x - target.x, person.location.z - target.z);
    if (d <= NEAR) {
      if (f.waypoint) {
        removeWaypoint(f);
        try {
          person.triggerEvent("villages:halt");
        } catch {
          /* gone */
        }
      }
      continue;
    }
    const now = system.currentTick;
    try {
      if (!f.waypoint || !f.waypoint.isValid || now - f.waypointBorn > WAYPOINT_LIFE) {
        removeWaypoint(f);
        f.waypoint = person.dimension.spawnEntity(WAYPOINT, target);
        f.waypointBorn = now;
        person.triggerEvent("villages:walk");
      } else {
        f.waypoint.teleport(target);
      }
    } catch (e) {
      log(`could not keep ${f.name} following: ${e}`);
      removeWaypoint(f);
    }
  }
}

/**
 * A player tapped a post the kids placed (engine/post.ts): an invited
 * person within reach whose job is the post's settles on it. Returns
 * whether one did, so the post knows whether to turn its plaque instead.
 */
export function settleAt(dim: Dimension, record: PostRecord, player: Player | undefined): boolean {
  if (record.placedBy !== PLACED_BY_PLAYER) return false;
  const empty = !hasPerson(dim, record);
  const at = { x: record.x + 0.5, y: record.y, z: record.z + 0.5 };
  let near: Entity[];
  try {
    near = dim.getEntities({ type: PERSON, tags: [INVITED_TAG], location: at, maxDistance: SETTLE_RANGE });
  } catch {
    return false;
  }
  for (const person of near) {
    const f = followers.get(person.id) ?? { entityId: person.id, job: jobOf(person), people: peopleOf(person), name: person.nameTag || peopleName(peopleOf(person)), waypointBorn: 0, since: 0 };
    if (!core.mayTakePost(f, record, empty)) {
      if (!empty) player?.sendMessage("That post has someone already.");
      else player?.sendMessage(`${f.name} is a ${core.jobName(f.job)}; turn the plaque to a ${core.jobName(f.job)}'s post.`);
      continue;
    }
    const settler = settleOnPost(dim, record, f.people, f.name);
    if (!settler) continue;
    settler.addTag(KIN_TAG);
    removeWaypoint(f);
    followers.delete(person.id);
    try {
      person.remove();
    } catch {
      /* gone */
    }
    player?.sendMessage(`${f.name} settles here.`);
    log(`${f.name} the ${peopleName(f.people)} settled at the kids' post at ${record.x},${record.y},${record.z}`);
    return true;
  }
  return false;
}

export function install(logger: (...parts: unknown[]) => void): void {
  log = logger;
  system.runInterval(tick, POLL_TICKS);
  // A dead follower is forgotten at once, or an escort's player could hire no other guard until its day was up.
  world.afterEvents.entityDie.subscribe((ev) => {
    const f = ev.deadEntity ? followers.get(ev.deadEntity.id) : undefined;
    if (!f) return;
    removeWaypoint(f);
    followers.delete(f.entityId);
    log(`${f.name} died while following`);
  });
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "villages:invite" && ev.id !== "villages:follow" && ev.id !== "villages:escort") return;
    const src = ev.sourceEntity;
    if (src instanceof Player && src.commandPermissionLevel < CommandPermissionLevel.GameDirectors) return;
    if (ev.id === "villages:escort" && ev.message.trim() === "home") {
      const escorts = [...followers.values()].filter((f) => f.post);
      for (const f of escorts) sendHome(f, "sent home by the hatch");
      log(`${escorts.length} escort(s) sent home`);
      return;
    }
    const [x, y, z] = ev.message.trim().split(/\s+/).map(Number);
    if (x === undefined || y === undefined || z === undefined || [x, y, z].some((n) => !Number.isFinite(n))) {
      log(`${ev.id} wants x y z${ev.id === "villages:escort" ? ", or home" : ""}`);
      return;
    }
    const dim = world.getDimension("minecraft:overworld");
    if (ev.id === "villages:escort") {
      const record = storage.get({ dimId: dim.id, x, y, z });
      if (!record) {
        log(`no post at ${x},${y},${z}`);
        return;
      }
      const e = escort(dim, record, src instanceof Player ? src : undefined);
      log(e ? `${e.nameTag} walks along (${followers.size} follower(s))` : `nobody at the post at ${x},${y},${z}, or already following`);
    } else if (ev.id === "villages:invite") {
      const record = storage.get({ dimId: dim.id, x, y, z });
      if (!record) {
        log(`no post at ${x},${y},${z}`);
        return;
      }
      const e = invite(dim, record, src instanceof Player ? src : undefined);
      log(e ? `${e.nameTag} is invited (${followers.size} follower(s))` : `nobody at the post at ${x},${y},${z}`);
    } else {
      for (const f of followers.values()) f.at = { x: x + 0.5, y, z: z + 0.5 };
      log(`${followers.size} follower(s) told to go to ${x},${y},${z}`);
    }
  });
}

/** For the debug listing. */
export const count = (): number => followers.size;
/** Whether a person is following someone (invited or an escort), and so not free for other work. */
export const isFollowing = (entityId: string): boolean => followers.has(entityId);
