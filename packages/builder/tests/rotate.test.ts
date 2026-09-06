import { describe, expect, it } from "vitest";
import { BUILDINGS } from "../../../tools/structures/buildings";
import type { Cell } from "../scripts/core/blueprint";
import { doorFacing, parseRotation, rotateCell, rotatePoint, rotatedSize, rotationFromYaw, turnStates } from "../scripts/core/rotate";

describe("turnStates", () => {
  it("turns stairs clockwise: the high side east goes south", () => {
    expect(turnStates({ weirdo_direction: 0, upside_down_bit: false }, 1)).toEqual({ weirdo_direction: 2, upside_down_bit: false });
    expect(turnStates({ weirdo_direction: 2 }, 1).weirdo_direction).toBe(1); // south -> west
    expect(turnStates({ weirdo_direction: 1 }, 1).weirdo_direction).toBe(3); // west -> north
    expect(turnStates({ weirdo_direction: 3 }, 1).weirdo_direction).toBe(0); // north -> east
  });
  it("turns a door's cardinal direction and its direction alias together, as the game reads them", () => {
    // Measured: a south door turned once reads cardinal west and direction 1; twice, north and 2.
    expect(turnStates({ "minecraft:cardinal_direction": "south", direction: 0 }, 1)).toEqual({ "minecraft:cardinal_direction": "west", direction: 1 });
    expect(turnStates({ "minecraft:cardinal_direction": "south", direction: 0 }, 2)).toEqual({ "minecraft:cardinal_direction": "north", direction: 2 });
  });
  it("turns a chest's cardinal direction with its facing_direction alias", () => {
    // Measured: a north chest turned once reads cardinal east and facing_direction 5.
    expect(turnStates({ "minecraft:cardinal_direction": "north", facing_direction: 2 }, 1)).toEqual({ "minecraft:cardinal_direction": "east", facing_direction: 5 });
    expect(turnStates({ "minecraft:cardinal_direction": "north", facing_direction: 2 }, 3)).toEqual({ "minecraft:cardinal_direction": "west", facing_direction: 4 });
  });
  it("swaps a lying log's axis on an odd turn and leaves an upright one", () => {
    expect(turnStates({ pillar_axis: "x" }, 1).pillar_axis).toBe("z");
    expect(turnStates({ pillar_axis: "x" }, 2).pillar_axis).toBe("x");
    expect(turnStates({ pillar_axis: "y" }, 1).pillar_axis).toBe("y");
  });
  it("carries wall joins round", () => {
    const s = { wall_connection_type_north: "short", wall_connection_type_east: "none", wall_connection_type_south: "none", wall_connection_type_west: "short", wall_post_bit: true };
    expect(turnStates(s, 1)).toEqual({ wall_connection_type_east: "short", wall_connection_type_south: "none", wall_connection_type_west: "none", wall_connection_type_north: "short", wall_post_bit: true });
  });
  it("leaves the rest alone and returns the same object for no turn", () => {
    const s = { hanging: true, wood_type: "oak" };
    expect(turnStates(s, 0)).toBe(s);
    expect(turnStates(s, 4)).toBe(s);
    expect(turnStates(s, 1)).toEqual(s);
  });
});

describe("rotatePoint", () => {
  const size = { x: 5, y: 1, z: 3 };
  it("keeps the minimum corner on the origin and swaps the sides", () => {
    expect(rotatedSize(size, 1)).toEqual({ x: 3, y: 1, z: 5 });
    expect(rotatedSize(size, 2)).toEqual(size);
    // One clockwise turn: the north-west corner goes to the north-east.
    expect(rotatePoint(0, 0, size, 1)).toEqual([2, 0]);
    expect(rotatePoint(4, 0, size, 1)).toEqual([2, 4]);
    expect(rotatePoint(0, 2, size, 1)).toEqual([0, 0]);
  });
  it("comes back after four turns", () => {
    for (let x = 0; x < 5; x++) for (let z = 0; z < 3; z++) expect(rotatePoint(x, z, size, 4)).toEqual([x, z]);
  });
});

describe("against the generator", () => {
  // The generator's Blueprint.rotated() is what was measured against the
  // game's own placement at every rotation (docs/settlements-results.md):
  // 222 stairs, six door halves and the wall joins agreed. So core must agree
  // with the generator cell for cell, states included.
  for (const key of ["tallfolk_well", "shared_larder", "shared_wall"]) {
    const src = BUILDINGS.find((b) => b.key === key)!;
    const size = { x: src.sx, y: src.sy, z: src.sz };
    for (const t of [1, 2, 3]) {
      it(`${key} turned ${t * 90} matches Blueprint.rotated`, () => {
        const expected = new Map(src.rotated(t).blocks().map((b) => [`${b.x},${b.y},${b.z}`, b]));
        for (const b of src.blocks()) {
          const cell: Cell = { x: b.x, y: b.y, z: b.z, name: b.name, states: b.states };
          const r = rotateCell(cell, size, t);
          const want = expected.get(`${r.x},${r.y},${r.z}`);
          expect(want, `${key}: nothing at ${r.x},${r.y},${r.z} for the cell from ${b.x},${b.y},${b.z}`).toBeDefined();
          expect(r.name).toBe(want!.name);
          expect(r.states).toEqual(want!.states);
        }
      });
    }
  }
});

describe("rotationFromYaw", () => {
  it("faces the door the way the player looks: south is the blueprint's own", () => {
    expect(rotationFromYaw(0)).toBe(0);
    expect(doorFacing(rotationFromYaw(0))).toBe("south");
    expect(doorFacing(rotationFromYaw(90))).toBe("west");
    expect(doorFacing(rotationFromYaw(180))).toBe("north");
    expect(doorFacing(rotationFromYaw(-180))).toBe("north");
    expect(doorFacing(rotationFromYaw(-90))).toBe("east");
  });
  it("takes the nearest quarter", () => {
    expect(rotationFromYaw(40)).toBe(0);
    expect(rotationFromYaw(50)).toBe(1);
    expect(rotationFromYaw(-134)).toBe(3);
    expect(rotationFromYaw(-136)).toBe(2);
  });
});

describe("parseRotation", () => {
  it("reads a quarter count, degrees, a StructureRotation name or a facing", () => {
    expect(parseRotation("0")).toBe(0);
    expect(parseRotation("3")).toBe(3);
    expect(parseRotation("90")).toBe(1);
    expect(parseRotation("Rotate180")).toBe(2);
    expect(parseRotation("west")).toBe(1);
    expect(parseRotation("north")).toBe(2);
    expect(parseRotation("east")).toBe(3);
    expect(parseRotation("sideways")).toBeUndefined();
    expect(parseRotation(undefined)).toBeUndefined();
  });
});
