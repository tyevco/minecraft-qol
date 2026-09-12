/**
 * Generate a T-pose three-view sheet for every entity in the repo that can be
 * posed.
 *
 *   npm run sheets            after `npm run viewer`, into dist/viewer/sheets
 *
 * A sheet is the model in its reference pose - the bind pose with the arms and
 * wings out - drawn front, right and top at one scale shared by every sheet,
 * over a grid in model units. Put side by side they are directly comparable:
 * the tallfolk really is a head taller than the hobbit, and you can see it
 * without loading a world.
 *
 * The set is discovered from the geometry on disk rather than from a list, so
 * a new entity model gets a sheet the run after it is generated. A model with
 * no limb bones (a gravestone, a waypoint, an egg) has nothing to pose and is
 * skipped; the run prints what it skipped and why.
 *
 * .github/workflows/pages.yml runs this on every push to main and publishes
 * dist/viewer, so the sheets are a static asset of the page.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { PALETTE, nav, siteCss } from "../pages/site";
import { Canvas, type Color } from "../textures/canvas";
import { findEntities, title, type Entity, type Skipped, type Variant } from "./catalog";
import { decodePng, type Image } from "./decode";
import { drawText, textWidth } from "./font";
import { OUTFIT_BONES, bounds, poseQuads, tPose, visibleBones, type Quad, type Vec3 } from "./pose";
import { VIEWS, renderPanel, type ViewName } from "./render";

const ROOT = resolve(__dirname, "../..");
const OUT = resolve(ROOT, "dist/viewer/sheets");

// The site's palette (tools/pages/site.ts), so a sheet sits flat on the page.
const INK = {
  page: PALETTE.bg,
  panel: 0x1e1f26,
  line: PALETTE.line,
  text: PALETTE.fg,
  dim: PALETTE.dim,
  accent: PALETTE.accent,
  gridFine: 0x282a33,
  gridCoarse: 0x353845,
  gridOrigin: 0x4b4150,
  outline: 0x101015,
} satisfies Record<string, Color>;

const MARGIN = 18;
const GAP = 14;
/** Blank model units kept around the model inside a panel. */
const PAD_UNITS = 2;
/** A panel is never narrower than this, so a small model is not cramped. */
const MIN_UNITS = 20;
/** No panel wider or taller than this, which is what sets the shared scale. */
const PANEL_LIMIT = 400;

// ---------------------------------------------------------------------------
// Framing. Every sheet is drawn at the same pixels per model unit, so a
// tallfolk sheet comes out physically larger than a hobbit one and the two
// compare directly; each sheet is then cropped to its own model, so a small
// entity is not a speck in a frame sized for the largest.
// ---------------------------------------------------------------------------

interface Framed {
  readonly entity: Entity;
  readonly variant: Variant;
  readonly quads: Quad[];
  readonly texture: Image;
  readonly size: Vec3;
  /** Job-outfit bones this sheet draws; empty when the variant names no job. */
  readonly outfit: string[];
}

interface Extent {
  min: number;
  max: number;
}

function screenExtents(quads: readonly Quad[]): Record<ViewName, { horizontal: Extent; vertical: Extent }> {
  const out = {} as Record<ViewName, { horizontal: Extent; vertical: Extent }>;
  for (const view of VIEWS) {
    const horizontal: Extent = { min: Infinity, max: -Infinity };
    const vertical: Extent = { min: Infinity, max: -Infinity };
    for (const quad of quads)
      for (const corner of quad.corners) {
        const h = corner[0] * view.right[0] + corner[1] * view.right[1] + corner[2] * view.right[2];
        const v = corner[0] * view.up[0] + corner[1] * view.up[1] + corner[2] * view.up[2];
        horizontal.min = Math.min(horizontal.min, h);
        horizontal.max = Math.max(horizontal.max, h);
        vertical.min = Math.min(vertical.min, v);
        vertical.max = Math.max(vertical.max, v);
      }
    out[view.name] = { horizontal, vertical };
  }
  return out;
}

const span = (e: Extent) => Math.max(e.max - e.min + PAD_UNITS * 2, MIN_UNITS);

/** The three panels of one sheet, in pixels, framed on that model's extents. */
function framesFor(quads: readonly Quad[], scale: number): Record<ViewName, Frame> {
  const extents = screenExtents(quads);
  const frames = {} as Record<ViewName, Frame>;
  for (const view of VIEWS) {
    const { horizontal, vertical } = extents[view.name];
    frames[view.name] = {
      width: Math.ceil(span(horizontal) * scale),
      height: Math.ceil(span(vertical) * scale),
      centre: {
        horizontal: (horizontal.min + horizontal.max) / 2,
        vertical: (vertical.min + vertical.max) / 2,
      },
    };
  }
  return frames;
}

