/**
 * Hearthstone - regional respawn anchors.
 *
 * Catches a player who dies near an anchor without having set a spawn point, and
 * sends them back there instead of to world spawn.
 *
 * The mechanic is deliberately inverted: rather than intercepting death and
 * correcting the respawn afterwards - which lands after the player has already
 * materialised at world spawn, producing a visible teleport flicker - we assign a
 * spawn point pre-emptively while they are nearby. Vanilla respawn then does all
 * the work and death handling needs no code.
 *
 * Measured behaviour this relies on (docs/hearthstone-spawn-results.md):
 *   getSpawnPoint() returns undefined for a player who never set one
 *   setSpawnPoint works, and is honoured on respawn, in the Nether too
 *   it throws LocationOutOfWorldBoundariesError outside the dimension's range
 */
import {
  LiquidType,
  system,
  world,
  type DimensionLocation,
  type Player,
  type Vector3,
} from "@minecraft/server";
import { withBlock } from "@qol/shared/engine/safeBlock";
import { chooseRespawn, nearestAnchor, type Point } from "./core/anchors";
import { decide, sameSpawn, type SpawnRef } from "./core/ownership";
import * as registry from "./engine/registry";

const TAG = "[Hearthstone]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

const ANCHOR_BLOCK = "hearthstone:hearthstone";
/** Player dynamic property recording the spawn point we assigned. */
const PROP_OWNED = "hs:owned";
/** Default catch radius. Pack settings will back this later; see docs/backlog.md. */
const DEFAULT_RADIUS = 64;
/** Ticks between sweeps. Player count is small and bounded; anchors are not. */
const EVALUATE_TICKS = 60;
/** Ticks between ember puffs. Only anchors within EMBER_RANGE of a player emit. */
const EMBER_TICKS = 8;
const EMBER_RANGE = 32;
const EMBER_PARTICLE = "hearthstone:ember";

// ---------------------------------------------------------------------------
// Ownership record
// ---------------------------------------------------------------------------

