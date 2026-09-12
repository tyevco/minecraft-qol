import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FACINGS } from "../scripts/core/facing";
import { stateFor } from "../scripts/core/pipes";

/**
 * The pipe joins its neighbours by writing one boolean block state per face,
 * named at runtime by `stateFor` and cast past the typed superset (custom
 * states are not in it - CLAUDE.md, "Adding or changing a pack"). So nothing
 * in TypeScript knows whether `pipe.json` declares the state the engine is
 * about to be asked for.
 *
 * The failure is silent by construction: `withState` throws on an undeclared
 * name and `engine/pipes.ts` catches it bare, so a renamed or missing state
 * leaves every pipe permanently un-joined with nothing in the log. The
 * GameTest that reads these states carries its own hardcoded list of six
 * names, so it would drift the same way rather than catch it.
 *
 * The `minecraft:connection` trait would have done this job, but it still
 * needs the Upcoming Creator Features toggle (docs/README.md corrections),
 * which is why the pack owns the six states by hand.
 */

const BLOCK = join(__dirname, "..", "behavior_pack", "blocks", "pipe.json");

interface BlockFile {
  "minecraft:block": { description: { states?: Record<string, (boolean | number | string)[]> } };
}

const states = (JSON.parse(readFileSync(BLOCK, "utf8")) as BlockFile)["minecraft:block"].description.states ?? {};

describe("the pipe block declares the state the script writes for each face", () => {
  it("has a state for every facing", () => {
    const missing = FACINGS.filter((f) => !(stateFor(f) in states)).map(stateFor);
    expect(missing, `pipe.json is missing ${missing.join(", ")}; those faces would never join`).toEqual([]);
  });

  it("declares each face state as the boolean the script sets", () => {
    for (const face of FACINGS) {
      const values = states[stateFor(face)];
      expect(values, stateFor(face)).toBeDefined();
      expect(values, `${stateFor(face)} lists ${JSON.stringify(values)}, but the script writes true/false`).toEqual([false, true]);
    }
  });

  it("declares no face state the script never writes", () => {
    const known = new Set(FACINGS.map(stateFor));
    const extra = Object.keys(states).filter((s) => s.startsWith("fluidworks:") && !known.has(s));
    expect(extra, `pipe.json declares ${extra.join(", ")}, which nothing sets`).toEqual([]);
  });

  /**
   * The measured cap: BDS rejects a state listing more than sixteen values
   * and the whole block fails to load, leaving every pipe in the world as
   * air with nothing in the log (docs/README.md corrections, found on the
   * villages post).
   */
  it("keeps every state inside the engine's cap of sixteen values", () => {
    for (const [name, values] of Object.entries(states)) {
      expect(values.length, `${name} lists ${values.length} values; BDS rejects more than 16`).toBeLessThanOrEqual(16);
    }
  });
});
