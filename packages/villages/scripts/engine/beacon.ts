/**
 * Sending the builder to a spot. The stable API has no "go here" for an
 * entity, so, as the villages measured (docs/villages-jigsaw-results.md, the
 * walk), the walk is vanilla pathing pointed at a beacon: a `villages:waypoint`
 * entity (nothing to draw, no gravity, gone in ninety seconds on its own) at
 * the spot, and the builder's `villages:walking` group, whose `follow_mob`
 * follows only that family. One waypoint per builder, moved by teleport from
 * spot to spot and replaced before its timer runs out.
 */
import { system, type Entity, type Vector3 } from "@minecraft/server";

export const WAYPOINT = "villages:waypoint";
/** Replace the waypoint before its 90 s timer (1800 ticks) takes it. */
const WAYPOINT_LIFE = 1500;

interface Beacon {
  waypoint: Entity;
  born: number;
}
const beacons = new Map<string, Beacon>();

function drop(b: Beacon | undefined): void {
  try {
    if (b?.waypoint.isValid) b.waypoint.remove();
  } catch {
    /* gone */
  }
}

/** Point `person` at `spot` (a block position; the beacon stands on its top face). */
export function sendTo(person: Entity, spot: Vector3): void {
  const at = { x: spot.x + 0.5, y: spot.y + 1, z: spot.z + 0.5 };
  const have = beacons.get(person.id);
  const now = system.currentTick;
  try {
    if (have && have.waypoint.isValid && now - have.born < WAYPOINT_LIFE) {
      have.waypoint.teleport(at);
      return;
    }
    drop(have);
    const waypoint = person.dimension.spawnEntity(WAYPOINT, at);
    beacons.set(person.id, { waypoint, born: now });
    person.triggerEvent("villages:walk");
  } catch {
    beacons.delete(person.id);
  }
}

/** Stop following: the beacon goes and the walking group comes off. */
export function halt(person: Entity | undefined): void {
  if (!person) return;
  drop(beacons.get(person.id));
  beacons.delete(person.id);
  try {
    if (person.isValid) person.triggerEvent("villages:halt");
  } catch {
    /* gone */
  }
}

/** Drop every beacon this module knows (a job stopping, or the world going away). */
export function haltAll(): void {
  for (const b of beacons.values()) drop(b);
  beacons.clear();
}
