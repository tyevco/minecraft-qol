/**
 * The one description of the GitHub Pages site, shared by every page build.
 *
 * The site started as the model viewer alone; the T-pose sheets were added
 * beside it, and more will follow. Each page is its own generator (the viewer
 * under tools/viewer, the sheets under tools/sheets), and what they share is
 * here: the list of sections, the navigation bar every page carries, and the
 * palette, so a new section is one entry in SECTIONS and a `nav()` call in its
 * generator, and it appears in the bar on every other page.
 *
 * Pure: no file system, no network, so tools/pages/tests can check it.
 */

export const SITE_NAME = "minecraft-qol";
export const REPO_URL = "https://github.com/tyevco/minecraft-qol";

/** The site's colours, one source for CSS and for the sheet rasteriser. */
export const PALETTE = {
  bg: 0x1b1c22,
  panel: 0x23242c,
  line: 0x33353f,
  fg: 0xe6e6ea,
  dim: 0x9a9ca8,
  accent: 0xe27928,
} as const;

export interface Section {
  /** Stable id; the nav marks the active one with it. */
  readonly id: string;
  /** Folder under dist/viewer, "" for the root page. */
  readonly dir: string;
  readonly title: string;
  /** One line for the nav's tooltip and the README. */
  readonly blurb: string;
}

export const SECTIONS: readonly Section[] = [
  { id: "models", dir: "", title: "Models", blurb: "Every model with its atlas: orbit, texture variants, bones, animations, particles; buildings with a cutaway." },
  { id: "sheets", dir: "sheets", title: "T-pose sheets", blurb: "Front, right and top of every posable entity at one shared scale." },
];

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** The relative path from a page in `fromDir` to the site root. */
export function toRoot(fromDir: string): string {
  const depth = fromDir.split("/").filter(Boolean).length;
  return depth === 0 ? "./" : "../".repeat(depth);
}

/** The relative href from a page in `fromDir` to a section. */
export function hrefTo(section: Section, fromDir: string): string {
  return section.dir ? `${toRoot(fromDir)}${section.dir}/` : toRoot(fromDir);
}

/**
 * CSS every page starts with: the palette as custom properties, the base
 * type, and the navigation bar. Pages add their own rules after it.
 */
export function siteCss(): string {
  return [
    `:root { color-scheme: dark; --bg:${hex(PALETTE.bg)}; --panel:${hex(PALETTE.panel)}; --line:${hex(PALETTE.line)}; --fg:${hex(PALETTE.fg)}; --dim:${hex(PALETTE.dim)}; --accent:${hex(PALETTE.accent)}; --nav-h:42px; }`,
    `html, body { margin:0; height:100%; background:var(--bg); color:var(--fg); font:14px/1.4 system-ui, sans-serif; }`,
    `.site-nav { position:sticky; top:0; z-index:10; display:flex; align-items:center; gap:4px; height:var(--nav-h); box-sizing:border-box; padding:0 14px; background:var(--panel); border-bottom:1px solid var(--line); }`,
    `.site-nav .brand { font-weight:600; color:var(--fg); text-decoration:none; margin-right:14px; }`,
    `.site-nav a.section { color:var(--dim); text-decoration:none; padding:5px 10px; border-radius:6px; border:1px solid transparent; }`,
    `.site-nav a.section:hover { color:var(--fg); border-color:var(--line); }`,
    `.site-nav a.section[aria-current="page"] { color:var(--fg); border-color:var(--accent); background:#2b2622; }`,
    `.site-nav .spacer { flex:1; }`,
    `.site-nav a.repo { color:var(--dim); text-decoration:none; font-size:12px; }`,
    `.site-nav a.repo:hover { color:var(--accent); }`,
  ].join("\n");
}

/**
 * The navigation bar for a page in `fromDir` (relative to the site root),
 * with `activeId`'s section marked as the current page.
 */
export function nav(activeId: string, fromDir: string): string {
  const home = SECTIONS[0]!;
  const links = SECTIONS.map((s) => {
    const current = s.id === activeId ? ` aria-current="page"` : "";
    return `<a class="section" href="${hrefTo(s, fromDir)}" title="${s.blurb}"${current}>${s.title}</a>`;
  }).join("");
  return (
    `<nav class="site-nav" aria-label="Site">` +
    `<a class="brand" href="${hrefTo(home, fromDir)}">${SITE_NAME}</a>` +
    links +
    `<span class="spacer"></span>` +
    `<a class="repo" href="${REPO_URL}" rel="noopener">GitHub</a>` +
    `</nav>`
  );
}

/**
 * Fill a page template: `<!-- @site-css -->` becomes the shared CSS and
 * `<!-- @site-nav -->` the bar. A template is a whole page, so it still opens
 * from disk during authoring; the markers are all it lacks.
 */
export function fillTemplate(html: string, activeId: string, fromDir: string): string {
  const css = "<!-- @site-css -->";
  const bar = "<!-- @site-nav -->";
  for (const marker of [css, bar])
    if (!html.includes(marker)) throw new Error(`page template is missing ${marker}`);
  return html.replace(css, siteCss()).replace(bar, nav(activeId, fromDir));
}
