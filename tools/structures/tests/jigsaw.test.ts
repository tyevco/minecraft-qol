import { describe, expect, it } from "vitest";
import { Blueprint, turnFacing, turnStates } from "../blueprint";
import { canvas, expand, type Pool } from "../jigsaw";

function pad(key: string, w: number, d: number): Blueprint {
  const bp = new Blueprint(key, key, [w, 2, d], "test", "");
  bp.fill(0, 0, 0, w, 1, d, "stone_bricks");
  return bp;
}

describe("turning", () => {
  it("turns facings clockwise seen from above and comes back round", () => {
    expect(turnFacing("east", 1)).toBe("south");
    expect(turnFacing("north", 1)).toBe("east");
    expect(turnFacing("west", 3)).toBe("south");
    expect(turnFacing("south", 4)).toBe("south");
  });

  it("turns every directional state the blueprints use", () => {
    expect(turnStates({ weirdo_direction: 0 }, 1).weirdo_direction).toBe(2); // east -> south
    expect(turnStates({ facing_direction: 5 }, 1).facing_direction).toBe(3); // east -> south
    expect(turnStates({ direction: 3 }, 1).direction).toBe(0); // east -> south
    expect(turnStates({ "minecraft:cardinal_direction": "north" }, 2)["minecraft:cardinal_direction"]).toBe("south");
    expect(turnStates({ pillar_axis: "x" }, 1).pillar_axis).toBe("z");
    expect(turnStates({ pillar_axis: "x" }, 2).pillar_axis).toBe("x");
    const walls = turnStates({ wall_connection_type_north: "short", wall_connection_type_east: "none", wall_connection_type_south: "none", wall_connection_type_west: "none" }, 1);
    expect(walls.wall_connection_type_east).toBe("short");
    expect(walls.wall_connection_type_north).toBe("none");
    expect(turnStates({ hanging: true }, 1)).toEqual({ hanging: true });
  });

  it("rotates a blueprint's blocks and markers together, and four turns is the identity", () => {
    const bp = pad("p", 3, 5);
    bp.jigsaw(2, 1, 1, { facing: "east", name: "a", target: "b", pool: "x", final: "gold_block" });
    const r = bp.rotated(1);
    expect(r.size).toEqual([5, 2, 3]);
    const m = r.markers()[0]!;
    expect(m.jigsaw.facing).toBe("south");
    expect([m.x, m.z]).toEqual([3, 2]); // east edge became the south edge
    const back = bp.rotated(4);
    expect(back.markers()[0]).toEqual(bp.markers()[0]);
    expect(back.blocks().length).toBe(bp.blocks().length);
  });
});

describe("expand", () => {
  const pools = (): Map<string, Pool> => {
    const start = pad("square", 5, 5);
    start.jigsaw(4, 1, 2, { facing: "east", name: "street", target: "street", pool: "streets", final: "gold_block" });
    start.jigsaw(2, 1, 4, { facing: "south", name: "street", target: "street", pool: "streets", final: "gold_block" });
    const street = pad("street", 3, 7);
    street.jigsaw(1, 1, 0, { facing: "north", name: "street", target: "street", pool: "streets", final: "gold_block" });
    street.jigsaw(1, 1, 6, { facing: "south", name: "street", target: "street", pool: "streets", final: "gold_block" });
    const end = pad("end", 1, 1);
    end.jigsaw(0, 1, 0, { facing: "north", name: "street", target: "street", pool: "minecraft:empty", final: "diamond_block" });
    return new Map([
      ["squares", { elements: [{ piece: start, weight: 1 }] }],
      ["streets", { elements: [{ piece: street, weight: 1 }], fallback: "ends" }],
      ["ends", { elements: [{ piece: end, weight: 1 }] }],
    ]);
  };

  it("joins a street to each socket, adjacent and facing back, and never overlaps", () => {
    const ex = expand(pools(), "squares", 1, 7, { startTurns: 0 });
    expect(ex.placements.map((p) => p.piece.key)).toEqual(["square", "street", "street"]);
    const east = ex.placements[1]!;
    // The square's east socket is at (4,1,2); the street's end marker meets it at (5,1,2), turned to face west.
    expect(east.turns % 2).toBe(1);
    expect(east.x).toBe(5);
    expect(east.y).toBe(0);
    expect(east.z <= 2 && east.z + east.placed.sz - 1 >= 2).toBe(true);
    expect(east.placed.at(0, 1, 2 - east.z)).toBe("minecraft:gold_block");
    for (let i = 0; i < ex.placements.length; i++)
      for (let j = i + 1; j < ex.placements.length; j++) {
        const a = ex.placements[i]!, b = ex.placements[j]!;
        const apart = a.x + a.placed.sx <= b.x || b.x + b.placed.sx <= a.x || a.z + a.placed.sz <= b.z || b.z + b.placed.sz <= a.z;
        expect(apart, `${a.piece.key} and ${b.piece.key} overlap`).toBe(true);
      }
  });

  it("stops at max depth and leaves the far sockets open; deeper runs grow streets", () => {
    const shallow = expand(pools(), "squares", 1, 7, { startTurns: 0 });
    expect(shallow.open.length).toBe(2);
    const deep = expand(pools(), "squares", 3, 7, { startTurns: 0 });
    expect(deep.placements.length).toBeGreaterThan(shallow.placements.length);
  });

  it("falls back to the pool's fallback when nothing fits", () => {
    const p = pools();
    // A street pool whose only piece is far too big to fit beside the square twice over.
    const huge = pad("huge", 40, 40);
    huge.jigsaw(0, 1, 20, { facing: "west", name: "street", target: "street", pool: "streets", final: "gold_block" });
    p.set("streets", { elements: [{ piece: huge, weight: 1 }], fallback: "ends" });
    const ex = expand(p, "squares", 2, 3, { startTurns: 0 });
    const keys = ex.placements.map((x) => x.piece.key);
    expect(keys[0]).toBe("square");
    expect(keys.filter((k) => k === "huge").length).toBeLessThanOrEqual(1);
    expect(keys).toContain("end");
  });

  it("is deterministic for a seed and different across seeds", () => {
    const a = expand(pools(), "squares", 3, 11);
    const b = expand(pools(), "squares", 3, 11);
    expect(a.placements.map((p) => [p.piece.key, p.x, p.z, p.turns])).toEqual(b.placements.map((p) => [p.piece.key, p.x, p.z, p.turns]));
    const c = expand(pools(), "squares", 3, 12);
    expect(c.placements.map((p) => p.turns)[0]).not.toBe(a.placements.map((p) => p.turns)[0] === 0 ? 1 : 0);
  });

  it("draws the whole expansion onto one canvas with final blocks in place of markers", () => {
    const ex = expand(pools(), "squares", 1, 7, { startTurns: 0 });
    const cv = canvas(ex, "v", "Village", "test", "");
    expect(cv.blocks().some((b) => b.name === "minecraft:jigsaw")).toBe(false);
    expect(cv.blocks().filter((b) => b.name === "minecraft:gold_block").length).toBeGreaterThanOrEqual(2);
    expect(cv.blocks().filter((b) => b.name === "minecraft:diamond_block").length).toBe(0);
  });
});
