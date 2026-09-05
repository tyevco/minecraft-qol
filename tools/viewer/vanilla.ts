/**
 * Vanilla block textures for the structure viewer, fetched at build time.
 *
 * A building is only judged fairly when it is drawn in the game's own
 * blocks, so the viewer maps every block a blueprint uses onto the vanilla
 * textures. Those textures are Mojang's and are not part of this repository:
 * `npm run viewer` fetches them from Mojang's public bedrock-samples
 * repository (the vanilla resource pack) into `.cache/` and copies the ones
 * the blueprints need into dist/viewer/vanilla/. Offline, the viewer falls
 * back to coloured cubes and this step says so.
 *
 * The mapping is the game's: blocks.json says which terrain_texture key each
 * face of a block uses, terrain_texture.json says which file that is. So an
 * unknown block name here is an unknown block name in the game, and this
 * step warns about it: it is the first check a blueprint gets.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { encodePng } from "../textures/png";

const RAW = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/";
const FACES = ["up", "down", "north", "south", "east", "west"] as const;
type Face = (typeof FACES)[number];

export interface VanillaBlock {
  /** Texture file per face, relative to the viewer root. */
  faces: Record<Face, string>;
  /** How the viewer draws it; a cube unless the name says otherwise. */
  shape: "cube" | "pane" | "fence" | "wall" | "lantern" | "campfire" | "chest" | "anvil" | "water" | "cutout" | "stairs" | "slab" | "door" | "bed" | "ladder" | "gate" | "cross";
  /** Alternate face textures by state (a door's upper half). */
  variants?: Record<string, Record<Face, string>>;
  /** A multiply colour for grey textures (water). */
  tint?: number;
  /** A second, tinted cut-out layer over the side faces (the grass overlay). */
  overlay?: { faces: Partial<Record<Face, string>>; tint: number };
}

export interface VanillaSet {
  attribution: string;
  blocks: Record<string, VanillaBlock>;
}

/** A block as a blueprint palette names it: identifier plus states. */
export interface PaletteEntry {
  name: string;
  states: Record<string, string | number | boolean>;
}

/** Bedrock's door textures are one list indexed by wood. */
const DOOR_WOODS = ["wooden", "spruce", "birch", "jungle", "acacia", "dark_oak", "iron"];

/** blocks.json and terrain_texture.json carry a BOM and comments. */
function parseLoose(text: string): unknown {
  return JSON.parse(text.replace(/^﻿/, "").replace(/\/\/[^\n]*/g, ""));
}

async function cached(cache: string, path: string): Promise<Buffer | undefined> {
  const file = resolve(cache, path);
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(RAW + path);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, buf);
  return buf;
}

/** Uncompressed or RLE truecolor TGA (types 2 and 10), as bedrock-samples ships a few. */
function decodeTga(buf: Buffer): { width: number; height: number; rgba: Uint8Array } {
  const idLen = buf[0]!;
  const type = buf[2]!;
  const width = buf.readUInt16LE(12);
  const height = buf.readUInt16LE(14);
  const bpp = buf[16]!;
  const topDown = (buf[17]! & 0x20) !== 0;
  if ((type !== 2 && type !== 10) || (bpp !== 24 && bpp !== 32)) throw new Error(`tga: unsupported type ${type} / ${bpp}bpp`);
  const bytes = bpp / 8;
  const rgba = new Uint8Array(width * height * 4);
  let p = 18 + idLen;
  let i = 0;
  const put = (at: number) => {
    const px = i++;
    const row = topDown ? Math.floor(px / width) : height - 1 - Math.floor(px / width);
    const o = (row * width + (px % width)) * 4;
    rgba[o] = buf[at + 2]!;
    rgba[o + 1] = buf[at + 1]!;
    rgba[o + 2] = buf[at]!;
    rgba[o + 3] = bytes === 4 ? buf[at + 3]! : 255;
  };
  const total = width * height;
  if (type === 2) {
    for (; i < total; ) {
      put(p);
      p += bytes;
    }
  } else {
    while (i < total) {
      const head = buf[p++]!;
      const n = (head & 0x7f) + 1;
      if (head & 0x80) {
        for (let k = 0; k < n; k++) put(p);
        p += bytes;
      } else {
        for (let k = 0; k < n; k++) {
          put(p);
          p += bytes;
        }
      }
    }
  }
  return { width, height, rgba };
}

