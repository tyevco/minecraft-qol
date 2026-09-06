import { EntityComponentTypes, system, world, type Entity } from "@minecraft/server";
import { withBlock } from "@qol/shared/engine/safeBlock";
import { PROJECTILES, consumeShot } from "../core/ammo";
import { type Position } from "../core/record";
import { damageMultiplier } from "../core/tiers";
import { isAtBlock, reconcileEntity, type EntityVerdict, type Head } from "../core/reconcile";
import { TURRET_ENTITY, isTurretEntity, readKind, readLink, removeHead, syncArming } from "./head";
import * as storage from "./storage";
import { TURRET_BLOCK, armingFor, chargeSpecial, retire } from "./turret";

/**
 * World-level hooks: the parts of the design the engine cannot do for us.
 *
 *  - Shot accounting. `minecraft:behavior.ranged_attack` fires whenever it has
 *    a target; nothing in the AI knows about ammo. Every projectile the world
 *    spawns is attributed through its projectile owner, and a turret's shot
 *    costs one: from the buffer for a plain arrow, from the feeding hopper's
 *    stack for anything special (core/ammo.ts). Zero ammo disarms the head by
 *    swapping its component group out, which is the only way to stop engine
 *    AI from firing.
 *  - Kill counting. `on_kill` was fixed for melee goals only (docs/README.md);
 *    a ranged turret gets nothing, so kills come from `entityDie`. For a
 *    vanilla arrow the damaging entity is expected to be the shooter; for a
 *    custom projectile it is measured to be the projectile itself, with its
 *    owner unreadable by then (`rig_custom_bolt_has_owner`). So every
 *    attributed projectile is remembered by id until it is gone, and a kill
 *    is looked up either way.
 *  - Damage tiers. The hit a turret's projectile lands is scaled in the
 *    `entityHurt` before-event by the record's damage tier (Guardian's
 *    pattern: `damage` is writable there). The turret is found the same two
 *    ways a kill is.
 *  - The entity side of reconciliation. A head that loads with no block under
 *    it, or whose block's record names a different head, removes itself.
 */

const TAG = "[Bulwark]";
/** Ticks between sweeps over loaded heads. Native-filtered, so it is cheap. */
const SWEEP_TICKS = 200;
const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
/** Projectiles remembered for kill attribution; an arrow in the ground lives a minute. */
const SHOT_MEMORY = 512;

export const stats = {
  shots: 0,
  /** Projectiles whose owner was unknown even a tick after spawning. */
  unattributed: 0,
  kills: 0,
  /** Kills found through the projectile map rather than the damaging entity. */
  killsByProjectile: 0,
  /** Hits scaled by a damage tier above the base. */
  scaledHits: 0,
  orphansRemoved: 0,
  /** Records whose block was found loaded and not a turret. */
  staleRetired: 0,
  sweeps: 0,
  /** Heads seen by the last sweep, by verdict. */
  lastSweep: { keep: 0, remove: 0, inert: 0 },
};

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/** Projectile id -> the block of the turret that fired it, newest last. */
const shotBy = new Map<string, Position>();

function remember(projectileId: string, link: Position): void {
  shotBy.set(projectileId, link);
  if (shotBy.size > SHOT_MEMORY) {
    const oldest = shotBy.keys().next().value;
    if (oldest !== undefined) shotBy.delete(oldest);
  }
}

function ownerOf(projectile: Entity): Entity | undefined {
  try {
    return projectile.getComponent(EntityComponentTypes.Projectile)?.owner;
  } catch {
    return undefined;
  }
}

/**
 * Charge a turret for a projectile it fired.
 *
 * The owner is read at spawn and, if missing, once more a tick later - the
 * probe protocol measures which of those is needed. A projectile with no
 * owner by then is a player's or a dispenser's and costs nobody anything.
 */
function attributeShot(projectile: Entity, retry: boolean): void {
  let owner: Entity | undefined;
  let projectileId: string;
  try {
    if (!projectile.isValid) return;
    projectileId = projectile.id;
    owner = ownerOf(projectile);
  } catch {
    return;
  }
  if (!owner) {
    if (retry) system.run(() => attributeShot(projectile, false));
    else stats.unattributed++;
    return;
  }
  if (!isTurretEntity(owner)) return;

  const link = readLink(owner);
  const record = link ? storage.get(link) : undefined;
  if (!link || !record) return;

  remember(projectileId, link);
  stats.shots++;

  let dim;
  try {
    dim = owner.dimension;
  } catch {
    return;
  }
  const kind = readKind(owner) ?? "arrow";
  if (kind === "arrow") {
    record.ammo = consumeShot(record.ammo);
    storage.put(record);
  } else if (!chargeSpecial(dim, link, kind)) {
    // The hopper emptied between the block's tick and this shot. Nothing to
    // charge; re-arm now rather than fire free until the next tick.
    syncArming(owner, armingFor(dim, record));
    return;
  }
  syncArming(owner, armingFor(dim, record));
}

/**
 * The turret behind a damage source, if any: the damaging entity when it is
 * a head, else whichever of the projectile or the entity was remembered at
 * spawn. `viaProjectile` says which route held.
 */
