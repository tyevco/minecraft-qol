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

const PEOPLES: [id: string, name: string][] = [
  ["stonefolk", "Stonefolk"],
  ["reedfolk", "Reedfolk"],
  ["tinker", "Tinker"],
  ["tallfolk", "Tallfolk"],
  ["hobbit", "Hobbit"],
  ["wood_elf", "Wood Elf"],
  ["high_elf", "High Elf"],
  ["drow", "Drow"],
];
const GREENS: Record<string, string[]> = {
  stonefolk: ["terrace", "grove", "mine"], reedfolk: ["reed_bed"], tinker: ["yard", "mine"], tallfolk: ["meadow", "orchard", "grove"],
  hobbit: ["party_field", "orchard"], wood_elf: ["glade"], high_elf: ["reflecting_pool", "cherry_garden"], drow: ["mushroom_grove", "web_hollow", "mine"],
};
const VILLAGE_PIECES: [id: string, name: string, people: string][] = PEOPLES.flatMap(([p, name]) => [
  ...(GREENS[p] ?? []).map((g): [string, string, string] => [`${p}_${g}`, `${name} ${g[0]!.toUpperCase()}${g.slice(1).replace("_", " ")}`, p]),
  [`${p}_square`, `${name} Square`, p],
  [`${p}_street_straight`, `${name} Street`, p],
  [`${p}_street_long`, `${name} Long Street`, p],
  [`${p}_lane`, `${name} Lane`, p],
  [`${p}_street_corner`, `${name} Corner`, p],
  [`${p}_street_t`, `${name} T-junction`, p],
  [`${p}_street_cross`, `${name} Crossroads`, p],
  [`${p}_lamp`, `${name} Lamp Post`, p],
  [`${p}_empty_lot`, `${name} Empty Lot`, p],
] as [string, string, string][]);

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
  ["tallfolk_field", "Field", "tallfolk"],
  ["tallfolk_barn", "Barn", "tallfolk"],
  ["tallfolk_well", "Well", "tallfolk"],
  ["tallfolk_gatehouse", "Gatehouse", "tallfolk"],
  ["hobbit_hole", "Hobbit Hole", "hobbit"],
  ["hobbit_garden", "Garden", "hobbit"],
  ["hobbit_inn", "Inn", "hobbit"],
  ["hobbit_pantry", "Pantry", "hobbit"],
  ["hobbit_bounder", "Bounder's Shelter", "hobbit"],
  ["wood_elf_platform_house", "Platform House", "wood_elf"],
  ["wood_elf_hearth", "Hearth Tree", "wood_elf"],
  ["wood_elf_lookout", "Lookout", "wood_elf"],
  ["wood_elf_bower", "Bower", "wood_elf"],
  ["wood_elf_larder", "Larder", "wood_elf"],
  ["high_elf_hall", "Hall of Arches", "high_elf"],
  ["high_elf_house", "House", "high_elf"],
  ["high_elf_library", "Library", "high_elf"],
  ["high_elf_garden", "Cherry Garden", "high_elf"],
  ["high_elf_spire", "Spire", "high_elf"],
  ["drow_sanctum", "Sanctum", "drow"],
  ["drow_house", "House", "drow"],
  ["drow_spinnery", "Spinnery", "drow"],
  ["drow_web_tower", "Web Tower", "drow"],
  ["drow_larder", "Larder", "drow"],
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
    notes: "Spout on +z (south, the facing_direction default); mouth on -z, behind the grille. Chevrons on the taper step point at the spout. Drips at the spout on every completed operation; flow drops (not previewed here) travel mouth to spout.",
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
    id: "villages_stonefolk",
    name: "Stonefolk",
    pack: "villages",
    kind: "entity",
    geometry: "packages/villages/resource_pack/models/entity/stonefolk.geo.json",
    textures: {
      guard: "packages/villages/resource_pack/textures/entity/stonefolk_guard.png",
      worker: "packages/villages/resource_pack/textures/entity/stonefolk_worker.png",
      trader: "packages/villages/resource_pack/textures/entity/stonefolk_trader.png",
      builder: "packages/villages/resource_pack/textures/entity/stonefolk_builder.png",
    },
    animations: {
      file: "packages/villages/resource_pack/animations/person.animation.json",
      controller: "packages/villages/resource_pack/animation_controllers/person.animation_controllers.json",
    },
    defaultVisible: ["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
    notes: "Short and broad, bearded; hillside halls, ore and stone. Jobs are texture variants; the helmet, hat, pack and tool bones go with a job (guard: helmet; worker: hat; trader: pack; builder: tool and pack). Toggle them here.",
  },
  {
    id: "villages_reedfolk",
    name: "Reedfolk",
    pack: "villages",
    kind: "entity",
    geometry: "packages/villages/resource_pack/models/entity/reedfolk.geo.json",
    textures: {
      guard: "packages/villages/resource_pack/textures/entity/reedfolk_guard.png",
      worker: "packages/villages/resource_pack/textures/entity/reedfolk_worker.png",
      trader: "packages/villages/resource_pack/textures/entity/reedfolk_trader.png",
      builder: "packages/villages/resource_pack/textures/entity/reedfolk_builder.png",
    },
    animations: {
      file: "packages/villages/resource_pack/animations/person.animation.json",
      controller: "packages/villages/resource_pack/animation_controllers/person.animation_controllers.json",
    },
    defaultVisible: ["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
    notes: "Tall and thin, marsh and river; fishers and glass-makers. Jobs are texture variants; the helmet, hat, pack and tool bones go with a job (guard: helmet; worker: hat; trader: pack; builder: tool and pack). Toggle them here.",
  },
  {
    id: "villages_tinker",
    name: "Tinker",
    pack: "villages",
    kind: "entity",
    geometry: "packages/villages/resource_pack/models/entity/tinker.geo.json",
    textures: {
      guard: "packages/villages/resource_pack/textures/entity/tinker_guard.png",
      worker: "packages/villages/resource_pack/textures/entity/tinker_worker.png",
      trader: "packages/villages/resource_pack/textures/entity/tinker_trader.png",
      builder: "packages/villages/resource_pack/textures/entity/tinker_builder.png",
    },
    animations: {
      file: "packages/villages/resource_pack/animations/person.animation.json",
      controller: "packages/villages/resource_pack/animation_controllers/person.animation_controllers.json",
    },
    defaultVisible: ["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
    notes: "Small and quick, goggles up; copper, redstone, Fluidworks. Jobs are texture variants; the helmet, hat, pack and tool bones go with a job (guard: helmet; worker: hat; trader: pack; builder: tool and pack). Toggle them here.",
  },
  {
    id: "villages_tallfolk",
    name: "Tallfolk",
    pack: "villages",
    kind: "entity",
    geometry: "packages/villages/resource_pack/models/entity/tallfolk.geo.json",
    textures: {
      guard: "packages/villages/resource_pack/textures/entity/tallfolk_guard.png",
      worker: "packages/villages/resource_pack/textures/entity/tallfolk_worker.png",
      trader: "packages/villages/resource_pack/textures/entity/tallfolk_trader.png",
      builder: "packages/villages/resource_pack/textures/entity/tallfolk_builder.png",
    },
    animations: {
      file: "packages/villages/resource_pack/animations/person.animation.json",
      controller: "packages/villages/resource_pack/animation_controllers/person.animation_controllers.json",
    },
    defaultVisible: ["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
    notes: "A head taller than a player; farmers and shepherds. Jobs are texture variants; the helmet, hat, pack and tool bones go with a job (guard: helmet; worker: hat; trader: pack; builder: tool and pack). Toggle them here.",
  },
  {
    id: "villages_hobbit",
    name: "Hobbit",
    pack: "villages",
    kind: "entity",
    geometry: "packages/villages/resource_pack/models/entity/hobbit.geo.json",
    textures: {
      guard: "packages/villages/resource_pack/textures/entity/hobbit_guard.png",
      worker: "packages/villages/resource_pack/textures/entity/hobbit_worker.png",
      trader: "packages/villages/resource_pack/textures/entity/hobbit_trader.png",
      builder: "packages/villages/resource_pack/textures/entity/hobbit_builder.png",
    },
    animations: {
      file: "packages/villages/resource_pack/animations/person.animation.json",
      controller: "packages/villages/resource_pack/animation_controllers/person.animation_controllers.json",
    },
    defaultVisible: ["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
    notes: "Small and barefoot, curly-haired; grass mounds with round doors in flowery hills. No hat. Jobs are texture variants; helmet, hat, pack and tool bones go with a job. Toggle them here.",
  },
  {
    id: "villages_wood_elf",
    name: "Wood Elf",
    pack: "villages",
    kind: "entity",
    geometry: "packages/villages/resource_pack/models/entity/wood_elf.geo.json",
    textures: {
      guard: "packages/villages/resource_pack/textures/entity/wood_elf_guard.png",
      worker: "packages/villages/resource_pack/textures/entity/wood_elf_worker.png",
      trader: "packages/villages/resource_pack/textures/entity/wood_elf_trader.png",
      builder: "packages/villages/resource_pack/textures/entity/wood_elf_builder.png",
    },
    animations: {
      file: "packages/villages/resource_pack/animations/person.animation.json",
      controller: "packages/villages/resource_pack/animation_controllers/person.animation_controllers.json",
    },
    defaultVisible: ["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
    notes: "Tall and lean with pointed ears and a green hood; platforms in the canopy on dark oak trunks. Jobs are texture variants; helmet, hat, pack and tool bones go with a job. Toggle them here.",
  },
  {
    id: "villages_high_elf",
    name: "High Elf",
    pack: "villages",
    kind: "entity",
    geometry: "packages/villages/resource_pack/models/entity/high_elf.geo.json",
    textures: {
      guard: "packages/villages/resource_pack/textures/entity/high_elf_guard.png",
      worker: "packages/villages/resource_pack/textures/entity/high_elf_worker.png",
      trader: "packages/villages/resource_pack/textures/entity/high_elf_trader.png",
      builder: "packages/villages/resource_pack/textures/entity/high_elf_builder.png",
    },
    animations: {
      file: "packages/villages/resource_pack/animations/person.animation.json",
      controller: "packages/villages/resource_pack/animation_controllers/person.animation_controllers.json",
    },
    defaultVisible: ["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
    notes: "Tall with pointed ears and a gold circlet; quartz halls under prismarine roofs in cherry groves and meadows. Jobs are texture variants; helmet, hat, pack and tool bones go with a job. Toggle them here.",
  },
  {
    id: "villages_drow",
    name: "Drow",
    pack: "villages",
    kind: "entity",
    geometry: "packages/villages/resource_pack/models/entity/drow.geo.json",
    textures: {
      guard: "packages/villages/resource_pack/textures/entity/drow_guard.png",
      worker: "packages/villages/resource_pack/textures/entity/drow_worker.png",
      trader: "packages/villages/resource_pack/textures/entity/drow_trader.png",
      builder: "packages/villages/resource_pack/textures/entity/drow_builder.png",
    },
    animations: {
      file: "packages/villages/resource_pack/animations/person.animation.json",
      controller: "packages/villages/resource_pack/animation_controllers/person.animation_controllers.json",
    },
    defaultVisible: ["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
    notes: "Dusky, white-haired, pointed ears and a dark hood; deepslate and blackstone under the dark forest's roof. Jobs are texture variants; helmet, hat, pack and tool bones go with a job. Toggle them here.",
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
  // Concept buildings (docs/design/settlements.md), drawn in vanilla textures.
  ...BUILDINGS.map(([id, name, people]): Model => ({
    id: `building_${id}`,
    name: `${name} (concept)`,
    pack: `concept · ${people} buildings`,
    kind: "structure",
    structure: `concepts/structures/${id}.json`,
  })),
  {
    id: "villages_post",
    name: "Job Post",
    pack: "villages",
    kind: "block",
    geometry: "packages/villages/resource_pack/models/blocks/post.geo.json",
    textures: { default: "packages/villages/resource_pack/textures/blocks/post.png" },
    notes: "The block a person is anchored to: one per building, the job in its state. It ticks, and keeps its person (docs/design/villages.md §4).",
  },
  // Village pieces and whole villages (docs/design/villages.md).
  ...VILLAGE_PIECES.map(([id, name, people]): Model => ({
    id: `piece_${id}`,
    name: `${name} (concept)`,
    pack: `concept · ${people} village pieces`,
    kind: "structure",
    structure: `concepts/structures/${id}.json`,
  })),
  ...PEOPLES.map(([id, name]): Model => ({
    id: `village_${id}`,
    name: `${name} village (seed 1)`,
    pack: "concept · villages",
    kind: "structure",
    structure: `concepts/villages/${id}.json`,
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
