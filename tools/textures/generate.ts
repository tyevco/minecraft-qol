/**
 * Generate every texture in the repo.
 *
 *   npm run textures
 *
 * Output is deterministic: the same source produces byte-identical PNGs, so a
 * texture change in a diff always corresponds to a source change here. Hand
 * editing the PNGs is pointless - the next run overwrites them.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as A from "../atlases";
import { Canvas } from "./canvas";
import * as T from "./tiles";

const ROOT = resolve(__dirname, "../..");

function atlas<Name extends string>(
  layout: A.AtlasLayout<Name>,
  painters: Record<Name, Canvas>,
): Canvas {
  const c = new Canvas(layout.size, layout.size);
  for (const [name, [col, row]] of Object.entries<A.Slot>(layout.tiles)) {
    const painted = painters[name as Name];
    if (!painted) throw new Error(`no painter for tile ${name}`);
    c.blit(painted, col * 16, row * 16);
  }
  return c;
}

function write(relPath: string, canvas: Canvas): void {
  const path = resolve(ROOT, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, canvas.png());
  console.log(`${relPath}  ${canvas.width}x${canvas.height}`);
}

/** The turret head atlas, parameterised by damage tier so tiers are a palette swap. */
function turretHead(tier: T.Ramp): Canvas {
  return atlas(A.TURRET_HEAD, {
    plate: T.rivetedPlate(tier, 101),
    deck: T.seamedPlate(tier, 102),
    barrel: T.pipeAlongU(T.NETHERITE),
    barrelV: T.pipeAlongV(T.NETHERITE),
    muzzle: T.opening(T.NETHERITE, 1, 103),
    sight: T.lens(
      { light: 0xff9a8a, mid: 0xe0392b, dark: 0x9c1f16, deep: 0x5e0f0a },
      T.NETHERITE,
    ),
    drum: T.bands(T.IRON, 104),
    swivel: T.flatDark(T.NETHERITE),
    vents: T.vents(tier, 105),
  });
}

// Hearthstone: the anchor. Dark carved stone, embers in the bowl, a flame.
write(
  "packages/hearthstone/resource_pack/textures/blocks/hearthstone.png",
  atlas(A.HEARTHSTONE, {
    bricks: T.hearthBricks(),
    carved: T.hearthCarved(),
    embers: T.hearthEmbers(),
    flame: T.hearthFlame(),
    plinth: T.hearthBricks(32),
    dark: T.hearthDark(),
    post: T.hearthPost(),
  }),
);

// Lens: the item icon.
write(
  "packages/lens/resource_pack/textures/items/spawn_lens.png",
  T.spawnLensIcon(),
);

// Fluidworks: dark iron body with copper hoops, the vanilla cauldron's cousin.
write(
  "packages/fluidworks/resource_pack/textures/blocks/funnel.png",
  atlas(A.FUNNEL, {
    plate: T.rivetedPlate(T.DARK_STONE, 201),
    copper: T.rivetedPlate(T.COPPER, 202),
    interior: T.interior(T.DARK_STONE),
    spout: T.opening(T.COPPER, 2, 203),
    wheel: T.valveWheel(T.COPPER, T.DARK_STONE),
    lid: T.seamedPlate(T.DARK_STONE, 204),
    dark: T.flatDark(T.DARK_STONE),
    pipeU: T.pipeAlongU(T.COPPER),
    pipeV: T.pipeAlongV(T.COPPER),
  }),
);
write(
  "packages/fluidworks/resource_pack/textures/blocks/pipe.png",
  atlas(A.PIPE, {
    alongU: T.pipeAlongU(T.COPPER),
    alongV: T.pipeAlongV(T.COPPER),
    junction: T.rivetedPlate(T.COPPER, 205),
    flange: T.opening(T.COPPER, 1, 206),
  }),
);

