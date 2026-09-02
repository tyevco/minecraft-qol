import { describe, it, expect } from "vitest";
import {
  GRAVE_REACHED_RADIUS,
  describeDimension,
  reachedGrave,
  sameSpec,
  wantedWaypoints,
  type WaypointInputs,
  type WaypointSpec,
} from "../scripts/core/waypoints";
import type { SpawnRef } from "../scripts/core/ownership";

const OW = "minecraft:overworld";
const NETHER = "minecraft:nether";

const ref = (x: number, y = 64, z = 0, dimId = OW): SpawnRef => ({ dimId, x, y, z });

const inputs = (over: Partial<WaypointInputs> = {}): WaypointInputs => ({
  at: ref(0),
  spawn: undefined,
  owned: undefined,
  grave: undefined,
  enabled: true,
  ...over,
});

const kinds = (specs: WaypointSpec[]) => specs.map((s) => s.kind);

describe("wantedWaypoints", () => {
  it("shows nothing for a player with no spawn point and no grave", () => {
    expect(wantedWaypoints(inputs())).toEqual([]);
  });

  it("shows nothing at all when the player has switched markers off", () => {
    const all = inputs({ spawn: ref(100), grave: ref(200) });
    expect(wantedWaypoints({ ...all, enabled: false })).toEqual([]);
    expect(wantedWaypoints(all)).toHaveLength(2);
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
    // They are the same spawn point under two labels, so exactly one applies.
    const ours = ref(100);
    for (const owned of [undefined, ours, ref(7)]) {
      const out = wantedWaypoints(inputs({ spawn: ours, owned }));
      const spawnKinds = kinds(out).filter((k) => k !== "grave");
      expect(spawnKinds).toHaveLength(1);
    }
  });

  it("marks the grave alongside the spawn point", () => {
    const out = wantedWaypoints(inputs({ spawn: ref(100), grave: ref(-300, 12, 40) }));
    expect(kinds(out).sort()).toEqual(["bed", "grave"]);
    expect(out.find((s) => s.kind === "grave")).toEqual({ kind: "grave", ...ref(-300, 12, 40) });
  });

  it("drops the grave once the player is back at it", () => {
    const grave = ref(50, 20, 50);
    const near = { ...grave, x: grave.x + GRAVE_REACHED_RADIUS };
    const far = { ...grave, x: grave.x + GRAVE_REACHED_RADIUS + 1 };
    expect(kinds(wantedWaypoints(inputs({ at: near, grave })))).toEqual([]);
    expect(kinds(wantedWaypoints(inputs({ at: far, grave })))).toEqual(["grave"]);
  });

  it("withholds markers in another dimension rather than pointing the wrong way", () => {
    const bedInOverworld = ref(100);
    const graveInNether = ref(30, 40, 30, NETHER);
    const both = inputs({ spawn: bedInOverworld, grave: graveInNether });

    expect(kinds(wantedWaypoints({ ...both, at: ref(0, 64, 0, OW) }))).toEqual(["bed"]);
    expect(kinds(wantedWaypoints({ ...both, at: ref(0, 64, 0, NETHER) }))).toEqual(["grave"]);
  });

  it("does not treat a grave in another dimension at matching coordinates as reached", () => {
    const grave = ref(0, 64, 0, NETHER);
    expect(reachedGrave(ref(0, 64, 0, OW), grave)).toBe(false);
    expect(reachedGrave(ref(0, 64, 0, NETHER), grave)).toBe(true);
  });

  it("carries the exact coordinates through untouched", () => {
    const spawn = ref(-1234, -59, 9876);
    const [only] = wantedWaypoints(inputs({ at: ref(0, -59, 0), spawn }));
    expect(only).toEqual({ kind: "bed", dimId: OW, x: -1234, y: -59, z: 9876 });
  });
});

describe("reachedGrave", () => {
  it("is false with no grave", () => {
    expect(reachedGrave(ref(0), undefined)).toBe(false);
  });

  it("measures in three dimensions", () => {
    const grave = ref(0, 0, 0);
    expect(reachedGrave(ref(0, GRAVE_REACHED_RADIUS + 1, 0), grave)).toBe(false);
    expect(reachedGrave(ref(0, GRAVE_REACHED_RADIUS, 0), grave)).toBe(true);
  });
});

describe("sameSpec", () => {
  const spec: WaypointSpec = { kind: "bed", ...ref(1, 2, 3) };

  it("matches on kind and position together", () => {
    expect(sameSpec(spec, { ...spec })).toBe(true);
    expect(sameSpec(spec, { ...spec, kind: "hearth" })).toBe(false);
    expect(sameSpec(spec, { ...spec, y: 9 })).toBe(false);
    expect(sameSpec(spec, { ...spec, dimId: NETHER })).toBe(false);
  });

  it("treats a missing side as not matching", () => {
    expect(sameSpec(undefined, spec)).toBe(false);
    expect(sameSpec(spec, undefined)).toBe(false);
  });
});

describe("describeDimension", () => {
  it("names the three vanilla dimensions", () => {
    expect(describeDimension(OW)).toBe("the Overworld");
    expect(describeDimension(NETHER)).toBe("the Nether");
    expect(describeDimension("minecraft:the_end")).toBe("the End");
  });

  it("degrades gracefully for anything else", () => {
    expect(describeDimension("foo:sky_islands")).toBe("foo:sky islands");
  });
});
