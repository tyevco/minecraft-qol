import { describe, expect, it } from "vitest";
import {
  AMMO_CAP,
  AMMO_ITEM,
  EVENT_ARM,
  EVENT_DISARM,
  KINDS,
  KIND_EVENT,
  KIND_PROJECTILE,
  PROJECTILES,
  acceptFeed,
  armEvent,
  arming,
  classify,
  consumeShot,
  findKind,
  findSpecial,
  groupEvents,
  isArmed,
  planPull,
  type Slot,
  type StackView,
} from "../scripts/core/ammo";

// Stack shapes as the engine reports them (docs/bulwark-ammo-results.md).
const arrows = (n: number): Slot => ({ typeId: AMMO_ITEM, amount: n, localizationKey: "item.arrow.name" });
const tipped = (effect: string, n = 1): StackView => ({
  typeId: AMMO_ITEM,
  amount: n,
  localizationKey: `tipped_arrow.effect.${effect}`,
});
const splash = (effect: string, n = 1): StackView => ({
  typeId: "minecraft:splash_potion",
  amount: n,
  localizationKey: "%potion.x.splash.name",
  potionEffectId: `minecraft:${effect}`,
});
const snowballs = (n: number): StackView => ({ typeId: "minecraft:snowball", amount: n, localizationKey: "item.snowball.name" });
const other = (n: number): Slot => ({ typeId: "minecraft:cobblestone", amount: n, localizationKey: "tile.cobblestone.name" });

describe("classify", () => {
  it("knows a plain arrow by its key", () => {
    expect(classify(arrows(1)!)).toBe("arrow");
  });

  it("reads the three tints the turret fires off the localization key", () => {
    expect(classify(tipped("moveSlowdown"))).toBe("slowness");
    expect(classify(tipped("weakness"))).toBe("weakness");
    expect(classify(tipped("wither"))).toBe("decay");
  });

  it("refuses tints that heal or do nothing to the undead", () => {
    for (const effect of ["poison", "heal", "harm", "nightVision", "regeneration"]) {
      expect(classify(tipped(effect)), effect).toBeUndefined();
    }
  });

  it("never treats an arrow with no readable key as plain", () => {
    expect(classify({ typeId: AMMO_ITEM, amount: 4 })).toBeUndefined();
  });

  it("reads a splash potion off its effect id, strength and length included", () => {
    expect(classify(splash("slowness"))).toBe("splash_slowness");
    expect(classify(splash("long_slowness"))).toBe("splash_slowness");
    expect(classify(splash("strong_slowness"))).toBe("splash_slowness");
    expect(classify(splash("weakness"))).toBe("splash_weakness");
    expect(classify(splash("wither"))).toBe("splash_decay");
    expect(classify(splash("poison"))).toBeUndefined();
    expect(classify(splash("healing"))).toBeUndefined();
  });

  it("takes snowballs, and nothing else", () => {
    expect(classify(snowballs(3))).toBe("snowball");
    expect(classify(other(3)!)).toBeUndefined();
    expect(classify({ typeId: "minecraft:lingering_potion", amount: 1, potionEffectId: "minecraft:weakness" })).toBeUndefined();
    expect(classify({ typeId: "minecraft:potion", amount: 1, potionEffectId: "minecraft:weakness" })).toBeUndefined();
  });

  it("ignores empty stacks", () => {
    expect(classify(undefined)).toBeUndefined();
    expect(classify({ ...tipped("weakness"), amount: 0 })).toBeUndefined();
  });
});

describe("kinds", () => {
  it("has an event and a projectile for every kind", () => {
    for (const kind of KINDS) {
      expect(KIND_EVENT[kind]).toMatch(/^bulwark:ammo_/);
      expect(PROJECTILES.has(KIND_PROJECTILE[kind])).toBe(true);
    }
  });
});

describe("planPull", () => {
  it("takes nothing from an empty hopper", () => {
    expect(planPull(0, [null, null, null, null, null])).toEqual({ takes: [], ammo: 0 });
  });

  it("ignores everything that is not a plain arrow", () => {
    expect(planPull(0, [other(64), { typeId: "minecraft:spectral_arrow", amount: 8 }, null])).toEqual({
      takes: [],
      ammo: 0,
    });
  });

  it("leaves tipped arrows and snowballs where they are", () => {
    const plan = planPull(0, [tipped("moveSlowdown", 16), snowballs(16), arrows(5), splash("weakness", 2)]);
    expect(plan).toEqual({ takes: [{ slot: 2, amount: 5 }], ammo: 5 });
  });

  it("takes a whole stack when there is room", () => {
    expect(planPull(0, [arrows(16)])).toEqual({ takes: [{ slot: 0, amount: 16 }], ammo: 16 });
  });

  it("stops exactly at the cap, splitting the last slot", () => {
    const plan = planPull(50, [arrows(10), arrows(10)]);
    expect(plan.ammo).toBe(AMMO_CAP);
    expect(plan.takes).toEqual([
      { slot: 0, amount: 10 },
      { slot: 1, amount: 4 },
    ]);
  });

  it("takes nothing when already full", () => {
    expect(planPull(AMMO_CAP, [arrows(64)])).toEqual({ takes: [], ammo: AMMO_CAP });
  });

  it("bounds one pull by maxPerPull", () => {
    const plan = planPull(0, [arrows(64), arrows(64)], AMMO_CAP, 16);
    expect(plan).toEqual({ takes: [{ slot: 0, amount: 16 }], ammo: 16 });
  });

  it("skips empty and foreign slots to reach arrows further along", () => {
    const plan = planPull(0, [null, other(3), null, arrows(2), arrows(3)]);
    expect(plan.takes).toEqual([
      { slot: 3, amount: 2 },
      { slot: 4, amount: 3 },
    ]);
    expect(plan.ammo).toBe(5);
  });
});