// Bulwark: a stone foot, iron plating, and a head that is a palette swap per tier.
write(
  "packages/bulwark/resource_pack/textures/blocks/turret_base.png",
  atlas(A.TURRET_BASE, {
    foot: T.roughStone(T.DARK_STONE, 301),
    plate: T.rivetedPlate(T.IRON, 302),
    deck: T.seamedPlate(T.IRON, 303),
    socket: T.socket(T.IRON),
    brace: T.bands(T.IRON, 304),
    dark: T.flatDark(T.DARK_STONE),
  }),
);
write(
  "packages/bulwark/resource_pack/textures/entity/turret_head_iron.png",
  turretHead(T.IRON),
);
write(
  "packages/bulwark/resource_pack/textures/entity/turret_head_diamond.png",
  turretHead(T.DIAMOND),
);
write(
  "packages/bulwark/resource_pack/textures/entity/turret_head_netherite.png",
  turretHead(T.NETHERITE),
);

// Graves: a weathered headstone on a mound of turned earth.
write(
  "packages/graves/resource_pack/textures/entity/gravestone.png",
  atlas(A.GRAVESTONE, {
    stone: T.roughStone(T.STONE, 401),
    face: T.gravestoneFace(T.STONE),
    top: T.roughStone(
      {
        light: T.STONE.light,
        mid: T.STONE.light,
        dark: T.STONE.mid,
        deep: T.STONE.dark,
      },
      402,
    ),
    mound: T.mound(),
    dark: T.flatDark(T.DARK_STONE),
  }),
);

// Particle sprites, one per pack that emits something.
write(
  "packages/hearthstone/resource_pack/textures/particle/ember.png",
  T.softDot(T.HEARTH.flameTip, T.HEARTH.ember),
);
write(
  "packages/graves/resource_pack/textures/particle/wisp.png",
  T.softDot(0xf2fbff, 0x7fc8ff),
);
write(
  "packages/bulwark/resource_pack/textures/particle/vent.png",
  T.softDot(0xd8d8d8, 0x6a6a6a),
);
write(
  "packages/fluidworks/resource_pack/textures/particle/drip.png",
  T.softDot(0xbfe6ff, 0x2f7fd6),
);

// Concept entities (docs/design/entities.md): generated into concepts/ so the
// viewer can show them. No pack ships them yet.
const CONCEPTS = "concepts/entities/textures";

write(
  `${CONCEPTS}/decoy.png`,
  atlas(A.DECOY, {
    post: T.plankV(T.OAK),
    bar: T.plankU(T.OAK),
    burlap: T.burlap(T.BURLAP),
    target: T.bullseye(T.BURLAP),
    face: T.sackFace(T.BURLAP, 0x3a2e1e),
    straw: T.straw(T.STRAW),
    dark: T.flatDark(T.OAK),
  }),
);

write(
  `${CONCEPTS}/patrol_golem.png`,
  atlas(A.PATROL_GOLEM, {
    stone: T.roughStone(T.STONE, 611),
    moss: T.mossStone(T.STONE),
    plate: T.rivetedPlate(T.IRON, 612),
    band: T.bands(T.IRON, 613),
    face: T.golemFace(T.STONE, 0xffd25a),
    chest: T.seamedPlate(T.IRON, 614),
    dark: T.flatDark(T.DARK_STONE),
  }),
);

write(
  `${CONCEPTS}/runner.png`,
  atlas(A.RUNNER, {
    plate: T.rivetedPlate(T.COPPER, 621),
    drum: T.bands(T.COPPER, 622),
    deck: T.seamedPlate(T.COPPER, 623),
    glass: T.glassPane(0x9fd8e8, T.COPPER),
    face: T.runnerFace(T.COPPER, T.AMETHYST.mid),
    fin: T.fin(T.IRON),
    bulb: T.bulb(0xfff4c2, T.AMETHYST.mid),
    dark: T.flatDark(T.COPPER),
  }),
);

