/**
 * Generate every geometry file in the repo.
 *
 *   npm run models
 *
 * Conventions, all in block units where 16 = one block:
 *   - Block models are centred on x and z (-8..8) and stand on y = 0.
 *   - A directional block's FRONT is authored on +z (south), the default value
 *     of the placement-direction state; permutations rotate from there.
 *   - Entity models face -z (north), the vanilla convention, so a yaw of 0
 *     points the model where the entity is looking.
 *   - Block geometry is rendered with x MIRRORED: geometry +x lands on the
 *     world's WEST side and -x on its east. Measured with the pipe, whose arm
 *     bones are shown per world face: the arm authored on +x appeared on the
 *     west, so two pipes side by side reached away from each other. z is not
 *     mirrored (-z is north; the funnel's spout follows its state). So a bone
 *     or feature that must sit on the world's east is authored on -x. See
 *     docs/block-geometry-results.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as A from "../atlases";
import {
  buildGeometry,
  type BoneSpec,
  type CubeSpec,
  type GeometrySpec,
} from "./geometry";

const ROOT = resolve(__dirname, "../..");

function write(relPath: string, spec: GeometrySpec<string>): void {
  const path = resolve(ROOT, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(buildGeometry(spec), null, 2) + "\n");
  console.log(`${relPath}  ${spec.identifier}`);
}

type Cube<N extends string> = CubeSpec<N>;
type Bone<N extends string> = BoneSpec<N>;

// ---------------------------------------------------------------------------
// Hearthstone - a stone-brick hearth: plinth, carved body, four corner posts,
// a walled bowl of embers, and a flame. Recipe is stone bricks round a campfire
// and the model should say so.
// ---------------------------------------------------------------------------

type HS = keyof typeof A.HEARTHSTONE.tiles;

const hearthPost = (x: number, z: number): Cube<HS> => ({
  origin: [x, 4, z],
  size: [2, 9, 2],
  faces: {
    sides: { tile: "post", align: "topleft" },
    up: { tile: "post", align: "topleft" },
  },
});

const hearthFlame = (yaw: number): Cube<HS> => ({
  origin: [-4, 12, 0],
  size: [8, 7, 0],
  rotation: [0, yaw, 0],
  pivot: [0, 12, 0],
  faces: {
    north: { tile: "flame", at: [4, 9], material: "flame" },
    south: { tile: "flame", at: [4, 9], material: "flame" },
  },
});

write("packages/hearthstone/resource_pack/models/blocks/hearthstone.geo.json", {
  identifier: "geometry.hearthstone",
  atlas: A.HEARTHSTONE,
  visibleBounds: { width: 2, height: 2, offset: [0, 0.75, 0] },
  bones: [
    {
      name: "hearthstone",
      cubes: [
        // Plinth: full footprint, bottom course of bricks.
        {
          origin: [-8, 0, -8],
          size: [16, 4, 16],
          faces: {
            sides: { tile: "bricks", align: "bottom" },
            up: "plinth",
            down: "dark",
          },
        },
        // Body: carved panels with an ember slit on each side.
        {
          origin: [-6, 4, -6],
          size: [12, 6, 12],
          faces: {
            sides: { tile: "carved", at: [2, 5] },
            up: "dark",
            down: "dark",
          },
        },
        // Bowl walls, top course of bricks, leaving the embers recessed.
        {
          origin: [-7, 10, -7],
          size: [14, 3, 2],
          faces: { all: { tile: "bricks", align: "top" }, down: "dark" },
        },
        {
          origin: [-7, 10, 5],
          size: [14, 3, 2],
          faces: { all: { tile: "bricks", align: "top" }, down: "dark" },
        },
        {
          origin: [-7, 10, -5],
          size: [2, 3, 10],
          faces: { all: { tile: "bricks", align: "top" }, down: "dark" },
        },
        {
          origin: [5, 10, -5],
          size: [2, 3, 10],
          faces: { all: { tile: "bricks", align: "top" }, down: "dark" },
        },
        // Embers, one unit below the rim.
        { origin: [-5, 10, -5], size: [10, 2, 10], faces: { up: "embers" } },
        hearthPost(-8, -8),
        hearthPost(6, -8),
        hearthPost(-8, 6),
        hearthPost(6, 6),
      ],
    },
    {
      name: "flame",
      pivot: [0, 12, 0],
      cubes: [hearthFlame(45), hearthFlame(-45)],
    },
  ],
});

// ---------------------------------------------------------------------------
// Fluidworks funnel - a hopper's cousin turned on its side. Wide copper-hooped
// mouth at the back (input), body tapering forward to a spout (output), valve
// wheel on top. Front is +z.
// ---------------------------------------------------------------------------

type FN = keyof typeof A.FUNNEL.tiles;

const pipeU = { tile: "pipeU", at: [0, 0] } as const satisfies {
  tile: FN;
  at: readonly [number, number];
};
const pipeV = { tile: "pipeV", at: [0, 0] } as const satisfies {
  tile: FN;
  at: readonly [number, number];
};

write("packages/fluidworks/resource_pack/models/blocks/funnel.geo.json", {
  identifier: "geometry.fluidworks_funnel",
  atlas: A.FUNNEL,
  visibleBounds: { width: 2, height: 2, offset: [0, 0.5, 0] },
  bones: [
    {
      name: "funnel",
      cubes: [
        // Mouth rim: four copper bars framing an opening you can see into.
        { origin: [-7, 14, -8], size: [14, 1, 3], faces: { all: "copper" } },
        { origin: [-7, 1, -8], size: [14, 1, 3], faces: { all: "copper" } },
        { origin: [-7, 2, -8], size: [1, 12, 3], faces: { all: "copper" } },
        { origin: [6, 2, -8], size: [1, 12, 3], faces: { all: "copper" } },
        // Throat: the dark plate seen through the mouth.
        {
          origin: [-6, 2, -5],
          size: [12, 12, 1],
          faces: {
            north: "interior",
            sides: "plate",
            up: "lid",
            down: "plate",
          },
        },
        // Body.
        {
          origin: [-6, 2, -4],
          size: [12, 12, 4],
          faces: { sides: "plate", up: "lid", down: "plate" },
        },
        // A copper hoop round the body.
        {
          origin: [-6.5, 1.5, -2.5],
          size: [13, 13, 1],
          faces: {
            east: "copper",
            west: "copper",
            up: "copper",
            down: "copper",
          },
        },
        // Taper step and spout.
        {
          origin: [-4, 4, 0],
          size: [8, 8, 4],
          faces: { sides: "plate", up: "lid", down: "plate" },
        },
        // The spout is a short pipe: cylinder shading along its axis, an opening at the end.
        {
          origin: [-3, 5, 4],
          size: [6, 6, 4],
          faces: {
            east: pipeU,
            west: pipeU,
            up: pipeV,
            down: pipeV,
            south: "spout",
          },
        },
        // Valve wheel.
        { origin: [-1, 14, -3], size: [2, 1, 2], faces: { all: "dark" } },
        {
          origin: [-3, 15, -5],
          size: [6, 1, 6],
          faces: { sides: "copper", up: "wheel", down: "dark" },
        },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Fluidworks pipe - a junction with six arms, one bone each so block states
// can show only the connected ones. Every arm ends in a flange.
// ---------------------------------------------------------------------------

type PP = keyof typeof A.PIPE.tiles;

const alongU = { tile: "alongU", at: [0, 0] } as const;
const alongV = { tile: "alongV", at: [0, 0] } as const;
const flangeFace = "flange";

const pipeArm = (name: string, arm: Cube<PP>, flange: Cube<PP>): Bone<PP> => ({
  name,
  cubes: [arm, flange],
});

write("packages/fluidworks/resource_pack/models/blocks/pipe.geo.json", {
  identifier: "geometry.fluidworks_pipe",
  atlas: A.PIPE,
  visibleBounds: { width: 1, height: 1, offset: [0, 0.5, 0] },
  bones: [
    {
      name: "center",
      cubes: [
        { origin: [-3, 5, -3], size: [6, 6, 6], faces: { all: "junction" } },
      ],
    },
    pipeArm(
      "north",
      {
        origin: [-2, 6, -8],
        size: [4, 4, 6],
        faces: { east: alongU, west: alongU, up: alongV, down: alongV },
      },
      {
        origin: [-3, 5, -8],
        size: [6, 6, 1],
        faces: { all: "junction", north: flangeFace },
      },
    ),
    pipeArm(
      "south",
      {
        origin: [-2, 6, 2],
        size: [4, 4, 6],
        faces: { east: alongU, west: alongU, up: alongV, down: alongV },
      },
      {
        origin: [-3, 5, 7],
        size: [6, 6, 1],
        faces: { all: "junction", south: flangeFace },
      },
    ),
    // Bones are named for the WORLD face they reach, which is what the block
    // JSON's bone_visibility keys on. x is mirrored in rendering (see the
    // header), so the world-east arm is authored on -x and world-west on +x.
    pipeArm(
      "east",
      {
        origin: [-8, 6, -2],
        size: [6, 4, 4],
        faces: { north: alongU, south: alongU, up: alongU, down: alongU },
      },
      {
        origin: [-8, 5, -3],
        size: [1, 6, 6],
        faces: { all: "junction", west: flangeFace },
      },
    ),
    pipeArm(
      "west",
      {
        origin: [2, 6, -2],
        size: [6, 4, 4],
        faces: { north: alongU, south: alongU, up: alongU, down: alongU },
      },
      {
        origin: [7, 5, -3],
        size: [1, 6, 6],
        faces: { all: "junction", east: flangeFace },
      },
    ),
    pipeArm(
      "up",
      { origin: [-2, 11, -2], size: [4, 5, 4], faces: { sides: alongV } },
      {
        origin: [-3, 15, -3],
        size: [6, 1, 6],
        faces: { all: "junction", up: flangeFace },
      },
    ),
    pipeArm(
      "down",
      { origin: [-2, 0, -2], size: [4, 5, 4], faces: { sides: alongV } },
      {
        origin: [-3, 0, -3],
        size: [6, 1, 6],
        faces: { all: "junction", down: flangeFace },
      },
    ),
  ],
});

// ---------------------------------------------------------------------------
// Bulwark turret base - the block. Stone foot, iron column with corner braces,
// a deck, and the mount the head entity sits in.
// ---------------------------------------------------------------------------

type TB = keyof typeof A.TURRET_BASE.tiles;

const brace = (x: number, z: number): Cube<TB> => ({
  origin: [x, 3, z],
  size: [3, 7, 3],
  faces: { sides: "brace", up: "plate" },
});

write("packages/bulwark/resource_pack/models/blocks/turret_base.geo.json", {
  identifier: "geometry.bulwark_turret_base",
  atlas: A.TURRET_BASE,
  visibleBounds: { width: 2, height: 2, offset: [0, 0.5, 0] },
  bones: [
    {
      name: "turret_base",
      cubes: [
        {
          origin: [-8, 0, -8],
          size: [16, 3, 16],
          faces: {
            sides: { tile: "foot", align: "bottom" },
            up: "foot",
            down: "dark",
          },
        },
        {
          origin: [-6, 3, -6],
          size: [12, 7, 12],
          faces: { sides: "plate", up: "dark", down: "dark" },
        },
        brace(-8, -8),
        brace(5, -8),
        brace(-8, 5),
        brace(5, 5),
        {
          origin: [-7, 10, -7],
          size: [14, 2, 14],
          faces: { sides: "plate", up: "deck", down: "dark" },
        },
        {
          origin: [-5, 12, -5],
          size: [10, 2, 10],
          faces: { sides: "plate", up: "socket", down: "dark" },
        },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Bulwark turret head - the entity. A swivel plate, a housing that yaws and
// pitches to track a target (bone "head", driven by look_at_target), a barrel
// out the front, a sight on top, an ammo drum and a vented counterweight.
// ---------------------------------------------------------------------------

type TH = keyof typeof A.TURRET_HEAD.tiles;

const barrelU = { tile: "barrel", at: [0, 0] } as const;
const barrelV = { tile: "barrelV", at: [0, 0] } as const;

write("packages/bulwark/resource_pack/models/entity/turret_head.geo.json", {
  identifier: "geometry.bulwark_turret_head",
  atlas: A.TURRET_HEAD,
  visibleBounds: { width: 3, height: 2, offset: [0, 0.75, 0] },
  bones: [
    {
      name: "base",
      cubes: [
        { origin: [-3, 0, -3], size: [6, 2, 6], faces: { all: "swivel" } },
      ],
    },
    {
      name: "head",
      parent: "base",
      pivot: [0, 2, 0],
      // Where the idle vent steam and, later, the muzzle flash attach.
      locators: { vents: [-7.5, 8.5, 0.5], muzzle: [0, 5.5, -17.5] },
      cubes: [
        {
          origin: [-4, 2, -4],
          size: [8, 7, 8],
          faces: { sides: "plate", south: "vents", up: "deck", down: "swivel" },
        },
        {
          origin: [-1.5, 4, -15],
          size: [3, 3, 11],
          faces: { east: barrelU, west: barrelU, up: barrelV, down: barrelV },
        },
        {
          origin: [-2, 3.5, -17],
          size: [4, 4, 2],
          faces: {
            sides: "barrel",
            up: "barrel",
            down: "barrel",
            north: "muzzle",
          },
        },
        {
          origin: [-2, 9, -4],
          size: [4, 4, 6],
          faces: { sides: "plate", up: "deck", north: "sight" },
        },
        { origin: [4, 3, -2], size: [3, 5, 5], faces: { all: "drum" } },
        { origin: [-7, 3, -2], size: [3, 5, 5], faces: { all: "vents" } },
      ] satisfies Cube<TH>[],
    },
  ],
});

// ---------------------------------------------------------------------------
// Graves gravestone - the entity. A headstone with a rounded top and an
// inscription on its front (-z), standing at the head of a low mound.
// ---------------------------------------------------------------------------

type GV = keyof typeof A.GRAVESTONE.tiles;

write("packages/graves/resource_pack/models/entity/gravestone.geo.json", {
  identifier: "geometry.graves_gravestone",
  atlas: A.GRAVESTONE,
  visibleBounds: { width: 2, height: 2, offset: [0, 0.75, 0] },
  bones: [
    {
      name: "gravestone",
      // The wisp rises from just in front of the inscription.
      locators: { wisp: [0, 10, -2] },
      cubes: [
        // Plinth under the stone.
        {
          origin: [-6, 0, -1],
          size: [12, 2, 6],
          faces: { sides: "stone", up: "top", down: "dark" },
        },
        // The stone itself, stepping in twice towards a rounded top.
        {
          origin: [-5, 2, 0],
          size: [10, 11, 3],
          faces: { sides: "stone", north: "face", up: "top", down: "dark" },
        },
        {
          origin: [-4, 13, 0],
          size: [8, 2, 3],
          faces: { sides: "stone", up: "top" },
        },
        {
          origin: [-2, 15, 0],
          size: [4, 1, 3],
          faces: { sides: "stone", up: "top" },
        },
        // The grave: a mound of earth stretching out in front.
        {
          origin: [-4, 0, -9],
          size: [8, 2, 8],
          faces: { sides: "mound", up: "mound", down: "dark" },
        },
        {
          origin: [-3, 2, -8],
          size: [6, 1, 6],
          faces: { sides: "mound", up: "mound" },
        },
      ] satisfies Cube<GV>[],
    },
  ],
});
