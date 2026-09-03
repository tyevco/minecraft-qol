/**
 * The 16x16 tiles every atlas is assembled from.
 *
 * Each block's atlas is a grid of these; geometry faces pick a sub-rectangle of
 * one tile (see tools/models/). Keeping every face on a 16x16 tile means a face
 * texture is authored once and reused by every cube of that material, and the
 * atlas layout is a table in generate.ts rather than a hand-packed sheet.
 *
 * Surface variation comes from `Canvas.grain`: coherent, low-contrast clusters
 * of near-tones, as vanilla's stone and wood have. Single-pixel `speckle` is
 * reserved for things that really are scattered points - embers in a bed of
 * coals, a lichen spot - because at 16 pixels a face, random contrasting
 * pixels read as artefacts, not texture.
 */
import {
  Canvas,
  mix,
  prng,
  shade,
  tile,
  valueNoise,
  type Color,
  type Palette,
} from "./canvas";

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

/** Four-step metal or stone ramp, light to deep. */
export interface Ramp {
  light: Color;
  mid: Color;
  dark: Color;
  deep: Color;
}

/** The existing Hearthstone palette: dark carved stone with a hearth glow. */
export const HEARTH = {
  outline: 0x2c2b33,
  stone: 0x403e48,
  stoneLight: 0x565460,
  stoneDark: 0x353440,
  emberDark: 0x96421e,
  ember: 0xe27928,
  emberBright: 0xffc45c,
  flameTip: 0xfff1b5,
};

export const STONE: Ramp = {
  light: 0xa3a3a3,
  mid: 0x828282,
  dark: 0x636363,
  deep: 0x4b4b4b,
};
export const DARK_STONE: Ramp = {
  light: 0x6a6a72,
  mid: 0x54545c,
  dark: 0x3f3f47,
  deep: 0x2c2c33,
};
export const IRON: Ramp = {
  light: 0xdedede,
  mid: 0xb8b8b8,
  dark: 0x8c8c8c,
  deep: 0x5c5c5c,
};
export const COPPER: Ramp = {
  light: 0xeaa87a,
  mid: 0xc47d4f,
  dark: 0x91532f,
  deep: 0x5e331c,
};
export const DIAMOND: Ramp = {
  light: 0xb2f7ee,
  mid: 0x5fdccd,
  dark: 0x2fa89b,
  deep: 0x1c6f66,
};
export const NETHERITE: Ramp = {
  light: 0x6f6369,
  mid: 0x4f454b,
  dark: 0x372f34,
  deep: 0x231d21,
};
export const AMETHYST: Ramp = {
  light: 0xe6c7ff,
  mid: 0xb07ee6,
  dark: 0x8552b8,
  deep: 0x5a3585,
};

// ---------------------------------------------------------------------------
// Stone
// ---------------------------------------------------------------------------

/** Vanilla-shaped stone bricks: two courses of 8x4 bricks, offset by half. */
export function stoneBricks(r: Ramp, seed = 1): Canvas {
  const c = tile().fill(0, 0, 16, 16, r.mid);
  for (let course = 0; course < 4; course++) {
    const y = course * 4;
    const offset = course % 2 === 0 ? 0 : 4;
    for (let bx = -8 + offset; bx < 16; bx += 8) {
      c.fill(bx, y, 8, 4, r.mid);
      c.fill(bx, y, 8, 1, r.light); // top highlight
      c.fill(bx, y + 3, 8, 1, r.deep); // mortar below
      c.fill(bx + 7, y, 1, 4, r.deep); // mortar right
      c.fill(bx, y + 1, 1, 2, r.light); // left highlight
    }
  }
  return c.grain(0, 0, 16, 16, r.mid, r.light, r.dark, 0.3, seed, 3);
}

/** Rough stone: soft clusters of lighter and darker tone, a few deep flecks. */
export function roughStone(r: Ramp, seed = 2): Canvas {
  const c = tile()
    .fill(0, 0, 16, 16, r.mid)
    .grain(0, 0, 16, 16, r.mid, r.light, r.dark, 0.55, seed, 4);
  // Two-pixel flecks of the deep tone, seeded, never adjacent to each other.
  const rand = prng(seed + 7);
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(rand() * 15);
    const y = Math.floor(rand() * 15);
    c.fill(x, y, 2, 1, mix(r.dark, r.deep, 0.6));
  }
  return c;
}