/** The hatchling atlas, parameterised by variant so variants are a palette swap. */
function hatchling(r: T.Ramp): Canvas {
  return atlas(A.HATCHLING, {
    scales: T.scales(r),
    belly: T.bellyPlates(r),
    face: T.hatchlingFace(r),
    snout: T.snout(r),
    horn: T.horn(T.BONE),
    membrane: T.membrane(r),
    dark: T.flatDark(r),
  });
}
// The hatchling shipped: packages/hatchling. The egg atlas and item icons are
// below, next to the egg painters.
const HATCHLING_RP = "packages/hatchling/resource_pack/textures";
write(`${HATCHLING_RP}/entity/hatchling_ember.png`, hatchling(T.EMBER));
write(`${HATCHLING_RP}/entity/hatchling_moss.png`, hatchling(T.MOSS));
write(`${HATCHLING_RP}/entity/hatchling_frost.png`, hatchling(T.FROST));

write(
  `${CONCEPTS}/messenger.png`,
  atlas(A.MESSENGER, {
    feathers: T.feathers(T.PIGEON),
    breast: T.feathers(
      {
        light: 0xe4e7ec,
        mid: T.PIGEON.light,
        dark: T.PIGEON.mid,
        deep: T.PIGEON.dark,
      },
      544,
    ),
    face: T.birdFace(T.PIGEON),
    beak: T.beak(0xe9a03b),
    tail: T.tailFeathers(T.PIGEON),
    satchel: T.satchel(T.LEATHER),
    strap: T.strap(T.LEATHER),
    dark: T.flatDark(T.PIGEON),
  }),
);

write(
  `${CONCEPTS}/mule.png`,
  atlas(A.MULE, {
    fur: T.hide(T.HIDE),
    belly: T.hide(
      {
        light: 0xe0cdb0,
        mid: 0xc7ad8c,
        dark: T.HIDE.light,
        deep: T.HIDE.mid,
      },
      565,
    ),
    cheek: T.cheek(T.HIDE),
    blaze: T.blaze(T.HIDE),
    muzzle: T.muzzle(T.HIDE),
    mane: T.mane(T.HIDE),
    burlap: T.burlap(T.BURLAP, 566),
    strap: T.strap(T.LEATHER),
    dark: T.flatDark(T.HIDE),
  }),
);

/** The egg atlas, parameterised like the hatchling so the two match. */
function egg(r: T.Ramp): Canvas {
  return atlas(A.EGG, {
    shell: T.eggShell(r),
    crackA: T.crackA(r),
    crackB: T.crackB(r),
    straw: T.straw(T.STRAW, 572),
    dark: T.flatDark(T.OAK),
  });
}
write(`${HATCHLING_RP}/entity/egg_ember.png`, egg(T.EMBER));
write(`${HATCHLING_RP}/entity/egg_moss.png`, egg(T.MOSS));
write(`${HATCHLING_RP}/entity/egg_frost.png`, egg(T.FROST));
write(`${HATCHLING_RP}/items/egg_ember.png`, T.eggIcon(T.EMBER));
write(`${HATCHLING_RP}/items/egg_moss.png`, T.eggIcon(T.MOSS));
write(`${HATCHLING_RP}/items/egg_frost.png`, T.eggIcon(T.FROST));

// Pack icons: 16 pixels of art scaled to 128, into every behavior pack and
// resource pack. The probe's manifest sits at the package root, so its icon
// does too.
const ICON_SCALE = 8;
function packIcon(dir: string, icon: Canvas, resourcePack = true): void {
  write(`${dir}/behavior_pack/pack_icon.png`, icon.scale(ICON_SCALE));
  if (resourcePack) write(`${dir}/resource_pack/pack_icon.png`, icon.scale(ICON_SCALE));
}
packIcon("packages/qol-times", T.iconQolTimes(), false);
packIcon("packages/lens", T.iconLens());
packIcon("packages/hearthstone", T.iconHearthstone());
packIcon("packages/graves", T.iconGraves());
packIcon("packages/guardian", T.iconGuardian(), false);
packIcon("packages/fluidworks", T.iconFluidworks());
packIcon("packages/bulwark", T.iconBulwark());
packIcon("packages/hatchling", T.iconHatchling());
packIcon("packages/gametest", T.iconGametest(), false);
write("packages/probe/pack_icon.png", T.iconProbe().scale(ICON_SCALE));

