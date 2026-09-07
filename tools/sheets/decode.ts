/**
 * Minimal PNG decoder, the counterpart to tools/textures/png.ts.
 *
 * The sheet renderer samples the repo's entity textures, so it has to read the
 * PNGs the texture generator wrote. Node has zlib, so this needs no dependency
 * - the same reason the encoder is hand-rolled. Every texture in the repo is
 * 8-bit RGBA, but greyscale, RGB and palette are cheap to cover and mean a
 * hand-made PNG dropped in later does not fail silently.
 */
import { inflateSync } from "node:zlib";

export interface Image {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA, 4 bytes per pixel. */
  readonly rgba: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Bytes per pixel of a decoded scanline, which is what the filters step by. */
function channels(colorType: number): number {
  switch (colorType) {
    case 0: return 1; // greyscale
    case 2: return 3; // truecolour
    case 3: return 1; // palette index
    case 4: return 2; // greyscale + alpha
    case 6: return 4; // truecolour + alpha
    default: throw new Error(`unsupported PNG colour type ${colorType}`);
  }
}

/** Undo the per-scanline filter in place; `raw` is the inflated IDAT stream. */
function unfilter(raw: Buffer, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]!;
    const line = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : undefined;
    for (let i = 0; i < stride; i++) {
      const x = raw[pos + i]!;
      const a = i >= bpp ? line[i - bpp]! : 0;
      const b = prev ? prev[i]! : 0;
      const c = prev && i >= bpp ? prev[i - bpp]! : 0;
      let value: number;
      switch (filter) {
        case 0: value = x; break;
        case 1: value = x + a; break;
        case 2: value = x + b; break;
        case 3: value = x + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
      line[i] = value & 0xff;
    }
    pos += stride;
  }
  return out;
}

/** Decode an 8-bit PNG to RGBA. Interlaced and 16-bit files are rejected. */
export function decodePng(file: Buffer): Image {
  for (let i = 0; i < SIGNATURE.length; i++)
    if (file[i] !== SIGNATURE[i]) throw new Error("not a PNG");

  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const idat: Buffer[] = [];

  let pos = 8;
  while (pos < file.length) {
    const length = file.readUInt32BE(pos);
    const type = file.toString("ascii", pos + 4, pos + 8);
    const body = file.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length; // length + type + data + crc
    switch (type) {
      case "IHDR":
        width = body.readUInt32BE(0);
        height = body.readUInt32BE(4);
        depth = body[8]!;
        colorType = body[9]!;
        if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth}`);
        if (body[12] !== 0) throw new Error("interlaced PNGs are not supported");
        break;
      case "PLTE": palette = new Uint8Array(body); break;
      case "tRNS": transparency = new Uint8Array(body); break;
      case "IDAT": idat.push(body); break;
      case "IEND": pos = file.length; break;
      default: break; // ancillary chunks carry nothing the renderer needs
    }
  }

  const bpp = channels(colorType);
  const pixels = unfilter(inflateSync(Buffer.concat(idat)), width, height, bpp);
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp;
    const d = i * 4;
    switch (colorType) {
      case 0:
        rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s]!;
        rgba[d + 3] = 255;
        break;
      case 2:
        rgba[d] = pixels[s]!;
        rgba[d + 1] = pixels[s + 1]!;
        rgba[d + 2] = pixels[s + 2]!;
        rgba[d + 3] = 255;
        break;
      case 3: {
        if (!palette) throw new Error("palette PNG with no PLTE chunk");
        const index = pixels[s]!;
        rgba[d] = palette[index * 3]!;
        rgba[d + 1] = palette[index * 3 + 1]!;
        rgba[d + 2] = palette[index * 3 + 2]!;
        rgba[d + 3] = transparency?.[index] ?? 255;
        break;
      }
      case 4:
        rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s]!;
        rgba[d + 3] = pixels[s + 1]!;
        break;
      default:
        rgba[d] = pixels[s]!;
        rgba[d + 1] = pixels[s + 1]!;
        rgba[d + 2] = pixels[s + 2]!;
        rgba[d + 3] = pixels[s + 3]!;
        break;
    }
  }
  return { width, height, rgba };
}