/** Flat dark stone with a faint edge, for undersides and hidden faces. */
export function flatDark(r: Ramp): Canvas {
  return tile()
    .fill(0, 0, 16, 16, r.deep)
    .rect(0, 0, 16, 16, shade(r.deep, 0.8));
}

// ---------------------------------------------------------------------------
// Hearthstone
// ---------------------------------------------------------------------------

/**
 * Body side: a carved panel with an ember slit. Faces sample a 12x6 window at
 * (2,5), so the slit is centred in that window, not in the tile.
 */
export function hearthCarved(): Canvas {
  const p = HEARTH;
  const c = tile()
    .fill(0, 0, 16, 16, p.stone)
    .grain(0, 0, 16, 16, p.stone, p.stoneLight, p.stoneDark, 0.5, 11);
  // Window is x 2..13, y 5..10. Border on the window edge, slit in the middle.
  c.rect(2, 5, 12, 6, p.outline);
  c.fill(3, 6, 10, 1, p.stoneLight);
  c.art(
    4,
    7,
    [
      "oEEEEEEo", //
      "oeeeeeeo",
    ],
    { o: p.outline, E: p.emberBright, e: p.ember },
  );
  return c;
}

/** Bed of coals for the top of the bowl. Faces sample the centre 10x10. */
export function hearthEmbers(): Canvas {
  const p = HEARTH;
  const c = tile().fill(0, 0, 16, 16, p.emberDark);
  c.speckle(0, 0, 16, 16, [p.outline, p.stoneDark], 0.35, 21);
  c.art(
    3,
    3,
    [
      "..e..ee...", //
      ".eEe.eEe..",
      "..e.eEBEe.",
      "ee...eEe..",
      "eEe.e.e..e",
      ".e.eEe..eE",
      "...eBEe.e.",
      ".e..eEe...",
      "eEe..e..ee",
      ".e......e.",
    ],
    { ".": "transparent", e: p.ember, E: p.emberBright, B: p.flameTip },
  );
  return c;
}

/** Flame billboard, 8 wide by 7 tall at (4,9). Everything else transparent. */
export function hearthFlame(): Canvas {
  const p = HEARTH;
  return tile().art(
    4,
    9,
    [
      "...e....", //
      "..eEe...",
      "..eEEe..",
      ".eEWWEe.",
      ".eEWWEe.",
      "eEEWWEEe",
      "eeEEEEee",
    ],
    { ".": "transparent", e: p.ember, E: p.emberBright, W: p.flameTip },
  );
}

/** Top of the plinth and rim: dark bricks. */
export function hearthBricks(seed = 31): Canvas {
  const p = HEARTH;
  return stoneBricks(
    { light: p.stoneLight, mid: p.stone, dark: p.stoneDark, deep: p.outline },
    seed,
  );
}

export function hearthPost(): Canvas {
  const p = HEARTH;
  return tile()
    .fill(0, 0, 16, 16, p.stone)
    .grain(0, 0, 16, 16, p.stone, p.stoneLight, p.stoneDark, 0.5, 41)
    .fill(0, 0, 1, 16, p.stoneLight)
    .fill(15, 0, 1, 16, p.outline);
}

export function hearthDark(): Canvas {
  const p = HEARTH;
  return tile()
    .fill(0, 0, 16, 16, p.outline)
    .grain(0, 0, 16, 16, p.outline, p.stoneDark, p.outline, 0.6, 51);
}

// ---------------------------------------------------------------------------
// Metal
// ---------------------------------------------------------------------------

/** Riveted plate: border, corner rivets, light grain. */
export function rivetedPlate(r: Ramp, seed = 3): Canvas {
  const c = tile()
    .fill(0, 0, 16, 16, r.mid)
    .grain(0, 0, 16, 16, r.mid, r.light, r.dark, 0.18, seed, 5)
    .rect(0, 0, 16, 16, r.dark)
    .fill(1, 1, 14, 1, r.light)
    .fill(1, 1, 1, 14, r.light);
  for (const [x, y] of [
    [2, 2],
    [12, 2],
    [2, 12],
    [12, 12],
  ] as const) {
    c.fill(x, y, 2, 2, r.deep).set(x, y, r.light);
  }
  return c;
}

