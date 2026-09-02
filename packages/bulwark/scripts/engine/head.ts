import { world, type Dimension, type Entity } from "@minecraft/server";
import { armEvent, isArmed } from "../core/ammo";
import { linkKey, parseLinkKey, type Position } from "../core/record";
import { headSpawnLocation, isAtBlock, type Head } from "../core/reconcile";

/**
 * The turret head: the entity half of the block/entity pair.
 *
 * The link back to its block is a dynamic property on the entity holding the
 * block's position, so either side can find the other. The armed flag
 * mirrors which component group we last asked the entity to wear, so the
 * block's tick can bring the two into line without firing an event every
 * second.
 */

export const TURRET_ENTITY = "bulwark:turret_head";
const PROP_LINK = "bw:link";
const PROP_ARMED = "bw:armed";
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
 * Bring the entity's component group in line with its ammo.
 *
 * Fires the arm/disarm event only when the recorded state disagrees, so a
 * settled turret costs nothing per tick.
 */
export function syncArming(entity: Entity, ammo: number): void {
  const event = armEvent(ammo, readArmed(entity));
  if (!event) return;
  try {
    entity.triggerEvent(event);
    entity.setDynamicProperty(PROP_ARMED, isArmed(ammo));
  } catch (e) {
    console.warn(`${TAG} could not ${event} head ${entity.id}: ${e}`);
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
