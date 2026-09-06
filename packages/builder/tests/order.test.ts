import { describe, expect, it } from "vitest";
import type { Cell } from "../scripts/core/blueprint";
import { companionOf, leansOn, placementOrder, removalOrder, supportOf, worldCells } from "../scripts/core/order";

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

describe("a ladder and its wall", () => {
  it("knows which block a ladder leans on", () => {
    expect(leansOn(cell(5, 1, 5, "minecraft:ladder", { facing_direction: 2 }))).toEqual({ x: 5, y: 1, z: 6 }); // faces north, wall south
    expect(leansOn(cell(5, 1, 5, "minecraft:ladder", { facing_direction: 4 }))).toEqual({ x: 6, y: 1, z: 5 }); // faces west, wall east
    expect(leansOn(cell(5, 1, 5))).toBeUndefined();
  });
  it("places the ladder after the wall it leans on even when the order would reach the wall later, and takes it down first", () => {
    // The turned inn's case: the ladder at x = 5 faces west, its wall at x = 6 comes later in the west-to-east order.
    const ladder = cell(5, 1, 5, "minecraft:ladder", { facing_direction: 4 });
    const wall = cell(6, 1, 5, "minecraft:spruce_planks");
    const placed = placementOrder([cell(7, 1, 5), ladder, wall, cell(4, 1, 5)]);
    expect(placed.indexOf(ladder)).toBe(placed.indexOf(wall) + 1);
    expect(placed.map((c) => c.x)).toEqual([4, 6, 5, 7]);
    const down = removalOrder(placed);
    expect(down.indexOf(ladder)).toBeLessThan(down.indexOf(wall));
  });
  it("moves a north-facing ladder after its south wall, which the north-to-south order reaches later; a ladder whose wall is outside the building stays put", () => {
    const ladder = cell(5, 1, 5, "minecraft:ladder", { facing_direction: 2 });
    const wall = cell(5, 1, 6, "minecraft:spruce_planks");
    expect(placementOrder([ladder, wall]).map((c) => c.z)).toEqual([6, 5]);
    expect(placementOrder([ladder, cell(1, 1, 1)]).map((c) => c.x)).toEqual([1, 5]);
  });
});

describe("two-block things", () => {
  const lower = cell(3, 1, 5, "minecraft:spruce_door", { upper_block_bit: false, "minecraft:cardinal_direction": "south" });
  const upper = cell(3, 2, 5, "minecraft:spruce_door", { upper_block_bit: true, "minecraft:cardinal_direction": "south" });
  const foot = cell(1, 1, 2, "minecraft:bed", { direction: 2, head_piece_bit: false });
  const head = cell(1, 1, 1, "minecraft:bed", { direction: 2, head_piece_bit: true });
  it("knows a door's other half and a bed's", () => {
    expect(companionOf(lower)).toEqual({ x: 3, y: 2, z: 5 });
    expect(companionOf(upper)).toEqual({ x: 3, y: 1, z: 5 });
    expect(companionOf(foot)).toEqual({ x: 1, y: 1, z: 1 }); // head north of the foot
    expect(companionOf(head)).toEqual({ x: 1, y: 1, z: 2 });
    expect(companionOf(cell(1, 1, 1, "minecraft:bed", { direction: 3, head_piece_bit: false }))).toEqual({ x: 2, y: 1, z: 1 }); // east
    expect(companionOf(cell(0, 0, 0))).toBeUndefined();
  });
  it("places the upper half straight after the lower, not a layer later", () => {
    const placed = placementOrder([upper, cell(4, 1, 5), lower, cell(2, 1, 5), cell(2, 2, 5)]);
    expect(placed.indexOf(upper)).toBe(placed.indexOf(lower) + 1);
    expect(placed.map((c) => `${c.x},${c.y}`)).toEqual(["2,1", "3,1", "3,2", "4,1", "2,2"]);
  });
  it("places the bed's head straight after its foot whichever the order meets first", () => {
    const placed = placementOrder([foot, cell(2, 1, 1), head, cell(0, 1, 2)]);
    expect(Math.abs(placed.indexOf(head) - placed.indexOf(foot))).toBe(1);
  });
});
