import { world, type Dimension, type Entity } from "@minecraft/server";
import { groupEvents, isKind, type Arming, type Kind } from "../core/ammo";
import { linkKey, parseLinkKey, type Position } from "../core/record";
import { isTier, tierEvent, type Tier } from "../core/tiers";
import { headSpawnLocation, isAtBlock, type Head } from "../core/reconcile";

/**
 * The turret head: the entity half of the block/entity pair.
 *
 * The link back to its block is a dynamic property on the entity holding the
 * block's position, so either side can find the other. The armed flag and
 * the ammo kind mirror which component groups we last asked the entity to
 * wear, so the block's tick can bring them into line without firing an event
 * every second, and a shot can be charged to the right supply.
 */

export const TURRET_ENTITY = "bulwark:turret_head";
const PROP_LINK = "bw:link";
const PROP_ARMED = "bw:armed";
const PROP_KIND = "bw:kind";
const PROP_AIM = "bw:aim";
const PROP_TARGET = "bw:target";
/** The entity's own int property, drawn by the render controller. */
const PROPERTY_TIER = "bulwark:tier";
const TAG = "[Bulwark]";

export function isTurretEntity(entity: Entity | undefined): entity is Entity {
  try {
    return !!entity && entity.isValid && entity.typeId === TURRET_ENTITY;
  } catch {
    return false;
  }
}

export function readLink(entity: Entity): Position | undefined {
  try {
    const raw = entity.getDynamicProperty(PROP_LINK);
    return typeof raw === "string" ? parseLinkKey(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function writeLink(entity: Entity, block: Position): void {
  try {
    entity.setDynamicProperty(PROP_LINK, linkKey(block));
  } catch (e) {
    console.warn(`${TAG} failed to link head ${entity.id}: ${e}`);
  }
}

export function readArmed(entity: Entity): boolean | undefined {
  try {
    const raw = entity.getDynamicProperty(PROP_ARMED);
    return typeof raw === "boolean" ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** The ammo kind the head was last set to fire; undefined when disarmed or unknown. */
export function readKind(entity: Entity): Kind | undefined {
  try {
    const raw = entity.getDynamicProperty(PROP_KIND);
    return isKind(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** The aim group event the head was last set to; undefined when disarmed or unknown. */
export function readAim(entity: Entity): string | undefined {
  try {
    const raw = entity.getDynamicProperty(PROP_AIM);
    return typeof raw === "string" ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** The target selector event the head was last set to; undefined when disarmed or unknown. */
export function readTarget(entity: Entity): string | undefined {
  try {
    const raw = entity.getDynamicProperty(PROP_TARGET);
    return typeof raw === "string" ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** The damage tier the head is drawn at, off its own entity property. */
export function readTier(entity: Entity): Tier | undefined {
  try {
    const raw = entity.getProperty(PROPERTY_TIER);
    return isTier(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** The plain-data view of a head, relative to the block doing the asking. */
export function toHead(entity: Entity, block: Position): Head {
  let atBlock = false;
  try {
    atBlock = isAtBlock(block, entity.location);
  } catch {
    // An invalid entity is not at any block.
  }
  return { id: entity.id, link: readLink(entity), atBlock };
}

/** The entity a record names, if it is loaded, ours, and in the right dimension. */
export function linkedEntity(id: string | undefined, dimId: string): Entity | undefined {
  if (!id) return undefined;
  let entity: Entity | undefined;
  try {
    entity = world.getEntity(id);
  } catch {
    return undefined;
  }
  if (!isTurretEntity(entity)) return undefined;
  try {
    return entity.dimension.id === dimId ? entity : undefined;
  } catch {
    return undefined;
  }
}

/** Every head standing on or right next to a block, linked or not. */
export function headsAt(dim: Dimension, block: Position): Entity[] {
  try {
    return dim.getEntities({
      type: TURRET_ENTITY,
      location: headSpawnLocation(block),
      maxDistance: 1.5,
    });
  } catch {
    return [];
  }
}

export function spawnHead(dim: Dimension, block: Position): Entity | undefined {
  try {
    const entity = dim.spawnEntity(TURRET_ENTITY, headSpawnLocation(block), {
      initialPersistence: true,
    });
    writeLink(entity, block);
    return entity;
  } catch (e) {
    console.warn(`${TAG} could not spawn a head at ${linkKey(block)}: ${e}`);
    return undefined;
  }
}

/** Put a drifted head back on its block. */
export function seat(entity: Entity, block: Position): void {
  try {
    entity.teleport(headSpawnLocation(block), { keepVelocity: false });
  } catch (e) {
    console.warn(`${TAG} could not reseat head ${entity.id}: ${e}`);
  }
}

/**
 * Bring the entity's component groups in line with what it should fire.
 *
 * Fires events only where the recorded state disagrees, so a settled turret
 * costs nothing per tick. A shooter group swap takes effect on the very next
 * shot (measured, `rig_swap_changes_next_shot`), so a hopper that changes
 * ammo changes the turret within a block tick.
 */
export function syncArming(entity: Entity, want: Arming, damage?: Tier): void {
  const events = groupEvents(want, {
    armed: readArmed(entity),
    kind: readKind(entity),
    aim: readAim(entity),
    target: readTarget(entity),
  });
  // The texture follows the damage tier; the property lands next tick, so a
  // same-tick read is stale, and a tier event fires at most once per change.
  if (damage !== undefined && readTier(entity) !== damage) events.push(tierEvent(damage));
  if (events.length === 0) return;
  try {
    for (const event of events) entity.triggerEvent(event);
    entity.setDynamicProperty(PROP_ARMED, want.armed);
    entity.setDynamicProperty(PROP_KIND, want.armed ? want.kind : undefined);
    entity.setDynamicProperty(PROP_AIM, want.armed ? want.aim : undefined);
    entity.setDynamicProperty(PROP_TARGET, want.armed ? want.target : undefined);
  } catch (e) {
    console.warn(`${TAG} could not ${events.join("+")} head ${entity.id}: ${e}`);
  }
}

/** remove(), never kill(): kill() fires entityDie for every head cleaned up. */
export function removeHead(entity: Entity): void {
  try {
    entity.remove();
  } catch {
    // Already gone.
  }
}
