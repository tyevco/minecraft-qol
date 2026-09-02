/**
 * A small builder for Bedrock geometry files with per-face UVs.
 *
 * Why generate rather than hand-write: a model here is a few dozen cubes, each
 * with six faces, each face a UV rectangle into an atlas. Written by hand that
 * is hundreds of coordinates with nothing checking them. Here a face names a
 * tile from tools/atlases.ts and the window size follows from the cube, so a
 * face cannot sample the wrong size or a slot nobody painted.
 */
import type { AtlasLayout, Slot } from "../atlases";

export type Vec3 = readonly [number, number, number];
export type Face = "north" | "south" | "east" | "west" | "up" | "down";

export const FACES: readonly Face[] = [
  "north",
  "south",
  "east",
  "west",
  "up",
  "down",
];

/** Where a face's window sits inside its 16x16 tile. */
export type Align = "center" | "top" | "bottom" | "topleft";

export interface FaceRef<Name extends string = string> {
  tile: Name;
  align?: Align;
  /** Explicit window origin inside the tile; overrides align. */
  at?: readonly [u: number, v: number];
  /** Named entry in the block's minecraft:material_instances; default is "*". */
  material?: string;
}

/** `sides` covers the four verticals; `all` everything; a named face wins. */
export type FaceMap<Name extends string> = Partial<
  Record<Face | "sides" | "all", FaceRef<Name> | Name>
>;

export interface CubeSpec<Name extends string> {
  origin: Vec3;
  size: Vec3;
  faces: FaceMap<Name>;
  rotation?: Vec3;
  pivot?: Vec3;
  inflate?: number;
}

export interface BoneSpec<Name extends string> {
  name: string;
  pivot?: Vec3;
  parent?: string;
  rotation?: Vec3;
  cubes: CubeSpec<Name>[];
}

export interface GeometrySpec<Name extends string> {
  identifier: string;
  atlas: AtlasLayout<Name>;
  visibleBounds: { width: number; height: number; offset: Vec3 };
  bones: BoneSpec<Name>[];
}

interface FaceJson {
  uv: [number, number];
  uv_size: [number, number];
  material_instance?: string;
}

interface CubeJson {
  origin: Vec3;
  size: Vec3;
  rotation?: Vec3;
  pivot?: Vec3;
  inflate?: number;
  uv: Partial<Record<Face, FaceJson>>;
}

interface BoneJson {
  name: string;
  parent?: string;
  pivot: Vec3;
  rotation?: Vec3;
  cubes: CubeJson[];
}

/** The window a face needs, in texture pixels: width along u, height along v. */
function faceSize(size: Vec3, face: Face): [number, number] {
  const [sx, sy, sz] = size;
  switch (face) {
    case "north":
    case "south":
      return [sx, sy];
    case "east":
    case "west":
      return [sz, sy];
    case "up":
    case "down":
      return [sx, sz];
  }
}

function resolveFace<Name extends string>(
  faces: FaceMap<Name>,
  face: Face,
): FaceRef<Name> | undefined {
  const pick =
    faces[face] ??
    (face === "up" || face === "down" ? undefined : faces.sides) ??
    faces.all;
  if (pick === undefined) return undefined;
  return typeof pick === "string" ? { tile: pick } : pick;
}

function window(slot: Slot, [w, h]: [number, number], ref: FaceRef): FaceJson {
  if (w > 16 || h > 16)
    throw new Error(`face ${w}x${h} does not fit a 16x16 tile (${ref.tile})`);
  let u: number;
  let v: number;
  if (ref.at) {
    [u, v] = ref.at;
  } else {
    switch (ref.align ?? "center") {
      case "center":
        u = Math.floor((16 - w) / 2);
        v = Math.floor((16 - h) / 2);
        break;
      case "top":
        u = Math.floor((16 - w) / 2);
        v = 0;
        break;
      case "bottom":
        u = Math.floor((16 - w) / 2);
        v = 16 - h;
        break;
      case "topleft":
        u = 0;
        v = 0;
        break;
    }
  }
  if (u + w > 16 || v + h > 16)
    throw new Error(`window ${u},${v} ${w}x${h} overruns tile ${ref.tile}`);
  return {
    uv: [slot[0] * 16 + u, slot[1] * 16 + v],
    uv_size: [w, h],
    ...(ref.material ? { material_instance: ref.material } : {}),
  };
}

export function buildGeometry<Name extends string>(
  spec: GeometrySpec<Name>,
): object {
  const bones: BoneJson[] = spec.bones.map((bone) => ({
    name: bone.name,
    ...(bone.parent ? { parent: bone.parent } : {}),
    pivot: bone.pivot ?? [0, 0, 0],
    ...(bone.rotation ? { rotation: bone.rotation } : {}),
    cubes: bone.cubes.map((cube) => {
      const uv: Partial<Record<Face, FaceJson>> = {};
      for (const face of FACES) {
        const ref = resolveFace(cube.faces, face);
        if (!ref) continue;
        const slot = spec.atlas.tiles[ref.tile];
        if (!slot)
          throw new Error(`${spec.identifier}: unknown tile ${ref.tile}`);
        uv[face] = window(slot, faceSize(cube.size, face), ref);
      }
      return {
        origin: cube.origin,
        size: cube.size,
        ...(cube.rotation ? { rotation: cube.rotation } : {}),
        ...(cube.pivot ? { pivot: cube.pivot } : {}),
        ...(cube.inflate !== undefined ? { inflate: cube.inflate } : {}),
        uv,
      };
    }),
  }));

  return {
    format_version: "1.16.0",
    "minecraft:geometry": [
      {
        description: {
          identifier: spec.identifier,
          texture_width: spec.atlas.size,
          texture_height: spec.atlas.size,
          visible_bounds_width: spec.visibleBounds.width,
          visible_bounds_height: spec.visibleBounds.height,
          visible_bounds_offset: spec.visibleBounds.offset,
        },
        bones,
      },
    ],
  };
}