// Peoples: one atlas per people and job (docs/design/npcs.md). The window
// sizes passed to the face painters are the model's: they must match the
// biped specs in tools/models/generate.ts, and the models' comments say so.
interface People {
  key: string;
  skin: number;
  hair: number;
  eye: number;
  beard: boolean;
  head: [number, number];
  body: [number, number];
  arm: [number, number];
  leg: [number, number];
}
const PEOPLES: People[] = [
  { key: "stonefolk", skin: 0xc98f6f, hair: 0xb5442b, eye: 0x3a2a1a, beard: true, head: [8, 7], body: [10, 10], arm: [4, 10], leg: [4, 8] },
  { key: "reedfolk", skin: 0x9fb08f, hair: 0x2f3a2a, eye: 0x1f4a3a, beard: false, head: [7, 8], body: [8, 14], arm: [3, 14], leg: [4, 14] },
  { key: "tinker", skin: 0xd9a877, hair: 0x6a4a2a, eye: 0x2a2a2e, beard: false, head: [7, 6], body: [6, 8], arm: [3, 8], leg: [3, 7] },
  { key: "tallfolk", skin: 0xa0714f, hair: 0x3a2a1a, eye: 0x2a2a2e, beard: false, head: [8, 8], body: [8, 13], arm: [4, 13], leg: [4, 13] },
];
interface Job {
  key: string;
  cloth: T.Ramp;
  trim: number;
  trousers: number;
  boot: number;
  front: T.Look["front"];
}
const JOBS: Job[] = [
  { key: "guard", cloth: { light: 0xd0d4dc, mid: 0x8f96a3, dark: 0x5c6270, deep: 0x3a3e48 }, trim: 0xb5382b, trousers: 0x3a3e48, boot: 0x2a2a2e, front: "plate" },
  { key: "worker", cloth: { light: 0xa7b06a, mid: 0x7a8348, dark: 0x555c30, deep: 0x363b1e }, trim: 0xd9c27a, trousers: 0x6b5a3e, boot: 0x4a3a28, front: "apron" },
  { key: "trader", cloth: { light: 0x9d7ed0, mid: 0x6a4fa0, dark: 0x47336f, deep: 0x2d2047 }, trim: 0xd9a441, trousers: 0x2d2047, boot: 0x3a2a1a, front: "coat" },
  { key: "builder", cloth: { light: 0x7fb2e0, mid: 0x4a7fb5, dark: 0x30557c, deep: 0x1f3650 }, trim: 0xe8c14a, trousers: 0x4a3a28, boot: 0x2a2a2e, front: "apron" },
];
for (const people of PEOPLES) {
  for (const job of JOBS) {
    const look: T.Look = { skin: people.skin, hair: people.hair, eye: people.eye, cloth: job.cloth, trim: job.trim, trousers: job.trousers, boot: job.boot, front: job.front };
    write(
      `${CONCEPTS}/${people.key}_${job.key}.png`,
      atlas(A.BIPED, {
        skin: T.skinTile(people.skin),
        face: T.faceTile(look, people.head[0], people.head[1], people.beard),
        hair: T.hairTile(people.hair),
        hairTop: T.hairTile(people.hair),
        shirt: T.shirtTile(look, people.body[0], people.body[1]),
        shirtBack: T.clothTile(job.cloth, 611),
        shirtSide: T.clothTile(job.cloth, 612),
        sleeve: T.sleeveTile(look, people.arm[0], people.arm[1]),
        hand: T.skinTile(people.skin),
        trousers: T.trousersTile(look, people.leg[0], people.leg[1]),
        helmet: T.helmetTile(),
        hat: T.straw(T.STRAW, 613),
        pack: T.packTile(),
        tool: T.toolTile(),
        toolWood: T.plankV(T.OAK, 614),
        dark: T.flatDark(T.DARK_STONE),
      }),
    );
  }
}