/** Plate top with a centre seam, for lids and decks. */
export function seamedPlate(r: Ramp, seed = 4): Canvas {
  return rivetedPlate(r, seed)
    .fill(7, 1, 1, 14, r.dark)
    .fill(8, 1, 1, 14, r.light);
}

/**
 * Horizontal bands, highlight on top and shadow below, for anything that reads
 * as a hoop or a rolled edge. Faces sample any band-aligned window.
 */
export function bands(r: Ramp, seed = 5): Canvas {
  const c = tile();
  for (let y = 0; y < 16; y += 4) {
    c.fill(0, y, 16, 1, r.light);
    c.fill(0, y + 1, 16, 2, r.mid);
    c.fill(0, y + 3, 16, 1, r.deep);
  }
  void seed;
  return c;
}

/**
 * A pipe seen from the side, running left to right: cylindrical shading top to
 * bottom repeated every four rows, plus a joint seam every eight columns.
 */
export function pipeAlongU(r: Ramp): Canvas {
  const c = tile();
  for (let y = 0; y < 16; y += 4) {
    c.fill(0, y, 16, 1, r.light);
    c.fill(0, y + 1, 16, 1, r.mid);
    c.fill(0, y + 2, 16, 1, r.dark);
    c.fill(0, y + 3, 16, 1, r.deep);
  }
  for (let x = 7; x < 16; x += 8)
    c.fill(x, 0, 1, 16, r.deep).fill(x + 1, 0, 1, 16, r.light);
  return c;
}

/** The same pipe running top to bottom. */
export function pipeAlongV(r: Ramp): Canvas {
  const src = pipeAlongU(r);
  const c = tile();
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const p = src.get(y, x);
      c.set(x, y, (p.r << 16) | (p.g << 8) | p.b);
    }
  }
  return c;
}

/** Deep interior, slightly lighter towards the centre so a mouth reads as a hole. */
export function interior(r: Ramp, seed = 12): Canvas {
  const c = tile()
    .fill(0, 0, 16, 16, r.dark)
    .grain(0, 0, 16, 16, r.dark, r.mid, r.deep, 0.5, seed);
  c.fill(2, 2, 12, 12, r.deep);
  c.fill(4, 4, 8, 8, shade(r.deep, 0.7));
  c.fill(6, 6, 4, 4, shade(r.deep, 0.45));
  return c;
}

/** A square face with a round opening in the middle: spout ends and flanges. */
export function opening(r: Ramp, holeRadius = 2, seed = 6): Canvas {
  const c = rivetedPlate(r, seed);
  const cx = 7.5;
  const cy = 7.5;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= holeRadius) c.set(x, y, shade(r.deep, 0.45));
      else if (d <= holeRadius + 1) c.set(x, y, r.deep);
      else if (d <= holeRadius + 2) c.set(x, y, r.light);
    }
  }
  return c;
}

/** Valve wheel seen from above: a ring with four spokes, on a plate. */
export function valveWheel(r: Ramp, plate: Ramp): Canvas {
  const c = seamedPlate(plate, 7);
  c.art(
    5,
    5,
    [
      ".LLLL.", //
      "LDmmDL",
      "LmDDmL",
      "LmDDmL",
      "LDmmDL",
      ".LLLL.",
    ],
    { ".": "transparent", L: r.light, m: r.mid, D: r.deep },
  );
  return c;
}

/** Vertical vent slits in a plate. */
export function vents(r: Ramp, seed = 8): Canvas {
  const c = rivetedPlate(r, seed);
  for (let x = 4; x <= 10; x += 3)
    c.fill(x, 4, 1, 8, r.deep).fill(x + 1, 4, 1, 8, r.light);
  return c;
}

/** Glass lens: coloured disc with a highlight, in a dark bezel. */
export function lens(glass: Ramp, bezel: Ramp): Canvas {
  const c = rivetedPlate(bezel, 9);
  c.art(
    3,
    3,
    [
      "...bbbb...", //
      ".bbmmmmbb.",
      ".bmlLLmmb.",
      "bmlLWWlmmb",
      "bmlLWWlmmb",
      "bmmlllmmdb",
      "bmmmmmmddb",
      ".bmmmdddb.",
      ".bbddddbb.",
      "...bbbb...",
    ],
    {
      ".": "transparent",
      b: bezel.deep,
      m: glass.mid,
      l: glass.light,
      L: mix(glass.light, 0xffffff, 0.5),
      W: 0xffffff,
      d: glass.dark,
    },
  );
  return c;
}

