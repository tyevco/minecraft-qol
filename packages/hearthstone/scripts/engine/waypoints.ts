import {
  LocationWaypoint,
  LocatorBarError,
  WaypointTexture,
  world,
  type Player,
  type RGB,
  type WaypointTextureSelector,
} from "@minecraft/server";
import { sameSpec, type WaypointKind, type WaypointSpec } from "../core/waypoints";

/**
 * Per-player pool of locator-bar markers.
 *
 * Same shape as the Lens marker pool: a waypoint is a persistent handle, so we
 * keep one per kind per player and move it with setDimensionLocation rather than
 * churning handles every sweep. `LocationWaypoint`, `LocatorBar` and
 * `WaypointTexture` are all stable in @minecraft/server 2.9.0.
 *
 * Handles live only in module memory. A /reload discards them while - as far as
 * the typings say - the engine may keep the waypoints on the bar, so `reset()`
 * exists to sweep those before rebuilding. The bar only ever exposes waypoints
 * this pack added, so that sweep cannot touch vanilla player markers.
 */

const TAG = "[Hearthstone]";

interface Style {
  color: RGB;
  texture: WaypointTexture;
}

const STYLE: Record<WaypointKind, Style> = {
  // Cool and calm: the ordinary case, your own bed.
  bed: { color: { red: 0.6, green: 0.8, blue: 1 }, texture: WaypointTexture.Square },
  // Ember orange, matching the §6 gold in the pack's messages.
  hearth: { color: { red: 1, green: 0.6, blue: 0.15 }, texture: WaypointTexture.SmallStar },
  // Red: a warning, and the one you most want to spot at a glance.
  grave: { color: { red: 0.9, green: 0.25, blue: 0.25 }, texture: WaypointTexture.Circle },
};

function selector(kind: WaypointKind): WaypointTextureSelector {
  return { textureBoundsList: [{ lowerBound: 0, texture: STYLE[kind].texture }] };
}

interface Handle {
  waypoint: LocationWaypoint;
  spec: WaypointSpec;
}

/** player.id -> kind -> handle. */
const pools = new Map<string, Map<WaypointKind, Handle>>();

function toLocation(spec: WaypointSpec) {
  return {
    dimension: world.getDimension(spec.dimId),
    // Centre of the block so the marker sits where the player would look.
    x: spec.x + 0.5,
    y: spec.y,
    z: spec.z + 0.5,
  };
}

function drop(pool: Map<WaypointKind, Handle>, kind: WaypointKind): void {
  const handle = pool.get(kind);
  if (!handle) return;
  pool.delete(kind);
  try {
    handle.waypoint.remove();
  } catch {
    /* already gone */
  }
}

/**
 * Make the player's bar show exactly `wanted`.
 *
 * Existing handles are moved, missing ones created, surplus ones removed. A
 * spec that has not changed costs nothing but a comparison.
 */
export function sync(player: Player, wanted: readonly WaypointSpec[]): void {
  let pool = pools.get(player.id);
  if (!pool) {
    pool = new Map();
    pools.set(player.id, pool);
  }

  const keep = new Set<WaypointKind>();

  for (const spec of wanted) {
    keep.add(spec.kind);
    const existing = pool.get(spec.kind);

    if (existing) {
      if (sameSpec(existing.spec, spec) && existing.waypoint.isValid) continue;
      try {
        existing.waypoint.setDimensionLocation(toLocation(spec));
        existing.spec = spec;
        continue;
      } catch {
        // Invalidated under us; fall through and recreate.
        drop(pool, spec.kind);
      }
    }

    try {
      const waypoint = new LocationWaypoint(toLocation(spec), selector(spec.kind), STYLE[spec.kind].color);
      player.locatorBar.addWaypoint(waypoint);
      pool.set(spec.kind, { waypoint, spec });
    } catch (e) {
      // The bar has a hard cap shared with everything else this pack adds. Three
      // markers should never reach it, but if another feature does, say so
      // rather than failing silently every sweep.
      const reason = e instanceof LocatorBarError ? e.reason : String(e);
      console.warn(`${TAG} could not add ${spec.kind} waypoint for ${player.name}: ${reason}`);
    }
  }

  for (const kind of [...pool.keys()]) {
    if (!keep.has(kind)) drop(pool, kind);
  }
}

/** Forget a player who left. Their handles are removed from the bar too. */
export function forget(playerId: string): void {
  const pool = pools.get(playerId);
  if (!pool) return;
  for (const kind of [...pool.keys()]) drop(pool, kind);
  pools.delete(playerId);
}

/**
 * Remove every waypoint this pack has on the player's bar, including any left
 * over from before a /reload that we no longer hold a handle to.
 */
export function reset(player: Player): void {
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
    console.warn(`${TAG} could not clear stale waypoints for ${player.name}: ${e}`);
  }
}

/** What is currently on the bar for a player, for hs:debug. */
export function describe(playerId: string): string {
  const pool = pools.get(playerId);
  if (!pool || pool.size === 0) return "none";
  return [...pool.values()]
    .map((h) => `${h.spec.kind}@${h.spec.x},${h.spec.y},${h.spec.z}`)
    .join(" ");
}
