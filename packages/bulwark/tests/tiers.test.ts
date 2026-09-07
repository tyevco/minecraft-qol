import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KINDS, KIND_EVENT } from "../scripts/core/ammo";
import {
  AXES,
  BASE_TIERS,
  MATERIALS,
  RANGE_BLOCKS,
  RATE_INTERVAL,
  aimEvent,
  damageMultiplier,
  describeTiers,
  feedUpgrade,
  gateAllows,
  gateFor,
  materialsToReturn,
  tierEvent,
  upgradeFor,
  withTier,
  type Tier,
  type Tiers,
} from "../scripts/core/tiers";

const at = (t: Partial<Tiers>): Tiers => ({ ...BASE_TIERS, ...t });

describe("feeding upgrades", () => {
  it("knows which axis and tier every material buys", () => {
    expect(upgradeFor("minecraft:diamond")).toEqual({ axis: "damage", tier: 2 });
    expect(upgradeFor("minecraft:netherite_ingot")).toEqual({ axis: "damage", tier: 3 });
    expect(upgradeFor("minecraft:redstone_block")).toEqual({ axis: "rate", tier: 2 });
    expect(upgradeFor("minecraft:quartz")).toEqual({ axis: "rate", tier: 3 });
    expect(upgradeFor("minecraft:ender_eye")).toEqual({ axis: "range", tier: 2 });
    expect(upgradeFor("minecraft:ender_chest")).toEqual({ axis: "range", tier: 3 });
    expect(upgradeFor("minecraft:fire_charge")).toEqual({ axis: "gate", tier: 2 });
    expect(upgradeFor("minecraft:dragon_breath")).toEqual({ axis: "gate", tier: 3 });
    expect(upgradeFor("minecraft:iron_ingot")).toBeUndefined();
    expect(upgradeFor("minecraft:arrow")).toBeUndefined();
  });

  it("raises one axis one tier with the next material", () => {
    expect(feedUpgrade(BASE_TIERS, "minecraft:diamond")).toEqual({ kind: "upgrade", axis: "damage", tier: 2 });
    expect(feedUpgrade(at({ damage: 2 }), "minecraft:netherite_ingot")).toEqual({ kind: "upgrade", axis: "damage", tier: 3 });
  });

  it("refuses the third material before the second, naming what is needed", () => {
    expect(feedUpgrade(BASE_TIERS, "minecraft:netherite_ingot")).toEqual({
      kind: "order",
      axis: "damage",
      needs: "minecraft:diamond",
    });
  });

  it("refuses a material already spent or a maxed axis", () => {
    expect(feedUpgrade(at({ rate: 2 }), "minecraft:redstone_block")).toEqual({ kind: "maxed", axis: "rate" });
    expect(feedUpgrade(at({ rate: 3 }), "minecraft:quartz")).toEqual({ kind: "maxed", axis: "rate" });
    expect(feedUpgrade(at({ rate: 3 }), "minecraft:redstone_block")).toEqual({ kind: "maxed", axis: "rate" });
  });

  it("ignores anything that is not a material", () => {
    expect(feedUpgrade(BASE_TIERS, "minecraft:cobblestone")).toEqual({ kind: "not_material" });
  });

  it("does not touch other axes", () => {
    expect(withTier(at({ range: 3 }), "gate", 2)).toEqual({ damage: 1, rate: 1, range: 3, gate: 2 });
  });
});

describe("giving materials back", () => {
  it("returns one item per tier above the base, in feeding order", () => {
    expect(materialsToReturn(BASE_TIERS)).toEqual([]);
    expect(materialsToReturn(at({ damage: 3, gate: 2 }))).toEqual([
      "minecraft:diamond",
      "minecraft:netherite_ingot",
      "minecraft:fire_charge",
    ]);
  });

  it("returns exactly what feeding took, whatever the order fed", () => {
    let tiers = { ...BASE_TIERS };
    const fed: string[] = [];
    for (const item of ["minecraft:redstone_block", "minecraft:diamond", "minecraft:quartz", "minecraft:ender_eye"]) {
      const v = feedUpgrade(tiers, item);
      expect(v.kind).toBe("upgrade");
      if (v.kind === "upgrade") tiers = withTier(tiers, v.axis, v.tier);
      fed.push(item);
    }
    expect([...materialsToReturn(tiers)].sort()).toEqual([...fed].sort());
  });
});

