/**
 * A small builder for structures: a grid of block names authored in code,
 * written out as a .mcstructure (what a builder NPC or `structureManager`
 * would place) and as a preview JSON the viewer draws as coloured cubes.
 *
 * Why code: a building here is a few dozen calls - floor, walls, a door, a
 * stepped roof - and every one of them is reviewable in a diff, unlike a
 * binary saved from a world. The same source produces the file the game reads
 * and the picture a person judges, so the two cannot drift.
 *
 * Coordinates: x east, y up, z south; (0, 0, 0) is the north-west bottom
 * corner. A building's front is +z (south), as the block models are.
 */
import { byte, compound, encodeRoot, int, list, string, type Tag } from "./nbt";

export type States = Record<string, string | number | boolean>;

interface PaletteEntry {
  name: string;
  states: States;
}

export class Blueprint {
  readonly cells: Int32Array;
  readonly palette: PaletteEntry[] = [];
  private readonly keys = new Map<string, number>();

  constructor(
    readonly key: string,
    readonly title: string,
    readonly size: readonly [number, number, number],
    readonly people: string,
    readonly notes: string,
  ) {
    this.cells = new Int32Array(size[0] * size[1] * size[2]).fill(-1);
  }

  get sx(): number {
    return this.size[0];
  }
  get sy(): number {
    return this.size[1];
  }
  get sz(): number {
    return this.size[2];
  }

  private index(x: number, y: number, z: number): number {
    return (x * this.sy + y) * this.sz + z;
  }

  private paletteIndex(name: string, states: States): number {
    const full = name.includes(":") ? name : `minecraft:${name}`;
    const key = `${full}|${JSON.stringify(states)}`;
    let i = this.keys.get(key);
    if (i === undefined) {
      i = this.palette.length;
      this.palette.push({ name: full, states });
      this.keys.set(key, i);
    }
    return i;
  }

  /** Place one block. Out-of-range writes throw: a building must fit its box. */
  set(x: number, y: number, z: number, block: string, states: States = {}): this {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz)
      throw new Error(`${this.key}: (${x},${y},${z}) is outside ${this.size.join("x")}`);
    this.cells[this.index(x, y, z)] = block === "air" ? -1 : this.paletteIndex(block, states);
    return this;
  }

  at(x: number, y: number, z: number): string | undefined {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return undefined;
    const i = this.cells[this.index(x, y, z)]!;
    return i < 0 ? undefined : this.palette[i]!.name;
  }

  fill(x: number, y: number, z: number, w: number, h: number, d: number, block: string, states?: States): this {
    for (let i = x; i < x + w; i++)
      for (let j = y; j < y + h; j++)
        for (let k = z; k < z + d; k++) this.set(i, j, k, block, states);
    return this;
  }

  /** The four walls of a box, no floor or ceiling. */
  walls(x: number, y: number, z: number, w: number, h: number, d: number, block: string): this {
    this.fill(x, y, z, w, h, 1, block);
    this.fill(x, y, z + d - 1, w, h, 1, block);
    this.fill(x, y, z, 1, h, d, block);
    this.fill(x + w - 1, y, z, 1, h, d, block);
    return this;
  }

  /** A hollow box: walls, floor and ceiling. */
  shell(x: number, y: number, z: number, w: number, h: number, d: number, block: string): this {
    this.walls(x, y, z, w, h, d, block);
    this.fill(x, y, z, w, 1, d, block);
    this.fill(x, y + h - 1, z, w, 1, d, block);
    return this;
  }

  /**
   * A pitched roof running east-west over a footprint, stepped one block in
   * per layer from each side (north and south), overhanging the walls by one.
   * `ridge` caps the top course. Returns the height it reached.
   */
  gableRoof(x: number, y: number, z: number, w: number, d: number, block: string, ridge = block): number {
    let layer = 0;
    let n = z - 1;
    let s = z + d;
    let ox = x - 1;
    let ow = w + 2;
    while (s - n >= 1) {
      const depth = s - n + 1;
      const top = s - n <= 2;
      this.fill(ox, y + layer, n, ow, 1, depth, top ? ridge : block);
      if (top) break;
      n++;
      s--;
      layer++;
      if (layer === 1) {
        ox = x;
        ow = w;
      }
    }
    return layer + 1;
  }

  /** A stepped pyramid roof (for square towers). */
  hipRoof(x: number, y: number, z: number, w: number, d: number, block: string): number {
    let layer = 0;
    let x0 = x - 1;
    let z0 = z - 1;
    let ww = w + 2;
    let dd = d + 2;
    while (ww > 0 && dd > 0) {
      this.fill(x0, y + layer, z0, ww, 1, dd, block);
      x0++;
      z0++;
      ww -= 2;
      dd -= 2;
      layer++;
    }
    return layer;
  }

  /**
   * The same blueprint in the smallest box that holds every block, with the
   * origin moved to the first block. Buildings are authored in a roomy scratch
   * box and trimmed, so a roof one course taller than expected is never an
   * out-of-range error and the saved size is always tight.
   */
  trimmed(): Blueprint {
    const bs = this.blocks();
    if (!bs.length) throw new Error(`${this.key}: nothing placed`);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const b of bs) {
      const p = [b.x, b.y, b.z];
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i]!, p[i]!);
        max[i] = Math.max(max[i]!, p[i]!);
      }
    }
    const out = new Blueprint(this.key, this.title, [max[0]! - min[0]! + 1, max[1]! - min[1]! + 1, max[2]! - min[2]! + 1], this.people, this.notes);
    for (const b of bs) out.set(b.x - min[0]!, b.y - min[1]!, b.z - min[2]!, b.name, b.states);
    return out;
  }

  /** Every block, for the preview and for counting materials. */
  blocks(): { x: number; y: number; z: number; name: string; states: States }[] {
    const out: { x: number; y: number; z: number; name: string; states: States }[] = [];
    for (let x = 0; x < this.sx; x++)
      for (let y = 0; y < this.sy; y++)
        for (let z = 0; z < this.sz; z++) {
          const i = this.cells[this.index(x, y, z)]!;
          if (i >= 0) out.push({ x, y, z, ...this.palette[i]! });
        }
    return out;
  }

  /** Material count by block name, what a blueprint table would ask for. */
  materials(): Record<string, number> {
    const m: Record<string, number> = {};
    for (const b of this.blocks()) {
      if (b.name === "minecraft:water") continue;
      m[b.name] = (m[b.name] ?? 0) + 1;
    }
    return m;
  }

  toMcstructure(): Buffer {
    const [sx, sy, sz] = this.size;
    const count = sx * sy * sz;
    const indices: Tag[] = new Array<Tag>(count);
    const waterlogged: Tag[] = new Array<Tag>(count).fill(int(-1));
    for (let i = 0; i < count; i++) indices[i] = int(this.cells[i]!);
    const palette = this.palette.length
      ? this.palette
      : [{ name: "minecraft:air", states: {} }];
    const stateTag = (v: string | number | boolean): Tag =>
      typeof v === "string" ? string(v) : typeof v === "boolean" ? byte(v ? 1 : 0) : int(v);
    return encodeRoot(
      compound({
        format_version: int(1),
        size: list([int(sx), int(sy), int(sz)]),
        structure: compound({
          block_indices: list([list(indices), list(waterlogged)]),
          entities: list([]),
          palette: compound({
            default: compound({
              block_palette: list(
                palette.map((p) =>
                  compound({
                    name: string(p.name),
                    states: compound(Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, stateTag(v)]))),
                    version: int(18163713),
                  }),
                ),
              ),
              block_position_data: compound({}),
            }),
          }),
        }),
        structure_world_origin: list([int(0), int(0), int(0)]),
      }),
    );
  }

  /** The preview the viewer draws: size, a colour per palette entry, sparse blocks. */
  toPreview(): object {
    return {
      key: this.key,
      title: this.title,
      people: this.people,
      notes: this.notes,
      size: this.size,
      palette: this.palette.map((p) => ({ name: p.name, color: previewColor(p.name) })),
      blocks: this.blocks().map((b) => [b.x, b.y, b.z, this.palette.findIndex((p) => p.name === b.name && JSON.stringify(p.states) === JSON.stringify(b.states))]),
      materials: this.materials(),
    };
  }
}

