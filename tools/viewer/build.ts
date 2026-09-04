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
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { buildVanilla, type PaletteEntry } from "./vanilla";

const ROOT = resolve(__dirname, "../..");
const OUT = resolve(ROOT, "dist/viewer");

interface Model {
  id: string;
  name: string;
  pack: string;
  kind: "block" | "entity" | "structure";
  /** Geometry and textures for a block or entity model. */
  geometry?: string;
  textures?: Record<string, string>;
  /** A structure preview JSON (tools/structures) for a building. */
  structure?: string;
  /** Bones shown on load; default all. */
  defaultVisible?: string[];
  notes?: string;
  /** Particle effects to preview, each a particle definition plus its sprite. */
  particles?: Particle[];
  /** Animation file and, optionally, the controller that sequences it. */
  animations?: { file: string; controller?: string };
}

interface Particle {
  effect: string;
  definition: string;
  texture: string;
  /** Model-unit point to emit from, or a locator name from the geometry. */
  at?: [number, number, number];
  locator?: string;
  /** For once-emitters that script re-fires: seconds between fires. */
  every?: number;
}

const BUILDINGS: [id: string, name: string, people: string][] = [
  ["stonefolk_hall", "Hill Hall", "stonefolk"],
  ["stonefolk_forge", "Forge", "stonefolk"],
  ["stonefolk_watchpost", "Watch Post", "stonefolk"],
  ["stonefolk_store", "Storehouse", "stonefolk"],
  ["reedfolk_stilt_house", "Stilt House", "reedfolk"],
  ["reedfolk_dock", "Dock", "reedfolk"],
  ["reedfolk_rack", "Drying Rack", "reedfolk"],
  ["reedfolk_tower", "Reed Tower", "reedfolk"],
  ["tinker_workshop", "Workshop", "tinker"],
  ["tinker_still", "Copper Still", "tinker"],
  ["tinker_stall", "Market Stall", "tinker"],
  ["tinker_burrow", "Burrow", "tinker"],
  ["tallfolk_farmhouse", "Farmhouse", "tallfolk"],
  ["tallfolk_barn", "Barn", "tallfolk"],
  ["tallfolk_well", "Well", "tallfolk"],
  ["tallfolk_gatehouse", "Gatehouse", "tallfolk"],
  ["shared_larder", "Larder", "shared"],
  ["shared_inn", "Inn", "shared"],
  ["shared_bridge", "Bridge Span", "shared"],
  ["shared_wall", "Wall Segment", "shared"],
];

