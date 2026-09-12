import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTE, SECTIONS, fillTemplate, hrefTo, nav, siteCss, toRoot } from "../site";

describe("sections", () => {
  it("have unique ids and dirs, and the root page comes first", () => {
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
    expect(new Set(SECTIONS.map((s) => s.dir)).size).toBe(SECTIONS.length);
    expect(SECTIONS[0]!.dir).toBe("");
  });
});

describe("relative links", () => {
  it("point from the root page into each section", () => {
    expect(toRoot("")).toBe("./");
    expect(hrefTo(SECTIONS[0]!, "")).toBe("./");
    expect(hrefTo(SECTIONS[1]!, "")).toBe("./sheets/");
  });

  it("point from a section back to the root and across to a sibling", () => {
    expect(toRoot("sheets")).toBe("../");
    expect(hrefTo(SECTIONS[0]!, "sheets")).toBe("../");
    expect(hrefTo(SECTIONS[1]!, "sheets")).toBe("../sheets/");
    expect(toRoot("a/b")).toBe("../../");
  });
});

describe("nav", () => {
  it("links every section and marks only the active one", () => {
    const html = nav("sheets", "sheets");
    for (const s of SECTIONS) expect(html).toContain(`href="${hrefTo(s, "sheets")}"`);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/href="\.\.\/sheets\/"[^>]*aria-current="page"/);
  });
});

describe("palette", () => {
  it("is what the CSS custom properties carry", () => {
    const css = siteCss();
    expect(css).toContain("--bg:#1b1c22");
    expect(css).toContain(`--accent:#${PALETTE.accent.toString(16)}`);
  });
});

describe("fillTemplate", () => {
  it("fills the viewer's page and leaves no marker behind", () => {
    const template = readFileSync(resolve(__dirname, "../../viewer/index.html"), "utf8");
    const page = fillTemplate(template, "models", "");
    expect(page).not.toContain("<!-- @site-");
    expect(page).toContain('class="site-nav"');
    expect(page).toContain("--accent:");
  });

  it("refuses a template with no place for the bar", () => {
    expect(() => fillTemplate("<html></html>", "models", "")).toThrow(/@site-css/);
  });
});