function readOwned(player: Player): SpawnRef | undefined {
  try {
    const raw = player.getDynamicProperty(PROP_OWNED);
    if (typeof raw !== "string") return undefined;
    const parsed = JSON.parse(raw) as SpawnRef;
    return typeof parsed?.dimId === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeOwned(player: Player, ref: SpawnRef | undefined): void {
  try {
    player.setDynamicProperty(
      PROP_OWNED,
      ref ? JSON.stringify(ref) : undefined,
    );
  } catch (e) {
    log(`failed to record ownership: ${e}`);
  }
}

function currentSpawn(player: Player): SpawnRef | undefined {
  try {
    const point = player.getSpawnPoint();
    if (!point) return undefined;
    return { dimId: point.dimension.id, x: point.x, y: point.y, z: point.z };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// World queries
// ---------------------------------------------------------------------------

/** Room for a player to stand: two clear blocks with something solid beneath. */
function isStandingSpot(
  dimId: string,
  x: number,
  y: number,
  z: number,
): boolean {
  const dim = world.getDimension(dimId);
  const clear = (loc: Vector3) =>
    withBlock(
      dim,
      loc,
      (b) => b.isAir || !b.isLiquidBlocking(LiquidType.Water),
    ) ?? false;
  const solid = (loc: Vector3) =>
    withBlock(
      dim,
      loc,
      (b) => !b.isAir && !b.isLiquid && b.isLiquidBlocking(LiquidType.Water),
    ) ?? false;

  return (
    clear({ x, y, z }) && clear({ x, y: y + 1, z }) && solid({ x, y: y - 1, z })
  );
}

function toDimensionLocation(ref: SpawnRef): DimensionLocation | undefined {
  try {
    return {
      x: ref.x,
      y: ref.y,
      z: ref.z,
      dimension: world.getDimension(ref.dimId),
    };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Walk players, not anchors.
 *
 * Player count is small and bounded; anchor count is not. The common case - a
 * player with their own bed-set spawn - costs one getSpawnPoint call and a
 * string compare, and that is the majority of players in an established world.
 */
function evaluate(player: Player): void {
  const current = currentSpawn(player);
  const owned = readOwned(player);
  const verdict = decide(current, owned);

  if (verdict === "foreign") {
    // They slept in a bed or used a respawn anchor. Stop managing them, for good.
    if (owned) writeOwned(player, undefined);
    return;
  }

  const at: Point = {
    dimId: player.dimension.id,
    x: Math.floor(player.location.x),
    y: Math.floor(player.location.y),
    z: Math.floor(player.location.z),
  };

  const anchor = nearestAnchor(at, registry.all());
  if (!anchor) return;

  const target = chooseRespawn(anchor, (x, y, z) =>
    isStandingSpot(anchor.dimId, x, y, z),
  );
  if (!target) {
    // Visible failure over silent: an obstructed anchor that says so is
    // debuggable, one that quietly does nothing is a support ticket.
    return;
  }

  // Already pointed here - nothing to do, and re-setting every sweep would be
  // pointless churn on a dynamic property.
  if (verdict === "managed" && sameSpawn(current, target)) return;

  const destination = toDimensionLocation(target);
  if (!destination) return;

  try {
    player.setSpawnPoint(destination);
    writeOwned(player, target);
  } catch (e) {
    // Throws outside the dimension's height range, which an anchor near bedrock
    // or the world ceiling can easily produce.
    log(`could not set spawn at ${target.x},${target.y},${target.z}: ${e}`);
  }
}

/**
 * The hearth glows. Blocks cannot carry a particle emitter, so script puffs a
 * short-lived custom effect over each anchor that has a player nearby; an
 * unloaded chunk throws and is skipped. Cost is bounded by anchors near
 * players, not by anchors.
 */
function embers(): void {
  const players = world.getAllPlayers();
  if (players.length === 0) return;
  for (const anchor of registry.all()) {
    const near = players.some(
      (p) =>
        p.dimension.id === anchor.dimId &&
        Math.abs(p.location.x - anchor.x) < EMBER_RANGE &&
        Math.abs(p.location.z - anchor.z) < EMBER_RANGE &&
        Math.abs(p.location.y - anchor.y) < EMBER_RANGE,
    );
    if (!near) continue;
    try {
      world
        .getDimension(anchor.dimId)
        .spawnParticle(EMBER_PARTICLE, {
          x: anchor.x + 0.5,
          y: anchor.y + 0.8,
          z: anchor.z + 0.5,
        });
    } catch {
      /* unloaded, or the block is gone; the registry sorts that out elsewhere */
    }
  }
}

function sweep(): void {
  for (const player of world.getAllPlayers()) {
    try {
      evaluate(player);
    } catch (e) {
      log(`evaluate failed: ${e}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

world.afterEvents.worldLoad.subscribe(() => {
  registry.load();

  system.runInterval(sweep, EVALUATE_TICKS);
  system.runInterval(embers, EMBER_TICKS);

  world.afterEvents.playerPlaceBlock.subscribe((ev) => {
    if (!ev.block.isValid || ev.block.typeId !== ANCHOR_BLOCK) return;
    const anchor = registry.add(
      ev.block.dimension.id,
      ev.block.x,
      ev.block.y,
      ev.block.z,
      DEFAULT_RADIUS,
    );
    ev.player.sendMessage(
      `§6Hearthstone bound.§7 Players nearby without a spawn point will wake here. ` +
        `§8(radius ${anchor.radius})`,
    );
    system.run(() => evaluate(ev.player));
  });

  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    if (ev.brokenBlockPermutation.type.id !== ANCHOR_BLOCK) return;
    // We own deregistration: without block entities, nothing cleans this up.
    if (
      registry.remove(ev.block.dimension.id, ev.block.x, ev.block.y, ev.block.z)
    ) {
      ev.player.sendMessage("§7Hearthstone unbound.");
    }
  });

  // Cover a player the moment they arrive rather than up to a sweep later.
  world.afterEvents.playerSpawn.subscribe((ev) => {
    system.run(() => {
      try {
        evaluate(ev.player);
      } catch (e) {
        log(`spawn evaluate failed: ${e}`);
      }
    });
  });

  world.afterEvents.playerDimensionChange.subscribe((ev) => {
    system.run(() => {
      try {
        evaluate(ev.player);
      } catch (e) {
        log(`dimension evaluate failed: ${e}`);
      }
    });
  });

  // Diagnostics, in the same shape as the other packs: /reload-safe because
  // scriptEventReceive is subscribed here rather than at startup.
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "hs:debug") return;
    const player = ev.sourceEntity;
    if (!player || !("sendMessage" in player)) return;
    const p = player as Player;

    const current = currentSpawn(p);
    const owned = readOwned(p);
    p.sendMessage(`§7anchors: §f${registry.count()}§7 registered`);
    p.sendMessage(
      `§7spawn: §f${current ? `${current.x},${current.y},${current.z} in ${current.dimId}` : "unset"}`,
    );
    p.sendMessage(
      `§7owned by us: §f${owned ? `${owned.x},${owned.y},${owned.z}` : "no"}§7 ` +
        `-> decision §f${decide(current, owned)}`,
    );
  });

  log(
    `ready at tick ${system.currentTick}, ${registry.count()} anchor(s) known`,
  );
});