/** Socket ring on a plate, for the turret mount. */
export function socket(r: Ramp): Canvas {
  const c = seamedPlate(r, 10);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d <= 2.5) c.set(x, y, shade(r.deep, 0.5));
      else if (d <= 3.5) c.set(x, y, r.deep);
      else if (d <= 4.5) c.set(x, y, r.light);
    }
  }
  return c;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** The Spawn Lens icon: an amethyst lens in a gold ring, glinting. */
export function spawnLensIcon(): Canvas {
  const gold: Palette = {
    ".": "transparent",
    r: 0x8a5a1c,
    R: 0xd9a441,
    G: 0xf5d77a,
    g: AMETHYST.deep,
    p: AMETHYST.dark,
    P: AMETHYST.mid,
    L: AMETHYST.light,
    W: 0xffffff,
  };
  return tile().art(
    0,
    0,
    [
      ".....RRRRRR.....", //
      "...RRGGGGGGRR...",
      "..RGgggggggggR..",
      ".RGgppppppppgGR.",
      ".RGgpPLLPPPPpgr.",
      "RGgpPLWWLPPPPpgr",
      "RGgpPLWWLPPPPpgr",
      "RGgpPPLLPPPPPpgr",
      "RGgpPPPPPPPPPpgr",
      "RGgppPPPPPPPppgr",
      ".RGgppPPPPPppgr.",
      ".RGggpppppppggr.",
      "..RGGgggggggGr..",
      "...rrRRRRRRrr...",
      ".....rrrrrr.....",
      "................",
    ],
    gold,
  );
}

// ---------------------------------------------------------------------------
// Gravestone
// ---------------------------------------------------------------------------

/** Weathered headstone face with a cross and two lines of worn inscription. */
export function gravestoneFace(r: Ramp): Canvas {
  const c = roughStone(r, 61);
  c.art(
    3,
    1,
    [
      "....dd....", //
      "....dd....",
      "..dddddd..",
      "....dd....",
      "....dd....",
      "....dd....",
      "..........",
      ".dd.d.ddd.",
      "..........",
      "d.ddd.d.d.",
      "..........",
      "..dd.ddd..",
    ],
    { ".": "transparent", d: r.deep },
  );
  // A little lichen.
  c.set(1, 12, 0x6b7f3a).set(2, 13, 0x7f9444).set(13, 3, 0x6b7f3a);
  return c;
}

/** Freshly turned earth with a few grass blades. */
export function mound(seed = 62): Canvas {
  const dirt: Ramp = {
    light: 0x9b6d4a,
    mid: 0x79553a,
    dark: 0x5c3f2b,
    deep: 0x3f2a1c,
  };
  const c = roughStone(dirt, seed);
  // A few grass blades along the top edge, two pixels tall.
  for (const x of [1, 5, 6, 10, 14]) c.fill(x, 0, 1, 2, x % 2 ? 0x5d8a3a : 0x4a7030);
  return c;
}

// ---------------------------------------------------------------------------
// Particles: 8x8 soft dots. Alpha falls off from the centre so additive and
// blended materials both read as a glow rather than a square.
// ---------------------------------------------------------------------------

export function softDot(inner: Color, outer: Color, size = 8): Canvas {
  const c = new Canvas(size, size);
  const mid = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - mid, y - mid) / (size / 2);
      if (d > 1) continue;
      const t = Math.min(1, d);
      c.set(
        x,
        y,
        mix(inner, outer, t),
        Math.round(255 * (1 - t) * (1 - t * 0.5)),
      );
    }
  }
  return c;
}

// ---------------------------------------------------------------------------
// Concept entities (docs/design/entities.md). Organic materials: wood, cloth,
// straw, hide, feathers and scales. Each painter states the window its model
// samples when the pattern is placed for it.
// ---------------------------------------------------------------------------