describe("findSpecial and findKind", () => {
  it("finds the first special stack, lowest slot first, past plain arrows", () => {
    expect(findSpecial([arrows(10), null, tipped("wither", 3), snowballs(8)])).toEqual({ slot: 2, kind: "decay" });
  });

  it("finds nothing in a hopper of plain arrows or junk", () => {
    expect(findSpecial([arrows(10), other(1), tipped("poison", 5)])).toBeUndefined();
  });

  it("finds the stack of a given kind to charge, skipping other kinds", () => {
    const slots: Slot[] = [tipped("moveSlowdown", 1), snowballs(4), tipped("moveSlowdown", 2)];
    expect(findKind(slots, "snowball")).toBe(1);
    expect(findKind(slots, "slowness")).toBe(0);
    expect(findKind(slots, "decay")).toBeUndefined();
  });
});

describe("acceptFeed", () => {
  it("takes plain arrows up to the cap", () => {
    expect(acceptFeed(60, arrows(10)!)).toEqual({ accepted: 4, ammo: 64 });
    expect(acceptFeed(0, arrows(10)!)).toEqual({ accepted: 10, ammo: 10 });
  });

  it("refuses special ammo by hand, and says which", () => {
    expect(acceptFeed(0, tipped("weakness", 8))).toEqual({ accepted: 0, ammo: 0, refused: "weakness" });
    expect(acceptFeed(0, snowballs(8))).toEqual({ accepted: 0, ammo: 0, refused: "snowball" });
  });

  it("ignores an empty hand and things that are not ammo", () => {
    expect(acceptFeed(5, undefined)).toEqual({ accepted: 0, ammo: 5 });
    expect(acceptFeed(5, other(5)!)).toEqual({ accepted: 0, ammo: 5 });
    expect(acceptFeed(5, tipped("poison", 5))).toEqual({ accepted: 0, ammo: 5 });
  });
});

describe("shots and arming", () => {
  it("consumes one per shot and never goes negative", () => {
    expect(consumeShot(3)).toBe(2);
    expect(consumeShot(0)).toBe(0);
  });

  it("is armed only with ammo", () => {
    expect(isArmed(0)).toBe(false);
    expect(isArmed(1)).toBe(true);
  });

  it("prefers a hopper's special ammo over the buffer, and falls back to it", () => {
    expect(arming(10, "snowball")).toEqual({ armed: true, kind: "snowball" });
    expect(arming(0, "splash_decay")).toEqual({ armed: true, kind: "splash_decay" });
    expect(arming(10, undefined)).toEqual({ armed: true, kind: "arrow" });
    expect(arming(0, undefined)).toEqual({ armed: false, kind: "arrow" });
    expect(arming(0, "arrow")).toEqual({ armed: false, kind: "arrow" });
  });
});

describe("groupEvents", () => {
  it("arms and picks the ammo group from an unknown state", () => {
    expect(groupEvents({ armed: true, kind: "arrow" }, {})).toEqual([EVENT_ARM, KIND_EVENT.arrow]);
  });

  it("does nothing when the head already wears the right groups", () => {
    expect(groupEvents({ armed: true, kind: "slowness" }, { armed: true, kind: "slowness" })).toEqual([]);
    expect(groupEvents({ armed: false, kind: "arrow" }, { armed: false })).toEqual([]);
  });

  it("swaps only the ammo group when the kind changes on an armed head", () => {
    expect(groupEvents({ armed: true, kind: "snowball" }, { armed: true, kind: "arrow" })).toEqual([
      KIND_EVENT.snowball,
    ]);
  });

  it("disarms with one event, whatever the kind was", () => {
    expect(groupEvents({ armed: false, kind: "arrow" }, { armed: true, kind: "decay" })).toEqual([EVENT_DISARM]);
    expect(groupEvents({ armed: false, kind: "arrow" }, {})).toEqual([EVENT_DISARM]);
  });

  it("re-fires the ammo group when the kind last written is unknown", () => {
    expect(groupEvents({ armed: true, kind: "arrow" }, { armed: true })).toEqual([KIND_EVENT.arrow]);
  });
});

describe("armEvent", () => {
  it("fires nothing when the recorded state already matches", () => {
    expect(armEvent(5, true)).toBeUndefined();
    expect(armEvent(0, false)).toBeUndefined();
  });

  it("fires the right event on a change or an unknown state", () => {
    expect(armEvent(1, false)).toBe(EVENT_ARM);
    expect(armEvent(0, true)).toBe(EVENT_DISARM);
    expect(armEvent(1, undefined)).toBe(EVENT_ARM);
    expect(armEvent(0, undefined)).toBe(EVENT_DISARM);
  });
});
