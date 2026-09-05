/**
 * A person walking somewhere. The stable API has no "go here" for an
 * entity, so the walk is vanilla pathing pointed at a beacon: a
 * `villages:waypoint` entity (nothing to draw, no gravity, gone in ninety
 * seconds on its own) is spawned at the spot and the person is put in its
 * `villages:walking` group, whose nearest_attackable_target picks the
 * waypoint and whose move_towards_target walks to it. Script polls the
 * distance and takes the group away on arrival, or gives up after
 * WALK_TIMEOUT ticks. The route is the real one: a person can be waylaid on
 * it, which is why the player secures it.
 *
 * The target behaviour picks the *nearest* waypoint, so only one walk runs
 * at a time within earshot of another: `walk()` refuses to start while a
 * walk is under way within 64 blocks, and the caller tries again later.
 */
import { system, type Dimension, type Entity, type Vector3 } from "@minecraft/server";
import * as core from "../core/trades";

const log = (...parts: unknown[]): void => console.warn("[Villages]", ...parts);
const WAYPOINT = "villages:waypoint";
const EXCLUSION = 64;

interface Walk {
  spot: Vector3;
  waypoint: Entity | undefined;
}
const active = new Map<string, Walk>();

function near(a: Vector3, b: Vector3): boolean {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2 <= EXCLUSION * EXCLUSION;
}

function remove(e: Entity | undefined): void {
  try {
    if (e && e.isValid) e.remove();
  } catch {
    /* already gone */
  }
}

/** Whether a walk from `from` may start now (no other walk within earshot). */
export function canStart(from: Vector3): boolean {
  for (const w of active.values()) if (near(w.spot, from)) return false;
  return true;
}

/**
 * Send `person` to stand at `spot` (a block position; it stands on it).
 * `done(true)` on arrival, `done(false)` if the walk could not start, the
 * person went away, or the time ran out - in which case the person is left
 * where it got to, with the walking group taken off.
 */
export function walk(dim: Dimension, person: Entity, spot: Vector3, done: (arrived: boolean) => void): void {
  if (!person.isValid || !canStart(spot) || active.has(person.id)) return done(false);
  const centre = { x: spot.x + 0.5, y: spot.y, z: spot.z + 0.5 };
  const state: Walk = { spot: centre, waypoint: undefined };
  try {
    state.waypoint = dim.spawnEntity(WAYPOINT, centre);
    person.triggerEvent("villages:walk");
  } catch (e) {
    log(`could not start a walk to ${spot.x},${spot.y},${spot.z}: ${e}`);
    remove(state.waypoint);
    return done(false);
  }
  active.set(person.id, state);
  const started = system.currentTick;
  const finish = (ok: boolean): void => {
    active.delete(person.id);
    remove(state.waypoint);
    try {
      if (person.isValid) person.triggerEvent("villages:halt");
    } catch {
      /* gone */
    }
    done(ok);
  };
  const id = system.runInterval(() => {
    if (!person.isValid) {
      system.clearRun(id);
      return finish(false);
    }
    if (core.arrived(person.location, centre)) {
      system.clearRun(id);
      return finish(true);
    }
    if (system.currentTick - started > core.WALK_TIMEOUT) {
      system.clearRun(id);
      log(`a walk to ${spot.x},${spot.y},${spot.z} timed out; the person is at ${Math.floor(person.location.x)},${Math.floor(person.location.y)},${Math.floor(person.location.z)}`);
      return finish(false);
    }
  }, core.WALK_POLL);
}

/** Sweep waypoints nobody is walking to (a /reload mid-walk leaves them; they also expire on their own). */
export function sweep(dim: Dimension, around: Vector3): void {
  try {
    for (const e of dim.getEntities({ type: WAYPOINT, location: around, maxDistance: 64 })) {
      let claimed = false;
      for (const w of active.values()) if (w.waypoint && w.waypoint.id === e.id) claimed = true;
      if (!claimed) remove(e);
    }
  } catch {
    /* unloaded */
  }
}