describe("what tiers do", () => {
  it("scales damage 1x, 1.5x, 2x", () => {
    expect([1, 2, 3].map((t) => damageMultiplier(t as Tier))).toEqual([1, 1.5, 2]);
  });

  it("gates ammo kinds: plain, then tints, then the rest", () => {
    for (const kind of KINDS) expect(gateAllows(1, kind), kind).toBe(kind === "arrow");
    expect(gateAllows(2, "slowness")).toBe(true);
    expect(gateAllows(2, "decay")).toBe(true);
    expect(gateAllows(2, "snowball")).toBe(false);
    expect(gateAllows(2, "splash_weakness")).toBe(false);
    for (const kind of KINDS) expect(gateAllows(3, kind), kind).toBe(true);
    expect(gateFor("weakness")).toBe(2);
    expect(gateFor("splash_decay")).toBe(3);
  });

  it("names the aim and tier events", () => {
    expect(aimEvent(1, 1)).toBe("bulwark:aim_r1_g1");
    expect(aimEvent(3, 2)).toBe("bulwark:aim_r3_g2");
    expect(tierEvent(2)).toBe("bulwark:tier_2");
    expect(describeTiers(at({ rate: 2 }))).toBe("damage I, fire rate II, range I, ammo I");
  });
});

/**
 * The head's JSON must carry a group and an event for every aim pair and
 * every ammo kind, with the numbers the tiers module documents. Read here so
 * a hand edit to one side fails a unit test rather than a night in game.
 */
describe("the head entity", () => {
  const raw = readFileSync(join(__dirname, "..", "behavior_pack", "entities", "turret_head.json"), "utf8");
  const entity = JSON.parse(raw)["minecraft:entity"] as {
    component_groups: Record<string, Record<string, unknown>>;
    events: Record<string, unknown>;
  };

  it("has an aim group per rate and range pair with the documented interval and radius", () => {
    for (const rate of [1, 2, 3] as Tier[]) {
      for (const range of [1, 2, 3] as Tier[]) {
        const name = aimEvent(rate, range);
        const group = entity.component_groups[name];
        expect(group, name).toBeDefined();
        if (!group) continue;
        const attack = group["minecraft:behavior.ranged_attack"] as {
          attack_interval: { min: number; max: number };
          attack_radius: number;
        };
        expect(attack.attack_interval).toEqual({ min: RATE_INTERVAL[rate][0], max: RATE_INTERVAL[rate][1] });
        expect(attack.attack_radius).toBe(RANGE_BLOCKS[range]);
        const follow = group["minecraft:follow_range"] as { value: number; max: number };
        expect(follow.max).toBeGreaterThanOrEqual(RANGE_BLOCKS[range]);
        expect(entity.events[name], `event ${name}`).toBeDefined();
      }
    }
  });

  it("has a target selector group and event per selector and range, and none in the aim groups", () => {
    for (const sel of ["any", "wounded", "healthy"]) {
      for (const range of [1, 2, 3] as Tier[]) {
        const name = `bulwark:target_${sel}_g${range}`;
        const group = entity.component_groups[name];
        expect(group, name).toBeDefined();
        const nat = group?.["minecraft:behavior.nearest_attackable_target"] as { entity_types: { max_dist: number }[] };
        expect(nat.entity_types[0]!.max_dist).toBe(RANGE_BLOCKS[range]);
        expect(entity.events[name], `event ${name}`).toBeDefined();
      }
    }
    for (const rate of [1, 2, 3] as Tier[])
      for (const range of [1, 2, 3] as Tier[])
        expect(entity.component_groups[aimEvent(rate, range)]?.["minecraft:behavior.nearest_attackable_target"]).toBeUndefined();
  });

  it("has an ammo group and event per kind, and a tier event per damage tier", () => {
    for (const kind of KINDS) {
      const event = KIND_EVENT[kind];
      expect(entity.component_groups[event], event).toBeDefined();
      expect(entity.events[event], event).toBeDefined();
    }
    for (const t of [1, 2, 3] as Tier[]) expect(entity.events[tierEvent(t)], tierEvent(t)).toBeDefined();
    expect(entity.events["bulwark:disarm"]).toBeDefined();
  });

  it("never lets two materials buy the same thing", () => {
    const all = AXES.flatMap((a) => [...MATERIALS[a]]);
    expect(new Set(all).size).toBe(all.length);
  });
});
