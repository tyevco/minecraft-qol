import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { encodePng } from "../../textures/png";
import { decodePng } from "../decode";

const ROOT = resolve(__dirname, "../../..");

/** The same IHDR/IDAT/IEND framing encodePng uses, with a chosen filter byte. */
function png(width: number, height: number, colorType: number, rows: number[][], filter: number): Buffer {
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    let crc = 0xffffffff;
    for (const b of body) crc = crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const check = Buffer.alloc(4);
    check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, check]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const raw = Buffer.concat(rows.map((row) => Buffer.from([filter, ...row])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("decodePng", () => {
  it("round-trips what the texture generator writes", () => {
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      rgba[i * 4] = i * 16;
      rgba[i * 4 + 1] = 255 - i * 16;
      rgba[i * 4 + 2] = (i * 37) % 256;
      rgba[i * 4 + 3] = i % 3 === 0 ? 0 : 255;
    }
    const image = decodePng(encodePng(4, 4, rgba));
    expect(image.width).toBe(4);
    expect(image.height).toBe(4);
    expect([...image.rgba]).toEqual([...rgba]);
  });

  it("reads every entity texture the sheets sample", () => {
    for (const path of [
      "packages/villages/resource_pack/textures/entity/stonefolk_guard.png",
      "packages/hatchling/resource_pack/textures/entity/hatchling_ember.png",
      "concepts/entities/textures/mule.png",
    ]) {
      const image = decodePng(readFileSync(resolve(ROOT, path)));
      expect(image.width, path).toBeGreaterThan(0);
      expect(image.rgba.length, path).toBe(image.width * image.height * 4);
    }
  });

  it("undoes the Sub filter", () => {
    // Two RGB pixels per row, the second stored as a delta from the first.
    const file = png(2, 1, 2, [[10, 20, 30, 5, 5, 5]], 1);
    expect([...decodePng(file).rgba]).toEqual([10, 20, 30, 255, 15, 25, 35, 255]);
  });

  it("undoes the Up filter", () => {
    const file = png(1, 2, 2, [[10, 20, 30], [1, 2, 3]], 2);
    expect([...decodePng(file).rgba]).toEqual([10, 20, 30, 255, 11, 22, 33, 255]);
  });

  it("expands greyscale to RGBA", () => {
    const file = png(2, 1, 0, [[0, 255]], 0);
    expect([...decodePng(file).rgba]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });

  it("rejects what it cannot read rather than drawing nonsense", () => {
    expect(() => decodePng(Buffer.from("not a png at all"))).toThrow(/not a PNG/);
    const rgba = new Uint8Array(4);
    const sixteenBit = Buffer.from(encodePng(1, 1, rgba));
    sixteenBit[24] = 16; // IHDR bit depth; the CRC no longer matches, which we ignore
    expect(() => decodePng(sixteenBit)).toThrow(/bit depth/);
  });
});