const MODELS: Model[] = [
  {
    id: "hearthstone",
    name: "Hearthstone",
    pack: "hearthstone",
    kind: "block",
    geometry: "packages/hearthstone/resource_pack/models/blocks/hearthstone.geo.json",
    textures: { default: "packages/hearthstone/resource_pack/textures/blocks/hearthstone.png" },
    notes: "The flame faces use a second material instance (alpha_test, no face dimming). Script puffs embers every 8 ticks while a player is near.",
    particles: [
      {
        effect: "hearthstone:ember",
        definition: "packages/hearthstone/resource_pack/particles/ember.json",
        texture: "packages/hearthstone/resource_pack/textures/particle/ember.png",
        at: [0, 12.8, 0],
        every: 0.4,
      },
    ],
  },
  {
    id: "funnel",
    name: "Funnel",
    pack: "fluidworks",
    kind: "block",
    geometry: "packages/fluidworks/resource_pack/models/blocks/funnel.geo.json",
    textures: { default: "packages/fluidworks/resource_pack/textures/blocks/funnel.png" },
    notes: "Spout on +z (south, the facing_direction default); mouth on -z. Drips at the spout on every completed operation.",
    particles: [
      {
        effect: "fluidworks:drip",
        definition: "packages/fluidworks/resource_pack/particles/drip.json",
        texture: "packages/fluidworks/resource_pack/textures/particle/drip.png",
        at: [0, 8, 8],
        every: 2,
      },
    ],
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
    notes: "Texture chosen in game by the bulwark:tier entity property. Faces -z. Vents steam from the idle animation.",
    particles: [
      {
        effect: "bulwark:vent",
        definition: "packages/bulwark/resource_pack/particles/vent.json",
        texture: "packages/bulwark/resource_pack/textures/particle/vent.png",
        locator: "vents",
      },
    ],
  },
  {
    id: "gravestone",
    name: "Gravestone",
    pack: "graves",
    kind: "entity",
    geometry: "packages/graves/resource_pack/models/entity/gravestone.geo.json",
    textures: { default: "packages/graves/resource_pack/textures/entity/gravestone.png" },
    notes: "Holds the dead player's items in its minecraft:inventory. Inscription faces -z. A wisp rises from the idle animation.",
    particles: [
      {
        effect: "graves:wisp",
        definition: "packages/graves/resource_pack/particles/wisp.json",
        texture: "packages/graves/resource_pack/textures/particle/wisp.png",
        locator: "wisp",
      },
    ],
  },
  // Concept entities: proposals from docs/design/entities.md, generated into
  // concepts/ and shipped by no pack. Here so they can be judged as models.
  {
    id: "concept_decoy",
    name: "Decoy Dummy (concept)",
    pack: "concept · bulwark",
    kind: "entity",
    geometry: "concepts/entities/models/decoy.geo.json",
    animations: {
      file: "concepts/entities/animations/decoy.animation.json",
      controller: "concepts/entities/animation_controllers/decoy.animation_controllers.json",
    },
    textures: { default: "concepts/entities/textures/decoy.png" },
    notes: "A scarecrow in the player type family so hostiles target it. Head and body are separate bones so a hit can rock them; straw puffs from the chest locator.",
  },
  {
    id: "concept_patrol_golem",
    name: "Patrol Golem (concept)",
    pack: "concept · bulwark",
    kind: "entity",
    geometry: "concepts/entities/models/patrol_golem.geo.json",
    animations: {
      file: "concepts/entities/animations/patrol_golem.animation.json",
      controller: "concepts/entities/animation_controllers/patrol_golem.animation_controllers.json",
    },
    textures: { default: "concepts/entities/textures/patrol_golem.png" },
    notes: "Bulwark's mobile sibling: stone limbs, iron plate and boots, lit eyes. Limbs on their own bones for a walk cycle; the head yaws with look_at_target.",
  },
  {
    id: "concept_runner",
    name: "Runner (concept)",
    pack: "concept · companions",
    kind: "entity",
    geometry: "concepts/entities/models/runner.geo.json",
    animations: {
      file: "concepts/entities/animations/runner.animation.json",
      controller: "concepts/entities/animation_controllers/runner.animation_controllers.json",
    },
    textures: { default: "concepts/entities/textures/runner.png" },
    notes: "A clockwork fetcher in Fluidworks copper. The carried item shows through the glass front at the hand locator; the wings are fan blades on their own bones.",
  },
  {
    id: "hatchling",
    name: "Hatchling",
    pack: "hatchling",
    kind: "entity",
    geometry: "packages/hatchling/resource_pack/models/entity/hatchling.geo.json",
    textures: {
      ember: "packages/hatchling/resource_pack/textures/entity/hatchling_ember.png",
      moss: "packages/hatchling/resource_pack/textures/entity/hatchling_moss.png",
      frost: "packages/hatchling/resource_pack/textures/entity/hatchling_frost.png",
    },
    animations: {
      file: "packages/hatchling/resource_pack/animations/hatchling.animation.json",
      controller: "packages/hatchling/resource_pack/animation_controllers/hatchling.animation_controllers.json",
    },
    notes: "The pet. Texture by the hatchling:variant property; size by the stage component group (0.55, 0.8, 1.1). The flap plays when hatchling:happy is set after a feeding.",
  },
  {
    id: "hatchling_egg",
    name: "Hatchling Egg",
    pack: "hatchling",
    kind: "entity",
    geometry: "packages/hatchling/resource_pack/models/entity/egg.geo.json",
    textures: {
      ember: "packages/hatchling/resource_pack/textures/entity/egg_ember.png",
      moss: "packages/hatchling/resource_pack/textures/entity/egg_moss.png",
      frost: "packages/hatchling/resource_pack/textures/entity/egg_frost.png",
    },
    animations: {
      file: "packages/hatchling/resource_pack/animations/egg.animation.json",
      controller: "packages/hatchling/resource_pack/animation_controllers/egg.animation_controllers.json",
    },
    defaultVisible: ["nest", "egg"],
    notes: "Placed from its item, warmed by hand. crack_1 and crack_2 are shown by the render controller as hatchling:cracks advances; toggle them here. It wobbles once cracked and plays hatch on hatchling:hatching.",
  },
  {
    id: "concept_stonefolk",
    name: "Stonefolk (concept)",
    pack: "concept · peoples",
    kind: "entity",
    geometry: "concepts/entities/models/stonefolk.geo.json",
    textures: {
      guard: "concepts/entities/textures/stonefolk_guard.png",
      worker: "concepts/entities/textures/stonefolk_worker.png",
      trader: "concepts/entities/textures/stonefolk_trader.png",
      builder: "concepts/entities/textures/stonefolk_builder.png",
    },
    animations: {
      file: "concepts/entities/animations/stonefolk.animation.json",
      controller: "concepts/entities/animation_controllers/stonefolk.animation_controllers.json",
    },
    defaultVisible: ["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
    notes: "Short and broad, bearded; hillside halls, ore and stone. Jobs are texture variants; the helmet, hat, pack and tool bones go with a job (guard: helmet; worker: hat; trader: pack; builder: tool and pack). Toggle them here.",
  },
  {
    id: "concept_reedfolk",
    name: "Reedfolk (concept)",
    pack: "concept · peoples",
    kind: "entity",
    geometry: "concepts/entities/models/reedfolk.geo.json",
    textures: {
      guard: "concepts/entities/textures/reedfolk_guard.png",
      worker: "concepts/entities/textures/reedfolk_worker.png",
      trader: "concepts/entities/textures/reedfolk_trader.png",
      builder: "concepts/entities/textures/reedfolk_builder.png",
    },
    animations: {
      file: "concepts/entities/animations/reedfolk.animation.json",
      controller: "concepts/entities/animation_controllers/reedfolk.animation_controllers.json",
    },
    defaultVisible: ["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
    notes: "Tall and thin, marsh and river; fishers and glass-makers. Jobs are texture variants; the helmet, hat, pack and tool bones go with a job (guard: helmet; worker: hat; trader: pack; builder: tool and pack). Toggle them here.",
  },
  {
    id: "concept_tinker",
    name: "Tinker (concept)",
    pack: "concept · peoples",
    kind: "entity",
    geometry: "concepts/entities/models/tinker.geo.json",
    textures: {
      guard: "concepts/entities/textures/tinker_guard.png",
      worker: "concepts/entities/textures/tinker_worker.png",
      trader: "concepts/entities/textures/tinker_trader.png",
      builder: "concepts/entities/textures/tinker_builder.png",
    },
    animations: {
      file: "concepts/entities/animations/tinker.animation.json",
      controller: "concepts/entities/animation_controllers/tinker.animation_controllers.json",
    },
    defaultVisible: ["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
    notes: "Small and quick, goggles up; copper, redstone, Fluidworks. Jobs are texture variants; the helmet, hat, pack and tool bones go with a job (guard: helmet; worker: hat; trader: pack; builder: tool and pack). Toggle them here.",
  },
  {
    id: "concept_tallfolk",
    name: "Tallfolk (concept)",
    pack: "concept · peoples",
    kind: "entity",
    geometry: "concepts/entities/models/tallfolk.geo.json",
    textures: {
      guard: "concepts/entities/textures/tallfolk_guard.png",
      worker: "concepts/entities/textures/tallfolk_worker.png",
      trader: "concepts/entities/textures/tallfolk_trader.png",
      builder: "concepts/entities/textures/tallfolk_builder.png",
    },
    animations: {
      file: "concepts/entities/animations/tallfolk.animation.json",
      controller: "concepts/entities/animation_controllers/tallfolk.animation_controllers.json",
    },
    defaultVisible: ["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
    notes: "A head taller than a player; farmers and shepherds. Jobs are texture variants; the helmet, hat, pack and tool bones go with a job (guard: helmet; worker: hat; trader: pack; builder: tool and pack). Toggle them here.",
  },
  {
    id: "concept_messenger",
    name: "Messenger (concept)",
    pack: "concept · companions",
    kind: "entity",
    geometry: "concepts/entities/models/messenger.geo.json",
    animations: {
      file: "concepts/entities/animations/messenger.animation.json",
      controller: "concepts/entities/animation_controllers/messenger.animation_controllers.json",
    },
    textures: { default: "concepts/entities/textures/messenger.png" },
    notes: "A pigeon with a satchel. Wings fold along the body and can open on their bones; the letter renders at the letter locator on the chest.",
  },
  {
    id: "concept_mule",
    name: "Pack Mule (concept)",
    pack: "concept · companions",
    kind: "entity",
    geometry: "concepts/entities/models/mule.geo.json",
    animations: {
      file: "concepts/entities/animations/mule.animation.json",
      controller: "concepts/entities/animation_controllers/mule.animation_controllers.json",
    },
    textures: { default: "concepts/entities/textures/mule.png" },
    notes: "A donkey with panniers and a harness. Each pannier is its own bone so an empty side can be hidden by bone visibility.",
  },
  // Concept buildings (docs/design/settlements.md), drawn as coloured cubes.
  ...BUILDINGS.map(([id, name, people]): Model => ({
    id: `building_${id}`,
    name: `${name} (concept)`,
    pack: `concept · ${people} buildings`,
    kind: "structure",
    structure: `concepts/structures/${id}.json`,
  })),
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const catalog = {
  generated: new Date().toISOString(),
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
copyFileSync(resolve(__dirname, "index.html"), resolve(OUT, "index.html"));
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
