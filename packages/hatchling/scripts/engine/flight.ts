/**
 * The glide: a falling hatchling spreads its wings and drifts down.
 *
 * Why this exists at all. A hatchling that walks off a ledge used to hit the
 * ground like anything else, and a dead pet dragon ends the session for the
 * player it belonged to. The entity now refuses `fall` damage outright
 * (`minecraft:damage_sensor` in behavior_pack/entities/hatchling.json), which
 * is the promise; this file is what makes the promise visible - it has wings,
 * so it should use them.
 *
 * How: a short sweep reads each hatchling's vertical speed and, while it is
 * falling faster than a glide, pushes back just enough to hold it at
 * `GLIDE_SPEED`. `core/glide.ts` makes that decision; everything engine-shaped
 * - finding the hatchlings, reading velocity, applying the impulse, setting
 * the property the animation reads - is here.
 *
 * The sweep is deliberately dumb and cheap: one type-filtered `getEntities`
 * per dimension, every few ticks, touching only hatchlings that are actually
 * in the air. There is no per-entity state, so a `/reload` mid-fall lands
 * exactly like any other fall.
 */
import { world, type Dimension, type Entity } from "@minecraft/server";
import { glide } from "../core/glide";
import * as settings from "./settings";
import { PET } from "./tend";

type Log = (...parts: unknown[]) => void;

/**
 * Ticks between sweeps. Two is often enough to catch a fall before it looks
 * like a drop, and rare enough that the scan costs nothing worth measuring.
 */
export const SWEEP_TICKS = 2;

/** Every dimension a hatchling can be in. */
const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

const P_GLIDING = "hatchling:gliding";

/** Hatchlings loaded in `id`, or nothing if that dimension is not available. */
function hatchlingsIn(id: string): Entity[] {
  let dimension: Dimension;
  try {
    dimension = world.getDimension(id);
  } catch {
    return [];
  }
  try {
    return dimension.getEntities({ type: PET });
  } catch {
    // A dimension with nothing loaded in it; nothing to do either way.
    return [];
  }
}

function setGliding(pet: Entity, gliding: boolean): void {
  // Only write on a change: setProperty on a client_sync property is a network
  // message, and a falling hatchling would otherwise send one every sweep.
  if (pet.getProperty(P_GLIDING) === gliding) return;
  pet.setProperty(P_GLIDING, gliding);
}

/** One step for one hatchling. Exported for the sake of being readable. */
export function steady(pet: Entity, enabled: boolean): void {
  const action = glide(pet.getVelocity().y, pet.isOnGround, enabled);
  setGliding(pet, action.gliding);
  if (action.impulseY > 0) pet.applyImpulse({ x: 0, y: action.impulseY, z: 0 });
}

export function sweep(log: Log): void {
  // The switch is read every sweep rather than cached so that turning the
  // glide off in the panel lands within a sweep, wings folded.
  const enabled = settings.policy().glide;
  for (const id of DIMENSIONS)
    for (const pet of hatchlingsIn(id)) {
      try {
        if (pet.isValid) steady(pet, enabled);
      } catch (e) {
        // One hatchling in an unloading chunk must not stop the rest; the
        // worst case is that it falls the vanilla way, which it survives.
        log(`glide failed: ${e}`);
      }
    }
}
