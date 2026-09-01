import { describe, it, expect } from "vitest";
import { decide, sameSpawn, type SpawnRef } from "../scripts/core/ownership";

const at = (x: number, y = 64, z = 0, dimId = "minecraft:overworld"): SpawnRef => ({
  dimId,
  x,
  y,
  z,
});

describe("sameSpawn", () => {
  it("compares position and dimension together", () => {
    expect(sameSpawn(at(1), at(1))).toBe(true);
    expect(sameSpawn(at(1), at(2))).toBe(false);
    expect(sameSpawn(at(1), at(1, 64, 0, "minecraft:nether"))).toBe(false);
  });

  it("treats a missing side as not matching", () => {
    expect(sameSpawn(undefined, at(1))).toBe(false);
    expect(sameSpawn(at(1), undefined)).toBe(false);
    expect(sameSpawn(undefined, undefined)).toBe(false);
  });
});

describe("decide", () => {
  it("assigns to a player who has never set a spawn", () => {
    expect(decide(undefined, undefined)).toBe("assign");
  });

  it("keeps managing a spawn point it set itself", () => {
    const ours = at(10);
    expect(decide(ours, ours)).toBe("managed");
  });

  it("releases a player who slept in a bed", () => {
    // The point of the whole design: a real bed always wins, permanently.
    expect(decide(at(500), at(10))).toBe("foreign");
  });

  it("releases a player who had never been managed at all", () => {
    expect(decide(at(500), undefined)).toBe("foreign");
  });

  it("picks a player back up after their bed is destroyed", () => {
    // Vanilla clears the spawn point when the bed goes, so the player returns to
    // having none. Re-adopting them then is exactly the desired behaviour.
    expect(decide(undefined, at(10))).toBe("assign");
  });

  it("does not confuse an identical position in another dimension", () => {
    const overworld = at(10, 64, 0, "minecraft:overworld");
    const nether = at(10, 64, 0, "minecraft:nether");
    expect(decide(nether, overworld)).toBe("foreign");
  });

  it("only ever returns one of the three known decisions", () => {
    const options: SpawnRef[] = [at(0), at(1), at(2, 70, 3, "minecraft:the_end")];
    const allowed = new Set(["assign", "managed", "foreign"]);
    for (const current of [undefined, ...options]) {
      for (const owned of [undefined, ...options]) {
        expect(allowed.has(decide(current, owned))).toBe(true);
      }
    }
  });
});
