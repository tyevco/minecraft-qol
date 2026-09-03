/**
 * Pixel-art helpers for the texture generator.
 *
 * Two ways to paint: ASCII art (a list of equal-length strings plus a palette,
 * for anything with deliberate shape) and seeded speckle (for stone and metal
 * grain). The PRNG is seeded per call so every run produces identical bytes and
 * a texture diff in review means a real change.
 */
import { encodePng } from "./png";

/** Packed 0xRRGGBB, or 0xRRGGBBAA when `alpha` is given. */
export type Color = number;

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function rgba(color: Color, alpha = 255): RGBA {
  return {
    r: (color >>> 16) & 0xff,
    g: (color >>> 8) & 0xff,
    b: color & 0xff,
    a: alpha,
  };
}

/** Lighten (factor > 1) or darken (factor < 1) a packed colour. */
export function shade(color: Color, factor: number): Color {
  const c = rgba(color);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    (clamp(c.r * factor) << 16) |
    (clamp(c.g * factor) << 8) |
    clamp(c.b * factor)
  );
}

/** Linear blend of two packed colours; t=0 gives a, t=1 gives b. */
export function mix(a: Color, b: Color, t: number): Color {
  const ca = rgba(a);
  const cb = rgba(b);
  const l = (x: number, y: number) => Math.round(x + (y - x) * t);
  return (l(ca.r, cb.r) << 16) | (l(ca.g, cb.g) << 8) | l(ca.b, cb.b);
}

/** mulberry32: small, fast, deterministic. Quality is irrelevant for speckle. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Palette = Record<string, Color | "transparent">;

export class Canvas {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  set(x: number, y: number, color: Color, alpha = 255): this {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return this;
    const i = (y * this.width + x) * 4;
    const c = rgba(color, alpha);
    this.data[i] = c.r;
    this.data[i + 1] = c.g;
    this.data[i + 2] = c.b;
    this.data[i + 3] = c.a;
    return this;
  }

  get(x: number, y: number): RGBA {
    const i = (y * this.width + x) * 4;
    return {
      r: this.data[i]!,
      g: this.data[i + 1]!,
      b: this.data[i + 2]!,
      a: this.data[i + 3]!,
    };
  }

  fill(
    x: number,
    y: number,
    w: number,
    h: number,
    color: Color,
    alpha = 255,
  ): this {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) this.set(i, j, color, alpha);
    return this;
  }

  /** Outline only. */
  rect(x: number, y: number, w: number, h: number, color: Color): this {
    this.fill(x, y, w, 1, color);
    this.fill(x, y + h - 1, w, 1, color);
    this.fill(x, y, 1, h, color);
    this.fill(x + w - 1, y, 1, h, color);
    return this;
  }

  /**
   * Paint from ASCII art. Each string is one row; each character indexes the
   * palette. Space is always transparent. Rows must be equal length.
   */
  art(x: number, y: number, rows: readonly string[], palette: Palette): this {
    const width = rows[0]?.length ?? 0;
    rows.forEach((row, j) => {
      if (row.length !== width)
        throw new Error(
          `art row ${j} has length ${row.length}, expected ${width}`,
        );
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]!;
        if (ch === " ") continue;
        const color = palette[ch];
        if (color === undefined)
          throw new Error(`no palette entry for '${ch}'`);
        if (color === "transparent") continue;
        this.set(x + i, y + j, color);
      }
    });
    return this;
  }

  /**
   * Sprinkle single pixels from `colors` over a rectangle. `density` is the
   * fraction of pixels touched. Seeded so the result is stable across runs.
   */
  speckle(
    x: number,
    y: number,
    w: number,
    h: number,
    colors: readonly Color[],
    density: number,
    seed: number,
  ): this {
    const rand = prng(seed);
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (rand() < density)
          this.set(i, j, colors[Math.floor(rand() * colors.length)]!);
      }
    }
    return this;
  }

  /**
   * Coherent grain: value noise on a coarse lattice, bilinearly smoothed, then
   * cut into three tones. Pixels darken or lighten in soft clusters a few
   * pixels wide, the way vanilla stone and wood do, instead of the salt-and-
   * pepper that single-pixel speckle produces. `amount` is how far the tones
   * sit from the base (0..1); `cell` is the lattice spacing in pixels.
   */
  grain(
    x: number,
    y: number,
    w: number,
    h: number,
    base: Color,
    light: Color,
    dark: Color,
    amount: number,
    seed: number,
    cell = 4,
  ): this {
    const n = valueNoise(seed, cell);
    const lo = mix(base, dark, amount);
    const hi = mix(base, light, amount);
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        const v = n(i, j);
        this.set(i, j, v < 0.36 ? lo : v > 0.66 ? hi : base);
      }
    }
    return this;
  }

  /** Copy another canvas in at (x, y), honouring its alpha. */
  blit(src: Canvas, x: number, y: number): this {
    for (let j = 0; j < src.height; j++) {
      for (let i = 0; i < src.width; i++) {
        const c = src.get(i, j);
        if (c.a === 0) continue;
        this.set(x + i, y + j, (c.r << 16) | (c.g << 8) | c.b, c.a);
      }
    }
    return this;
  }

  /** Every pixel that is not transparent, remapped through `fn`. */
  map(fn: (c: Color, x: number, y: number) => Color): this {
    for (let j = 0; j < this.height; j++) {
      for (let i = 0; i < this.width; i++) {
        const c = this.get(i, j);
        if (c.a === 0) continue;
        this.set(i, j, fn((c.r << 16) | (c.g << 8) | c.b, i, j), c.a);
      }
    }
    return this;
  }

  png(): Buffer {
    return encodePng(this.width, this.height, this.data);
  }
}

/**
 * Seeded value noise over a 16x16 tile: random values on a lattice `cell`
 * pixels apart, wrapped so the tile repeats, blended with a smoothstep. Returns
 * a sampler in 0..1.
 */
export function valueNoise(seed: number, cell: number): (x: number, y: number) => number {
  const rand = prng(seed);
  const n = Math.max(1, Math.round(16 / cell));
  const lattice: number[] = [];
  for (let i = 0; i < n * n; i++) lattice.push(rand());
  const at = (i: number, j: number) => lattice[((j % n) + n) % n * n + (((i % n) + n) % n)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const u = x / cell;
    const v = y / cell;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = smooth(u - i);
    const fv = smooth(v - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fu;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fu;
    return a + (b - a) * fv;
  };
}

/** A 16x16 tile, the unit every atlas here is built from. */
export function tile(): Canvas {
  return new Canvas(16, 16);
}
