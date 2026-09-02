import { describe, it, expect } from "vitest";
import { MAX_LEVEL, type CauldronState } from "../core/fluids/cauldron";
import {
  BUCKET,
  GLASS_BOTTLE,
  LAVA_BUCKET,
  POTION,
  POWDER_SNOW_BUCKET,
  WATER_BUCKET,
  WATER_POTION_EFFECT,
  ALL_CLAIMED,
} from "../core/fluids/items";
import {
  CAULDRON_RULES as RULES,
  bucketRule,
  bottleRule,
  concreteRule,
  dyeRule,
  washRule,
} from "../core/fluids";
import type { RuleResult, ItemRef } from "../core/fluids";

const water = (level: number): CauldronState => ({ fluid: "water", level });
const lava = (level: number): CauldronState => ({ fluid: "lava", level });
const empty: CauldronState = { fluid: "empty", level: 0 };

const item = (typeId: string, extra: Partial<ItemRef> = {}): ItemRef => ({
  typeId,
  amount: 1,
  ...extra,
});

const waterBottle = () => item(POTION, { potionEffectId: WATER_POTION_EFFECT });

/** Narrowing helper so tests read cleanly. */
function applied(r: RuleResult) {
  expect(r.kind).toBe("apply");
  if (r.kind !== "apply") throw new Error("unreachable");
  return r;
}

describe("buckets", () => {
  it("fills an empty cauldron to full and returns an empty bucket", () => {
    const r = applied(
      bucketRule({ item: item(WATER_BUCKET), cauldron: empty }),
    );
    expect(r.cauldron).toEqual({ fluid: "water", level: MAX_LEVEL });
    expect(r.output).toEqual({ mode: "new", typeId: BUCKET, amount: 1 });
  });

  it("handles lava and powder snow the same way", () => {
    expect(
      applied(bucketRule({ item: item(LAVA_BUCKET), cauldron: empty }))
        .cauldron,
    ).toEqual({ fluid: "lava", level: MAX_LEVEL });
    expect(
      applied(bucketRule({ item: item(POWDER_SNOW_BUCKET), cauldron: empty }))
        .cauldron,
    ).toEqual({ fluid: "powder_snow", level: MAX_LEVEL });
  });

  it("tops up a partially filled cauldron of the same fluid", () => {
    expect(
      applied(bucketRule({ item: item(WATER_BUCKET), cauldron: water(3) }))
        .cauldron,
    ).toEqual({ fluid: "water", level: MAX_LEVEL });
  });

  it("refuses to mix fluids rather than replacing the contents", () => {
    expect(
      bucketRule({ item: item(WATER_BUCKET), cauldron: lava(MAX_LEVEL) }),
    ).toEqual({ kind: "none" });
    expect(bucketRule({ item: item(LAVA_BUCKET), cauldron: water(3) })).toEqual(
      { kind: "none" },
    );
  });

  it("refuses to fill an already-full cauldron of the same fluid", () => {
    expect(
      bucketRule({ item: item(WATER_BUCKET), cauldron: water(MAX_LEVEL) }),
    ).toEqual({ kind: "none" });
  });

  it("drains a full cauldron and returns the matching filled bucket", () => {
    const r = applied(
      bucketRule({ item: item(BUCKET), cauldron: water(MAX_LEVEL) }),
    );
    expect(r.cauldron).toEqual({ fluid: "empty", level: 0 });
    expect(r.output).toEqual({ mode: "new", typeId: WATER_BUCKET, amount: 1 });

    expect(
      applied(bucketRule({ item: item(BUCKET), cauldron: lava(MAX_LEVEL) }))
        .output,
    ).toEqual({ mode: "new", typeId: LAVA_BUCKET, amount: 1 });
  });

  it("refuses to scoop a partially filled cauldron, matching vanilla", () => {
    for (let l = 1; l < MAX_LEVEL; l++) {
      expect(bucketRule({ item: item(BUCKET), cauldron: water(l) })).toEqual({
        kind: "none",
      });
    }
  });

  it("does nothing when the faced block is not a cauldron", () => {
    expect(
      bucketRule({ item: item(WATER_BUCKET), cauldron: undefined }),
    ).toEqual({ kind: "none" });
  });
});

