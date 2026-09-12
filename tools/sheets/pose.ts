/**
 * Pose a Bedrock geometry into its reference pose and flatten it to quads.
 *
 * Pure: no filesystem, no rendering, no @minecraft/*. Everything here is
 * arithmetic on a parsed .geo.json, so the pose rules and the bone maths are
 * unit-tested in tools/sheets/tests without drawing a pixel.
 *
 * The maths follows tools/viewer/viewer.js, which follows Blockbench's Bedrock
 * codec - that is the renderer the models were authored against, so a sheet
 * and the viewer show the same model. Two conventions carry over:
 *
 *   - A bone or cube rotation (rx, ry, rz) in degrees becomes the matrix
 *     Rz(rz) . Ry(-ry) . Rx(-rx): x and y are negated, applied in ZYX order.
 *   - The whole model is mirrored in x for display (docs/README.md's
 *     block-geometry correction: +x is the world's west).
 */

export type Vec3 = readonly [number, number, number];
export type Face = "north" | "south" | "east" | "west" | "up" | "down";

export const FACES: readonly Face[] = ["north", "south", "east", "west", "up", "down"];

export interface FaceUv {
  uv: [number, number];
  uv_size: [number, number];
}

export interface Cube {
  origin: Vec3;
  size: Vec3;
  rotation?: Vec3;
  pivot?: Vec3;
  inflate?: number;
  uv?: Partial<Record<Face, FaceUv>>;
}

export interface Bone {
  name: string;
  parent?: string;
  pivot?: Vec3;
  rotation?: Vec3;
  cubes?: Cube[];
}

export interface Geometry {
  description: {
    identifier: string;
    texture_width?: number;
    texture_height?: number;
  };
  bones?: Bone[];
}

/** Read the single geometry out of a parsed .geo.json. */
export function readGeometry(file: unknown): Geometry {
  const list = (file as { "minecraft:geometry"?: Geometry[] })["minecraft:geometry"];
  const geo = list?.[0];
  if (!geo) throw new Error("no minecraft:geometry in file");
  return geo;
}

// ---------------------------------------------------------------------------
// The rig: which bones a pose knows, and what the reference pose does to them.
// ---------------------------------------------------------------------------

/**
 * Limb bones. A model with none of these has nothing a pose can move - a
 * gravestone, a waypoint marker, an egg - and gets no sheet.
 */
export const LIMB_BONES: readonly string[] = [
  "left_arm", "right_arm",
  "left_leg", "right_leg",
  "front_left_leg", "front_right_leg",
  "back_left_leg", "back_right_leg",
  "left_wing", "right_wing",
];

/** Arms and wings go out to the sides; +z rolls, so the left goes +90. */
const SPREAD: Record<string, Vec3> = {
  left_arm: [0, 0, 90],
  right_arm: [0, 0, -90],
  left_wing: [0, 0, 90],
  right_wing: [0, 0, -90],
};

/**
 * The four job-outfit bones the person rig carries. They are alternatives - a
 * guard's helmet and a worker's hat occupy the same head - so a sheet draws
 * only the ones its job wears, and none when the texture names no job.
 */
export const OUTFIT_BONES: readonly string[] = ["helmet", "hat", "pack", "tool"];

/** Which outfit bones each job wears (packages/villages). */
export const JOB_OUTFIT: Record<string, readonly string[]> = {
  guard: ["helmet"],
  worker: ["hat"],
  trader: ["pack"],
  builder: ["tool", "pack"],
};

/** A geometry can be posed when it has at least one limb bone. */
export function isPosable(geo: Geometry): boolean {
  const names = new Set((geo.bones ?? []).map((b) => b.name));
  return LIMB_BONES.some((limb) => names.has(limb));
}

/**
 * The reference pose: every authored bone rotation cleared to the bind pose,
 * then arms and wings taken out to the sides. That is what makes it a T-pose
 * rather than a screenshot - a lean the model was authored with (the pack
 * mule's neck, the hatchling's folded wings) would otherwise hide the rig.
 */
