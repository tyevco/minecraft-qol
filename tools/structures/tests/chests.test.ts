import { describe, expect, it } from "vitest";
import { Blueprint } from "../blueprint";
import { BUILDINGS } from "../buildings";

// Chests in a row are double chests: the blueprint faces a chest into the
// room and pairs it with the next one facing the same way across their
// facing, as the game does when a player sets one down beside another. A
// larder placed without the pairing came up as single chests in game.
describe("chests", () => {
  const row = (n: number, wallNorth = true): Blueprint => {
    const bp = new Blueprint("row", "", [5, 3, 4], "", "");
    bp.fill(0, 0, 0, 5, 1, 4, "stone_bricks");
    if (wallNorth) bp.fill(0, 1, 0, 5, 1, 1, "stone_bricks");
    for (let x = 0; x < n; x++) bp.set(x, 1, 1, "chest");
    return bp.trimmed();
  };

  it("faces a chest with no facing into the room, away from the wall", () => {
    const bp = row(1);
    expect(bp.blocks().find((b) => b.name === "minecraft:chest")?.states["minecraft:cardinal_direction"]).toBe("south");
  });

  it("keeps a facing the author set", () => {
    const bp = new Blueprint("set", "", [3, 3, 3], "", "");
    bp.set(1, 1, 1, "chest", { "minecraft:cardinal_direction": "east" });
    expect(bp.trimmed().blocks()[0]!.states["minecraft:cardinal_direction"]).toBe("east");
  });

  it("pairs two in a row, the left half from the front leading (east, facing south), and leaves a third alone", () => {
    expect(row(2).chestPairs()).toEqual([{ lead: [1, 1, 1], other: [0, 1, 1] }]);
    expect(row(3).chestPairs()).toEqual([{ lead: [1, 1, 1], other: [0, 1, 1] }]);
    expect(row(4).chestPairs()).toEqual([
      { lead: [1, 1, 1], other: [0, 1, 1] },
      { lead: [3, 1, 1], other: [2, 1, 1] },
    ]);
  });

  it("leads with the east half of a row facing north too", () => {
    const bp = new Blueprint("north", "", [5, 3, 4], "", "");
    bp.fill(0, 0, 0, 5, 1, 4, "stone_bricks").fill(0, 1, 2, 5, 1, 1, "stone_bricks");
    bp.set(0, 1, 1, "chest").set(1, 1, 1, "chest");
    const t = bp.trimmed();
    expect(t.blocks().filter((b) => b.name === "minecraft:chest").map((b) => b.states["minecraft:cardinal_direction"])).toEqual(["north", "north"]);
    expect(t.chestPairs()).toEqual([{ lead: [1, 1, 1], other: [0, 1, 1] }]);
  });

  it("never puts three chests in a row in a building", () => {
    for (const bp of BUILDINGS)
      for (const b of bp.blocks()) {
        if (!/chest$/.test(b.name)) continue;
        expect(bp.at(b.x + 1, b.y, b.z) === b.name && bp.at(b.x + 2, b.y, b.z) === b.name, `${bp.key}: three chests from ${b.x},${b.y},${b.z} along x`).toBe(false);
        expect(bp.at(b.x, b.y, b.z + 1) === b.name && bp.at(b.x, b.y, b.z + 2) === b.name, `${bp.key}: three chests from ${b.x},${b.y},${b.z} along z`).toBe(false);
      }
  });

  it("does not pair chests one behind the other, or facing different ways, or of different kinds", () => {
    const behind = new Blueprint("behind", "", [3, 3, 4], "", "");
    behind.fill(0, 0, 0, 3, 1, 4, "stone_bricks").set(1, 1, 1, "chest").set(1, 1, 2, "chest");
    expect(behind.trimmed().chestPairs()).toEqual([]);
    const ways = new Blueprint("ways", "", [3, 3, 3], "", "");
    ways.set(0, 1, 1, "chest", { "minecraft:cardinal_direction": "south" }).set(1, 1, 1, "chest", { "minecraft:cardinal_direction": "north" });
    expect(ways.chestPairs()).toEqual([]);
    const kinds = new Blueprint("kinds", "", [3, 3, 3], "", "");
    kinds.set(0, 1, 1, "chest").set(1, 1, 1, "trapped_chest");
    expect(kinds.chestPairs()).toEqual([]);
  });

  it("pairs along z for chests facing east or west", () => {
    const bp = new Blueprint("z", "", [3, 3, 3], "", "");
    bp.set(1, 1, 0, "chest", { "minecraft:cardinal_direction": "east" }).set(1, 1, 1, "chest", { "minecraft:cardinal_direction": "east" });
    expect(bp.chestPairs()).toEqual([{ lead: [1, 1, 1], other: [1, 1, 0] }]);
  });

  it("cuts a three-high doorway for a people whose model stands over two blocks", () => {
    const house = BUILDINGS.find((b) => b.key === "high_elf_house")!;
    const door = house.blocks().find((b) => /door$/.test(b.name) && !b.states.upper_block_bit)!;
    expect(house.at(door.x, door.y + 2, door.z), "the block over the high elf door").toBeUndefined();
    const hobbit = BUILDINGS.find((b) => b.key === "hobbit_hole")!;
    const hd = hobbit.blocks().find((b) => /door$/.test(b.name) && !b.states.upper_block_bit)!;
    expect(hobbit.at(hd.x, hd.y + 2, hd.z), "the lintel over a hobbit door").toBeDefined();
  });

  it("writes both halves of every pair into the structure", () => {
    const bp = row(2);
    const text = bp.toMcstructure().toString("latin1");
    expect(text.split("pairlead").length - 1).toBe(2);
    expect(text.split("Chest").length - 1).toBe(2);
  });

  // The buildings authored with a row: what a person sees in game.
  for (const [key, pairs] of [["drow_larder", 2], ["hobbit_pantry", 2], ["hobbit_inn", 1], ["wood_elf_larder", 1], ["shared_larder", 1], ["drover_trading_post", 0], ["tallfolk_barn", 0]] as const) {
    it(`${key} has ${pairs} double chest(s)`, () => {
      const bp = BUILDINGS.find((b) => b.key === key);
      expect(bp, key).toBeDefined();
      expect(bp!.chestPairs().length, bp!.chestPairs().map((p) => p.lead.join(",")).join("; ")).toBe(pairs);
    });
  }
});