describe("bottles", () => {
  it("adds exactly 2 levels, Bedrock's rate rather than Java's 1", () => {
    expect(
      applied(bottleRule({ item: waterBottle(), cauldron: empty })).cauldron,
    ).toEqual({ fluid: "water", level: 2 });
    expect(
      applied(bottleRule({ item: waterBottle(), cauldron: water(2) })).cauldron,
    ).toEqual({ fluid: "water", level: 4 });
  });

  it("returns a glass bottle when filling", () => {
    expect(
      applied(bottleRule({ item: waterBottle(), cauldron: empty })).output,
    ).toEqual({ mode: "new", typeId: GLASS_BOTTLE, amount: 1 });
  });

  it("refuses to overfill past 6 instead of wasting the bottle", () => {
    expect(bottleRule({ item: waterBottle(), cauldron: water(5) })).toEqual({
      kind: "none",
    });
    expect(
      bottleRule({ item: waterBottle(), cauldron: water(MAX_LEVEL) }),
    ).toEqual({ kind: "none" });
  });

  it("takes 2 levels back out and returns a water bottle", () => {
    const r = applied(
      bottleRule({ item: item(GLASS_BOTTLE), cauldron: water(4) }),
    );
    expect(r.cauldron).toEqual({ fluid: "water", level: 2 });
    expect(r.output).toEqual({ mode: "new", typeId: POTION, amount: 1 });
  });

  it("normalises a drained-to-zero cauldron back to empty", () => {
    expect(
      applied(bottleRule({ item: item(GLASS_BOTTLE), cauldron: water(2) }))
        .cauldron,
    ).toEqual({ fluid: "empty", level: 0 });
  });

  it("refuses when there is not enough water to fill a bottle", () => {
    expect(
      bottleRule({ item: item(GLASS_BOTTLE), cauldron: water(1) }),
    ).toEqual({ kind: "none" });
    expect(bottleRule({ item: item(GLASS_BOTTLE), cauldron: empty })).toEqual({
      kind: "none",
    });
  });

  it("does not treat a non-water potion as a water bottle", () => {
    const awkward = item(POTION, { potionEffectId: "minecraft:mundane" });
    expect(bottleRule({ item: awkward, cauldron: empty })).toEqual({
      kind: "none",
    });
  });

  it("refuses bottles against lava", () => {
    expect(
      bottleRule({ item: item(GLASS_BOTTLE), cauldron: lava(MAX_LEVEL) }),
    ).toEqual({ kind: "none" });
    expect(
      bottleRule({ item: waterBottle(), cauldron: lava(MAX_LEVEL) }),
    ).toEqual({ kind: "none" });
  });
});

describe("dye", () => {
  it("dyes water without changing the level, and consumes the dye", () => {
    const r = applied(
      dyeRule({ item: item("minecraft:red_dye"), cauldron: water(4) }),
    );
    expect(r.cauldron).toEqual(water(4));
    expect(r.effects).toEqual([
      { kind: "add_dye", dyeTypeId: "minecraft:red_dye" },
    ]);
    expect(r.output).toBeUndefined();
  });

  it("requires actual water", () => {
    expect(
      dyeRule({ item: item("minecraft:red_dye"), cauldron: empty }),
    ).toEqual({ kind: "none" });
    expect(
      dyeRule({ item: item("minecraft:red_dye"), cauldron: lava(MAX_LEVEL) }),
    ).toEqual({ kind: "none" });
  });

  it("ignores non-dye items", () => {
    expect(dyeRule({ item: item(BUCKET), cauldron: water(4) })).toEqual({
      kind: "none",
    });
  });
});

describe("wash", () => {
  const dyedBoots = item("minecraft:leather_boots", { colorRgb: 0xff0000 });

  it("consumes one level and transforms the stack in place", () => {
    const r = applied(washRule({ item: dyedBoots, cauldron: water(3) }));
    expect(r.cauldron).toEqual({ fluid: "water", level: 2 });
    // `transform` preserves enchantments and durability; `new` would strip them.
    expect(r.output).toEqual({ mode: "transform", clearDye: true });
  });

  it("does not waste a level on an undyed item", () => {
    const plain = item("minecraft:leather_boots");
    expect(washRule({ item: plain, cauldron: water(3) })).toEqual({
      kind: "none",
    });
  });

  it("washes wolf armor", () => {
    const armor = item("minecraft:wolf_armor", { colorRgb: 0x00ff00 });
    expect(
      applied(washRule({ item: armor, cauldron: water(1) })).cauldron,
    ).toEqual({ fluid: "empty", level: 0 });
  });

  it("refuses without enough water", () => {
    expect(washRule({ item: dyedBoots, cauldron: empty })).toEqual({
      kind: "none",
    });
  });

  it("does not claim banners or shulker boxes", () => {
    for (const id of ["minecraft:white_banner", "minecraft:red_shulker_box"]) {
      expect(
        washRule({
          item: item(id, { colorRgb: 1 }),
          cauldron: water(MAX_LEVEL),
        }),
      ).toEqual({ kind: "none" });
    }
  });
});