export const OAK: Ramp = {
  light: 0xb8935a,
  mid: 0x9a7444,
  dark: 0x6e502c,
  deep: 0x4a341a,
};
export const BURLAP: Ramp = {
  light: 0xd2b98f,
  mid: 0xb0956b,
  dark: 0x836c4a,
  deep: 0x57472f,
};
export const STRAW: Ramp = {
  light: 0xf0dc86,
  mid: 0xcfb256,
  dark: 0xa08434,
  deep: 0x6d5a20,
};
export const BONE: Ramp = {
  light: 0xf3ecd8,
  mid: 0xd9cfb4,
  dark: 0xa89e84,
  deep: 0x6f6753,
};
export const LEATHER: Ramp = {
  light: 0xb5643a,
  mid: 0x8a4a2a,
  dark: 0x5f321c,
  deep: 0x3a1e10,
};
export const PIGEON: Ramp = {
  light: 0xc5cad2,
  mid: 0x8f959e,
  dark: 0x61676f,
  deep: 0x3b3f45,
};
export const HIDE: Ramp = {
  light: 0xb39272,
  mid: 0x8c6d50,
  dark: 0x6a4f38,
  deep: 0x452f1f,
};
/** Hatchling variants: a palette swap, like the turret tiers. */
export const EMBER: Ramp = {
  light: 0xffb26b,
  mid: 0xe0642a,
  dark: 0x9c3a14,
  deep: 0x5c1f0a,
};
export const MOSS: Ramp = {
  light: 0xa8e07a,
  mid: 0x5fa83c,
  dark: 0x3a7326,
  deep: 0x224415,
};
export const FROST: Ramp = {
  light: 0xe6f7ff,
  mid: 0x9ad4f0,
  dark: 0x5a9ec7,
  deep: 0x2f5f86,
};

const EYE_GOLD = 0xf2c14e;
const EYE_DARK = 0x1a1a1f;
const GLINT = 0xffffff;

/** Plank with the grain running top to bottom: posts and legs. */
export function plankV(r: Ramp, seed = 501): Canvas {
  const c = tile().fill(0, 0, 16, 16, r.mid);
  for (let x = 0; x < 16; x += 4) {
    c.fill(x, 0, 1, 16, r.light);
    c.fill(x + 3, 0, 1, 16, r.deep);
  }
  // Grain along the planks: soft streaks of the dark tone.
  return c.grain(0, 0, 16, 16, r.mid, r.mid, r.dark, 0.45, seed, 4);
}

/** The same plank running left to right: crossbars. */
export function plankU(r: Ramp, seed = 502): Canvas {
  const src = plankV(r, seed);
  const c = tile();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const p = src.get(y, x);
      c.set(x, y, (p.r << 16) | (p.g << 8) | p.b);
    }
  return c;
}

/** Coarse woven cloth: a two-pixel weave with a stitched border. */
export function burlap(r: Ramp, seed = 503): Canvas {
  const c = tile();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const over = ((x >> 1) + (y >> 1)) % 2 === 0;
      c.set(x, y, over ? r.mid : r.dark);
      if (over && (x & 1) === 0 && (y & 1) === 0) c.set(x, y, r.light);
    }
  void seed;
  return c;
}

/** Bundled straw: vertical strands with a few crossing wisps. */
export function straw(r: Ramp, seed = 504): Canvas {
  const c = tile();
  const rand = prng(seed);
  for (let x = 0; x < 16; x++) {
    const roll = rand();
    const col = roll < 0.25 ? r.light : roll < 0.7 ? r.mid : r.dark;
    c.fill(x, 0, 1, 16, col);
  }
  // A few crossing wisps, short and in the dark tone rather than the deep.
  for (let i = 0; i < 3; i++) {
    const y = Math.floor(rand() * 16);
    const x = Math.floor(rand() * 12);
    c.fill(x, y, 3 + Math.floor(rand() * 2), 1, r.dark);
  }
  return c;
}

/**
 * The decoy's chest: a painted bullseye on burlap. The body's front samples an
 * 8x10 window at (4,3), so the rings are centred on (7.5,7.5) and stay inside
 * a radius of 3.5.
 */
export function bullseye(cloth: Ramp): Canvas {
  const c = burlap(cloth, 505);
  const red = 0xb5382b;
  const white = 0xece5d3;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d <= 1.2) c.set(x, y, red);
      else if (d <= 2.3) c.set(x, y, white);
      else if (d <= 3.4) c.set(x, y, red);
      else if (d <= 3.9) c.set(x, y, cloth.deep);
    }
  return c;
}

