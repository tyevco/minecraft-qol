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
 * Getting back is the other half of the problem, so the pack also marks the
 * player's spawn point on the locator bar: their bed (or respawn anchor), or
 * the Hearthstone they will wake at. Both toggles live in the settings panel.
 * The gravestone marker is Graves' - it knows when a stone is placed and
 * emptied - through the same shared module.
 */
import {
  LiquidType,
  WaypointTexture,
  system,
  world,
  type DimensionLocation,
  type Player,
  type Vector3,
} from "@minecraft/server";
import { createSettingsPoller } from "@qol/shared/engine/packSettings";
import { withBlock } from "@qol/shared/engine/safeBlock";
import * as waypoints from "@qol/shared/engine/waypoints";
import { chooseRespawn, nearestAnchor, type Point } from "./core/anchors";
import { decide, sameSpawn, type SpawnRef } from "./core/ownership";
import {
  DEFAULT_SETTINGS,
  describeSettings,
  parseSettings,
  sameSettings,
} from "./core/settings";
import {
  WAYPOINT_KEY,
  isOurKey,
  wantedWaypoints,
  type WaypointKind,
} from "./core/waypoints";
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
/** Ticks between settings-panel polls. The change event is beta-only. */
const SETTINGS_TICKS = 100;

const settings = createSettingsPoller(
  parseSettings,
  sameSettings,
  DEFAULT_SETTINGS,
  log,
  describeSettings,
);

/** Marker styles. The hearth is ember orange, matching the pack's §6 messages. */
const STYLE: Record<WaypointKind, waypoints.WaypointStyle> = {
  bed: { color: { red: 0.6, green: 0.8, blue: 1 }, texture: WaypointTexture.Square },
  hearth: { color: { red: 1, green: 0.6, blue: 0.15 }, texture: WaypointTexture.SmallStar },
};

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
    player.setDynamicProperty(PROP_OWNED, ref ? JSON.stringify(ref) : undefined);
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
 * Bring the player's locator bar in line with where they will wake up.
 *
 * Runs after assignSpawn on every sweep, so a freshly assigned hearth shows
 * within the same tick, and a bed slept in shows by the next sweep at the latest.
 */
function syncWaypoints(player: Player): void {
  const { showBed, showHearth } = settings.current();
  const wanted = wantedWaypoints({
    at: whereIs(player),
    spawn: currentSpawn(player),
    owned: readOwned(player),
    showBed,
    showHearth,
  });
  waypoints.sync(
    player,
    wanted.map((w) => ({ key: WAYPOINT_KEY[w.kind], target: w, style: STYLE[w.kind] })),
    isOurKey,
    log,
  );
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
  settings.refresh();

  // A /reload discards our waypoint handles but not, necessarily, the waypoints.
  // Sweep whatever this pack left on each bar before the first sync rebuilds it.
  for (const player of world.getAllPlayers()) waypoints.reset(player, log);

  system.runInterval(sweep, EVALUATE_TICKS);
  system.runInterval(() => {
    // A changed panel takes effect on the next sweep, not the one after.
    if (settings.refresh()) sweep();
  }, SETTINGS_TICKS);

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

  // Cover a player the moment they arrive rather than up to a sweep later.
  world.afterEvents.playerSpawn.subscribe((ev) => {
    system.run(() => {
      try {
        // A joining player's handles went with their last session, and the
        // bar may or may not have kept the waypoints; start clean.
        if (ev.initialSpawn) waypoints.reset(ev.player, log);
        evaluate(ev.player);
      } catch (e) {
        log(`spawn evaluate failed: ${e}`);
      }
    });
  });

  world.afterEvents.playerLeave.subscribe((ev) => waypoints.forget(ev.playerId));

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
    p.sendMessage(`§7panel: §f${describeSettings(settings.current())}`);
    p.sendMessage(
      `§7waypoints: §f${waypoints.describe(p.id)}§7 ` +
        `(bar ${p.locatorBar.count}/${p.locatorBar.maxCount})`,
    );
  });

  log(`ready at tick ${system.currentTick}, ${registry.count()} anchor(s) known`);
});
