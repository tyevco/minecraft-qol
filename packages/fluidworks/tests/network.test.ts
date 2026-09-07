import { describe, expect, it } from "vitest";
import {
  key,
  route,
  routes,
  walk,
  type NetworkView,
} from "../scripts/core/network";

/** A tiny world: a set of pipe keys and a set of terminal keys. */
function view(pipes: string[], terminals: string[]): NetworkView {
  const p = new Set(pipes);
  const t = new Set(terminals);
  return { isPipe: (v) => p.has(key(v)), isTerminal: (v) => t.has(key(v)) };
}

describe("walk", () => {
  const funnel = { x: 0, y: 0, z: 0 };

  it("follows a straight run to the tank at its end", () => {
    const v = view(["1,0,0", "2,0,0", "3,0,0"], ["4,0,0"]);
    expect(walk({ x: 1, y: 0, z: 0 }, funnel, v)).toEqual({ x: 4, y: 0, z: 0 });
  });

  it("finds a tank beside the run, not only at its end", () => {
    const v = view(["1,0,0", "2,0,0", "3,0,0"], ["2,1,0"]);
    expect(walk({ x: 1, y: 0, z: 0 }, funnel, v)).toEqual({ x: 2, y: 1, z: 0 });
  });

  it("takes corners and climbs", () => {
    const v = view(["1,0,0", "1,0,1", "1,1,1", "1,2,1"], ["1,2,2"]);
    expect(walk({ x: 1, y: 0, z: 0 }, funnel, v)).toEqual({ x: 1, y: 2, z: 2 });
  });

  it("never returns the funnel it started from, even if it looks like a terminal", () => {
    const v = view(["1,0,0"], ["0,0,0"]);
    expect(walk({ x: 1, y: 0, z: 0 }, funnel, v)).toBeUndefined();
  });

  it("prefers the nearest terminal", () => {
    const v = view(["1,0,0", "2,0,0", "3,0,0"], ["3,1,0", "1,-1,0"]);
    expect(walk({ x: 1, y: 0, z: 0 }, funnel, v)).toEqual({
      x: 1,
      y: -1,
      z: 0,
    });
  });

  it("gives up past the pipe limit and on a non-pipe start", () => {
    const pipes = Array.from({ length: 80 }, (_, i) => `${i + 1},0,0`);
    expect(
      walk({ x: 1, y: 0, z: 0 }, funnel, view(pipes, ["81,0,0"]), 64),
    ).toBeUndefined();
    expect(
      walk({ x: 1, y: 0, z: 0 }, funnel, view([], ["2,0,0"])),
    ).toBeUndefined();
  });
});

describe("route", () => {
  const funnel = { x: 0, y: 0, z: 0 };

  it("lists the pipes from the funnel to the tank, in order", () => {
    const v = view(["1,0,0", "2,0,0", "3,0,0"], ["4,0,0"]);
    expect(route({ x: 1, y: 0, z: 0 }, funnel, v)).toEqual({
      terminal: { x: 4, y: 0, z: 0 },
      path: [
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
      ],
    });
  });

  it("stops the path at the pipe beside a tank found part-way", () => {
    const v = view(["1,0,0", "2,0,0", "3,0,0"], ["2,1,0"]);
    expect(route({ x: 1, y: 0, z: 0 }, funnel, v)?.path).toEqual([
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ]);
  });

  it("follows the branch that reached the tank, not the dead end", () => {
    const v = view(["1,0,0", "2,0,0", "1,0,1", "1,0,2", "1,0,3"], ["1,0,4"]);
    expect(route({ x: 1, y: 0, z: 0 }, funnel, v)?.path).toEqual([
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 0, z: 2 },
      { x: 1, y: 0, z: 3 },
    ]);
  });

  it("is undefined when the run reaches nothing", () => {
    const v = view(["1,0,0", "2,0,0"], []);
    expect(route({ x: 1, y: 0, z: 0 }, funnel, v)).toBeUndefined();
  });
});

describe("routes", () => {
  const funnel = { x: 0, y: 0, z: 0 };
  const at = (x: number, y: number, z: number) => ({ x, y, z });

  it("lists every tank on a T, nearest first, each with its own path", () => {
    // funnel - pipe - pipe(T), tanks north and south of the T
    const v = view(["1,0,0", "2,0,0"], ["2,0,-1", "2,0,1"]);
    const found = routes(at(1, 0, 0), funnel, v);
    expect(found.map((r) => r.terminal)).toEqual([at(2, 0, -1), at(2, 0, 1)]);
    for (const r of found) expect(r.path).toEqual([at(1, 0, 0), at(2, 0, 0)]);
  });

  it("orders tanks by pipe distance, whichever arm they are on", () => {
    const v = view(
      ["1,0,0", "2,0,0", "3,0,0", "1,0,1"],
      ["3,1,0", "1,-1,1", "4,0,0"],
    );
    expect(routes(at(1, 0, 0), funnel, v).map((r) => r.terminal)).toEqual([
      at(1, -1, 1),
      at(3, 1, 0),
      at(4, 0, 0),
    ]);
  });

  it("lists a tank touching the run twice only once, by the shorter path", () => {
    // an elbow round a tank at 2,0,1: pipes 1,0,0 2,0,0 3,0,0 3,0,1 3,0,2 2,0,2
    const v = view(
      ["1,0,0", "2,0,0", "3,0,0", "3,0,1", "3,0,2", "2,0,2"],
      ["2,0,1"],
    );
    const found = routes(at(1, 0, 0), funnel, v);
    expect(found).toHaveLength(1);
    expect(found[0]!.path).toEqual([at(1, 0, 0), at(2, 0, 0)]);
  });

  it("is empty on a run that reaches nothing and on a non-pipe start", () => {
    expect(routes(at(1, 0, 0), funnel, view(["1,0,0", "2,0,0"], []))).toEqual([]);
    expect(routes(at(1, 0, 0), funnel, view([], ["2,0,0"]))).toEqual([]);
  });

  it("route is the first of routes", () => {
    const v = view(["1,0,0", "2,0,0"], ["2,0,-1", "2,0,1"]);
    expect(route(at(1, 0, 0), funnel, v)).toEqual(routes(at(1, 0, 0), funnel, v)[0]);
  });
});
