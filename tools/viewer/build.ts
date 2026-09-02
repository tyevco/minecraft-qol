/**
 * Assemble the model viewer into dist/viewer.
 *
 *   npm run viewer           then serve dist/viewer (any static server)
 *
 * Copies the generated geometry and atlases the catalogue below points at,
 * plus index.html and viewer.js, and writes catalog.json. GitHub Pages
 * publishes the same folder from .github/workflows/pages.yml on every push
 * to main, so the page always shows what the repo generates.
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const OUT = resolve(ROOT, "dist/viewer");

interface Model {
  id: string;
  name: string;
  pack: string;
  kind: "block" | "entity";
  geometry: string;
  textures: Record<string, string>;
  /** Bones shown on load; default all. */
  defaultVisible?: string[];
  notes?: string;
}

const MODELS: Model[] = [
  {
    id: "hearthstone",
    name: "Hearthstone",
    pack: "hearthstone",
    kind: "block",
    geometry: "packages/hearthstone/resource_pack/models/blocks/hearthstone.geo.json",
    textures: { default: "packages/hearthstone/resource_pack/textures/blocks/hearthstone.png" },
    notes: "The flame faces use a second material instance (alpha_test, no face dimming).",
  },
  {
    id: "funnel",
    name: "Funnel",
    pack: "fluidworks",
    kind: "block",
    geometry: "packages/fluidworks/resource_pack/models/blocks/funnel.geo.json",
    textures: { default: "packages/fluidworks/resource_pack/textures/blocks/funnel.png" },
    notes: "Spout on +z (south, the facing_direction default); mouth on -z.",
  },
  {
    id: "pipe",
    name: "Fluid Pipe",
    pack: "fluidworks",
    kind: "block",
    geometry: "packages/fluidworks/resource_pack/models/blocks/pipe.geo.json",
    textures: { default: "packages/fluidworks/resource_pack/textures/blocks/pipe.png" },
    defaultVisible: ["center", "north", "south"],
    notes: "One bone per arm; in game each is shown by a boolean block state.",
  },
  {
    id: "turret_base",
    name: "Turret Base",
    pack: "bulwark",
    kind: "block",
    geometry: "packages/bulwark/resource_pack/models/blocks/turret_base.geo.json",
    textures: { default: "packages/bulwark/resource_pack/textures/blocks/turret_base.png" },
  },
  {
    id: "turret_head",
    name: "Turret Head",
    pack: "bulwark",
    kind: "entity",
    geometry: "packages/bulwark/resource_pack/models/entity/turret_head.geo.json",
    textures: {
      iron: "packages/bulwark/resource_pack/textures/entity/turret_head_iron.png",
      diamond: "packages/bulwark/resource_pack/textures/entity/turret_head_diamond.png",
      netherite: "packages/bulwark/resource_pack/textures/entity/turret_head_netherite.png",
    },
    notes: "Texture chosen in game by the bulwark:tier entity property. Faces -z.",
  },
  {
    id: "gravestone",
    name: "Gravestone",
    pack: "graves",
    kind: "entity",
    geometry: "packages/graves/resource_pack/models/entity/gravestone.geo.json",
    textures: { default: "packages/graves/resource_pack/textures/entity/gravestone.png" },
    notes: "Holds the dead player's items in its minecraft:inventory. Inscription faces -z.",
  },
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const catalog = {
  generated: new Date().toISOString(),
  models: MODELS.map((m) => {
    const dir = resolve(OUT, "assets", m.id);
    mkdirSync(dir, { recursive: true });
    const geoName = basename(m.geometry);
    copyFileSync(resolve(ROOT, m.geometry), resolve(dir, geoName));
    const textures: Record<string, string> = {};
    for (const [name, src] of Object.entries(m.textures)) {
      const file = basename(src);
      copyFileSync(resolve(ROOT, src), resolve(dir, file));
      textures[name] = `assets/${m.id}/${file}`;
    }
    return { ...m, geometry: `assets/${m.id}/${geoName}`, textures };
  }),
};

writeFileSync(resolve(OUT, "catalog.json"), JSON.stringify(catalog, null, 2));
copyFileSync(resolve(__dirname, "index.html"), resolve(OUT, "index.html"));
copyFileSync(resolve(__dirname, "viewer.js"), resolve(OUT, "viewer.js"));
writeFileSync(resolve(OUT, ".nojekyll"), "");
console.log(`dist/viewer: ${MODELS.length} models`);