export function tPose(bone: Bone): Vec3 {
  return SPREAD[bone.name] ?? [0, 0, 0];
}

/** Bones a sheet draws, given the job the texture variant names. */
export function visibleBones(geo: Geometry, job: string | undefined): Set<string> {
  const worn = new Set(job ? JOB_OUTFIT[job] ?? [] : []);
  const visible = new Set<string>();
  for (const bone of geo.bones ?? [])
    if (!OUTFIT_BONES.includes(bone.name) || worn.has(bone.name))
      visible.add(bone.name);
  return visible;
}

// ---------------------------------------------------------------------------
// Bone maths.
// ---------------------------------------------------------------------------

/** Column-major 3x3, applied as m * v. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 3; r++)
      out[c * 3 + r] = a[r]! * b[c * 3]! + a[3 + r]! * b[c * 3 + 1]! + a[6 + r]! * b[c * 3 + 2]!;
  return out as unknown as Mat3;
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0]! * v[0] + m[3]! * v[1] + m[6]! * v[2],
    m[1]! * v[0] + m[4]! * v[1] + m[7]! * v[2],
    m[2]! * v[0] + m[5]! * v[1] + m[8]! * v[2],
  ];
}

/**
 * A Bedrock rotation as a matrix: Rz(rz) . Ry(-ry) . Rx(-rx), the negation and
 * order Blockbench's codec uses and tools/viewer/viewer.js reproduces.
 */
export function rotationMatrix(rotation: Vec3 | undefined): Mat3 {
  if (!rotation || (rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0)) return IDENTITY;
  const d = Math.PI / 180;
  const x = -rotation[0] * d;
  const y = -rotation[1] * d;
  const z = rotation[2] * d;
  const [sx, cx] = [Math.sin(x), Math.cos(x)];
  const [sy, cy] = [Math.sin(y), Math.cos(y)];
  const [sz, cz] = [Math.sin(z), Math.cos(z)];
  // Rz . Ry . Rx, column-major.
  return [
    cz * cy, sz * cy, -sy,
    cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx,
    cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx,
  ];
}

/** A face of a posed cube: four corners in display space, plus its UV window. */
export interface Quad {
  bone: string;
  face: Face;
  /** Corners TL, TR, BR, BL as seen from outside the cube. */
  corners: [Vec3, Vec3, Vec3, Vec3];
  /** Matching texture pixels, same winding. */
  uvs: [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]];
}

/** Corners TL, TR, BR, BL of one face, seen from outside. */
function faceCorners(o: Vec3, s: Vec3, face: Face): [Vec3, Vec3, Vec3, Vec3] {
  const [x, y, z] = o;
  const [X, Y, Z] = [x + s[0], y + s[1], z + s[2]];
  switch (face) {
    case "north": return [[X, Y, z], [x, Y, z], [x, y, z], [X, y, z]];
    case "south": return [[x, Y, Z], [X, Y, Z], [X, y, Z], [x, y, Z]];
    case "east": return [[X, Y, Z], [X, Y, z], [X, y, z], [X, y, Z]];
    case "west": return [[x, Y, z], [x, Y, Z], [x, y, Z], [x, y, z]];
    case "up": return [[x, Y, z], [X, Y, z], [X, Y, Z], [x, Y, Z]];
    case "down": return [[x, y, Z], [X, y, Z], [X, y, z], [x, y, z]];
  }
}

interface Placed {
  rotation: Mat3;
  translation: Vec3;
}

/**
 * Resolve every bone's transform from the model root, applying `pose` in place
 * of the authored rotation. A bone sits at its pivot relative to its parent's,
 * exactly as the viewer's nested groups do.
 */
