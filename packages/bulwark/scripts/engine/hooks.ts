import { EntityComponentTypes, system, world, type Entity } from "@minecraft/server";
import { withBlock } from "@qol/shared/engine/safeBlock";
import { consumeShot } from "../core/ammo";
import { isAtBlock, reconcileEntity, type EntityVerdict, type Head } from "../core/reconcile";
import { TURRET_ENTITY, isTurretEntity, readLink, removeHead, syncArming } from "./head";
import * as storage from "./storage";
import { TURRET_BLOCK, retire } from "./turret";

/**
 * World-level hooks: the parts of the design the engine cannot do for us.
 *
 *  - Shot accounting. `minecraft:behavior.ranged_attack` fires whenever it has
 *    a target; nothing in the AI knows about ammo. Every arrow the world spawns
 *    is attributed through its projectile owner, and a turret's arrow costs one
 *    from the buffer. Zero ammo disarms the head by swapping its component
 *    group out, which is the only way to stop engine AI from firing.
 *  - Kill counting. `on_kill` was fixed for melee goals only (docs/README.md);
 *    a ranged turret gets nothing, so kills come from `entityDie` and the
 *    damaging entity, which for an arrow is its shooter.
 *  - The entity side of reconciliation. A head that loads with no block under
 *    it, or whose block's record names a different head, removes itself.
 */

const TAG = "[Bulwark]";
const ARROW = "minecraft:arrow";
/** Ticks between sweeps over loaded heads. Native-filtered, so it is cheap. */
const SWEEP_TICKS = 200;
const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

export const stats = {
  shots: 0,
  /** Arrows whose owner was unknown even a tick after spawning. */
  unattributed: 0,
  kills: 0,
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

function ownerOf(arrow: Entity): Entity | undefined {
  try {
    return arrow.getComponent(EntityComponentTypes.Projectile)?.owner;
  } catch {
    return undefined;
  }
}

/**
 * Charge a turret for an arrow it fired.
 *
 * The owner is read at spawn and, if missing, once more a tick later - the
 * probe protocol measures which of those is needed. An arrow with no owner by
 * then is a player's or a dispenser's and costs nobody anything.
 */
function attributeShot(arrow: Entity, retry: boolean): void {
  let owner: Entity | undefined;
  try {
    if (!arrow.isValid) return;
    owner = ownerOf(arrow);
  } catch {
    return;
  }
  if (!owner) {
    if (retry) system.run(() => attributeShot(arrow, false));
    else stats.unattributed++;
    return;
  }
  if (!isTurretEntity(owner)) return;

  const link = readLink(owner);
  const record = link ? storage.get(link) : undefined;
  if (!record) return;

  record.ammo = consumeShot(record.ammo);
  storage.put(record);
  stats.shots++;
  syncArming(owner, record.ammo);
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
    if (typeId === ARROW) attributeShot(entity, true);
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
    const shooter = ev.damageSource.damagingEntity;
    if (!isTurretEntity(shooter)) return;
    const link = readLink(shooter);
    const record = link ? storage.get(link) : undefined;
    if (!record) return;
    record.kills++;
    storage.put(record);
    stats.kills++;
  });

  system.runInterval(sweep, SWEEP_TICKS);
  console.warn(`${TAG} hooks installed; sweeping heads every ${SWEEP_TICKS} ticks`);
}