describe("concrete", () => {
  it("turns powder into the matching concrete and wears the water rather than draining it", () => {
    const r = applied(
      concreteRule({
        item: item("minecraft:lime_concrete_powder"),
        cauldron: water(2),
      }),
    );
    expect(r.cauldron).toEqual(water(2));
    expect(r.output).toEqual({
      mode: "new",
      typeId: "minecraft:lime_concrete",
      amount: 1,
    });
    expect(r.wear).toBe(1);
  });

  it("needs water in the tank", () => {
    expect(
      concreteRule({
        item: item("minecraft:red_concrete_powder"),
        cauldron: empty,
      }),
    ).toEqual({ kind: "none" });
    expect(
      concreteRule({
        item: item("minecraft:red_concrete_powder"),
        cauldron: lava(3),
      }),
    ).toEqual({ kind: "none" });
  });

  it("ignores concrete that is already set, and non-powders", () => {
    expect(
      concreteRule({
        item: item("minecraft:red_concrete"),
        cauldron: water(3),
      }),
    ).toEqual({ kind: "none" });
    expect(
      concreteRule({ item: item("minecraft:sand"), cauldron: water(3) }),
    ).toEqual({ kind: "none" });
  });
});

describe("invariants across every rule", () => {
  const fluids = ["empty", "water", "lava", "powder_snow"] as const;
  const cauldrons: (CauldronState | undefined)[] = [undefined];
  for (const f of fluids) {
    for (let l = 0; l <= MAX_LEVEL; l++) cauldrons.push({ fluid: f, level: l });
  }

  const probes: ItemRef[] = [
    ...ALL_CLAIMED.map((id) => item(id)),
    item("minecraft:white_concrete_powder"),
    item("minecraft:black_concrete_powder"),
    waterBottle(),
    item("minecraft:leather_boots", { colorRgb: 0x123456 }),
    item("minecraft:wolf_armor", { colorRgb: 0x123456 }),
  ];

  it("never produces more than one output item, so nothing can multiply", () => {
    for (const rule of Object.values(RULES)) {
      for (const c of cauldrons) {
        for (const i of probes) {
          const r = rule({ item: i, cauldron: c });
          if (r.kind !== "apply") continue;
          if (r.output?.mode === "new") expect(r.output.amount).toBe(1);
        }
      }
    }
  });

  it("always leaves the cauldron in a legal, normalised state", () => {
    for (const rule of Object.values(RULES)) {
      for (const c of cauldrons) {
        for (const i of probes) {
          const r = rule({ item: i, cauldron: c });
          if (r.kind !== "apply") continue;
          expect(r.cauldron.level).toBeGreaterThanOrEqual(0);
          expect(r.cauldron.level).toBeLessThanOrEqual(MAX_LEVEL);
          // level 0 must mean the empty fluid, never "water at 0"
          if (r.cauldron.level === 0) expect(r.cauldron.fluid).toBe("empty");
          if (r.cauldron.fluid === "empty") expect(r.cauldron.level).toBe(0);
        }
      }
    }
  });

  it("never acts when the faced block is not a cauldron", () => {
    for (const rule of Object.values(RULES)) {
      for (const i of probes) {
        expect(rule({ item: i, cauldron: undefined })).toEqual({
          kind: "none",
        });
      }
    }
  });

  it("has no two rules claiming the same item and cauldron together", () => {
    // Overlapping claims would make dispatch order semantically significant.
    for (const c of cauldrons) {
      for (const i of probes) {
        const claimants = Object.entries(RULES)
          .filter(([, rule]) => rule({ item: i, cauldron: c }).kind === "apply")
          .map(([id]) => id);
        expect(claimants.length).toBeLessThanOrEqual(1);
      }
    }
  });
});