/** A sack head with cross-stitched eyes and a stitched mouth: 6x6 window at (5,5). */
export function sackFace(cloth: Ramp, thread: Color): Canvas {
  return burlap(cloth, 506).art(
    5,
    5,
    [
      "......", //
      "x.x.xx",
      ".x...x",
      "x.x.xx",
      "......",
      ".xxxx.",
    ],
    { ".": "transparent", x: thread },
  );
}

/** Rough stone with a patch of moss creeping in from one corner. */
export function mossStone(r: Ramp, seed = 511): Canvas {
  const c = roughStone(r, seed);
  // Moss where the noise is high and the corner is near: one ragged patch.
  const n = valueNoise(seed + 1, 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 15, y - 15) / 16;
      const v = n(x, y) * 0.6 + (1 - d);
      if (v > 1.05) c.set(x, y, v > 1.3 ? 0x5d8a3a : 0x4a7030);
    }
  return c;
}

/** The golem's face: two lit slits and a crack of a mouth. 6x6 window at (5,5). */
export function golemFace(r: Ramp, glow: Color): Canvas {
  return roughStone(r, 512).art(
    5,
    5,
    [
      "......", //
      "gg..gg",
      "......",
      "......",
      "..d...",
      ".d.dd.",
    ],
    { ".": "transparent", g: glow, d: r.deep },
  );
}

/** A window pane: tinted, one diagonal highlight, bezel at the edge. */
export function glassPane(tint: Color, bezel: Ramp): Canvas {
  const c = tile().fill(0, 0, 16, 16, tint);
  // Two diagonal highlights, one bright and one faint, as on vanilla glass.
  for (let i = 0; i < 16; i++) {
    c.set(i, 15 - i, mix(tint, GLINT, 0.45));
    if (i < 15) c.set(i + 1, 15 - i, mix(tint, GLINT, 0.25));
    if (i >= 4) c.set(i, 19 - i, mix(tint, GLINT, 0.15));
  }
  return c.rect(0, 0, 16, 16, bezel.deep);
}

/** Two round lens goggles on a plate: the runner's face. 8x5 window at (4,5). */
export function runnerFace(r: Ramp, iris: Color): Canvas {
  return rivetedPlate(r, 521).art(
    4,
    5,
    [
      "bbbbbbbb", //
      "bWibbWib",
      "biibbiib",
      "bbbbbbbb",
      "........",
    ],
    {
      ".": "transparent",
      b: r.deep,
      i: iris,
      W: mix(iris, GLINT, 0.7),
    },
  );
}

/** A fan blade: ribs along u with a darker trailing edge at the bottom. */
export function fin(r: Ramp): Canvas {
  const c = tile();
  for (let y = 0; y < 16; y++)
    c.fill(0, y, 16, 1, y % 3 === 0 ? r.light : y % 3 === 1 ? r.mid : r.dark);
  return c.fill(0, 14, 16, 2, r.deep).fill(0, 0, 16, 1, r.light);
}

/** A glowing bulb: a bright 2x2 core in a coloured rim. 4x4 window at (6,6). */
export function bulb(core: Color, rim: Color): Canvas {
  const c = tile().fill(0, 0, 16, 16, rim);
  return c.rect(6, 6, 4, 4, mix(rim, core, 0.35)).fill(7, 7, 2, 2, core);
}

/**
 * Scaled hide: soft grain with a faint scallop edge every four rows, the
 * scales four wide and offset row to row. Low contrast on purpose: a face is
 * five or six pixels tall, so anything busier reads as clutter.
 */
export function scales(r: Ramp, seed = 531): Canvas {
  const c = tile()
    .fill(0, 0, 16, 16, r.mid)
    .grain(0, 0, 16, 16, r.mid, r.light, r.dark, 0.3, seed, 4);
  const edge = mix(r.mid, r.dark, 0.55);
  for (let row = 0; row < 4; row++) {
    const y = row * 4 + 3;
    const off = row % 2 === 0 ? 0 : 2;
    for (let x = -4 + off; x < 16; x += 4) c.fill(x + 1, y, 3, 1, edge);
  }
  return c;
}

