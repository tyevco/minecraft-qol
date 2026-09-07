/**
 * An orthographic software renderer for posed Bedrock geometry.
 *
 * No browser, no GPU, no dependency: a sheet has to build in CI the same way
 * the textures do. Each quad from tools/sheets/pose.ts is rasterised as two
 * triangles with a depth buffer, sampled nearest-neighbour off the entity's
 * texture so the pixels stay the pixels the artist painted.
 *
 * Three views, in display space (x already mirrored, y up, model front at -z):
 *
 *   front   camera in front of the model, its left on your right
 *   right   camera off the model's right, the model facing screen right
 *   top     camera overhead, sharing the front view's left-right, so the
 *           model's front is at the bottom - third-angle projection
 */
import { Canvas, type Color, rgba } from "../textures/canvas";
import type { Image } from "./decode";
import type { Quad, Vec3 } from "./pose";

export type ViewName = "front" | "right" | "top";

interface View {
  readonly name: ViewName;
  readonly label: string;
  /** Away from the camera, into the scene. */
  readonly forward: Vec3;
  readonly up: Vec3;
  /** forward x up. */
  readonly right: Vec3;
  /** What the two screen axes measure, for the panel caption. */
  readonly axes: readonly [horizontal: string, vertical: string];
}

export const VIEWS: readonly View[] = [
  { name: "front", label: "FRONT", forward: [0, 0, 1], up: [0, 1, 0], right: [-1, 0, 0], axes: ["WIDTH", "HEIGHT"] },
  { name: "right", label: "RIGHT", forward: [-1, 0, 0], up: [0, 1, 0], right: [0, 0, -1], axes: ["DEPTH", "HEIGHT"] },
  { name: "top", label: "TOP", forward: [0, -1, 0], up: [0, 0, 1], right: [-1, 0, 0], axes: ["WIDTH", "DEPTH"] },
];

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** A key light from above, in front and a little to the left. */
const KEY: Vec3 = (() => {
  const v: Vec3 = [-0.35, 0.78, -0.52];
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
})();
const AMBIENT = 0.72;
const DIFFUSE = 0.28;

export interface PanelOptions {
  /** Pixels per model unit; an integer keeps the texture pixels square. */
  scale: number;
  width: number;
  height: number;
  /** Display-space point that lands at the panel's centre, per screen axis. */
  centre: { horizontal: number; vertical: number };
  background: Color;
  grid: { fine: Color; coarse: Color; origin: Color };
  outline: Color;
}

/**
 * Render one view of a posed model onto a fresh panel: grid, model, outline.
 */
export function renderPanel(
  quads: readonly Quad[],
  texture: Image,
  view: View,
  options: PanelOptions,
): Canvas {
  const { width, height, scale } = options;
  const canvas = new Canvas(width, height);
  canvas.fill(0, 0, width, height, options.background);

  // Screen position of a display-space point, in fractional pixels.
  const originX = width / 2 - options.centre.horizontal * scale;
  const originY = height / 2 + options.centre.vertical * scale;
  const project = (p: Vec3): [number, number, number] => [
    originX + dot(p, view.right) * scale,
    originY - dot(p, view.up) * scale,
    dot(p, view.forward),
  ];

  drawGrid(canvas, view, options, originX, originY);

  const depth = new Float64Array(width * height).fill(Infinity);
  const covered = new Uint8Array(width * height);
  for (const quad of quads) {
    const screen = quad.corners.map(project);
    const shade = shadeOf(quad.corners);
    triangle(canvas, depth, covered, texture, shade, [screen[0]!, screen[1]!, screen[2]!], [quad.uvs[0], quad.uvs[1], quad.uvs[2]]);
    triangle(canvas, depth, covered, texture, shade, [screen[0]!, screen[2]!, screen[3]!], [quad.uvs[0], quad.uvs[2], quad.uvs[3]]);
  }

  outline(canvas, depth, covered, options.outline);
  return canvas;
}

/** Flat shade from the quad's own normal; the texture carries the rest. */
function shadeOf(corners: readonly Vec3[]): number {
  const a = corners[0]!;
  const b = corners[1]!;
  const c = corners[2]!;
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(n[0], n[1], n[2]);
  if (length === 0) return AMBIENT;
  // Faces are drawn from both sides, so light the side that faces the light.
  const lambert = Math.abs(dot([n[0] / length, n[1] / length, n[2] / length], KEY));
  return AMBIENT + DIFFUSE * lambert;
}

