import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  IDENTITY,
  JOB_OUTFIT,
  OUTFIT_BONES,
  apply,
  bounds,
  boneTransforms,
  isPosable,
  multiply,
  poseQuads,
  readGeometry,
  rotationMatrix,
  tPose,
  visibleBones,
  type Bone,
  type Geometry,
  type Vec3,
} from "../pose";

const ROOT = resolve(__dirname, "../../..");
const geometry = (path: string): Geometry =>
  readGeometry(JSON.parse(readFileSync(resolve(ROOT, path), "utf8")));

const STONEFOLK = "packages/villages/resource_pack/models/entity/stonefolk.geo.json";
const HATCHLING = "packages/hatchling/resource_pack/models/entity/hatchling.geo.json";
const GRAVESTONE = "packages/graves/resource_pack/models/entity/gravestone.geo.json";
const MULE = "concepts/entities/models/mule.geo.json";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("rotationMatrix", () => {
  it("is the identity for no rotation", () => {
    expect(rotationMatrix(undefined)).toEqual(IDENTITY);
    expect(rotationMatrix([0, 0, 0])).toEqual(IDENTITY);
  });

  it("rolls +z counter-clockwise in the xy plane", () => {
    // The convention tools/viewer/viewer.js uses: z is not negated, so a
    // point below the pivot swings to +x. That is what puts a left arm out.
    const [x, y, z] = apply(rotationMatrix([0, 0, 90]), [0, -9, 0]);
    close(x, 9);
    close(y, 0);
    close(z, 0);
  });

  it("negates x and y, as Blockbench's Bedrock codec does", () => {
    // +x pitches the model's front down: a point in front (-z) goes down.
    const pitched = apply(rotationMatrix([90, 0, 0]), [0, 0, -4]);
    close(pitched[1], -4);
    // +y yaws to the model's left: a point in front swings to +x.
    const yawed = apply(rotationMatrix([0, 90, 0]), [0, 0, -4]);
    close(yawed[0], 4);
  });

  it("composes as Rz . Ry . Rx", () => {
    const combined = rotationMatrix([30, 20, 10]);
    const stepwise = multiply(
      multiply(rotationMatrix([0, 0, 10]), rotationMatrix([0, 20, 0])),
      rotationMatrix([30, 0, 0]),
    );
    const v: Vec3 = [1, 2, 3];
    apply(combined, v).forEach((c, i) => close(c, apply(stepwise, v)[i]!));
  });
});

describe("isPosable", () => {
  it("accepts a model with limb bones", () => {
    expect(isPosable(geometry(STONEFOLK))).toBe(true);
    expect(isPosable(geometry(HATCHLING))).toBe(true);
    expect(isPosable(geometry(MULE))).toBe(true);
  });

  it("rejects a prop with nothing to pose", () => {
    expect(isPosable(geometry(GRAVESTONE))).toBe(false);
  });
});

describe("tPose", () => {
  it("takes the arms out to opposite sides and clears everything else", () => {
    expect(tPose({ name: "left_arm" })).toEqual([0, 0, 90]);
    expect(tPose({ name: "right_arm" })).toEqual([0, 0, -90]);
    expect(tPose({ name: "left_wing" })).toEqual([0, 0, 90]);
    expect(tPose({ name: "right_wing" })).toEqual([0, 0, -90]);
    expect(tPose({ name: "head" })).toEqual([0, 0, 0]);
  });

  it("clears a rotation the model was authored with", () => {
    // The pack mule's neck leans forward 35 degrees; the reference pose is the
    // bind pose, so the sheet shows the rig rather than the model's attitude.
    const neck = geometry(MULE).bones!.find((b) => b.name === "neck")!;
    expect(neck.rotation).toEqual([35, 0, 0]);
    expect(tPose(neck)).toEqual([0, 0, 0]);
  });

  it("puts each arm out on its own side of the body", () => {
    const geo = geometry(STONEFOLK);
    const armX = (name: string) => {
      const quads = poseQuads(geo, { visible: new Set([name]) });
      const box = bounds(quads);
      return { min: box.min[0], max: box.max[0] };
    };
    const body = bounds(poseQuads(geo, { visible: new Set(["body"]) }));
    // Display space mirrors x, so the model's left arm is at negative x.
    const left = armX("left_arm");
    const right = armX("right_arm");
    expect(left.min).toBeLessThan(body.min[0]);
    expect(right.max).toBeGreaterThan(body.max[0]);
    // Horizontal: an arm is now wider than it is tall.
    const arm = bounds(poseQuads(geo, { visible: new Set(["left_arm"]) }));
    expect(arm.max[0] - arm.min[0]).toBeGreaterThan(arm.max[1] - arm.min[1]);
  });

  it("keeps the feet on the ground", () => {
    const geo = geometry(STONEFOLK);
    const box = bounds(poseQuads(geo, { visible: visibleBones(geo, undefined) }));
    close(box.min[1], 0);
  });
});