/** A colour for a block name, for the preview only. Vanilla-ish, not exact. */
export function previewColor(name: string): number {
  const n = name.replace("minecraft:", "");
  const rules: [RegExp, number][] = [
    [/water/, 0x3f76e4],
    [/campfire/, 0xe07a2a],
    [/scaffolding/, 0xd8c27a],
    [/dried_kelp/, 0x3f5a2e],
    [/glass/, 0xbfe6ff],
    [/lantern|torch|glowstone|sea_lantern/, 0xffd36b],
    [/hay/, 0xd9b43a],
    [/red_wool/, 0xb02e26],
    [/white_wool|wool/, 0xe9e9e9],
    [/copper|cut_copper/, 0xc47d4f],
    [/oxidized|weathered/, 0x6f9d84],
    [/deepslate_tile|deepslate_brick|deepslate/, 0x4c4c50],
    [/stone_brick/, 0x7d7d7d],
    [/polished_andesite|andesite/, 0x8f8f8a],
    [/cobblestone|cobble/, 0x8a8a8a],
    [/mud_brick/, 0x8e7250],
    [/mud/, 0x5a4a3a],
    [/brick/, 0x9c5a4a],
    [/mangrove_planks|mangrove/, 0x7a3a34],
    [/dark_oak/, 0x4a3218],
    [/spruce/, 0x735531],
    [/bamboo/, 0xc4b45a],
    [/oak_log|log|wood/, 0x5c4526],
    [/oak_planks|planks|fence|door|crafting/, 0xb08a56],
    [/chest|barrel/, 0x9a6b35],
    [/blast_furnace|furnace|smoker|anvil|smithing|iron_block|iron/, 0x9a9a9a],
    [/dirt|farmland|coarse/, 0x7a5a3a],
    [/grass|moss|leaves/, 0x5d8a3a],
    [/sand|smooth_sandstone|sandstone/, 0xdfd3a3],
    [/gravel/, 0x8c8c8c],
    [/stone/, 0x828282],
  ];
  for (const [re, c] of rules) if (re.test(n)) return c;
  return 0xaa88cc;
}
