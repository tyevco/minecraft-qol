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

/**
 * The block version a palette entry is stamped with: what the 1.26.45.1
 * server itself writes when it saves a structure (`structure save`, read
 * back out of the world database), packed 1.21.60.33. A custom block stamped
 * with an older version is dropped on load (the loader tries to upgrade it
 * and cannot), and so is one stamped with the server's own 1.26.45.1 (newer
 * than this constant); vanilla blocks survive either way. Measured in
 * docs/villages-jigsaw-results.md.
 */
export const BLOCK_VERSION = 18168865;

export type Facing = "north" | "south" | "east" | "west";

/**
 * A material family: the full block and the Bedrock names of its stairs and
 * slab. Several are legacy names (cobblestone stairs are `stone_stairs`), so
 * the table is the one place that knows them, checked against the vanilla
 * block list when the viewer builds.
 */
const MATERIALS: Record<string, { stairs: string; slab: string }> = {
  stone_bricks: { stairs: "stone_brick_stairs", slab: "stone_brick_slab" },
  polished_deepslate: { stairs: "polished_deepslate_stairs", slab: "polished_deepslate_slab" },
  deepslate_tiles: { stairs: "deepslate_tile_stairs", slab: "deepslate_tile_slab" },
  cobblestone: { stairs: "stone_stairs", slab: "cobblestone_slab" },
  brick_block: { stairs: "brick_stairs", slab: "brick_slab" },
  cut_copper: { stairs: "cut_copper_stairs", slab: "cut_copper_slab" },
  weathered_copper: { stairs: "weathered_cut_copper_stairs", slab: "weathered_cut_copper_slab" },
  oxidized_copper: { stairs: "oxidized_cut_copper_stairs", slab: "oxidized_cut_copper_slab" },
  oak_planks: { stairs: "oak_stairs", slab: "oak_slab" },
  spruce_planks: { stairs: "spruce_stairs", slab: "spruce_slab" },
  dark_oak_planks: { stairs: "dark_oak_stairs", slab: "dark_oak_slab" },
  mangrove_planks: { stairs: "mangrove_stairs", slab: "mangrove_slab" },
  bamboo_mosaic: { stairs: "bamboo_mosaic_stairs", slab: "bamboo_mosaic_slab" },
};

export function stairsOf(block: string): string {
  const m = MATERIALS[block];
  if (!m) throw new Error(`no stairs known for ${block}`);
  return m.stairs;
}

export function slabOf(block: string): string {
  const m = MATERIALS[block];
  if (!m) throw new Error(`no slab known for ${block}`);
  return m.slab;
}

/** Oak keeps Bedrock's legacy door and gate names. */
export function doorOf(wood: string): string {
  return wood === "oak" ? "wooden_door" : `${wood}_door`;
}
export function gateOf(wood: string): string {
  return wood === "oak" ? "fence_gate" : `${wood}_fence_gate`;
}

/** Stairs: `weirdo_direction` is the side the full-height half is on. */
const WEIRDO: Record<Facing, number> = { east: 0, west: 1, south: 2, north: 3 };
/** Beds and the like: `direction` counts south, west, north, east. */
const DIRECTION: Record<Facing, number> = { south: 0, west: 1, north: 2, east: 3 };
/** Ladders: `facing_direction` is the way the ladder faces, away from its wall. */
const FACING_DIRECTION: Record<Facing, number> = { north: 2, south: 3, west: 4, east: 5 };
const STEP: Record<Facing, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

const CLOCKWISE: Record<Facing, Facing> = { north: "east", east: "south", south: "west", west: "north" };
export const OPPOSITE: Record<Facing, Facing> = { north: "south", south: "north", east: "west", west: "east" };
export const FACINGS: Facing[] = ["north", "east", "south", "west"];

export function turnFacing(f: Facing, turns: number): Facing {
  let out = f;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) out = CLOCKWISE[out];
  return out;
}

const WEIRDO_FACING: Facing[] = ["east", "west", "south", "north"];
const DIRECTION_FACING: Facing[] = ["south", "west", "north", "east"];
const FACING_DIRECTION_FACING: Record<number, Facing> = { 2: "north", 3: "south", 4: "west", 5: "east" };

/**
 * A block's states after the block is turned clockwise (seen from above) by
 * quarter turns: every directional state the blueprints use. Anything not
 * listed is left alone.
 */