function shapeFor(name: string): VanillaBlock["shape"] {
  if (name === "water") return "water";
  if (/_stairs$/.test(name)) return "stairs";
  if (/_slab$/.test(name) && !/double_slab$/.test(name)) return "slab";
  if (/(^|_)door$/.test(name) && !/trapdoor$/.test(name)) return "door";
  if (name === "bed") return "bed";
  if (name === "ladder") return "ladder";
  if (/fence_gate$/.test(name)) return "gate";
  if (/^(wheat|carrots|potatoes|beetroot|reeds|tall_grass|short_grass|fern)$/.test(name)) return "cross";
  if (/_pane$/.test(name)) return "pane";
  if (/_fence$/.test(name)) return "fence";
  if (/_wall$/.test(name)) return "wall";
  if (name === "lantern" || name === "soul_lantern") return "lantern";
  if (name === "campfire" || name === "soul_campfire") return "campfire";
  if (/chest$/.test(name)) return "chest";
  if (name === "anvil") return "anvil";
  if (name === "scaffolding" || /leaves|glass/.test(name)) return "cutout";
  return "cube";
}

/**
 * Check every palette state against Mojang's block metadata: the state must
 * exist on that block and the value must be one it lists. A wrong state is
 * a structure the game refuses or a block that loads with defaults, and
 * neither is visible in the viewer, so this is the check.
 */
