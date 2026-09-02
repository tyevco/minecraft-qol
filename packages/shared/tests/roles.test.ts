import { describe, expect, it } from "vitest";
import { isRole, ROLES } from "../core/roles";

describe("isRole", () => {
  it("accepts the three roles and nothing else", () => {
    for (const r of ROLES) expect(isRole(r)).toBe(true);
    expect(isRole("admin")).toBe(false);
    expect(isRole(2)).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