export function turnStates(states: States, turns: number): States {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) return states;
  const out: States = { ...states };
  if (typeof states.weirdo_direction === "number") out.weirdo_direction = WEIRDO_FACING.indexOf(turnFacing(WEIRDO_FACING[states.weirdo_direction]!, t));
  if (typeof states.direction === "number" && states.direction >= 0 && states.direction <= 3) out.direction = DIRECTION_FACING.indexOf(turnFacing(DIRECTION_FACING[states.direction]!, t));
  if (typeof states.facing_direction === "number" && FACING_DIRECTION_FACING[states.facing_direction]) out.facing_direction = FACING_DIRECTION[turnFacing(FACING_DIRECTION_FACING[states.facing_direction]!, t)];
  if (typeof states["minecraft:cardinal_direction"] === "string") out["minecraft:cardinal_direction"] = turnFacing(states["minecraft:cardinal_direction"] as Facing, t);
  if (states.pillar_axis === "x" || states.pillar_axis === "z") out.pillar_axis = t % 2 === 0 ? states.pillar_axis : states.pillar_axis === "x" ? "z" : "x";
  if ("wall_connection_type_north" in states)
    for (const f of FACINGS) out[`wall_connection_type_${turnFacing(f, t)}`] = states[`wall_connection_type_${f}`]!;
  return out;
}

/**
 * A jigsaw marker: the block the game's jigsaw generator joins pieces at.
 * `name` is what another piece's `target` looks for; `pool` is where this
 * piece looks for the next one; `final` is the block left behind. Faces
 * outward, as vanilla's do. The data goes in the structure as the block
 * entity of a `minecraft:jigsaw` block (docs/design/villages.md §2).
 */
export interface Jigsaw {
  facing: Facing;
  name: string;
  target: string;
  pool: string;
  final: string;
  joint?: "rollable" | "aligned";
}


/** Blocks a wall or a pane does not join to. */
const NOT_JOINABLE = /water|lantern|campfire|ladder|torch|door|bed$|_slab$|_stairs$/;

interface PaletteEntry {
  name: string;
  states: States;
}

export class Blueprint {
  readonly cells: Int32Array;
  readonly palette: PaletteEntry[] = [];
  /** Jigsaw markers by cell index. */
  readonly jigsaws = new Map<number, Jigsaw>();
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

  private cellAt(i: number): [number, number, number] {
    return [Math.floor(i / (this.sy * this.sz)), Math.floor(i / this.sz) % this.sy, i % this.sz];
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
    const i = this.index(x, y, z);
    this.cells[i] = block === "air" ? -1 : this.paletteIndex(block, states);
    if (block !== "jigsaw") this.jigsaws.delete(i);
    return this;
  }

  at(x: number, y: number, z: number): string | undefined {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return undefined;
    const i = this.cells[this.index(x, y, z)]!;
    return i < 0 ? undefined : this.palette[i]!.name;
  }

  /** Stairs with the high side towards `facing`; `upsideDown` hangs them from the block above. */
  stairs(x: number, y: number, z: number, material: string, facing: Facing, upsideDown = false): this {
    return this.set(x, y, z, stairsOf(material), { weirdo_direction: WEIRDO[facing], upside_down_bit: upsideDown });
  }

  slab(x: number, y: number, z: number, material: string, top = false): this {
    return this.set(x, y, z, slabOf(material), { "minecraft:vertical_half": top ? "top" : "bottom" });
  }

  /** A closed door, two blocks, facing outward. */
  door(x: number, y: number, z: number, wood: string, facing: Facing): this {
    const base: States = { "minecraft:cardinal_direction": facing, door_hinge_bit: false, open_bit: false };
    this.set(x, y, z, doorOf(wood), { ...base, upper_block_bit: false });
    return this.set(x, y + 1, z, doorOf(wood), { ...base, upper_block_bit: true });
  }

  /** A bed with its foot at (x, z) and its head one block towards `facing`. */
  bed(x: number, y: number, z: number, facing: Facing): this {
    const [dx, dz] = STEP[facing];
    this.set(x, y, z, "bed", { direction: DIRECTION[facing], head_piece_bit: false, occupied_bit: false });
    return this.set(x + dx, y, z + dz, "bed", { direction: DIRECTION[facing], head_piece_bit: true, occupied_bit: false });
  }

  /** A ladder column of `h` blocks on the wall behind it, facing `facing` (away from the wall). */
  ladder(x: number, y: number, z: number, h: number, facing: Facing): this {
    for (let i = 0; i < h; i++) this.set(x, y + i, z, "ladder", { facing_direction: FACING_DIRECTION[facing] });
    return this;
  }

  /** A closed fence gate across a fence line, opening towards `facing`. */
  gate(x: number, y: number, z: number, wood: string, facing: Facing): this {
    return this.set(x, y, z, gateOf(wood), { "minecraft:cardinal_direction": facing, in_wall_bit: false, open_bit: false });
  }

  /** A jigsaw marker block, facing outward from the piece's edge. */
  jigsaw(x: number, y: number, z: number, j: Jigsaw): this {
    this.set(x, y, z, "jigsaw", { facing_direction: FACING_DIRECTION[j.facing], rotation: 0 });
    this.jigsaws.set(this.index(x, y, z), { joint: "rollable", ...j });
    return this;
  }

