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
 *
 * Getting back is the other half of the problem, so the pack also puts markers
 * on the locator bar: the player's bed (or respawn anchor), the Hearthstone they
 * will wake at, and their last death location until they return to it.
 * /scriptevent hs:waypoints toggles them per player.
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
import { describeDimension, reachedGrave, wantedWaypoints } from "./core/waypoints";
import * as registry from "./engine/registry";
import * as waypoints from "./engine/waypoints";

const TAG = "[Hearthstone]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

const ANCHOR_BLOCK = "hearthstone:hearthstone";
/** Player dynamic property recording the spawn point we assigned. */
const PROP_OWNED = "hs:owned";
/** Player dynamic property recording where they last died, until they return. */
const PROP_GRAVE = "hs:grave";
/** Player dynamic property: locator-bar markers on (default) or off. */
const PROP_WAYPOINTS = "hs:wp";
/** Default catch radius. Pack settings will back this later; see docs/backlog.md. */
const DEFAULT_RADIUS = 64;
/** Ticks between sweeps. Player count is small and bounded; anchors are not. */
const EVALUATE_TICKS = 60;

// ---------------------------------------------------------------------------
// Ownership record
// ---------------------------------------------------------------------------

function readRef(player: Player, prop: string): SpawnRef | undefined {
  try {
    const raw = player.getDynamicProperty(prop);
    if (typeof raw !== "string") return undefined;
    const parsed = JSON.parse(raw) as SpawnRef;
    return typeof parsed?.dimId === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeRef(player: Player, prop: string, ref: SpawnRef | undefined): void {
  try {
    player.setDynamicProperty(prop, ref ? JSON.stringify(ref) : undefined);
  } catch (e) {
    log(`failed to write ${prop}: ${e}`);
  }
}

const readOwned = (player: Player) => readRef(player, PROP_OWNED);
const writeOwned = (player: Player, ref: SpawnRef | undefined) =>
  writeRef(player, PROP_OWNED, ref);

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
// Grave and waypoint preferences
// ---------------------------------------------------------------------------

const readGrave = (player: Player) => readRef(player, PROP_GRAVE);
const writeGrave = (player: Player, ref: SpawnRef | undefined) =>
  writeRef(player, PROP_GRAVE, ref);

function waypointsEnabled(player: Player): boolean {
  try {
    return player.getDynamicProperty(PROP_WAYPOINTS) !== false;
  } catch {
    return true;
  }
}

function setWaypointsEnabled(player: Player, enabled: boolean): void {
  try {
    // Absent means on, so only ever store the opt-out.
    player.setDynamicProperty(PROP_WAYPOINTS, enabled ? undefined : false);
  } catch (e) {
    log(`failed to record waypoint preference: ${e}`);
  }
}

/** Players who died since they last spawned, so the respawn message fires once. */
const freshGraves = new Set<string>();

function whereIs(player: Player): Point {
  return {
    dimId: player.dimension.id,
    x: Math.floor(player.location.x),
    y: Math.floor(player.location.y),
    z: Math.floor(player.location.z),
  };
}

// ---------------------------------------------------------------------------
// World queries
// ---------------------------------------------------------------------------

/** Room for a player to stand: two clear blocks with something solid beneath. */
function isStandingSpot(dimId: string, x: number, y: number, z: number): boolean {
  const dim = world.getDimension(dimId);
  const clear = (loc: Vector3) =>
    withBlock(dim, loc, (b) => b.isAir || !b.isLiquidBlocking(LiquidType.Water)) ?? false;
  const solid = (loc: Vector3) =>
    withBlock(dim, loc, (b) => !b.isAir && !b.isLiquid && b.isLiquidBlocking(LiquidType.Water)) ??
    false;

  return clear({ x, y, z }) && clear({ x, y: y + 1, z }) && solid({ x, y: y - 1, z });
}

function toDimensionLocation(ref: SpawnRef): DimensionLocation | undefined {
  try {
    return { x: ref.x, y: ref.y, z: ref.z, dimension: world.getDimension(ref.dimId) };
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
  assignSpawn(player);
  syncWaypoints(player);
}

function assignSpawn(player: Player): void {
  const current = currentSpawn(player);
  const owned = readOwned(player);
  const verdict = decide(current, owned);

  if (verdict === "foreign") {
    // They slept in a bed or used a respawn anchor. Stop managing them, for good.
    if (owned) writeOwned(player, undefined);
    return;
  }

  const at = whereIs(player);

  const anchor = nearestAnchor(at, registry.all());
  if (!anchor) return;

  const target = chooseRespawn(anchor, (x, y, z) => isStandingSpot(anchor.dimId, x, y, z));
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
 * Bring the player's locator bar in line with where they can get back to.
 *
 * Runs after assignSpawn on every sweep, so a freshly assigned hearth shows
 * within the same tick, and a bed slept in shows by the next sweep at the latest.
 */
function syncWaypoints(player: Player): void {
  const at = whereIs(player);
  const grave = readGrave(player);

  // Reaching the grave retires it for good - the property, not just the marker.
  // Otherwise a player who leaves and comes back would find it resurrected.
  const back = reachedGrave(at, grave);
  if (back) writeGrave(player, undefined);

  waypoints.sync(
    player,
    wantedWaypoints({
      at,
      spawn: currentSpawn(player),
      owned: readOwned(player),
      grave: back ? undefined : grave,
      enabled: waypointsEnabled(player),
    }),
  );
}

function recordDeath(player: Player): void {
  try {
    const at = whereIs(player);
    writeGrave(player, at);
    freshGraves.add(player.id);
  } catch (e) {
    // The dead entity is documented as still readable in the after-event, but
    // this is the one place where losing the location is not worth a throw.
    log(`could not record death location: ${e}`);
  }
}

function announceGrave(player: Player): void {
  if (!freshGraves.delete(player.id)) return;
  const grave = readGrave(player);
  if (!grave) return;

  const where = `§f${grave.x}, ${grave.y}, ${grave.z}§7`;
  const dim = grave.dimId === player.dimension.id ? "" : ` in ${describeDimension(grave.dimId)}`;
  const hint = waypointsEnabled(player)
    ? " Your grave is on the locator bar until you get back to it."
    : "";
  player.sendMessage(`§7You died at ${where}${dim}.${hint}`);
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

  // A /reload discards our waypoint handles but not, necessarily, the waypoints.
  // Sweep whatever this pack left on each bar before the first sync rebuilds it.
  for (const player of world.getAllPlayers()) waypoints.reset(player);

  system.runInterval(sweep, EVALUATE_TICKS);

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
    if (registry.remove(ev.block.dimension.id, ev.block.x, ev.block.y, ev.block.z)) {
      ev.player.sendMessage("§7Hearthstone unbound.");
    }
  });

  // Where they died is where their things are. Filtered to players by the
  // engine, so this never runs for the mob that killed them.
  world.afterEvents.entityDie.subscribe(
    (ev) => {
      const player = ev.deadEntity;
      if (!("sendMessage" in player)) return;
      recordDeath(player as Player);
    },
    { entityTypes: ["minecraft:player"] },
  );

  // Cover a player the moment they arrive rather than up to a sweep later.
  world.afterEvents.playerSpawn.subscribe((ev) => {
    system.run(() => {
      try {
        // A joining player's handles are gone with their last session, and
        // the bar may or may not have kept the waypoints; start clean.
        if (ev.initialSpawn) waypoints.reset(ev.player);
        evaluate(ev.player);
        announceGrave(ev.player);
      } catch (e) {
        log(`spawn evaluate failed: ${e}`);
      }
    });
  });

  world.afterEvents.playerLeave.subscribe((ev) => {
    waypoints.forget(ev.playerId);
    freshGraves.delete(ev.playerId);
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
    if (ev.id !== "hs:debug" && ev.id !== "hs:waypoints") return;
    const player = ev.sourceEntity;
    if (!player || !("sendMessage" in player)) return;
    const p = player as Player;

    if (ev.id === "hs:waypoints") {
      const enabled = !waypointsEnabled(p);
      setWaypointsEnabled(p, enabled);
      syncWaypoints(p);
      p.sendMessage(
        enabled
          ? "§6Hearthstone waypoints on.§7 Bed, hearth and grave show on the locator bar."
          : "§7Hearthstone waypoints off.",
      );
      return;
    }

    const current = currentSpawn(p);
    const owned = readOwned(p);
    const grave = readGrave(p);
    p.sendMessage(`§7anchors: §f${registry.count()}§7 registered`);
    p.sendMessage(
      `§7spawn: §f${current ? `${current.x},${current.y},${current.z} in ${current.dimId}` : "unset"}`,
    );
    p.sendMessage(
      `§7owned by us: §f${owned ? `${owned.x},${owned.y},${owned.z}` : "no"}§7 ` +
        `-> decision §f${decide(current, owned)}`,
    );
    p.sendMessage(
      `§7grave: §f${grave ? `${grave.x},${grave.y},${grave.z} in ${grave.dimId}` : "none"}`,
    );
    p.sendMessage(
      `§7waypoints: §f${waypointsEnabled(p) ? "on" : "off"}§7, on bar: §f${waypoints.describe(p.id)}` +
        `§7 (${p.locatorBar.count}/${p.locatorBar.maxCount} used)`,
    );
  });

  log(`ready at tick ${system.currentTick}, ${registry.count()} anchor(s) known`);
});
