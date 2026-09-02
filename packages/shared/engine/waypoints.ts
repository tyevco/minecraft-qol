import {
  LocationWaypoint,
  LocatorBarError,
  world,
  type Player,
  type RGB,
  type WaypointTexture,
  type WaypointTextureSelector,
} from "@minecraft/server";

/**
 * Locator-bar markers, per player, keyed by string.
 *
 * `LocationWaypoint` and `Player.locatorBar` are stable in 2.9.0. A waypoint is
 * a persistent handle, so this keeps one per key per player and moves it with
 * `setDimensionLocation` rather than churning handles every sweep - the same
 * shape as the Lens marker pool. Each pack owns its own keys (`gv:grave:<id>`,
 * `hs:bed`, ...) and calls `ensure` / `clear` from the events it already
 * handles, or `sync` when it knows the whole set it wants.
 *
 * Handles live only in module memory. A /reload discards them while - as far
 * as the typings say - the engine may keep the waypoints on the bar, so
 * `reset()` sweeps those before the first rebuild. The bar only ever exposes
 * waypoints added by the pack asking, so the sweep cannot touch vanilla player
 * markers or another pack's. (Shared code is bundled into each pack, so each
 * pack has its own copy of this pool too.)
 *
 * Docs/design/waypoints.md §4 lists what is inferred here rather than
 * measured; `qolprobe:waypoint` in the probe pack measures it.
 */

export interface WaypointStyle {
  color: RGB;
  texture: WaypointTexture;
}

export interface WaypointTarget {
  dimId: string;
  x: number;
  y: number;
  z: number;
}

export interface WaypointRequest {
  key: string;
  target: WaypointTarget;
  style: WaypointStyle;
}

type Log = (...parts: unknown[]) => void;

interface Handle {
  waypoint: LocationWaypoint;
  target: WaypointTarget;
}

/** player.id -> key -> handle. */
const pools = new Map<string, Map<string, Handle>>();

function pool(playerId: string): Map<string, Handle> {
  let p = pools.get(playerId);
  if (!p) {
    p = new Map();
    pools.set(playerId, p);
  }
  return p;
}

export function sameTarget(a: WaypointTarget, b: WaypointTarget): boolean {
  return a.dimId === b.dimId && a.x === b.x && a.y === b.y && a.z === b.z;
}

function selector(style: WaypointStyle): WaypointTextureSelector {
  return { textureBoundsList: [{ lowerBound: 0, texture: style.texture }] };
}

function toLocation(target: WaypointTarget) {
  return {
    dimension: world.getDimension(target.dimId),
    // Centre of the block, so the marker sits where the player would look.
    x: target.x + 0.5,
    y: target.y,
    z: target.z + 0.5,
  };
}

function drop(p: Map<string, Handle>, key: string): boolean {
  const handle = p.get(key);
  if (!handle) return false;
  p.delete(key);
  try {
    handle.waypoint.remove();
  } catch {
    /* already gone */
  }
  return true;
}

/**
 * Add the marker if missing, move it if its target changed. Returns whether the
 * bar now carries it. A request that has not changed costs one comparison.
 */
export function ensure(
  player: Player,
  key: string,
  target: WaypointTarget,
  style: WaypointStyle,
  log: Log = console.warn,
): boolean {
  const p = pool(player.id);
  const existing = p.get(key);

  if (existing) {
    if (sameTarget(existing.target, target) && existing.waypoint.isValid) return true;
    try {
      existing.waypoint.setDimensionLocation(toLocation(target));
      existing.target = target;
      return true;
    } catch {
      // Invalidated under us; fall through and recreate.
      drop(p, key);
    }
  }

  try {
    const waypoint = new LocationWaypoint(toLocation(target), selector(style), style.color);
    player.locatorBar.addWaypoint(waypoint);
    p.set(key, { waypoint, target });
    return true;
  } catch (e) {
    // The bar has a hard cap (maxCount) shared with everything this pack adds.
    // Say so rather than failing silently on every sweep.
    const reason = e instanceof LocatorBarError ? e.reason : String(e);
    log(`could not add waypoint ${key} for ${player.name}: ${reason}`);
    return false;
  }
}

/** Remove the marker if present. Returns whether there was one. */
export function clear(playerId: string, key: string): boolean {
  const p = pools.get(playerId);
  return p ? drop(p, key) : false;
}

/**
 * Make the player's bar carry exactly `wanted` among the keys matching
 * `owns` - other keys on the same player are left alone, so two features in
 * one pack can each sync their own markers.
 */
export function sync(
  player: Player,
  wanted: readonly WaypointRequest[],
  owns: (key: string) => boolean,
  log: Log = console.warn,
): void {
  const keep = new Set<string>();
  for (const req of wanted) {
    keep.add(req.key);
    ensure(player, req.key, req.target, req.style, log);
  }
  const p = pools.get(player.id);
  if (!p) return;
  for (const key of [...p.keys()]) {
    if (owns(key) && !keep.has(key)) drop(p, key);
  }
}

/** Forget a player who left. Their handles are removed from the bar too. */
export function forget(playerId: string): void {
  const p = pools.get(playerId);
  if (!p) return;
  for (const key of [...p.keys()]) drop(p, key);
  pools.delete(playerId);
}

/**
 * Remove every waypoint this pack has on the player's bar, including any left
 * over from before a /reload that we no longer hold a handle to.
 */
export function reset(player: Player, log: Log = console.warn): void {
  forget(player.id);
  try {
    for (const stale of player.locatorBar.getAllWaypoints()) {
      try {
        stale.remove();
      } catch {
        /* already gone */
      }
    }
  } catch (e) {
    log(`could not clear stale waypoints for ${player.name}: ${e}`);
  }
}

/** What this pack holds for a player, for the <pack>:debug events. */
export function describe(playerId: string): string {
  const p = pools.get(playerId);
  if (!p || p.size === 0) return "none";
  return [...p.entries()]
    .map(([key, h]) => `${key}@${h.target.x},${h.target.y},${h.target.z}`)
    .join(" ");
}