export function boneTransforms(geo: Geometry, pose: (bone: Bone) => Vec3): Map<string, Placed> {
  const bones = new Map((geo.bones ?? []).map((b) => [b.name, b] as const));
  const resolved = new Map<string, Placed>();

  const resolve = (name: string, seen: Set<string>): Placed => {
    const cached = resolved.get(name);
    if (cached) return cached;
    if (seen.has(name)) throw new Error(`bone cycle through ${name}`);
    seen.add(name);
    const bone = bones.get(name);
    if (!bone) throw new Error(`unknown parent bone ${name}`);
    const pivot = bone.pivot ?? ([0, 0, 0] as Vec3);
    const local = rotationMatrix(pose(bone));
    const parent = bone.parent ? resolve(bone.parent, seen) : undefined;
    const parentPivot = (bone.parent ? bones.get(bone.parent)?.pivot : undefined) ?? ([0, 0, 0] as Vec3);
    // The bone's own offset from its parent, in the parent's frame.
    const offset: Vec3 = bone.parent
      ? [pivot[0] - parentPivot[0], pivot[1] - parentPivot[1], pivot[2] - parentPivot[2]]
      : pivot;
    const placed: Placed = parent
      ? { rotation: multiply(parent.rotation, local), translation: add(parent.translation, apply(parent.rotation, offset)) }
      : { rotation: local, translation: offset };
    resolved.set(name, placed);
    return placed;
  };

  for (const bone of geo.bones ?? []) resolve(bone.name, new Set());
  return resolved;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Flatten a posed geometry to quads in display space (model units, x mirrored,
 * y up). `visible` filters bones; a cube face with no UV window is skipped, as
 * it is in game.
 */
export function poseQuads(
  geo: Geometry,
  options: { pose?: (bone: Bone) => Vec3; visible?: ReadonlySet<string> } = {},
): Quad[] {
  const pose = options.pose ?? tPose;
  const transforms = boneTransforms(geo, pose);
  const quads: Quad[] = [];
  for (const bone of geo.bones ?? []) {
    if (options.visible && !options.visible.has(bone.name)) continue;
    const placed = transforms.get(bone.name)!;
    const pivot = bone.pivot ?? ([0, 0, 0] as Vec3);
    for (const cube of bone.cubes ?? []) {
      const inflate = cube.inflate ?? 0;
      const origin: Vec3 = [cube.origin[0] - inflate, cube.origin[1] - inflate, cube.origin[2] - inflate];
      const size: Vec3 = [cube.size[0] + 2 * inflate, cube.size[1] + 2 * inflate, cube.size[2] + 2 * inflate];
      const cubeRotation = rotationMatrix(cube.rotation);
      const cubePivot = cube.pivot ?? ([0, 0, 0] as Vec3);
      for (const face of FACES) {
        const window = cube.uv?.[face];
        if (!window) continue;
        const [u0, v0] = window.uv;
        const [w, h] = window.uv_size;
        const corners = faceCorners(origin, size, face).map((corner): Vec3 => {
          // Cube rotation about the cube's own pivot, then into the bone's
          // frame (vertices are relative to the bone pivot), then the chain.
          const local = apply(cubeRotation, [corner[0] - cubePivot[0], corner[1] - cubePivot[1], corner[2] - cubePivot[2]]);
          const inBone: Vec3 = [
            local[0] + cubePivot[0] - pivot[0],
            local[1] + cubePivot[1] - pivot[1],
            local[2] + cubePivot[2] - pivot[2],
          ];
          const world = add(apply(placed.rotation, inBone), placed.translation);
          return [-world[0], world[1], world[2]]; // display mirrors x
        }) as [Vec3, Vec3, Vec3, Vec3];
        quads.push({
          bone: bone.name,
          face,
          corners,
          uvs: [[u0, v0], [u0 + w, v0], [u0 + w, v0 + h], [u0, v0 + h]],
        });
      }
    }
  }
  return quads;
}

/** Axis-aligned bounds of a quad list, in display space. */
export function bounds(quads: readonly Quad[]): { min: Vec3; max: Vec3 } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const quad of quads)
    for (const corner of quad.corners)
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, corner[axis]!);
        max[axis] = Math.max(max[axis]!, corner[axis]!);
      }
  return { min, max };
}