/** Belly plates: a paler skin with one soft seam every four rows. */
export function bellyPlates(r: Ramp): Canvas {
  const skin = mix(r.light, GLINT, 0.25);
  const c = tile().fill(0, 0, 16, 16, skin);
  for (let y = 3; y < 16; y += 4) c.fill(0, y, 16, 1, mix(skin, r.light, 0.6));
  return c;
}

/** The hatchling's face: two big gold eyes with a glint. 6x5 window at (5,5). */
export function hatchlingFace(r: Ramp): Canvas {
  return scales(r, 533).art(
    5,
    5,
    [
      "......", //
      "Wg..Wg",
      "gd..gd",
      "......",
      "......",
    ],
    { ".": "transparent", g: EYE_GOLD, d: EYE_DARK, W: GLINT },
  );
}

/** A snout end with two nostrils: 4x2 window at (6,7). */
export function snout(r: Ramp): Canvas {
  return scales(r, 534).art(6, 7, ["d..d", "...."], {
    ".": "transparent",
    d: r.deep,
  });
}

/** Bone-coloured horn: the ramp's light end with a growth ring every 4 rows. */
export function horn(r: Ramp): Canvas {
  const c = tile().fill(0, 0, 16, 16, r.mid);
  for (let y = 0; y < 16; y += 4) c.fill(0, y, 16, 1, r.light).fill(0, y + 3, 16, 1, r.dark);
  return c;
}

/** Wing membrane: a lighter skin with dark vein lines fanning across it. */
export function membrane(r: Ramp): Canvas {
  const skin = mix(r.mid, r.light, 0.35);
  const c = tile().fill(0, 0, 16, 16, skin);
  for (let i = 0; i < 16; i++) {
    c.set(i, Math.floor(i / 2), r.dark);
    c.set(i, 7 + Math.floor(i / 4), r.dark);
    c.set(i, 13 + Math.floor(i / 8), r.dark);
  }
  return c;
}

/** Feathers: soft grain with a faint scallop edge every four rows. */
export function feathers(r: Ramp, seed = 541): Canvas {
  const c = tile()
    .fill(0, 0, 16, 16, r.mid)
    .grain(0, 0, 16, 16, r.mid, r.light, r.dark, 0.35, seed, 4);
  const edge = mix(r.mid, r.dark, 0.6);
  for (let row = 0; row < 4; row++) {
    const y = row * 4 + 3;
    const off = row % 2 === 0 ? 0 : 3;
    for (let x = -6 + off; x < 16; x += 6) c.fill(x + 1, y, 4, 1, edge);
  }
  return c;
}

/** Tail feathers: the same, with a dark bar across the tip. */
export function tailFeathers(r: Ramp): Canvas {
  return feathers(r, 542).fill(0, 12, 16, 2, r.deep).fill(0, 14, 16, 2, r.light);
}

/** The pigeon's face: two bead eyes on plain down, a pale cheek. 4x4 window at (6,6). */
export function birdFace(r: Ramp): Canvas {
  return tile()
    .fill(0, 0, 16, 16, r.mid)
    .grain(0, 0, 16, 16, r.mid, r.light, r.dark, 0.3, 543, 5)
    .art(
    6,
    6,
    [
      "....", //
      "d..d",
      "....",
      "llll",
    ],
    { ".": "transparent", d: EYE_DARK, l: r.light },
  );
}

/** Solid beak or leg colour, shaded top to bottom. */
export function beak(base: Color): Canvas {
  return tile()
    .fill(0, 0, 16, 8, base)
    .fill(0, 8, 16, 8, shade(base, 0.75))
    .fill(0, 0, 16, 1, mix(base, GLINT, 0.3));
}

/** A leather bag face: stitched border and a buckle. 4x3 window at (6,6). */
export function satchel(r: Ramp): Canvas {
  const c = tile()
    .fill(0, 0, 16, 16, r.mid)
    .grain(0, 0, 16, 16, r.mid, r.light, r.dark, 0.4, 551)
    .rect(0, 0, 16, 16, r.deep);
  return c.art(
    6,
    6,
    [
      "dddd", //
      ".BB.",
      "dddd",
    ],
    { ".": "transparent", d: r.deep, B: 0xd9a441 },
  );
}

/** A leather strap: the bag's tone with a lighter centre stripe. */
export function strap(r: Ramp): Canvas {
  return tile().fill(0, 0, 16, 16, r.dark).fill(0, 7, 16, 2, r.mid);
}

