/**
 * Assemble the model viewer into dist/viewer.
 *
 *   npm run viewer           then serve dist/viewer (any static server)
 *
 * Copies the generated geometry and atlases the catalogue (catalog.ts) points at,
 * plus viewer.js, fills index.html with the site's shared navigation bar
 * (tools/pages/site.ts), and writes catalog.json. GitHub Pages publishes the
 * same folder from .github/workflows/pages.yml on every push to main, so the
 * page always shows what the repo generates. The other sections of the site
 * (the T-pose sheets) are written into this folder by their own generators,
 * after this one, since this one clears it.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fillTemplate } from "../pages/site";
import { CATEGORIES, MODELS, type Model } from "./catalog";
import { buildVanilla, type PaletteEntry } from "./vanilla";

const ROOT = resolve(__dirname, "../..");
const OUT = resolve(ROOT, "dist/viewer");


rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const catalog = {
  generated: new Date().toISOString(),
  categories: CATEGORIES,
  models: MODELS.map((m) => {
    const dir = resolve(OUT, "assets", m.id);
    mkdirSync(dir, { recursive: true });
    if (m.kind === "structure") {
      const file = basename(m.structure!);
      copyFileSync(resolve(ROOT, m.structure!), resolve(dir, file));
      return { ...m, structure: `assets/${m.id}/${file}` };
    }
    const geoName = basename(m.geometry!);
    copyFileSync(resolve(ROOT, m.geometry!), resolve(dir, geoName));
    const textures: Record<string, string> = {};
    for (const [name, src] of Object.entries(m.textures ?? {})) {
      const file = basename(src);
      copyFileSync(resolve(ROOT, src), resolve(dir, file));
      textures[name] = `assets/${m.id}/${file}`;
    }
    const particles = (m.particles ?? []).map((pt) => {
      const def = basename(pt.definition);
      const tex = basename(pt.texture);
      copyFileSync(resolve(ROOT, pt.definition), resolve(dir, def));
      copyFileSync(resolve(ROOT, pt.texture), resolve(dir, tex));
      return { ...pt, definition: `assets/${m.id}/${def}`, texture: `assets/${m.id}/${tex}` };
    });
    let animations: Model["animations"];
    if (m.animations) {
      const file = basename(m.animations.file);
      copyFileSync(resolve(ROOT, m.animations.file), resolve(dir, file));
      animations = { file: `assets/${m.id}/${file}` };
      if (m.animations.controller) {
        const ctl = basename(m.animations.controller);
        copyFileSync(resolve(ROOT, m.animations.controller), resolve(dir, ctl));
        animations.controller = `assets/${m.id}/${ctl}`;
      }
    }
    return { ...m, geometry: `assets/${m.id}/${geoName}`, textures, particles, animations };
  }),
};

writeFileSync(resolve(OUT, "catalog.json"), JSON.stringify(catalog, null, 2));
writeFileSync(resolve(OUT, "index.html"), fillTemplate(readFileSync(resolve(__dirname, "index.html"), "utf8"), "models", ""));
copyFileSync(resolve(__dirname, "viewer.js"), resolve(OUT, "viewer.js"));
writeFileSync(resolve(OUT, ".nojekyll"), "");
console.log(`dist/viewer: ${MODELS.length} models`);

// Every palette entry the buildings use, so the vanilla step fetches only
// those textures and checks only those states.
const palette: PaletteEntry[] = [];
for (const m of MODELS)
  if (m.kind === "structure") {
    const preview = JSON.parse(readFileSync(resolve(ROOT, m.structure!), "utf8")) as { palette: PaletteEntry[] };
    palette.push(...preview.palette);
  }
void buildVanilla(palette, ROOT, OUT);
