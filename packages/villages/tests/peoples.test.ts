import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { JOBS, PEOPLES, PEOPLE_NAMES, PEOPLE_PER_PAGE, PAGE_STATE, PEOPLE_STATE, peopleIndex, peopleStates } from "../scripts/core/record";

/**
 * The peoples are written out four times, by hand, in four files:
 *
 *   - `core/record.ts`      PEOPLES and PEOPLE_NAMES, which the script reads;
 *   - `blocks/post.json`    the two block states the index is split across;
 *   - `entities/person.json` the `villages:people` property range;
 *   - `entities/person.json` one `villages:people_<n>` event per people.
 *
 * Nothing makes them agree, and each way of disagreeing fails differently and
 * quietly. A short event list spawns a stonefolk in a drover's town. A short
 * property range is a validation error at entity format 1.26.40, so the
 * person does not exist at all. And a state whose value list runs past
 * **sixteen** makes the whole block fail to load - measured on BDS 1.26.45,
 * which rejected `villages:post` at nineteen values with `too many input
 * elements, expected no more than 16` and left every post in the world as
 * air (docs/README.md corrections). That is the cap the page state exists to
 * work around.
 *
 * Only three peoples have a GameTest of their own (7, 8 and 18: the ends and
 * the seam). This holds the other sixteen, and costs no game.
 */

const ROOT = resolve(__dirname, "../..");
const PACK = resolve(ROOT, "villages/behavior_pack");

interface BlockFile {
  "minecraft:block": { description: { states?: Record<string, (number | string)[]> } };
}
interface EntityFile {
  "minecraft:entity": {
    description: { properties?: Record<string, { type: string; range?: [number, number]; default?: unknown }> };
    events?: Record<string, unknown>;
  };
}

const post = JSON.parse(readFileSync(resolve(PACK, "blocks/post.json"), "utf8")) as BlockFile;
const person = JSON.parse(readFileSync(resolve(PACK, "entities/person.json"), "utf8")) as EntityFile;

const states = post["minecraft:block"].description.states ?? {};
const props = person["minecraft:entity"].description.properties ?? {};
const events = person["minecraft:entity"].events ?? {};

describe("the peoples agree across the script, the block and the entity", () => {
  it("names every people", () => {
    for (const people of PEOPLES) expect(PEOPLE_NAMES[people], people).toBeTruthy();
    expect(Object.keys(PEOPLE_NAMES)).toHaveLength(PEOPLES.length);
  });

  it("gives the person a people property that reaches the last people", () => {
    const range = props["villages:people"]?.range;
    expect(range, "person.json has no villages:people property").toBeDefined();
    expect(range![0]).toBe(0);
    expect(range![1], `the property stops at ${range![1]}, but there are ${PEOPLES.length} peoples`).toBe(PEOPLES.length - 1);
  });

  it("gives the person a job property that reaches the last job", () => {
    const range = props["villages:job"]?.range;
    expect(range, "person.json has no villages:job property").toBeDefined();
    expect(range![1], `the property stops at ${range![1]}, but there are ${JOBS.length} jobs`).toBe(JOBS.length - 1);
  });

  it("carries one people event per people, and no more", () => {
    const missing = PEOPLES.map((_, i) => i).filter((i) => !(`villages:people_${i}` in events));
    expect(missing, `person.json is missing villages:people_${missing.join(", ")}`).toEqual([]);
    const extra = Object.keys(events)
      .filter((e) => /^villages:people_\d+$/.test(e))
      .filter((e) => Number(e.slice("villages:people_".length)) >= PEOPLES.length);
    expect(extra, `person.json has people events past the last people: ${extra.join(", ")}`).toEqual([]);
  });

  it("carries one job event per job, and no more", () => {
    const missing = JOBS.map((_, i) => i).filter((i) => !(`villages:job_${i}` in events));
    expect(missing, `person.json is missing villages:job_${missing.join(", ")}`).toEqual([]);
    const extra = Object.keys(events)
      .filter((e) => /^villages:job_\d+$/.test(e))
      .filter((e) => Number(e.slice("villages:job_".length)) >= JOBS.length);
    expect(extra, `person.json has job events past the last job: ${extra.join(", ")}`).toEqual([]);
  });
});

describe("the post block's states", () => {
  // The measured cap. Past it the block does not load at all and every post
  // in the world is air, with nothing in the log to say why.
  const CAP = 16;

  it("keeps every state's value list inside the engine's cap of sixteen", () => {
    for (const [name, values] of Object.entries(states)) {
      expect(values.length, `${name} lists ${values.length} values; BDS rejects more than ${CAP}`).toBeLessThanOrEqual(CAP);
    }
  });

  it("splits the people index at the same page size the script packs it at", () => {
    expect(states[PEOPLE_STATE], `post.json has no ${PEOPLE_STATE} state`).toBeDefined();
    expect(states[PEOPLE_STATE]).toHaveLength(PEOPLE_PER_PAGE);
    expect(PEOPLE_PER_PAGE).toBeLessThanOrEqual(CAP);
  });

  it("has pages enough to reach the last people", () => {
    const pages = states[PAGE_STATE]?.length ?? 0;
    const needed = Math.ceil(PEOPLES.length / PEOPLE_PER_PAGE);
    expect(pages, `${pages} page(s) of ${PEOPLE_PER_PAGE} cannot reach ${PEOPLES.length} peoples`).toBeGreaterThanOrEqual(needed);
  });

  it("has a job state that lists every job", () => {
    expect(states["villages:job"]).toHaveLength(JOBS.length);
  });

  it("round-trips every people through the two states the block carries", () => {
    for (let i = 0; i < PEOPLES.length; i++) {
      const s = peopleStates(i);
      expect(states[PEOPLE_STATE], `${PEOPLES[i]} needs ${PEOPLE_STATE} ${s[PEOPLE_STATE]}`).toContain(s[PEOPLE_STATE]);
      expect(states[PAGE_STATE], `${PEOPLES[i]} needs ${PAGE_STATE} ${s[PAGE_STATE]}`).toContain(s[PAGE_STATE]);
      expect(peopleIndex(s[PEOPLE_STATE], s[PAGE_STATE]), PEOPLES[i]).toBe(i);
    }
  });
});
