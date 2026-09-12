import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_CRACKS, MAX_STAGE, VARIANTS } from "../scripts/core/rules";

/**
 * The egg and the hatchling are driven by event names the script BUILDS at
 * runtime - `hatchling:variant_${id}`, `hatchling:crack_${n}`,
 * `hatchling:grow_${stage}` - so nothing in TypeScript can tell whether the
 * JSON carries the event it is about to trigger. `triggerEvent` with a name
 * the entity does not define does nothing at all and reports nothing, so a
 * fourth variant or a third crack would compile, pass every unit test, and
 * simply not happen in game.
 *
 * An entity property is worse than silent: at entity format 1.26.40
 * validation is strict, so a value written past its declared range fails the
 * whole definition to load and the entity stops existing.
 *
 * This is the check `packages/bulwark/tests/tiers.test.ts` already does for
 * the turret head: read both JSONs and hold them to the constants the script
 * derives its names from. It needs no game.
 */

const PACK = join(__dirname, "..", "behavior_pack");

interface EntityFile {
  "minecraft:entity": {
    description: { properties?: Record<string, { type: string; range?: [number, number] }> };
    events?: Record<string, unknown>;
  };
}

const read = (name: string): EntityFile["minecraft:entity"] =>
  (JSON.parse(readFileSync(join(PACK, "entities", name), "utf8")) as EntityFile)["minecraft:entity"];

const egg = read("egg.json");
const pet = read("hatchling.json");

/** Every crack count `cracksFor` can hand to a trigger: 1..MAX_CRACKS. */
const CRACKS = Array.from({ length: MAX_CRACKS }, (_, i) => i + 1);
/** Every stage `feed` can hand to a trigger: 1..MAX_STAGE (0 is the hatch's own). */
const STAGES = Array.from({ length: MAX_STAGE }, (_, i) => i + 1);

describe("the egg entity carries what the script triggers", () => {
  it("has a variant event for every variant", () => {
    for (const v of VARIANTS) {
      const name = `hatchling:variant_${v.id}`;
      expect(egg.events?.[name], `egg.json has no ${name} (${v.key})`).toBeDefined();
    }
  });

  it("has a crack event for every crack the rules can reach", () => {
    for (const n of CRACKS) {
      const name = `hatchling:crack_${n}`;
      expect(egg.events?.[name], `egg.json has no ${name}`).toBeDefined();
    }
  });

  it("declares a variant property that reaches the last variant", () => {
    const range = egg.description.properties?.["hatchling:variant"]?.range;
    expect(range, "egg.json has no hatchling:variant property").toBeDefined();
    expect(range![1], `the property stops at ${range![1]}, but there are ${VARIANTS.length} variants`).toBe(VARIANTS.length - 1);
  });

  it("declares a cracks property that reaches the last crack", () => {
    const range = egg.description.properties?.["hatchling:cracks"]?.range;
    expect(range, "egg.json has no hatchling:cracks property").toBeDefined();
    expect(range![1], `the property stops at ${range![1]}, but the rules crack to ${MAX_CRACKS}`).toBe(MAX_CRACKS);
  });
});

describe("the hatchling entity carries what the script triggers", () => {
  it("has a variant event for every variant", () => {
    for (const v of VARIANTS) {
      const name = `hatchling:variant_${v.id}`;
      expect(pet.events?.[name], `hatchling.json has no ${name} (${v.key})`).toBeDefined();
    }
  });

  it("has a grow event for every stage the rules can reach", () => {
    for (const n of STAGES) {
      const name = `hatchling:grow_${n}`;
      expect(pet.events?.[name], `hatchling.json has no ${name}`).toBeDefined();
    }
  });

  it("declares a variant property that reaches the last variant", () => {
    const range = pet.description.properties?.["hatchling:variant"]?.range;
    expect(range, "hatchling.json has no hatchling:variant property").toBeDefined();
    expect(range![1], `the property stops at ${range![1]}, but there are ${VARIANTS.length} variants`).toBe(VARIANTS.length - 1);
  });

  it("declares a stage property that reaches the last stage", () => {
    const range = pet.description.properties?.["hatchling:stage"]?.range;
    expect(range, "hatchling.json has no hatchling:stage property").toBeDefined();
    expect(range![1], `the property stops at ${range![1]}, but the rules grow to ${MAX_STAGE}`).toBe(MAX_STAGE);
  });

  /**
   * `minecraft:pushable` is not in the entity schema: its presence makes the
   * whole definition fail to load, so the entity simply does not exist. It
   * has been removed from these two twice already (docs/README.md
   * corrections), which is what earns it an assertion.
   */
  it("carries no minecraft:pushable, which would stop the entity loading at all", () => {
    for (const [name, file] of [["egg.json", "egg.json"], ["hatchling.json", "hatchling.json"]] as const) {
      const raw = readFileSync(join(PACK, "entities", file), "utf8");
      expect(raw.includes("minecraft:pushable"), `${name} names minecraft:pushable`).toBe(false);
    }
  });
});

describe("the egg items the variants name", () => {
  it("ships an item for every variant's egg", () => {
    for (const v of VARIANTS) {
      const file = join(PACK, "items", `egg_${v.key}.json`);
      const raw = (() => {
        try {
          return readFileSync(file, "utf8");
        } catch {
          return undefined;
        }
      })();
      expect(raw, `no item file for ${v.eggItem} (expected behavior_pack/items/egg_${v.key}.json)`).toBeDefined();
      const id = JSON.parse(raw!)["minecraft:item"].description.identifier as string;
      expect(id, `egg_${v.key}.json declares ${id}, the variant names ${v.eggItem}`).toBe(v.eggItem);
    }
  });
});