function turretBehind(
  damagingEntity: Entity | undefined,
  damagingProjectile: Entity | undefined,
): { link: Position; viaProjectile: boolean } | undefined {
  if (isTurretEntity(damagingEntity)) {
    const link = readLink(damagingEntity);
    return link ? { link, viaProjectile: false } : undefined;
  }
  for (const e of [damagingProjectile, damagingEntity]) {
    let id: string | undefined;
    try {
      id = e?.id;
    } catch {
      continue;
    }
    if (id === undefined) continue;
    const link = shotBy.get(id);
    if (link) return { link, viaProjectile: true };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Entity-side reconciliation
// ---------------------------------------------------------------------------

/** Decide, and act on, whether a head may stay. */
export function checkHead(entity: Entity): EntityVerdict | undefined {
  if (!isTurretEntity(entity)) return undefined;

  const link = readLink(entity);
  let atBlock = false;
  try {
    atBlock = link ? isAtBlock(link, entity.location) : false;
  } catch {
    return undefined;
  }
  const head: Head = { id: entity.id, link, atBlock };

  let blockIsTurret: boolean | undefined;
  if (link) {
    try {
      const dim = world.getDimension(link.dimId);
      // undefined when the chunk is not loaded: no evidence, no action.
      blockIsTurret = withBlock(dim, link, (b) => b.typeId === TURRET_BLOCK);
    } catch {
      blockIsTurret = undefined;
    }
  }

  const record = link ? storage.get(link) : undefined;
  const verdict = reconcileEntity(head, blockIsTurret, record?.entityId);
  if (verdict === "remove") {
    removeHead(entity);
    stats.orphansRemoved++;
  }
  return verdict;
}

/**
 * Everything the events might miss, caught within ten seconds.
 *
 * Two passes. Heads: the same check `entityLoad` runs. Records: a turret
 * removed by /setblock, /fill or a piston fires no break hook, so its record
 * would otherwise outlive it forever - and a block can only tick while it
 * exists, so nothing on the block side can notice. A record whose block is
 * loaded and is not a turret is retired here, arrows returned, head removed.
 * An unloaded chunk is no evidence and is skipped.
 */
export function sweep(): void {
  stats.sweeps++;
  const tally = { keep: 0, remove: 0, inert: 0 };
  for (const dimId of DIMENSIONS) {
    let heads: Entity[];
    try {
      heads = world.getDimension(dimId).getEntities({ type: TURRET_ENTITY });
    } catch {
      continue;
    }
    for (const head of heads) {
      const verdict = checkHead(head);
      if (verdict) tally[verdict]++;
    }
  }
  stats.lastSweep = tally;

  for (const record of storage.all()) {
    let dim;
    try {
      dim = world.getDimension(record.dimId);
    } catch {
      continue;
    }
    const isTurret = withBlock(dim, record, (b) => b.typeId === TURRET_BLOCK);
    if (isTurret === false) {
      retire(dim, record);
      stats.staleRetired++;
    }
  }
}

/** Loaded heads, by dimension. For diagnostics. */
export function headCensus(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const dimId of DIMENSIONS) {
    try {
      out[dimId] = world.getDimension(dimId).getEntities({ type: TURRET_ENTITY }).length;
    } catch {
      out[dimId] = -1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

export function install(): void {
  shotBy.clear();

  world.afterEvents.entitySpawn.subscribe((ev) => {
    let entity: Entity;
    let typeId: string;
    try {
      entity = ev.entity;
      typeId = entity.typeId;
    } catch {
      return;
    }
    // Cheapest test first: nearly every spawn in the world exits here.
    if (PROJECTILES.has(typeId)) attributeShot(entity, true);
    else if (typeId === TURRET_ENTITY) checkHead(entity);
  });

  world.afterEvents.entityLoad.subscribe((ev) => {
    try {
      if (ev.entity.typeId === TURRET_ENTITY) checkHead(ev.entity);
    } catch {
      // Entity gone before we looked.
    }
  });

  world.afterEvents.entityDie.subscribe((ev) => {
    const hit = turretBehind(ev.damageSource.damagingEntity, ev.damageSource.damagingProjectile);
    if (!hit) return;
    const record = storage.get(hit.link);
    if (!record) return;
    record.kills++;
    storage.put(record);
    stats.kills++;
    if (hit.viaProjectile) stats.killsByProjectile++;
  });

  world.beforeEvents.entityHurt.subscribe((ev) => {
    try {
      const hit = turretBehind(ev.damageSource.damagingEntity, ev.damageSource.damagingProjectile);
      if (!hit) return;
      const record = storage.get(hit.link);
      if (!record) return;
      const m = damageMultiplier(record.tiers.damage);
      if (m === 1) return;
      ev.damage = ev.damage * m;
      stats.scaledHits++;
    } catch (e) {
      // A throw leaves the hit as the engine proposed it, which is the base
      // tier - the safe failure. Log so it is not silent.
      console.warn(`${TAG} damage tier handler failed: ${e}`);
    }
  });

  system.runInterval(sweep, SWEEP_TICKS);
  console.warn(`${TAG} hooks installed; sweeping heads every ${SWEEP_TICKS} ticks`);
}