// ---------------------------------------------------------------------------
// Drawing a sheet.
// ---------------------------------------------------------------------------

const round = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

interface Frame {
  readonly width: number;
  readonly height: number;
  readonly centre: { horizontal: number; vertical: number };
}

function drawSheet(framed: Framed, scale: number, frames: Record<ViewName, Frame>): Canvas {
  const panelsTop = MARGIN + 24 + 12;
  const labelHeight = 7 + 5;
  const captionHeight = 5 + 7;
  const panelsWidth = VIEWS.reduce((sum, v) => sum + frames[v.name].width, 0) + GAP * (VIEWS.length - 1);
  const panelsHeight = Math.max(...VIEWS.map((v) => frames[v.name].height));

  const heading = framed.variant.name
    ? `${framed.entity.name.toUpperCase()} · ${framed.variant.name.toUpperCase()}`
    : framed.entity.name.toUpperCase();
  const [sx, sy, sz] = framed.size;
  const subtitle =
    `${framed.entity.pack.toUpperCase()} · T-POSE REFERENCE · ` +
    `${round(sx)} × ${round(sy)} × ${round(sz)} UNITS ` +
    `(${round(sx / 16)} × ${round(sy / 16)} × ${round(sz / 16)} BLOCKS)`;
  const hasOutfit = (framed.entity.geometry.bones ?? []).some((b) => OUTFIT_BONES.includes(b.name));
  const outfit = hasOutfit ? `OUTFIT: ${framed.outfit.length ? framed.outfit.join(" + ").toUpperCase() : "NONE"} · ` : "";
  const footer = `GRID 2 UNITS, HEAVY EVERY 16 (ONE BLOCK) · ${scale} PX PER UNIT · ${outfit}GENERATED FROM ${relative(ROOT, framed.entity.geometryPath).replace(/\\/g, "/").toUpperCase()}`;

  // A narrow model must still leave room for its own caption: text off the
  // right edge is silently dropped, not wrapped.
  const textWidest = Math.max(textWidth(heading, 3), textWidth(subtitle), textWidth(footer));
  const width = MARGIN * 2 + Math.max(panelsWidth, textWidest);
  const height = panelsTop + labelHeight + panelsHeight + captionHeight + 10 + 7 + MARGIN;
  const sheet = new Canvas(width, height);
  sheet.fill(0, 0, width, height, INK.page);

  drawText(sheet, MARGIN, MARGIN, heading, INK.text, 3);
  drawText(sheet, MARGIN, MARGIN + 24 + 2, subtitle, INK.dim, 1);

  let x = MARGIN;
  for (const view of VIEWS) {
    const frame = frames[view.name];
    const y = panelsTop + labelHeight;
    drawText(sheet, x, panelsTop, view.label, INK.accent, 1);
    const image = renderPanel(framed.quads, framed.texture, view, {
      scale,
      width: frame.width,
      height: frame.height,
      centre: frame.centre,
      background: INK.panel,
      grid: { fine: INK.gridFine, coarse: INK.gridCoarse, origin: INK.gridOrigin },
      outline: INK.outline,
    });
    sheet.blit(image, x, y);
    sheet.rect(x, y, frame.width, frame.height, INK.line);
    // Captions on one line, whatever each panel's own height is.
    drawText(sheet, x, y + panelsHeight + 5, `${view.axes[0]} / ${view.axes[1]}`, INK.dim, 1);
    x += frame.width + GAP;
  }

  drawText(sheet, MARGIN, height - MARGIN - 7, footer, INK.line, 1);
  return sheet;
}

// ---------------------------------------------------------------------------
// The gallery page.
// ---------------------------------------------------------------------------

interface SheetRecord {
  id: string;
  name: string;
  pack: string;
  variant: string | undefined;
  outfit: string[];
  file: string;
  size: { width: number; height: number; depth: number };
  pixels: { width: number; height: number };
  geometry: string;
  texture: string;
}

