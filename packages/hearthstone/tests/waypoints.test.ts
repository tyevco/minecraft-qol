import { describe, it, expect } from "vitest";
import {
  WAYPOINT_KEY,
  isOurKey,
  wantedWaypoints,
  type WaypointInputs,
} from "../scripts/core/waypoints";
import type { SpawnRef } from "../scripts/core/ownership";

const OW = "minecraft:overworld";
const NETHER = "minecraft:nether";

const ref = (x: number, y = 64, z = 0, dimId = OW): SpawnRef => ({ dimId, x, y, z });

const inputs = (over: Partial<WaypointInputs> = {}): WaypointInputs => ({
  at: ref(0),
  spawn: undefined,
  owned: undefined,
  showBed: true,
  showHearth: true,
  ...over,
});

describe("wantedWaypoints", () => {
  it("shows nothing for a player with no spawn point", () => {
    expect(wantedWaypoints(inputs())).toEqual([]);
    expect(wantedWaypoints(inputs({ owned: ref(5) }))).toEqual([]);
  });

  it("labels a Hearthstone-assigned spawn as the hearth", () => {
    const ours = ref(100);
    expect(wantedWaypoints(inputs({ spawn: ours, owned: ours }))).toEqual([
      { kind: "hearth", ...ours },
    ]);
  });

  it("labels a player's own spawn as their bed", () => {
    // Slept in a bed, or used a respawn anchor: either way it is theirs.
    expect(wantedWaypoints(inputs({ spawn: ref(100) }))).toEqual([{ kind: "bed", ...ref(100) }]);
    expect(wantedWaypoints(inputs({ spawn: ref(100), owned: ref(5) }))).toEqual([
      { kind: "bed", ...ref(100) },
    ]);
  });

  it("never shows a bed and a hearth at once", () => {
    // They are the same spawn point under two labels, so at most one applies.
    const ours = ref(100);
    for (const owned of [undefined, ours, ref(7)]) {
      expect(wantedWaypoints(inputs({ spawn: ours, owned })).length).toBeLessThanOrEqual(1);
    }
  });

  it("honours each panel toggle separately", () => {
    const ours = ref(100);
    const hearth = inputs({ spawn: ours, owned: ours });
    const bed = inputs({ spawn: ours });

    expect(wantedWaypoints({ ...hearth, showHearth: false })).toEqual([]);
    expect(wantedWaypoints({ ...hearth, showBed: false })).toHaveLength(1);
    expect(wantedWaypoints({ ...bed, showBed: false })).toEqual([]);
    expect(wantedWaypoints({ ...bed, showHearth: false })).toHaveLength(1);
  });

  it("withholds a marker in another dimension rather than pointing the wrong way", () => {
    const bedInOverworld = ref(100);
    const both = inputs({ spawn: bedInOverworld });
    expect(wantedWaypoints({ ...both, at: ref(0, 64, 0, OW) })).toHaveLength(1);
    expect(wantedWaypoints({ ...both, at: ref(0, 64, 0, NETHER) })).toEqual([]);
  });

  it("carries the exact coordinates through untouched", () => {
    const spawn = ref(-1234, -59, 9876);
    const [only] = wantedWaypoints(inputs({ at: ref(0, -59, 0), spawn }));
    expect(only).toEqual({ kind: "bed", dimId: OW, x: -1234, y: -59, z: 9876 });
  });
});

describe("keys", () => {
  it("are all this pack's own", () => {
    for (const key of Object.values(WAYPOINT_KEY)) expect(isOurKey(key)).toBe(true);
    expect(isOurKey("gv:grave:1")).toBe(false);
  });

  it("are distinct per kind", () => {
    expect(new Set(Object.values(WAYPOINT_KEY)).size).toBe(Object.keys(WAYPOINT_KEY).length);
  });
});