function validateStates(entries: Iterable<PaletteEntry>, metaJson: Buffer | undefined): void {
  if (!metaJson) {
    console.warn("vanilla textures: no block metadata; states not checked");
    return;
  }
  const meta = JSON.parse(metaJson.toString("utf8")) as {
    block_properties: { name: string; values: { value: string | number | boolean }[] }[];
    data_items: { name: string; properties?: { name: string }[] }[];
  };
  const values = new Map(meta.block_properties.map((p) => [p.name, new Set(p.values.map((v) => v.value))]));
  const props = new Map(meta.data_items.map((b) => [b.name, new Set((b.properties ?? []).map((p) => p.name))]));
  const seen = new Set<string>();
  for (const e of entries) {
    const key = `${e.name}|${JSON.stringify(e.states)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const allowed = props.get(e.name);
    if (!allowed) continue; // the identifier check reports unknown blocks
    for (const [state, value] of Object.entries(e.states)) {
      if (!allowed.has(state)) console.warn(`vanilla textures: ${e.name} has no state "${state}" (it has: ${[...allowed].join(", ") || "none"})`);
      else if (!values.get(state)?.has(value)) console.warn(`vanilla textures: ${e.name} state "${state}" cannot be ${JSON.stringify(value)}`);
    }
  }
}

/**
 * Resolve every block name to its six face textures and write the set the
 * viewer reads. Returns undefined, with a warning, when the network is not
 * there.
 */
export async function buildVanilla(entries: Iterable<PaletteEntry>, root: string, out: string): Promise<VanillaSet | undefined> {
  const cache = resolve(root, ".cache/bedrock-samples");
  let blocksJson: Buffer | undefined;
  let terrainJson: Buffer | undefined;
  let metaJson: Buffer | undefined;
  try {
    blocksJson = await cached(cache, "blocks.json");
    terrainJson = await cached(cache, "textures/terrain_texture.json");
    metaJson = await cached(cache, "../metadata/vanilladata_modules/mojang-blocks.json");
  } catch (e) {
    console.warn(`vanilla textures: ${(e as Error).message}; the viewer will draw coloured cubes`);
    return undefined;
  }
  if (!blocksJson || !terrainJson) return undefined;
  validateStates(entries, metaJson);
  const blocks = parseLoose(blocksJson.toString("utf8")) as Record<string, { textures?: string | Record<string, string>; carried_textures?: string | Record<string, string> }>;
  const terrain = (parseLoose(terrainJson.toString("utf8")) as { texture_data: Record<string, { textures: string | string[] | { path: string }[] }> }).texture_data;

  const texDir = resolve(out, "vanilla");
  mkdirSync(texDir, { recursive: true });
  const written = new Map<string, string>();
  const textureFile = async (key: string, index = 0): Promise<string | undefined> => {
    const entry = terrain[key];
    if (!entry) return undefined;
    const first = Array.isArray(entry.textures) ? entry.textures[index] ?? entry.textures[0] : entry.textures;
    const path = typeof first === "string" ? first : first?.path;
    if (!path) return undefined;
    if (written.has(path)) return written.get(path);
    const name = `${basename(path)}.png`;
    const png = await cached(cache, `${path}.png`);
    if (png) writeFileSync(resolve(texDir, name), png);
    else {
      const tga = await cached(cache, `${path}.tga`);
      if (!tga) return undefined;
      const { width, height, rgba } = decodeTga(tga);
      writeFileSync(resolve(texDir, name), encodePng(width, height, rgba));
    }
    const rel = `vanilla/${name}`;
    written.set(path, rel);
    return rel;
  };

  const set: VanillaSet = {
    attribution: "Block textures are Mojang's, fetched at build time from github.com/Mojang/bedrock-samples; not part of this repository.",
    blocks: {},
  };
  const names = new Set<string>();
  for (const e of entries) names.add(e.name);
  for (const full of names) {
    const name = full.replace(/^minecraft:/, "");
    const def = blocks[name];
    if (!def) {
      if (!full.startsWith("minecraft:")) continue; // a pack's own block; drawn in its preview colour
      console.warn(`vanilla textures: "${full}" is not a block in blocks.json; check the identifier`);
      continue;
    }
    // Grass and a few others ship pre-tinted "carried" textures; use them so
    // the top is green without a biome colour.
    const tex = name === "grass" ? def.carried_textures : def.textures;
    if (!tex) continue;
    let byFace: Record<string, string> = typeof tex === "string" ? { all: tex } : tex;
    // blocks.json lists a barrel's faces for its default facing; the viewer
    // draws them standing up, lid on top.
    if (name === "barrel") byFace = { up: "barrel_top", down: "barrel_bottom", side: "barrel_side" };
    // A bed's texture is an entity texture; planks under a red wool top is close enough.
    if (name === "bed") byFace = { all: "planks", up: "wool_colored_red" };
    const shape = shapeFor(name);
    // Doors index one texture list by wood; the lower half is "down", the upper "side".
    const doorIndex = shape === "door" ? Math.max(0, DOOR_WOODS.indexOf(name.replace(/_door$/, ""))) : 0;
    if (shape === "door") byFace = { all: byFace.down!, upper: byFace.side! };
    const faces = {} as Record<Face, string>;
    let complete = true;
    for (const face of FACES) {
      const key = byFace[face] ?? (face === "up" || face === "down" ? byFace.all : byFace.side ?? byFace.all);
      const file = key ? await textureFile(key, doorIndex) : undefined;
      if (!file) {
        complete = false;
        break;
      }
      faces[face] = file;
    }
    if (!complete) {
      console.warn(`vanilla textures: no texture for a face of "${full}"`);
      continue;
    }
    const block: VanillaBlock = { faces, shape };
    if (name === "water") block.tint = 0x3f76e4;
    if (shape === "door") {
      const upper = await textureFile(byFace.upper!, doorIndex);
      if (upper) block.variants = { upper: Object.fromEntries(FACES.map((f) => [f, upper])) as Record<Face, string> };
    }
    // The grass side is dirt under a grey overlay the game tints by biome:
    // draw dirt, then the overlay in plains green.
    if (name === "grass") {
      const overlay = faces.north;
      for (const face of ["north", "south", "east", "west"] as const) faces[face] = faces.down;
      block.overlay = { faces: { north: overlay, south: overlay, east: overlay, west: overlay }, tint: 0x79c05a };
    }
    set.blocks[full] = block;
  }
  writeFileSync(resolve(out, "vanilla.json"), JSON.stringify(set, null, 2));
  console.log(`dist/viewer/vanilla: ${Object.keys(set.blocks).length} blocks, ${written.size} textures`);
  return set;
}
