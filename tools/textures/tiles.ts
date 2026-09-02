/**
 * The 16x16 tiles every atlas is assembled from.
 *
 * Each block's atlas is a grid of these; geometry faces pick a sub-rectangle of
 * one tile (see tools/models/). Keeping every face on a 16x16 tile means a face
 * texture is authored once and reused by every cube of that material, and the
 * atlas layout is a table in generate.ts rather than a hand-packed sheet.
 */
import { Canvas, mix, shade, tile, type Color, type Palette } from "./canvas";

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
  return c.speckle(0, 0, 16, 16, [r.dark, r.light], 0.08, seed);
}

/** Rough stone: plain grain. */
export function roughStone(r: Ramp, seed = 2): Canvas {
  return tile()
    .fill(0, 0, 16, 16, r.mid)
    .speckle(0, 0, 16, 16, [r.dark, r.light, r.deep], 0.28, seed);
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
    .speckle(0, 0, 16, 16, [p.stoneDark, p.stoneLight], 0.1, 11);
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
    .speckle(0, 0, 16, 16, [p.stoneDark, p.stoneLight], 0.12, 41)
    .fill(0, 0, 1, 16, p.stoneLight)
    .fill(15, 0, 1, 16, p.outline);
}

export function hearthDark(): Canvas {
  const p = HEARTH;
  return tile()
    .fill(0, 0, 16, 16, p.outline)
    .speckle(0, 0, 16, 16, [p.stoneDark], 0.15, 51);
}

// ---------------------------------------------------------------------------
// Metal
// ---------------------------------------------------------------------------

/** Riveted plate: border, corner rivets, light grain. */
export function rivetedPlate(r: Ramp, seed = 3): Canvas {
  const c = tile()
    .fill(0, 0, 16, 16, r.mid)
    .speckle(0, 0, 16, 16, [r.light, r.dark], 0.06, seed)
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
  return c.speckle(0, 0, 16, 16, [r.dark], 0.05, seed);
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
    .speckle(0, 0, 16, 16, [r.mid, r.deep], 0.15, seed);
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
  return roughStone(dirt, seed).speckle(
    0,
    0,
    16,
    4,
    [0x5d8a3a, 0x4a7030],
    0.25,
    seed + 1,
  );
}