describe("boneTransforms", () => {
  it("carries a child bone with its parent", () => {
    const geo = geometry(STONEFOLK);
    // The tool hangs off the right arm, so the T-pose swings it out too.
    const posed = boneTransforms(geo, tPose);
    const rest = boneTransforms(geo, () => [0, 0, 0]);
    const tool = geo.bones!.find((b) => b.name === "tool")!;
    expect(tool.parent).toBe("right_arm");
    expect(posed.get("tool")!.rotation).not.toEqual(rest.get("tool")!.rotation);
    // A bone off the body is untouched by the arms.
    expect(posed.get("head")!.translation).toEqual(rest.get("head")!.translation);
  });

  it("places a root bone at its own pivot", () => {
    const geo = geometry(STONEFOLK);
    const body = geo.bones!.find((b) => b.name === "body")!;
    expect(boneTransforms(geo, () => [0, 0, 0]).get("body")!.translation).toEqual(body.pivot);
  });

  it("rejects a cycle rather than looping", () => {
    const cyclic: Geometry = {
      description: { identifier: "geometry.test" },
      bones: [
        { name: "a", parent: "b" },
        { name: "b", parent: "a" },
      ],
    };
    expect(() => boneTransforms(cyclic, () => [0, 0, 0])).toThrow(/cycle/);
  });
});

describe("visibleBones", () => {
  it("draws only the outfit the job wears", () => {
    const geo = geometry(STONEFOLK);
    for (const [job, worn] of Object.entries(JOB_OUTFIT)) {
      const visible = visibleBones(geo, job);
      for (const bone of OUTFIT_BONES)
        expect(visible.has(bone), `${job} / ${bone}`).toBe(worn.includes(bone));
    }
  });

  it("hides every outfit bone when the texture names no job", () => {
    const visible = visibleBones(geometry(STONEFOLK), undefined);
    for (const bone of OUTFIT_BONES) expect(visible.has(bone)).toBe(false);
    expect(visible.has("body")).toBe(true);
    expect(visible.has("left_arm")).toBe(true);
  });

  it("leaves a model with no outfit bones whole", () => {
    const geo = geometry(MULE);
    const visible = visibleBones(geo, undefined);
    expect(visible.size).toBe(geo.bones!.length);
    expect(visible.has("left_pack")).toBe(true);
  });
});

describe("poseQuads", () => {
  it("emits one quad per cube face that has a UV window", () => {
    const geo = geometry(GRAVESTONE);
    const faces = (geo.bones ?? []).flatMap((b: Bone) => b.cubes ?? []).reduce(
      (n, cube) => n + Object.keys(cube.uv ?? {}).length,
      0,
    );
    expect(poseQuads(geo, { pose: () => [0, 0, 0] })).toHaveLength(faces);
  });

  it("mirrors x, as the game does", () => {
    // docs/README.md: custom geometry renders with +x to the world's west.
    const geo: Geometry = {
      description: { identifier: "geometry.test" },
      bones: [
        {
          name: "root",
          pivot: [0, 0, 0],
          cubes: [{ origin: [2, 0, 0], size: [1, 1, 1], uv: { north: { uv: [0, 0], uv_size: [1, 1] } } }],
        },
      ],
    };
    const box = bounds(poseQuads(geo, { pose: () => [0, 0, 0] }));
    expect(box.min[0]).toBe(-3);
    expect(box.max[0]).toBe(-2);
  });

  it("grows a cube by its inflate on every side", () => {
    const cube = { origin: [0, 0, 0] as Vec3, size: [2, 2, 2] as Vec3, uv: { north: { uv: [0, 0] as [number, number], uv_size: [2, 2] as [number, number] } } };
    const make = (inflate?: number): Geometry => ({
      description: { identifier: "geometry.test" },
      bones: [{ name: "root", pivot: [0, 0, 0], cubes: [{ ...cube, inflate }] }],
    });
    const plain = bounds(poseQuads(make(), { pose: () => [0, 0, 0] }));
    const fat = bounds(poseQuads(make(0.5), { pose: () => [0, 0, 0] }));
    expect(fat.max[1] - fat.min[1]).toBeCloseTo(plain.max[1] - plain.min[1] + 1, 6);
  });

  it("spreads the hatchling's wings past its body", () => {
    const geo = geometry(HATCHLING);
    const body = bounds(poseQuads(geo, { visible: new Set(["body"]) }));
    const wings = bounds(poseQuads(geo, { visible: new Set(["left_wing", "right_wing"]) }));
    expect(wings.min[0]).toBeLessThan(body.min[0]);
    expect(wings.max[0]).toBeGreaterThan(body.max[0]);
  });
});