/** Short hide: soft dappling in the coat's own tones. */
export function hide(r: Ramp, seed = 561): Canvas {
  return tile()
    .fill(0, 0, 16, 16, r.mid)
    .grain(0, 0, 16, 16, r.mid, r.light, r.dark, 0.4, seed, 4);
}

/** The mule's cheek: one eye with a glint. Head sides sample a 6x5 window at (5,5). */
export function cheek(r: Ramp): Canvas {
  return hide(r, 562).art(
    6,
    5,
    [
      "......", //
      ".Wd...",
      ".dd...",
      "......",
      "......",
    ],
    { ".": "transparent", d: EYE_DARK, W: GLINT },
  );
}

/** The mule's forehead: a pale blaze down the middle. 5x5 window at (5,5). */
export function blaze(r: Ramp): Canvas {
  return hide(r, 566).fill(7, 4, 2, 8, mix(r.light, GLINT, 0.45));
}

/** A soft muzzle: lighter hide with two nostrils. 4x3 window at (6,6). */
export function muzzle(r: Ramp): Canvas {
  const soft: Ramp = {
    light: mix(r.light, GLINT, 0.4),
    mid: mix(r.light, GLINT, 0.2),
    dark: r.light,
    deep: r.dark,
  };
  return hide(soft, 563).art(6, 6, ["....", "d..d", "...."], {
    ".": "transparent",
    d: r.deep,
  });
}

/** Coarse hair: the ramp's dark end in vertical strands. */
export function mane(r: Ramp): Canvas {
  return straw(
    { light: r.dark, mid: r.deep, dark: shade(r.deep, 0.7), deep: shade(r.deep, 0.5) },
    564,
  );
}

// ---------------------------------------------------------------------------
// Hatchling egg. The shell is a pale version of the variant's coat with soft
// grain and nothing else: at seven pixels a face, a spot reads as a bar.
// Cracks are transparent overlays. The tile is four 8x8 quadrants, one per
// side of the egg; in each, rows 0-2 are the upper band's window and rows 3-6
// the middle band's, so a crack drawn down a quadrant runs continuously
// across the two cubes of that side. The first stage cracks two sides; the
// second cracks all four and chips the first.
// ---------------------------------------------------------------------------

/** Eggshell: pale coat colour with soft grain. */
export function eggShell(r: Ramp, seed = 571): Canvas {
  const pale = mix(r.light, GLINT, 0.55);
  return tile()
    .fill(0, 0, 16, 16, pale)
    .grain(0, 0, 16, 16, pale, GLINT, r.light, 0.35, seed, 5);
}

const CRACK_ROWS_A = [
  // north quadrant (0,0)      east quadrant (8,0)
  "...d....", "........",
  "...d....", "........",
  "..d.....", "........",
  "..d.....", "........",
  "...d....", "........",
  "...d....", "........",
  "....d...", "........",
  "........", "........",
  // south quadrant (0,8)      west quadrant (8,8)
  "........", ".....d..",
  "........", ".....d..",
  "........", "....d...",
  "........", "....d...",
  "........", "...d....",
  "........", "...d....",
  "........", "...d....",
  "........", "........",
];

const CRACK_ROWS_B = [
  "...d....", "....d...",
  "..dd....", "....d...",
  "..d.d...", "...d....",
  ".dd.....", "...d....",
  "...d....", "..d.....",
  "...dd...", "..d.d...",
  "....d...", "..d.....",
  "........", "........",
  "..d.....", ".....d..",
  "..d.....", ".....dd.",
  "...d....", "....d...",
  "...d....", "....d...",
  "..d.....", "...d....",
  "..d.....", "...d....",
  "...d....", "..dd....",
  "........", "........",
];

function crackTile(rows: readonly string[], ink: Color): Canvas {
  const merged: string[] = [];
  for (let i = 0; i < rows.length; i += 2) merged.push(rows[i]! + rows[i + 1]!);
  return tile().art(0, 0, merged, { ".": "transparent", d: ink });
}

/** First crack stage: a hairline down two sides. */
export function crackA(r: Ramp): Canvas {
  return crackTile(CRACK_ROWS_A, r.deep);
}

/** Second crack stage: every side, with branches. */
export function crackB(r: Ramp): Canvas {
  return crackTile(CRACK_ROWS_B, r.deep);
}