function gallery(records: readonly SheetRecord[], skipped: readonly Skipped[], scale: number): string {
  const packs = [...new Set(records.map((r) => r.pack))].sort();
  const sections = packs
    .map((pack) => {
      const cards = records
        .filter((r) => r.pack === pack)
        .map(
          (r) => `      <figure>
        <a href="${r.file}"><img src="${r.file}" width="${r.pixels.width}" height="${r.pixels.height}" alt="${r.name}${r.variant ? ` (${r.variant})` : ""} T-pose sheet" loading="lazy" /></a>
        <figcaption><b>${r.name}</b>${r.variant ? ` <span class="v">${r.variant}</span>` : ""}<br />
          <small>${r.size.width} × ${r.size.height} × ${r.size.depth} units · ${r.geometry}</small></figcaption>
      </figure>`,
        )
        .join("\n");
      return `    <h2>${title(pack)}</h2>\n    <div class="grid">\n${cards}\n    </div>`;
    })
    .join("\n");

  const skippedList = skipped.map((s) => `<li><code>${s.id}</code> — ${s.reason}</li>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>minecraft-qol T-pose sheets</title>
<style>
${siteCss()}
  main { max-width:1180px; margin:0 auto; padding:28px 20px 60px; }
  h1 { font-size:20px; margin:0 0 6px; }
  p.sub { color:var(--dim); margin:0 0 8px; max-width:70ch; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--dim); margin:32px 0 10px; border-bottom:1px solid var(--line); padding-bottom:6px; }
  .grid { display:grid; grid-template-columns:1fr; gap:18px; }
  figure { margin:0; background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  /* Every sheet is drawn at the same px per model unit, so they are shown at
     their own size rather than stretched: a bigger entity is a bigger sheet. */
  figure img { display:block; max-width:100%; height:auto; image-rendering:pixelated; }
  figcaption { padding:8px 12px; border-top:1px solid var(--line); }
  figcaption small { color:var(--dim); }
  .v { color:var(--accent); text-transform:uppercase; font-size:11px; letter-spacing:.06em; }
  a { color:var(--accent); }
  details { margin-top:34px; color:var(--dim); }
  code { font-family:ui-monospace, monospace; }
</style>
</head>
<body>
${nav("sheets", "sheets")}
<main>
  <h1>T-pose sheets</h1>
  <p class="sub">Every entity in the repo that has limbs to pose, drawn front, right and top in its
  reference pose: the bind pose with arms and wings out to the sides. Every sheet is drawn at the
  same scale (${scale} px per model unit) and shown here at its own size, so a bigger entity really
  is a bigger sheet and two of them compare directly. Generated by
  <code>npm run sheets</code> from the geometry and textures in the repo; nothing here is hand-drawn.</p>
${sections}
  <details>
    <summary>${skipped.length} entity models skipped</summary>
    <ul>${skippedList}</ul>
  </details>
</main>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------

const { models, skipped } = findEntities(ROOT);

// Pass one: pose everything, so the shared scale can be read off the set.
const framed: Framed[] = [];
for (const entity of models) {
  for (const variant of entity.variants) {
    const visible = visibleBones(entity.geometry, variant.name);
    const quads = poseQuads(entity.geometry, { pose: tPose, visible });
    if (quads.length === 0) continue;
    const box = bounds(quads);
    framed.push({
      entity,
      variant,
      quads,
      texture: decodePng(readFileSync(variant.path)),
      size: [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]],
      outfit: OUTFIT_BONES.filter((bone) => visible.has(bone)),
    });
  }
}
if (framed.length === 0) throw new Error("no posable entity models found");

// One scale for the whole set, chosen so the largest model still fits a panel.
let widest = 0;
for (const item of framed) {
  const extents = screenExtents(item.quads);
  for (const view of VIEWS)
    widest = Math.max(widest, span(extents[view.name].horizontal), span(extents[view.name].vertical));
}
const scale = Math.max(3, Math.min(8, Math.floor(PANEL_LIMIT / widest)));

mkdirSync(OUT, { recursive: true });
const records: SheetRecord[] = [];
for (const item of framed) {
  const file = `${item.entity.id}${item.variant.name ? `_${item.variant.name}` : ""}.png`;
  const sheet = drawSheet(item, scale, framesFor(item.quads, scale));
  writeFileSync(resolve(OUT, file), sheet.png());
  records.push({
    id: item.entity.id,
    name: item.entity.name,
    pack: item.entity.pack,
    variant: item.variant.name,
    outfit: item.outfit,
    file,
    size: {
      width: Math.round(item.size[0] * 10) / 10,
      height: Math.round(item.size[1] * 10) / 10,
      depth: Math.round(item.size[2] * 10) / 10,
    },
    pixels: { width: sheet.width, height: sheet.height },
    geometry: relative(ROOT, item.entity.geometryPath).replace(/\\/g, "/"),
    texture: relative(ROOT, item.variant.path).replace(/\\/g, "/"),
  });
}

writeFileSync(
  resolve(OUT, "sheets.json"),
  JSON.stringify({ generated: new Date().toISOString(), scale, sheets: records, skipped }, null, 2) + "\n",
);
writeFileSync(resolve(OUT, "index.html"), gallery(records, skipped, scale));

console.log(`dist/viewer/sheets: ${records.length} sheets from ${models.length} models at ${scale} px/unit`);
for (const s of skipped) console.log(`  skipped ${s.id}: ${s.reason}`);
