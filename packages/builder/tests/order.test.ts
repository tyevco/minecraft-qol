import { describe, expect, it } from "vitest";
import type { Cell } from "../scripts/core/blueprint";
import { placementOrder, removalOrder, supportOf, worldCells } from "../scripts/core/order";

const cell = (x: number, y: number, z: number, name = "minecraft:cobblestone", states = {}): Cell => ({ x, y, z, name, states });

describe("placementOrder", () => {
  it("goes bottom layer first, then north to south, then west to east", () => {
    const cells = [cell(2, 1, 0), cell(0, 0, 2), cell(1, 0, 0), cell(0, 0, 0), cell(0, 1, 0)];
    expect(placementOrder(cells).map((c) => `${c.x},${c.y},${c.z}`)).toEqual(["0,0,0", "1,0,0", "0,0,2", "0,1,0", "2,1,0"]);
  });
  it("pours water last in its layer, after the ring round it", () => {
    const cells = [cell(2, 0, 2, "minecraft:water"), cell(2, 0, 3), cell(1, 0, 1), cell(0, 1, 0)];
    expect(placementOrder(cells).map((c) => c.name)).toEqual(["minecraft:cobblestone", "minecraft:cobblestone", "minecraft:water", "minecraft:cobblestone"]);
  });
  it("does not change the input", () => {
    const cells = [cell(1, 0, 0), cell(0, 0, 0)];
    placementOrder(cells);
    expect(cells[0]!.x).toBe(1);
  });
});

describe("worldCells", () => {
  const size = { x: 3, y: 2, z: 2 };
  const cells = [cell(0, 0, 0), cell(2, 0, 1, "minecraft:stone_stairs", { weirdo_direction: 2 }), cell(0, 1, 0)];
  it("moves the ordered cells to the origin", () => {
    const out = worldCells(cells, size, 0, { x: 10, y: 64, z: -5 });
    expect(out.map((c) => [c.x, c.y, c.z])).toEqual([
      [10, 64, -5],
      [12, 64, -4],
      [10, 65, -5],
    ]);
  });
  it("turns the cells and their states, the minimum corner staying on the origin", () => {
    const out = worldCells(cells, size, 1, { x: 10, y: 64, z: 0 });
    // A 3x2 box turned once is 2x3; (0,0) -> (1,0), (2,1) -> (0,2).
    expect(out[0]).toMatchObject({ x: 11, y: 64, z: 0 });
    expect(out[1]).toMatchObject({ x: 10, y: 64, z: 2, states: { weirdo_direction: 1 } });
    expect(out.every((c) => c.x >= 10 && c.x < 12 && c.z >= 0 && c.z < 3)).toBe(true);
  });
});

describe("removalOrder", () => {
  it("is the placement order backwards", () => {
    const placed = placementOrder([cell(0, 0, 0), cell(1, 0, 0), cell(0, 1, 0)]);
    expect(removalOrder(placed).map((c) => `${c.x},${c.y},${c.z}`)).toEqual(["0,1,0", "1,0,0", "0,0,0"]);
  });
  it("takes a hanging lantern down before the block it hangs from, so it is not popped onto the ground", () => {
    // The well: the lantern at y = 3 hangs under the roof block at y = 4; both go up bottom first.
    const lantern = cell(2, 3, 2, "minecraft:lantern", { hanging: true });
    const roof = cell(2, 4, 2, "minecraft:dark_oak_planks");
    const placed = placementOrder([cell(2, 0, 2), lantern, roof, cell(2, 5, 2, "minecraft:dark_oak_slab")]);
    expect(placed.indexOf(lantern)).toBeLessThan(placed.indexOf(roof));
    const down = removalOrder(placed);
    expect(down.indexOf(lantern)).toBeLessThan(down.indexOf(roof));
    expect(down[0]!.y).toBe(5);
    expect(down[down.length - 1]!.y).toBe(0);
    expect(down).toHaveLength(4);
  });
  it("knows what a lantern hangs from, and that a standing one hangs from nothing", () => {
    expect(supportOf(cell(1, 2, 3, "minecraft:lantern", { hanging: true }))).toEqual({ x: 1, y: 3, z: 3 });
    expect(supportOf(cell(1, 2, 3, "minecraft:lantern", { hanging: false }))).toBeUndefined();
    expect(supportOf(cell(1, 2, 3))).toBeUndefined();
  });
});
