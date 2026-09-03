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
write(`${CONCEPTS}/hatchling_ember.png`, hatchling(T.EMBER));
write(`${CONCEPTS}/hatchling_moss.png`, hatchling(T.MOSS));
write(`${CONCEPTS}/hatchling_frost.png`, hatchling(T.FROST));

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
        light: 0xc9a67f,
        mid: T.HIDE.light,
        dark: T.HIDE.mid,
        deep: T.HIDE.dark,
      },
      565,
    ),
    face: T.muleFace(T.HIDE),
    muzzle: T.muzzle(T.HIDE),
    mane: T.mane(T.HIDE),
    burlap: T.burlap(T.BURLAP, 566),
    strap: T.strap(T.LEATHER),
    dark: T.flatDark(T.HIDE),
  }),
);