/**
 * A grid in model units, anchored on the model origin: every 2 units faint,
 * every 16 (one block) stronger, and the origin's own axes stronger still.
 */
function drawGrid(canvas: Canvas, view: View, options: PanelOptions, originX: number, originY: number): void {
  const { width, height, scale, grid } = options;
  const step = 2 * scale;
  const block = 16 * scale;
  for (let x = originX % step; x < width; x += step) {
    const u = Math.round(x);
    if (u < 0) continue;
    const onBlock = Math.abs(((u - originX) % block + block) % block) < 0.5;
    canvas.fill(u, 0, 1, height, onBlock ? grid.coarse : grid.fine);
  }
  for (let y = originY % step; y < height; y += step) {
    const v = Math.round(y);
    if (v < 0) continue;
    const onBlock = Math.abs(((v - originY) % block + block) % block) < 0.5;
    canvas.fill(0, v, width, 1, onBlock ? grid.coarse : grid.fine);
  }
  canvas.fill(Math.round(originX), 0, 1, height, grid.origin);
  canvas.fill(0, Math.round(originY), width, 1, grid.origin);
  void view;
}

/** Rasterise one textured triangle with a depth test. */
function triangle(
  canvas: Canvas,
  depth: Float64Array,
  covered: Uint8Array,
  texture: Image,
  shade: number,
  points: readonly number[][],
  uvs: readonly (readonly [number, number])[],
): void {
  const [p0, p1, p2] = points as [number[], number[], number[]];
  const area = (p1[0]! - p0[0]!) * (p2[1]! - p0[1]!) - (p2[0]! - p0[0]!) * (p1[1]! - p0[1]!);
  if (Math.abs(area) < 1e-9) return; // edge-on: contributes nothing

  const minX = Math.max(0, Math.floor(Math.min(p0[0]!, p1[0]!, p2[0]!)));
  const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(p0[0]!, p1[0]!, p2[0]!)));
  const minY = Math.max(0, Math.floor(Math.min(p0[1]!, p1[1]!, p2[1]!)));
  const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(p0[1]!, p1[1]!, p2[1]!)));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      // Barycentric weights; orthographic projection makes them affine, so
      // depth and UV interpolate linearly with no perspective divide.
      const w0 = ((p1[0]! - px) * (p2[1]! - py) - (p2[0]! - px) * (p1[1]! - py)) / area;
      const w1 = ((p2[0]! - px) * (p0[1]! - py) - (p0[0]! - px) * (p2[1]! - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;

      const z = w0 * p0[2]! + w1 * p1[2]! + w2 * p2[2]!;
      const index = y * canvas.width + x;
      if (z >= depth[index]!) continue;

      const u = w0 * uvs[0]![0] + w1 * uvs[1]![0] + w2 * uvs[2]![0];
      const v = w0 * uvs[0]![1] + w1 * uvs[1]![1] + w2 * uvs[2]![1];
      const tx = Math.min(texture.width - 1, Math.max(0, Math.floor(u)));
      const ty = Math.min(texture.height - 1, Math.max(0, Math.floor(v)));
      const t = (ty * texture.width + tx) * 4;
      if (texture.rgba[t + 3]! < 128) continue; // alpha_test, as in game

      depth[index] = z;
      covered[index] = 1;
      const clamp = (c: number) => Math.min(255, Math.round(c * shade));
      canvas.set(x, y, (clamp(texture.rgba[t]!) << 16) | (clamp(texture.rgba[t + 1]!) << 8) | clamp(texture.rgba[t + 2]!));
    }
  }
}

/**
 * A technical-drawing edge pass over the depth buffer: a line around the
 * silhouette, and a line where two parts overlap. Without it an arm in front
 * of a body of the same colour disappears into it.
 */
function outline(canvas: Canvas, depth: Float64Array, covered: Uint8Array, color: Color): void {
  const { width, height } = canvas;
  const line = rgba(color);
  const edge = new Uint8Array(width * height);
  const STEP = 0.75; // model units of depth that count as a separate part
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let mark = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (covered[i] && !covered[j]) mark = true; // silhouette
        else if (covered[i] && covered[j] && depth[i]! - depth[j]! > STEP) mark = true; // behind a nearer part
      }
      if (mark) edge[i] = 1;
    }
  }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (edge[y * width + x]) {
        const c = canvas.get(x, y);
        canvas.set(x, y, (Math.round(c.r * 0.35 + line.r * 0.65) << 16) | (Math.round(c.g * 0.35 + line.g * 0.65) << 8) | Math.round(c.b * 0.35 + line.b * 0.65));
      }
}
