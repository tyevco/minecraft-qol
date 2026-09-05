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

/**
 * A copper chevron on one face of the taper step, pointing at the spout: two
 * bars that meet at a tip on +z and splay back at 45 degrees. Geometry rather
 * than a painted arrow, so which way it points cannot depend on how a face's
 * UV runs (or on the x mirror, which only swaps the two bars). `axis` is the
 * one the bars swing about, i.e. the normal of the face they lie on.
 */
function chevron(
  face: "east" | "west" | "up" | "down",
): readonly Cube<FN>[] {
  // Bars run along z from the tip at z = 3.5 back to z = -0.5, one unit
  // proud of the face, and each is rotated about the tip.
  const tip = 3.5;
  const back = -0.5;
  const len = tip - back;
  let origin: readonly [number, number, number];
  let pivot: readonly [number, number, number];
  let spin: (deg: number) => readonly [number, number, number];
  switch (face) {
    case "east":
      origin = [4, 7.5, back];
      pivot = [4.5, 8, tip];
      spin = (d) => [d, 0, 0];
      break;
    case "west":
      origin = [-5, 7.5, back];
      pivot = [-4.5, 8, tip];
      spin = (d) => [d, 0, 0];
      break;
    case "up":
      origin = [-0.5, 12, back];
      pivot = [0, 12.5, tip];
      spin = (d) => [0, d, 0];
      break;
    case "down":
      origin = [-0.5, 3, back];
      pivot = [0, 3.5, tip];
      spin = (d) => [0, d, 0];
      break;
  }
  const bar = (deg: number): Cube<FN> => ({
    origin,
    size: [1, 1, len],
    pivot,
    rotation: spin(deg),
    faces: { all: "copper" },
  });
  return [bar(45), bar(-45)];
}

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
        // Throat: the grille seen through the mouth. Bars over a dark
        // interior say "intake" the way a bare plate did not.
        {
          origin: [-6, 2, -5],
          size: [12, 12, 1],
          faces: {
            north: "grille",
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
        // Taper step, with a chevron on each free face pointing at the spout.
        {
          origin: [-4, 4, 0],
          size: [8, 8, 4],
          faces: { sides: "plate", up: "lid", down: "plate" },
        },
        ...chevron("east"),
        ...chevron("west"),
        ...chevron("up"),
        ...chevron("down"),
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

// ===========================================================================
// Concept entities. Proposals from docs/design/entities.md, generated into
// concepts/ so they can be judged in the viewer before any pack exists. All
// face -z. Bones are split where an animation would move them (heads, limbs,
// wings, tails, panniers), so a model can be animated without re-authoring.
// ===========================================================================

const CONCEPT_MODELS = "concepts/entities/models";
// Shipped: the four peoples live in packages/villages now.
const VILLAGES_MODELS = "packages/villages/resource_pack/models/entity";

// ---------------------------------------------------------------------------
// Decoy dummy - a scarecrow in the `player` family. A stake, a burlap sack
// body with a painted bullseye, straw hands and a sack head. Head and body
// are separate bones so a hit can rock them.
// ---------------------------------------------------------------------------

type DC = keyof typeof A.DECOY.tiles;

write(`${CONCEPT_MODELS}/decoy.geo.json`, {
  identifier: "geometry.concept_decoy",
  atlas: A.DECOY,
  visibleBounds: { width: 2, height: 3, offset: [0, 1, 0] },
  bones: [
    {
      name: "post",
      cubes: [
        {
          origin: [-1, 0, -1],
          size: [2, 14, 2],
          faces: { sides: "post", up: "dark", down: "dark" },
        },
      ] satisfies Cube<DC>[],
    },
    {
      name: "body",
      parent: "post",
      pivot: [0, 12, 0],
      // Straw puffs out of the chest when it takes a hit.
      locators: { chest: [0, 17, -2.5] },
      cubes: [
        {
          origin: [-4, 12, -2],
          size: [8, 10, 4],
          faces: { all: "burlap", north: { tile: "target", at: [4, 3] } },
        },
        { origin: [-8, 18, -1], size: [16, 2, 2], faces: { all: "bar" } },
        { origin: [-9, 15, -1], size: [2, 4, 2], faces: { all: "straw" } },
        { origin: [7, 15, -1], size: [2, 4, 2], faces: { all: "straw" } },
        { origin: [-3, 10, -1.5], size: [6, 2, 3], faces: { all: "straw" } },
        { origin: [-2, 22, -1], size: [4, 1, 2], faces: { all: "straw" } },
      ] satisfies Cube<DC>[],
    },
    {
      name: "head",
      parent: "body",
      pivot: [0, 23, 0],
      cubes: [
        {
          origin: [-3, 23, -3],
          size: [6, 6, 6],
          faces: { all: "burlap", north: "face" },
        },
        { origin: [-2, 29, -2], size: [4, 2, 4], faces: { all: "straw" } },
      ] satisfies Cube<DC>[],
    },
  ],
});

// ---------------------------------------------------------------------------
// Patrol golem - Bulwark's mobile sibling. Stone limbs, an iron chest plate,
// iron shoulder caps and boots, lit eye slits. Limbs on their own bones for a
// walk cycle; the head yaws with look_at_target.
// ---------------------------------------------------------------------------

type PG = keyof typeof A.PATROL_GOLEM.tiles;

const golemLeg = (name: string, x: number): Bone<PG> => ({
  name,
  pivot: [x + 2, 8, 0],
  cubes: [
    {
      origin: [x, 2, -2],
      size: [4, 6, 4],
      faces: { sides: "stone", up: "dark", down: "dark" },
    },
    { origin: [x - 0.5, 0, -3], size: [5, 2, 5], faces: { all: "band" } },
  ],
});

const golemArm = (name: string, x: number): Bone<PG> => ({
  name,
  parent: "body",
  pivot: [x + 1.5, 19, 0],
  cubes: [
    { origin: [x - 0.5, 17, -3], size: [4, 3, 6], faces: { all: "band" } },
    {
      origin: [x, 7, -2],
      size: [3, 11, 4],
      faces: { sides: "stone", up: "dark", down: "dark" },
    },
    { origin: [x - 0.5, 4, -2.5], size: [4, 4, 5], faces: { all: "plate" } },
  ],
});

write(`${CONCEPT_MODELS}/patrol_golem.geo.json`, {
  identifier: "geometry.concept_patrol_golem",
  atlas: A.PATROL_GOLEM,
  visibleBounds: { width: 2, height: 3, offset: [0, 1, 0] },
  bones: [
    golemLeg("left_leg", 1),
    golemLeg("right_leg", -5),
    {
      name: "body",
      pivot: [0, 8, 0],
      cubes: [
        {
          origin: [-6, 8, -3],
          size: [12, 12, 6],
          faces: { sides: "stone", up: "moss", down: "dark" },
        },
        {
          origin: [-5, 10, -4],
          size: [10, 8, 1],
          faces: { all: "plate", north: "chest" },
        },
        { origin: [-6.5, 8, -3.5], size: [13, 2, 7], faces: { all: "band" } },
      ] satisfies Cube<PG>[],
    },
    golemArm("left_arm", 6),
    golemArm("right_arm", -9),
    {
      name: "head",
      parent: "body",
      pivot: [0, 20, 0],
      locators: { eyes: [0, 23, -3.5] },
      cubes: [
        {
          origin: [-3, 20, -3],
          size: [6, 6, 6],
          faces: { sides: "stone", north: "face", up: "moss", down: "dark" },
        },
        // An iron cap sitting above the eyes, not over them.
        { origin: [-3.5, 25, -3.5], size: [7, 2, 7], faces: { all: "band" } },
      ] satisfies Cube<PG>[],
    },
  ],
});

// ---------------------------------------------------------------------------
// Runner - a clockwork fetcher in Fluidworks copper. A hovering drum with a
// glass front (the carried item shows through it), a lensed head with an
// antenna bulb, two fan wings and a pair of pincers underneath.
// ---------------------------------------------------------------------------

type RN = keyof typeof A.RUNNER.tiles;

const runnerWing = (name: string, x: number, roll: number): Bone<RN> => ({
  name,
  parent: "body",
  pivot: [x, 13, 0],
  rotation: [0, 0, roll],
  cubes: [
    {
      origin: [x < 0 ? x - 7 : x, 12.5, -2],
      size: [7, 1, 4],
      faces: { up: "fin", down: "fin", sides: "dark" },
    },
  ],
});

write(`${CONCEPT_MODELS}/runner.geo.json`, {
  identifier: "geometry.concept_runner",
  atlas: A.RUNNER,
  visibleBounds: { width: 2, height: 2, offset: [0, 0.75, 0] },
  bones: [
    {
      name: "body",
      pivot: [0, 6, 0],
      // The held item renders at `hand`; the exhaust puffs steam.
      locators: { hand: [0, 5, -3.5], exhaust: [0, 3.5, 0] },
      cubes: [
        {
          origin: [-3, 6, -3],
          size: [6, 6, 6],
          faces: { sides: "drum", north: "glass", up: "deck", down: "dark" },
        },
        { origin: [-1, 4, -1], size: [2, 2, 2], faces: { all: "dark" } },
        { origin: [-4, 3, -2], size: [1, 3, 1], faces: { all: "plate" } },
        { origin: [3, 3, -2], size: [1, 3, 1], faces: { all: "plate" } },
      ] satisfies Cube<RN>[],
    },
    {
      name: "head",
      parent: "body",
      pivot: [0, 12, 0],
      cubes: [
        {
          origin: [-4, 12, -4],
          size: [8, 5, 8],
          faces: {
            sides: "plate",
            north: { tile: "face", at: [4, 5] },
            up: "deck",
            down: "dark",
          },
        },
        { origin: [-0.5, 17, -0.5], size: [1, 3, 1], faces: { all: "dark" } },
        {
          origin: [-2, 20, -2],
          size: [4, 4, 4],
          faces: { all: { tile: "bulb", at: [6, 6] } },
        },
      ] satisfies Cube<RN>[],
    },
    runnerWing("left_wing", 3, -15),
    runnerWing("right_wing", -3, 15),
  ],
});

// ---------------------------------------------------------------------------
// Hatchling - a pet dragon the size of a cat. Scaled body with a plated
// belly, a snouted head with horn nubs, four stubby legs, a two-segment tail
// and folded wing buds. One texture per variant.
// ---------------------------------------------------------------------------

type HL = keyof typeof A.HATCHLING.tiles;

const hatchlingLeg = (name: string, x: number, z: number): Bone<HL> => ({
  name,
  parent: "body",
  pivot: [x + 1, 3, z + 1],
  cubes: [
    {
      origin: [x, 0, z],
      size: [2, 3, 2],
      faces: { sides: "scales", up: "scales", down: "belly" },
    },
  ],
});

// Wing buds: folded against the flank, tilted out so they read from the side.
const hatchlingWing = (name: string, x: number): Bone<HL> => ({
  name,
  parent: "body",
  pivot: [x < 0 ? x + 1 : x, 8, -1],
  rotation: [0, 0, x < 0 ? 35 : -35],
  cubes: [
    { origin: [x, 4, -3], size: [1, 5, 5], faces: { all: "membrane" } },
  ],
});

// Shipped: the hatchling and its egg live in packages/hatchling now.
const HATCHLING_MODELS = "packages/hatchling/resource_pack/models/entity";

write(`${HATCHLING_MODELS}/hatchling.geo.json`, {
  identifier: "geometry.hatchling",
  atlas: A.HATCHLING,
  visibleBounds: { width: 2, height: 1.5, offset: [0, 0.5, 0] },
  bones: [
    {
      name: "body",
      pivot: [0, 3, 0],
      cubes: [
        {
          origin: [-3, 3, -4],
          size: [6, 5, 9],
          faces: { sides: "scales", up: "scales", down: "belly" },
        },
      ] satisfies Cube<HL>[],
    },
    {
      name: "head",
      parent: "body",
      pivot: [0, 7, -4],
      // A puff of smoke, frost or spores, per variant.
      locators: { mouth: [0, 7, -11.5] },
      cubes: [
        {
          origin: [-3, 6, -9],
          size: [6, 5, 5],
          faces: { sides: "scales", north: "face", up: "scales", down: "belly" },
        },
        {
          origin: [-2, 6, -11],
          size: [4, 2, 2],
          faces: {
            sides: "scales",
            north: { tile: "snout", at: [6, 7] },
            up: "scales",
            down: "belly",
          },
        },
        { origin: [-3, 11, -7], size: [1, 2, 1], faces: { all: "horn" } },
        { origin: [2, 11, -7], size: [1, 2, 1], faces: { all: "horn" } },
      ] satisfies Cube<HL>[],
    },
    hatchlingLeg("front_left_leg", 1, -4),
    hatchlingLeg("front_right_leg", -3, -4),
    hatchlingLeg("back_left_leg", 1, 2),
    hatchlingLeg("back_right_leg", -3, 2),
    {
      name: "tail",
      parent: "body",
      pivot: [0, 5.5, 5],
      cubes: [
        { origin: [-1.5, 4, 5], size: [3, 3, 4], faces: { all: "scales" } },
      ] satisfies Cube<HL>[],
    },
    {
      name: "tail_tip",
      parent: "tail",
      pivot: [0, 5.5, 9],
      cubes: [
        { origin: [-1, 4.5, 9], size: [2, 2, 4], faces: { all: "scales" } },
        { origin: [-1.5, 4, 13], size: [3, 3, 1], faces: { all: "membrane" } },
      ] satisfies Cube<HL>[],
    },
    hatchlingWing("left_wing", 3),
    hatchlingWing("right_wing", -4),
  ],
});

// ---------------------------------------------------------------------------
// Messenger - a pigeon with a satchel. Body, head with beak, folded wings,
// tail and legs, each on its own bone. The satchel sits on the chest.
// ---------------------------------------------------------------------------

type MS = keyof typeof A.MESSENGER.tiles;

write(`${CONCEPT_MODELS}/messenger.geo.json`, {
  identifier: "geometry.concept_messenger",
  atlas: A.MESSENGER,
  visibleBounds: { width: 1, height: 1, offset: [0, 0.5, 0] },
  bones: [
    {
      name: "body",
      pivot: [0, 3, 0],
      // Where the carried letter shows.
      locators: { letter: [0, 4.5, -4.5] },
      cubes: [
        {
          origin: [-2.5, 3, -3],
          size: [5, 4, 7],
          faces: { sides: "feathers", north: "breast", up: "feathers", down: "breast" },
        },
        {
          origin: [-2, 3, -4],
          size: [4, 3, 1],
          faces: { all: "strap", north: { tile: "satchel", at: [6, 6] } },
        },
        { origin: [-2.5, 7, -2.5], size: [5, 0.5, 1], faces: { all: "strap" } },
      ] satisfies Cube<MS>[],
    },
    {
      name: "head",
      parent: "body",
      pivot: [0, 7, -2],
      cubes: [
        {
          origin: [-2, 7, -5],
          size: [4, 4, 4],
          faces: {
            sides: "feathers",
            north: { tile: "face", at: [6, 6] },
            up: "feathers",
            down: "breast",
          },
        },
        { origin: [-0.5, 8, -7], size: [1, 1, 2], faces: { all: "beak" } },
      ] satisfies Cube<MS>[],
    },
    {
      name: "left_wing",
      parent: "body",
      pivot: [2.5, 7, -2],
      cubes: [
        { origin: [2.5, 4, -3], size: [1, 3, 7], faces: { all: "feathers" } },
      ] satisfies Cube<MS>[],
    },
    {
      name: "right_wing",
      parent: "body",
      pivot: [-2.5, 7, -2],
      cubes: [
        { origin: [-3.5, 4, -3], size: [1, 3, 7], faces: { all: "feathers" } },
      ] satisfies Cube<MS>[],
    },
    {
      name: "tail",
      parent: "body",
      pivot: [0, 5, 4],
      cubes: [
        { origin: [-2, 4, 4], size: [4, 2, 3], faces: { all: "tail" } },
      ] satisfies Cube<MS>[],
    },
    {
      name: "left_leg",
      parent: "body",
      pivot: [1, 3, -1],
      cubes: [
        { origin: [0.5, 0, -1.5], size: [1, 3, 1], faces: { all: "beak" } },
      ] satisfies Cube<MS>[],
    },
    {
      name: "right_leg",
      parent: "body",
      pivot: [-1, 3, -1],
      cubes: [
        { origin: [-1.5, 0, -1.5], size: [1, 3, 1], faces: { all: "beak" } },
      ] satisfies Cube<MS>[],
    },
  ],
});

// ---------------------------------------------------------------------------
// Pack mule - a donkey with panniers, in vanilla horse proportions: a long
// body on four solid legs, a neck that rises forward at an angle (bone
// rotation, so the head follows), a boxy skull with a longer muzzle, ears on
// top and eyes on the cheeks. A leather harness; a burlap pannier each side
// on its own bone so an empty side can be hidden.
// ---------------------------------------------------------------------------

type ML = keyof typeof A.MULE.tiles;

const muleLeg = (name: string, x: number, z: number): Bone<ML> => ({
  name,
  parent: "body",
  pivot: [x + 1.5, 9, z + 1.5],
  cubes: [
    {
      origin: [x, 0, z],
      size: [3, 9, 3],
      faces: { sides: "fur", up: "fur", down: "dark" },
    },
  ],
});

const mulePack = (name: string, x: number): Bone<ML> => ({
  name,
  parent: "body",
  pivot: [x < 0 ? x + 4 : x, 15, 0],
  cubes: [
    { origin: [x, 7, -5], size: [4, 8, 10], faces: { all: "burlap" } },
    // A leather flap over the top of the bag.
    {
      origin: [x - 0.5, 14.5, -5.5],
      size: [5, 1.5, 11],
      faces: { all: "strap" },
    },
  ],
});

write(`${CONCEPT_MODELS}/mule.geo.json`, {
  identifier: "geometry.concept_mule",
  atlas: A.MULE,
  visibleBounds: { width: 2, height: 2, offset: [0, 0.75, 0] },
  bones: [
    {
      name: "body",
      pivot: [0, 9, 0],
      cubes: [
        {
          origin: [-5, 9, -8],
          size: [10, 9, 16],
          faces: { sides: "fur", up: "fur", down: "belly" },
        },
        // Girth: half a pixel proud of the body all round.
        { origin: [-5.5, 8.5, -1], size: [11, 10, 3], faces: { all: "strap" } },
      ] satisfies Cube<ML>[],
    },
    {
      name: "neck",
      parent: "body",
      // Authored upright, then pitched forward so the head follows.
      pivot: [0, 14, -6],
      rotation: [35, 0, 0],
      cubes: [
        {
          origin: [-2, 13, -9],
          size: [4, 10, 5],
          faces: { sides: "fur", north: "fur", up: "fur", down: "belly" },
        },
        { origin: [-1, 23, -8.5], size: [2, 1, 4], faces: { all: "mane" } },
        // Mane down the back of the neck.
        { origin: [-1, 14, -4.5], size: [2, 9, 1], faces: { all: "mane" } },
      ] satisfies Cube<ML>[],
    },
    {
      name: "head",
      parent: "neck",
      pivot: [0, 23, -6.5],
      // Bring the head back up a little from the neck's pitch.
      rotation: [-15, 0, 0],
      cubes: [
        {
          origin: [-2.5, 21, -11],
          size: [5, 5, 6],
          faces: {
            east: "cheek",
            west: "cheek",
            north: "blaze",
            south: "fur",
            up: "fur",
            down: "belly",
          },
        },
        {
          origin: [-2, 20, -16],
          size: [4, 4, 5],
          faces: {
            sides: "muzzle",
            north: { tile: "muzzle", at: [6, 6] },
            up: "fur",
            down: "belly",
          },
        },
        { origin: [1, 26, -8], size: [1, 3, 1], faces: { all: "fur" } },
        { origin: [-2, 26, -8], size: [1, 3, 1], faces: { all: "fur" } },
        // Forelock between the ears.
        { origin: [-1, 26, -10], size: [2, 1, 2], faces: { all: "mane" } },
      ] satisfies Cube<ML>[],
    },
    muleLeg("front_left_leg", 2, -7),
    muleLeg("front_right_leg", -5, -7),
    muleLeg("back_left_leg", 2, 4),
    muleLeg("back_right_leg", -5, 4),
    {
      name: "tail",
      parent: "body",
      pivot: [0, 17, 8],
      rotation: [15, 0, 0],
      cubes: [
        { origin: [-1, 10, 7.5], size: [2, 7, 2], faces: { all: "mane" } },
      ] satisfies Cube<ML>[],
    },
    mulePack("left_pack", 5),
    mulePack("right_pack", -9),
  ],
});

// ---------------------------------------------------------------------------
// Hatchling egg - the thing a hatchling comes from. An egg stacked from five
// cubes on a straw nest. The `egg` bone wobbles and hatches; `crack_1` and
// `crack_2` are alpha-tested overlay cubes a quarter pixel proud of the
// shell, shown by bone visibility as the egg's crack property advances.
// ---------------------------------------------------------------------------

type EG = keyof typeof A.EGG.tiles;

const eggShell: Cube<EG>[] = [
  { origin: [-2.5, 2, -2.5], size: [5, 2, 5], faces: { all: "shell" } },
  { origin: [-3.5, 4, -3.5], size: [7, 4, 7], faces: { all: "shell" } },
  { origin: [-3, 8, -3], size: [6, 3, 6], faces: { all: "shell" } },
  { origin: [-2, 11, -2], size: [4, 2, 4], faces: { all: "shell" } },
  { origin: [-1, 13, -1], size: [2, 1, 2], faces: { all: "shell" } },
];

// Each side reads its own quadrant of the crack tile: the middle band rows
// 3-6 and the upper band rows 0-2 of that quadrant, so a crack runs on from
// one cube to the next.
const eggCracks = (tile: EG): Cube<EG>[] => [
  {
    origin: [-3.5, 4, -3.5],
    size: [7, 4, 7],
    inflate: 0.25,
    faces: {
      north: { tile, at: [0, 3] },
      east: { tile, at: [8, 3] },
      south: { tile, at: [0, 11] },
      west: { tile, at: [8, 11] },
    },
  },
  {
    origin: [-3, 8, -3],
    size: [6, 3, 6],
    inflate: 0.25,
    faces: {
      north: { tile, at: [1, 0] },
      east: { tile, at: [9, 0] },
      south: { tile, at: [1, 8] },
      west: { tile, at: [9, 8] },
    },
  },
];

write(`${HATCHLING_MODELS}/egg.geo.json`, {
  identifier: "geometry.hatchling_egg",
  atlas: A.EGG,
  visibleBounds: { width: 1, height: 1, offset: [0, 0.5, 0] },
  bones: [
    {
      name: "nest",
      cubes: [
        { origin: [-4, 0, -4], size: [8, 2, 8], faces: { all: "straw", down: "dark" } },
        { origin: [-6, 0, -6], size: [12, 2, 2], faces: { all: "straw", down: "dark" } },
        { origin: [-6, 0, 4], size: [12, 2, 2], faces: { all: "straw", down: "dark" } },
        { origin: [4, 0, -4], size: [2, 2, 8], faces: { all: "straw", down: "dark" } },
        { origin: [-6, 0, -4], size: [2, 2, 8], faces: { all: "straw", down: "dark" } },
      ] satisfies Cube<EG>[],
    },
    {
      name: "egg",
      parent: "nest",
      pivot: [0, 2, 0],
      // Where the hatch burst and the wobble's dust attach.
      locators: { top: [0, 14, 0] },
      cubes: eggShell,
    },
    { name: "crack_1", parent: "egg", pivot: [0, 2, 0], cubes: eggCracks("crackA") },
    { name: "crack_2", parent: "egg", pivot: [0, 2, 0], cubes: eggCracks("crackB") },
  ],
});

// ===========================================================================
// Peoples (docs/design/npcs.md). One biped builder, four sets of proportions.
// Bone names are vanilla's (head, body, arms, legs) so vanilla look_at_target
// and our own walk cycle apply to all four. Accessories are their own bones
// so a job can show them by bone visibility: helmet, hat, pack, tool.
// Window sizes here must match the face painters' arguments in
// tools/textures/generate.ts (head w x h, body w x h, arm, leg).
// ===========================================================================

type BP = keyof typeof A.BIPED.tiles;

interface BipedSpec {
  file: string;
  identifier: string;
  head: [number, number, number];
  body: [number, number, number];
  arm: [number, number, number];
  leg: [number, number, number];
  beard?: boolean;
  goggles?: boolean;
  hat: "cap" | "reed" | "straw";
}

function biped(spec: BipedSpec): void {
  const [hw, hh, hd] = spec.head;
  const [bw, bh, bd] = spec.body;
  const [aw, ah, ad] = spec.arm;
  const [lw, lh, ld] = spec.leg;
  const hip = lh;
  const shoulder = hip + bh;
  const top = shoulder + hh;
  const handY = shoulder - ah;
  const rightArmX = -bw / 2 - aw;
  const armSpec = (name: string, x: number): Bone<BP> => ({
    name,
    parent: "body",
    pivot: [x + aw / 2, shoulder - 1, 0],
    cubes: [{ origin: [x, shoulder - ah, -ad / 2], size: [aw, ah, ad], faces: { sides: "sleeve", up: "sleeve", down: "hand" } }],
  });
  const legSpec = (name: string, x: number): Bone<BP> => ({
    name,
    parent: "body",
    pivot: [x + lw / 2, hip, 0],
    cubes: [{ origin: [x, 0, -ld / 2], size: [lw, lh, ld], faces: { sides: "trousers", up: "dark", down: "dark" } }],
  });
  const headCubes: Cube<BP>[] = [
    { origin: [-hw / 2, shoulder, -hd / 2], size: [hw, hh, hd], faces: { sides: "hair", north: "face", up: "hairTop", down: "skin" } },
  ];
  if (spec.beard) headCubes.push({ origin: [-hw / 2 + 1, shoulder - 3, -hd / 2 - 0.5], size: [hw - 2, 4, 1], faces: { all: "hair" } });
  if (spec.goggles) {
    headCubes.push({ origin: [-hw / 2 + 1, top - 2, -hd / 2 - 1], size: [2, 2, 1], faces: { all: "tool" } });
    headCubes.push({ origin: [hw / 2 - 3, top - 2, -hd / 2 - 1], size: [2, 2, 1], faces: { all: "tool" } });
    headCubes.push({ origin: [-hw / 2, top - 1.5, -hd / 2 - 0.5], size: [hw, 1, 1], faces: { all: "pack" } });
  }
  const hatCubes: Cube<BP>[] =
    spec.hat === "reed"
      ? [
          { origin: [-hw / 2 - 4, top - 0.5, -hd / 2 - 4], size: [hw + 8, 1, hd + 8], faces: { all: "hat" } },
          { origin: [-hw / 2 - 1, top + 0.5, -hd / 2 - 1], size: [hw + 2, 2, hd + 2], faces: { all: "hat" } },
          { origin: [-1.5, top + 2.5, -1.5], size: [3, 2, 3], faces: { all: "hat" } },
        ]
      : spec.hat === "straw"
        ? [
            { origin: [-hw / 2 - 3, top - 0.5, -hd / 2 - 3], size: [hw + 6, 1, hd + 6], faces: { all: "hat" } },
            { origin: [-hw / 2 + 1, top + 0.5, -hd / 2 + 1], size: [hw - 2, 3, hd - 2], faces: { all: "hat" } },
          ]
        : [
            { origin: [-hw / 2 - 1, top - 0.5, -hd / 2 - 1], size: [hw + 2, 1, hd + 2], faces: { all: "pack" } },
            { origin: [-hw / 2 + 1, top + 0.5, -hd / 2 + 1], size: [hw - 2, 3, hd - 2], faces: { all: "pack" } },
          ];
  write(`${VILLAGES_MODELS}/${spec.file}.geo.json`, {
    identifier: spec.identifier,
    atlas: A.BIPED,
    visibleBounds: { width: 2, height: 3, offset: [0, 1, 0] },
    bones: [
      {
        name: "body",
        pivot: [0, hip, 0],
        cubes: [{ origin: [-bw / 2, hip, -bd / 2], size: [bw, bh, bd], faces: { north: "shirt", south: "shirtBack", east: "shirtSide", west: "shirtSide", up: "dark", down: "dark" } }],
      },
      { name: "head", parent: "body", pivot: [0, shoulder, 0], locators: { eyes: [0, shoulder + hh * 0.55, -hd / 2] }, cubes: headCubes },
      armSpec("left_arm", bw / 2),
      armSpec("right_arm", rightArmX),
      legSpec("left_leg", 0),
      legSpec("right_leg", -lw),
      // Accessories, hidden or shown per job.
      {
        name: "helmet",
        parent: "head",
        pivot: [0, shoulder, 0],
        cubes: [
          { origin: [-hw / 2 - 0.5, shoulder + hh * 0.5, -hd / 2 - 0.5], size: [hw + 1, hh * 0.5 + 0.5, hd + 1], faces: { sides: "helmet", up: "helmet", down: "dark" } },
          { origin: [-1, shoulder + hh * 0.3, -hd / 2 - 1], size: [2, hh * 0.3, 1], faces: { all: "helmet" } },
        ],
      },
      { name: "hat", parent: "head", pivot: [0, shoulder, 0], cubes: hatCubes },
      {
        name: "pack",
        parent: "body",
        pivot: [0, hip, 0],
        cubes: [{ origin: [-bw / 2 + 1, hip + 1, bd / 2], size: [bw - 2, bh - 2, 3], faces: { all: "pack" } }],
      },
      {
        name: "tool",
        parent: "right_arm",
        pivot: [rightArmX + aw / 2, shoulder - 1, 0],
        cubes: [
          { origin: [rightArmX + aw / 2 - 0.5, handY - 6, -ad / 2 - 1.5], size: [1, 8, 1], faces: { all: "toolWood" } },
          { origin: [rightArmX + aw / 2 - 2, handY - 8, -ad / 2 - 2.5], size: [4, 2.5, 3], faces: { all: "tool" } },
        ],
      },
    ],
  });
}

biped({ file: "stonefolk", identifier: "geometry.villages_stonefolk", head: [8, 7, 8], body: [10, 10, 5], arm: [4, 10, 4], leg: [4, 8, 4], beard: true, hat: "cap" });
// Tall and lean, not a stick: a player-width body on legs a block long.
biped({ file: "reedfolk", identifier: "geometry.villages_reedfolk", head: [7, 8, 7], body: [8, 14, 4], arm: [3, 14, 3], leg: [4, 14, 4], hat: "reed" });
biped({ file: "tinker", identifier: "geometry.villages_tinker", head: [7, 6, 7], body: [6, 8, 4], arm: [3, 8, 3], leg: [3, 7, 3], goggles: true, hat: "cap" });
biped({ file: "tallfolk", identifier: "geometry.villages_tallfolk", head: [8, 8, 8], body: [8, 13, 4], arm: [4, 13, 4], leg: [4, 13, 4], hat: "straw" });

// ---------------------------------------------------------------------------
// Villages job post - the block a person is anchored to. A wooden post with
// a plaque, centred on x/z, standing on y = 0 (docs/design/villages.md §4).
// ---------------------------------------------------------------------------

type PB = keyof typeof A.POST.tiles;

// The waypoint a person walks to (engine/walk.ts): an entity with nothing to
// draw. One bone, no cubes, so the client has a geometry to bind.
write("packages/villages/resource_pack/models/entity/waypoint.geo.json", {
  identifier: "geometry.villages_waypoint",
  atlas: A.POST,
  visibleBounds: { width: 0.1, height: 0.1, offset: [0, 0, 0] },
  bones: [{ name: "root", pivot: [0, 0, 0], cubes: [] }],
});

write("packages/villages/resource_pack/models/blocks/post.geo.json", {
  identifier: "geometry.villages_post",
  atlas: A.POST,
  visibleBounds: { width: 1, height: 1, offset: [0, 0.5, 0] },
  bones: [
    {
      name: "post",
      pivot: [0, 0, 0],
      cubes: [
        { origin: [-2, 0, -2], size: [4, 12, 4], faces: { all: "post" } } as Cube<PB>,
        { origin: [-6, 7, -3], size: [12, 5, 1], faces: { all: "plaque" } } as Cube<PB>,
        { origin: [-6, 7, 2], size: [12, 5, 1], faces: { all: "plaque" } } as Cube<PB>,
      ],
    },
  ],
});