  /** A log or other pillar lying along an axis. */
  log(x: number, y: number, z: number, block: string, axis: "x" | "y" | "z"): this {
    return this.set(x, y, z, block, { pillar_axis: axis });
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
   * A pitched roof running east-west over a footprint, built of stairs: each
   * course has a row of stairs on its north and south edges, high side
   * towards the ridge, with the roof block between them; the first course
   * overhangs the walls by one. Two facing rows of stairs make the peak of an
   * even span; an odd span ends in a row of `ridge` (a log lies along it) or,
   * if none is given, a slab. Returns the number of courses.
   */
  gableRoof(x: number, y: number, z: number, w: number, d: number, block: string, ridge?: string): number {
    let layer = 0;
    let n = z - 1;
    let s = z + d;
    let ox = x - 1;
    let ow = w + 2;
    for (;;) {
      const depth = s - n + 1;
      const yy = y + layer;
      if (depth >= 3) {
        for (let i = ox; i < ox + ow; i++) this.stairs(i, yy, n, block, "south").stairs(i, yy, s, block, "north");
        this.fill(ox, yy, n + 1, ow, 1, depth - 2, block);
      } else if (depth === 2) {
        for (let i = ox; i < ox + ow; i++) this.stairs(i, yy, n, block, "south").stairs(i, yy, s, block, "north");
        return layer + 1;
      } else {
        for (let i = ox; i < ox + ow; i++) {
          if (ridge && /_log$/.test(ridge)) this.log(i, yy, n, ridge, "x");
          else if (ridge) this.set(i, yy, n, ridge);
          else this.slab(i, yy, n, block);
        }
        return layer + 1;
      }
      n++;
      s--;
      layer++;
      if (layer === 1) {
        ox = x;
        ow = w;
      }
    }
  }

  /**
   * A pyramid roof of stairs: every course is a ring of stairs with the high
   * side inward (the corners become outer-corner stairs in the game), filled
   * with the block; the first course overhangs by one; a single block at the
   * top becomes a slab. Returns the number of courses.
   */
  hipRoof(x: number, y: number, z: number, w: number, d: number, block: string): number {
    let layer = 0;
    let x0 = x - 1;
    let z0 = z - 1;
    let ww = w + 2;
    let dd = d + 2;
    while (ww > 0 && dd > 0) {
      const yy = y + layer;
      if (ww === 1 && dd === 1) {
        this.slab(x0, yy, z0, block);
        return layer + 1;
      }
      for (let i = x0; i < x0 + ww; i++) {
        if (dd === 1) this.slab(i, yy, z0, block);
        else this.stairs(i, yy, z0, block, "south").stairs(i, yy, z0 + dd - 1, block, "north");
      }
      for (let k = z0 + 1; k < z0 + dd - 1; k++) {
        if (ww === 1) this.slab(x0, yy, k, block);
        else this.stairs(x0, yy, k, block, "east").stairs(x0 + ww - 1, yy, k, block, "west");
      }
      if (ww > 2 && dd > 2) this.fill(x0 + 1, yy, z0 + 1, ww - 2, 1, dd - 2, block);
      x0++;
      z0++;
      ww -= 2;
      dd -= 2;
      layer++;
    }
    return layer;
  }

  /**
   * States that depend on neighbours, set once the building is complete:
   * a lantern under a block hangs; a wall joins to whatever stands beside
   * it. The game recomputes wall joins on any neighbour update, but a
   * structure placed block by block gets no such update, so they are stored.
   */
  private finalize(): void {
    const joinable = (x: number, y: number, z: number): boolean => {
      const n = this.at(x, y, z);
      return n !== undefined && !NOT_JOINABLE.test(n);
    };
    for (const b of this.blocks()) {
      const short = b.name.replace("minecraft:", "");
      if (short === "lantern" || short === "soul_lantern") {
        const above = this.at(b.x, b.y + 1, b.z);
        this.set(b.x, b.y, b.z, short, { hanging: above !== undefined && !/lantern/.test(above) });
      } else if (/_wall$/.test(short)) {
        const east = joinable(b.x + 1, b.y, b.z);
        const west = joinable(b.x - 1, b.y, b.z);
        const north = joinable(b.x, b.y, b.z - 1);
        const south = joinable(b.x, b.y, b.z + 1);
        const above = this.at(b.x, b.y + 1, b.z) !== undefined;
        const straight = (east && west && !north && !south) || (north && south && !east && !west);
        this.set(b.x, b.y, b.z, short, {
          wall_connection_type_east: east ? "short" : "none",
          wall_connection_type_west: west ? "short" : "none",
          wall_connection_type_north: north ? "short" : "none",
          wall_connection_type_south: south ? "short" : "none",
          wall_post_bit: above || !straight,
        });
      }
    }
  }

  /**
   * The same blueprint in the smallest box that holds every block, with the
   * origin moved to the first block. Buildings are authored in a roomy scratch
   * box and trimmed, so a roof one course taller than expected is never an
   * out-of-range error and the saved size is always tight. Neighbour-derived
   * states are settled here too.
   */
  trimmed(): Blueprint {
    this.finalize();
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
    for (const [i, j] of this.jigsaws) {
      const b = this.cellAt(i);
      out.jigsaws.set(out.index(b[0] - min[0]!, b[1] - min[1]!, b[2] - min[2]!), j);
    }
    return out;
  }

  /**
   * This blueprint turned clockwise (seen from above) by quarter turns, states
   * and markers included: what the game does to a piece when it joins it to
   * a socket, done here so the offline expander previews what the game will
   * place. (0, 0, 0) stays a corner of the box.
   */
  rotated(turns: number): Blueprint {
    const t = ((turns % 4) + 4) % 4;
    if (t === 0) return this;
    const [sx, sy, sz] = this.size;
    const size: [number, number, number] = t % 2 === 0 ? [sx, sy, sz] : [sz, sy, sx];
    const out = new Blueprint(this.key, this.title, size, this.people, this.notes);
    const map = (x: number, z: number): [number, number] => {
      // One clockwise quarter turn: east goes to south. Applied t times.
      let cx = x, cz = z, w = sx, d = sz;
      for (let i = 0; i < t; i++) {
        [cx, cz] = [d - 1 - cz, cx];
        [w, d] = [d, w];
      }
      return [cx, cz];
    };
    for (const b of this.blocks()) {
      const [x, z] = map(b.x, b.z);
      out.set(x, b.y, z, b.name, turnStates(b.states, t));
    }
    for (const [i, j] of this.jigsaws) {
      const [x, y, z] = this.cellAt(i);
      const [nx, nz] = map(x, z);
      out.jigsaws.set(out.index(nx, y, nz), { ...j, facing: turnFacing(j.facing, t) });
    }
    return out;
  }

  /** Copy every block and marker of another blueprint in at an offset. Air is not copied. */
  paste(other: Blueprint, ox: number, oy: number, oz: number): this {
    for (const b of other.blocks()) this.set(b.x + ox, b.y + oy, b.z + oz, b.name, b.states);
    for (const [i, j] of other.jigsaws) {
      const [x, y, z] = other.cellAt(i);
      this.jigsaws.set(this.index(x + ox, y + oy, z + oz), j);
    }
    return this;
  }

  /** The markers with their positions. */
  markers(): { x: number; y: number; z: number; jigsaw: Jigsaw }[] {
    return [...this.jigsaws].map(([i, jigsaw]) => {
      const [x, y, z] = this.cellAt(i);
      return { x, y, z, jigsaw };
    });
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
    // Jigsaw markers as the JigsawBlock block entity, the field names the
    // server binary carries (target_pool, final_state, joint, priorities).
    const positionData: Record<string, Tag> = {};
    for (const [i, j] of this.jigsaws) {
      const [x, y, z] = this.cellAt(i);
      positionData[String(i)] = compound({
        block_entity_data: compound({
          id: string("JigsawBlock"),
          name: string(j.name),
          target: string(j.target),
          target_pool: string(j.pool),
          final_state: string(j.final.includes(":") ? j.final : `minecraft:${j.final}`),
          joint: string(j.joint ?? "rollable"),
          placement_priority: int(0),
          selection_priority: int(0),
          isMovable: byte(1),
          x: int(x),
          y: int(y),
          z: int(z),
        }),
      });
    }
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
                    // Sorted, as the game writes them.
                    states: compound(Object.fromEntries(Object.entries(p.states).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, stateTag(v)]))),
                    version: int(BLOCK_VERSION),
                  }),
                ),
              ),
              block_position_data: compound(positionData),
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
      palette: this.palette.map((p) => ({ name: p.name, states: p.states, color: previewColor(p.name) })),
      blocks: this.blocks().map((b) => [b.x, b.y, b.z, this.palette.findIndex((p) => p.name === b.name && JSON.stringify(p.states) === JSON.stringify(b.states))]),
      materials: this.materials(),
    };
  }
}

/** A colour for a block name, for the preview only. Vanilla-ish, not exact. */
export function previewColor(name: string): number {
  const n = name.replace("minecraft:", "");
  if (n.includes(":")) {
    for (const [re, c] of [[/villages:post/, 0x8b5a2b] as const]) if (re.test(n)) return c;
    return 0xaa88cc;
  }
  const rules: [RegExp, number][] = [
    [/water/, 0x3f76e4],
    [/^bed$/, 0xb02e26],
    [/villages:post/, 0x8b5a2b],
    [/ladder/, 0xb08a56],
    [/door/, 0xa8814f],
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
