import { describe, expect, it } from "vitest";
import {
  HEALTHY_AT,
  PRIORITIES,
  WOUNDED_AT,
  chooseSelector,
  isPriority,
  priorityFromIndex,
  priorityIndex,
  tally,
  targetEvent,
} from "../scripts/core/targeting";

describe("priority", () => {
  it("round-trips through its row index and reads junk as nearest", () => {
    for (const p of PRIORITIES) expect(priorityFromIndex(priorityIndex(p))).toBe(p);
    expect(priorityFromIndex(9)).toBe("nearest");
    expect(priorityFromIndex("weakest")).toBe("nearest");
    expect(isPriority("strongest")).toBe(true);
    expect(isPriority("closest")).toBe(false);
  });

  it("names the selector event by selector and range", () => {
    expect(targetEvent("any", 1)).toBe("bulwark:target_any_g1");
    expect(targetEvent("wounded", 3)).toBe("bulwark:target_wounded_g3");
  });
});

describe("chooseSelector", () => {
  const none = { wounded: 0, healthy: 0 };
  it("is the plain selector for nearest, whatever is nearby", () => {
    expect(chooseSelector("nearest", { wounded: 3, healthy: 3 })).toBe("any");
  });

  it("prefers the wounded or the healthy only while some are in range", () => {
    expect(chooseSelector("weakest", { wounded: 1, healthy: 4 })).toBe("wounded");
    expect(chooseSelector("weakest", none)).toBe("any");
    expect(chooseSelector("strongest", { wounded: 4, healthy: 1 })).toBe("healthy");
    expect(chooseSelector("strongest", none)).toBe("any");
  });

  it("tallies healths against the thresholds the selectors filter on", () => {
    expect(tally([WOUNDED_AT, WOUNDED_AT + 1, HEALTHY_AT - 1, HEALTHY_AT, 20])).toEqual({ wounded: 1, healthy: 2 });
    expect(tally([])).toEqual({ wounded: 0, healthy: 0 });
  });
});
