// Bedrock geometry viewer. Reads catalog.json (written by tools/viewer/build.ts),
// builds each .geo.json's cubes with per-face UVs onto its atlas, and lets you
// orbit, swap texture variants and toggle bones.
//
// Conventions follow Blockbench's Bedrock codec so models look as they do in
// game: x is mirrored, cube and bone rotations about their pivots with x and y
// negated, units are 1/16 of a block.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const FACES = ["north", "south", "east", "west", "up", "down"];

// Corners TL, TR, BR, BL as seen from outside the cube. Same table as the
// verification renderer used while the models were authored.
function corners(o, s, face) {
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

function euler(rot) {
  const d = Math.PI / 180;
  return new THREE.Euler(-(rot?.[0] ?? 0) * d, -(rot?.[1] ?? 0) * d, (rot?.[2] ?? 0) * d, "ZYX");
}

function inflate(o, s, amount) {
  if (!amount) return [o, s];
  return [o.map((v) => v - amount), s.map((v) => v + 2 * amount)];
}

/** Build one bone's mesh: all its cubes, vertices relative to the bone pivot. */
function buildBone(bone, texW, texH, material) {
  const pos = [], uv = [], idx = [];
  const pivot = bone.pivot ?? [0, 0, 0];
  for (const cube of bone.cubes ?? []) {
    const [o, s] = inflate(cube.origin, cube.size, cube.inflate);
    const rot = cube.rotation ? euler(cube.rotation) : null;
    const cp = cube.pivot ?? [0, 0, 0];
    for (const face of FACES) {
      const f = cube.uv?.[face];
      if (!f) continue;
      const [u0, v0] = f.uv;
      const [w, h] = f.uv_size;
      const uvs = [[u0, v0], [u0 + w, v0], [u0 + w, v0 + h], [u0, v0 + h]];
      const base = pos.length / 3;
      corners(o, s, face).forEach((c, i) => {
        const v = new THREE.Vector3(c[0], c[1], c[2]);
        if (rot) v.sub(new THREE.Vector3(...cp)).applyEuler(rot).add(new THREE.Vector3(...cp));
        v.sub(new THREE.Vector3(...pivot));
        pos.push(v.x, v.y, v.z);
        uv.push(uvs[i][0] / texW, 1 - uvs[i][1] / texH);
      });
      idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

function buildModel(geo, texture) {
  const desc = geo.description;
  const material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
  const root = new THREE.Group();
  root.scale.set(-1 / 16, 1 / 16, 1 / 16); // Bedrock's x runs the other way.
  const groups = new Map();
  for (const bone of geo.bones) {
    const g = new THREE.Group();
    g.name = bone.name;
    const pivot = bone.pivot ?? [0, 0, 0];
    g.position.set(...pivot);
    if (bone.rotation) g.rotation.copy(euler(bone.rotation));
    g.add(buildBone(bone, desc.texture_width, desc.texture_height, material));
    groups.set(bone.name, { group: g, pivot, rest: bone.rotation ?? [0, 0, 0] });
  }
  for (const bone of geo.bones) {
    const { group, pivot } = groups.get(bone.name);
    const parent = bone.parent ? groups.get(bone.parent) : undefined;
    if (parent) {
      group.position.set(pivot[0] - parent.pivot[0], pivot[1] - parent.pivot[1], pivot[2] - parent.pivot[2]);
      parent.group.add(group);
    } else root.add(group);
    groups.get(bone.name).restPos = group.position.clone();
  }
  return { root, groups };
}

// ---------------------------------------------------------------------------
// Particles. A small interpreter for the subset of Bedrock's particle
// components the packs use: box emitter shape, instant or steady rate, once or
// looping lifetime, lifetime and speed as numbers or math.random(a, b),
// dynamic motion (acceleration + drag), billboard size, and a colour gradient
// over particle age. Enough to preview the effect; not a full Molang engine.
// ---------------------------------------------------------------------------

function molangNumber(v, fallback = 0) {
  if (typeof v === "number") return () => v;
  if (typeof v !== "string") return () => fallback;
  const m = /math\.random\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(v);
  if (m) {
    const a = parseFloat(m[1]), b = parseFloat(m[2]);
    return () => a + Math.random() * (b - a);
  }
  const n = parseFloat(v);
  return () => (Number.isFinite(n) ? n : fallback);
}

function parseGradient(tint) {
  const g = tint?.color?.gradient;
  if (!g) return null;
  return Object.entries(g)
    .map(([k, hex]) => {
      const h = hex.replace("#", "");
      const argb = h.length === 8 ? h : "FF" + h;
      return {
        t: parseFloat(k),
        a: parseInt(argb.slice(0, 2), 16) / 255,
        r: parseInt(argb.slice(2, 4), 16) / 255,
        g: parseInt(argb.slice(4, 6), 16) / 255,
        b: parseInt(argb.slice(6, 8), 16) / 255,
      };
    })
    .sort((x, y) => x.t - y.t);
}

function sampleGradient(stops, t) {
  if (!stops || stops.length === 0) return { r: 1, g: 1, b: 1, a: 1 };
  if (t <= stops[0].t) return stops[0];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const p = stops[i - 1], q = stops[i];
      const f = (t - p.t) / Math.max(1e-6, q.t - p.t);
      return { r: p.r + (q.r - p.r) * f, g: p.g + (q.g - p.g) * f, b: p.b + (q.b - p.b) * f, a: p.a + (q.a - p.a) * f };
    }
  }
  return stops[stops.length - 1];
}

class Emitter {
  constructor(def, texture, origin, retriggerEvery) {
    const c = def.particle_effect.components;
    const rp = def.particle_effect.description.basic_render_parameters ?? {};
    this.origin = origin; // THREE.Vector3, world space
    this.shape = c["minecraft:emitter_shape_box"] ?? { offset: [0, 0, 0], half_dimensions: [0, 0, 0], direction: [0, 1, 0] };
    this.instant = c["minecraft:emitter_rate_instant"]?.num_particles ?? 0;
    this.steady = c["minecraft:emitter_rate_steady"] ?? null;
    this.loop = c["minecraft:emitter_lifetime_looping"] ?? null;
    this.once = c["minecraft:emitter_lifetime_once"] ?? null;
    this.lifetime = molangNumber(c["minecraft:particle_lifetime_expression"]?.max_lifetime, 1);
    this.speed = molangNumber(c["minecraft:particle_initial_speed"], 0);
    const dyn = c["minecraft:particle_motion_dynamic"] ?? {};
    this.accel = new THREE.Vector3(...(dyn.linear_acceleration ?? [0, 0, 0]));
    this.drag = dyn.linear_drag_coefficient ?? 0;
    this.size = (c["minecraft:particle_appearance_billboard"]?.size ?? [0.1, 0.1])[0];
    this.gradient = parseGradient(c["minecraft:particle_appearance_tinting"]);
    this.retriggerEvery = retriggerEvery ?? 0.5;
    this.clock = 0;
    this.spawnDebt = 0;
    this.particles = [];
    this.max = 256;

    this.positions = new Float32Array(this.max * 3);
    this.colors = new Float32Array(this.max * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.colors, 4));
    g.setDrawRange(0, 0);
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        map: texture,
        size: this.size * 2,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        blending: rp.material === "particles_add" ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    this.points.frustumCulled = false;
  }

  spawn() {
    if (this.particles.length >= this.max) return;
    const h = this.shape.half_dimensions;
    const off = this.shape.offset ?? [0, 0, 0];
    const pos = new THREE.Vector3(
      this.origin.x + off[0] + (Math.random() * 2 - 1) * h[0],
      this.origin.y + off[1] + (Math.random() * 2 - 1) * h[1],
      this.origin.z + off[2] + (Math.random() * 2 - 1) * h[2],
    );
    let dir;
    if (Array.isArray(this.shape.direction)) dir = new THREE.Vector3(...this.shape.direction);
    else dir = pos.clone().sub(this.origin).add(new THREE.Vector3(0, 0.01, 0));
    if (this.shape.direction === "inwards") dir.negate();
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    dir.normalize().multiplyScalar(this.speed());
    this.particles.push({ pos, vel: dir, age: 0, life: Math.max(0.05, this.lifetime()) });
  }

  update(dt) {
    this.clock += dt;
    // Emission
    if (this.steady) {
      let active = true;
      if (this.loop) {
        const period = (this.loop.active_time ?? 1) + (this.loop.sleep_time ?? 0);
        active = this.clock % period < (this.loop.active_time ?? 1);
      }
      if (active) {
        this.spawnDebt += (this.steady.spawn_rate ?? 1) * dt;
        while (this.spawnDebt >= 1 && this.particles.length < (this.steady.max_particles ?? this.max)) {
          this.spawn();
          this.spawnDebt -= 1;
        }
      }
    } else if (this.instant) {
      // A once-emitter is something a script re-fires; re-trigger on a cadence.
      if (this.clock >= this.retriggerEvery) {
        this.clock -= this.retriggerEvery;
        for (let i = 0; i < this.instant; i++) this.spawn();
      }
    }
    // Integration
    const keep = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vel.addScaledVector(this.accel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - this.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      keep.push(p);
    }
    this.particles = keep;
    // Upload
    for (let i = 0; i < keep.length; i++) {
      const p = keep[i];
      this.positions.set([p.pos.x, p.pos.y, p.pos.z], i * 3);
      const c = sampleGradient(this.gradient, p.age / p.life);
      this.colors.set([c.r, c.g, c.b, c.a], i * 4);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, keep.length);
  }
}

// ---------------------------------------------------------------------------
// Animations. A Molang evaluator for the subset the generated animation files
// use (arithmetic, comparisons, ?:, math.*, query.* and variable.* reads,
// query.property('name')), keyframe interpolation, and a player that runs
// either one animation or an animation controller's state machine. Rotations
// add to the bone's rest rotation, positions to its rest position, scales
// multiply, as in game. Trig is in degrees, as in Molang.
// ---------------------------------------------------------------------------

function tokenize(src) {
  const out = [];
  const re = /\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z_][\w.]*)|('[^']*')|(<=|>=|==|!=|&&|\|\||[-+*\/()<>!?:,]))/gy;
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1] !== undefined) out.push({ t: "num", v: parseFloat(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "id", v: m[2].toLowerCase() });
    else if (m[3] !== undefined) out.push({ t: "str", v: m[3].slice(1, -1) });
    else out.push({ t: "op", v: m[4] });
  }
  return out;
}

const MATH = {
  sin: (a) => Math.sin((a * Math.PI) / 180),
  cos: (a) => Math.cos((a * Math.PI) / 180),
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,
  sqrt: Math.sqrt,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  mod: (a, b) => a % b,
  clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  random: (a, b) => a + Math.random() * (b - a),
  pi: Math.PI,
};

/** Compile a Molang string to (ctx) => number. Numbers compile to constants. */
function molang(src) {
  if (typeof src === "number") return () => src;
  if (typeof src !== "string") return () => 0;
  const toks = tokenize(src.replace(/;\s*$/, ""));
  let i = 0;
  const peek = () => toks[i];
  const take = (v) => {
    const t = toks[i++];
    if (v !== undefined && (!t || t.v !== v)) throw new Error(`molang: expected ${v} in "${src}"`);
    return t;
  };
  const primary = () => {
    const t = take();
    if (!t) throw new Error(`molang: unexpected end of "${src}"`);
    if (t.t === "num") return () => t.v;
    if (t.t === "str") return () => t.v;
    if (t.t === "op" && t.v === "(") { const e = ternary(); take(")"); return e; }
    if (t.t === "op" && t.v === "-") { const e = unary(); return (c) => -e(c); }
    if (t.t === "op" && t.v === "!") { const e = unary(); return (c) => (e(c) ? 0 : 1); }
    if (t.t === "id") {
      const [ns, ...rest] = t.v.split(".");
      const name = rest.join(".");
      if (peek()?.v === "(") {
        take("(");
        const args = [];
        if (peek()?.v !== ")") { args.push(ternary()); while (peek()?.v === ",") { take(","); args.push(ternary()); } }
        take(")");
        if ((ns === "math" || ns === "m") && typeof MATH[name] === "function") return (c) => MATH[name](...args.map((a) => a(c)));
        if ((ns === "query" || ns === "q") && name === "property") return (c) => c.property[args[0](c)] ?? 0;
        return () => 0;
      }
      if (ns === "math" && name in MATH) return () => MATH[name];
      if (ns === "query" || ns === "q") return (c) => c.query[name] ?? 0;
      if (ns === "variable" || ns === "v") return (c) => c.variable[name] ?? 0;
      return () => 0;
    }
    throw new Error(`molang: unexpected ${t.v} in "${src}"`);
  };
  const unary = () => primary();
  const binary = (next, ops) => () => {
    let l = next();
    while (peek()?.t === "op" && ops[peek().v]) { const f = ops[take().v]; const r = next(); const ll = l; l = (c) => f(ll(c), r(c)); }
    return l;
  };
  const mul = binary(unary, { "*": (a, b) => a * b, "/": (a, b) => (b === 0 ? 0 : a / b) });
  const add = binary(mul, { "+": (a, b) => a + b, "-": (a, b) => a - b });
  const cmp = binary(add, { "<": (a, b) => +(a < b), ">": (a, b) => +(a > b), "<=": (a, b) => +(a <= b), ">=": (a, b) => +(a >= b) });
  const eq = binary(cmp, { "==": (a, b) => +(a === b), "!=": (a, b) => +(a !== b) });
  const and = binary(eq, { "&&": (a, b) => +(!!a && !!b) });
  const or = binary(and, { "||": (a, b) => +(!!a || !!b) });
  const ternary = () => {
    const cond = or();
    if (peek()?.v !== "?") return cond;
    take("?");
    const a = ternary();
    take(":");
    const b = ternary();
    return (c) => (cond(c) ? a(c) : b(c));
  };
  const e = ternary();
  if (i < toks.length) throw new Error(`molang: trailing ${toks[i].v} in "${src}"`);
  return e;
}

/** A vec3 channel: a static triple of expressions, or keyframes of them. */
function compileChannel(v) {
  if (Array.isArray(v)) { const fs = v.map(molang); return (c) => fs.map((f) => f(c)); }
  const keys = Object.entries(v)
    .map(([t, val]) => ({ t: parseFloat(t), fs: (Array.isArray(val) ? val : val.post ?? val.pre ?? [0, 0, 0]).map(molang) }))
    .sort((a, b) => a.t - b.t);
  return (c) => {
    const t = c.query.anim_time;
    if (t <= keys[0].t) return keys[0].fs.map((f) => f(c));
    for (let k = 1; k < keys.length; k++) {
      if (t <= keys[k].t) {
        const p = keys[k - 1], q = keys[k];
        const f = (t - p.t) / Math.max(1e-6, q.t - p.t);
        return p.fs.map((pf, j) => { const a = pf(c), b = q.fs[j](c); return a + (b - a) * f; });
      }
    }
    return keys[keys.length - 1].fs.map((f) => f(c));
  };
}

class Animator {
  /**
   * @param anims  the file's `animations` object, keyed by full identifier
   * @param controllers  the file's `animation_controllers` object, or null
   * @param groups  bone name -> { group, rest, restPos } from buildModel
   */
  constructor(anims, controllers, groups) {
    this.groups = groups;
    this.anims = new Map();
    for (const [id, def] of Object.entries(anims)) {
      const key = id.split(".").pop();
      const bones = Object.entries(def.bones ?? {}).map(([bone, ch]) => ({
        bone,
        rotation: ch.rotation ? compileChannel(ch.rotation) : null,
        position: ch.position ? compileChannel(ch.position) : null,
        scale: ch.scale ? compileChannel(ch.scale) : null,
      }));
      this.anims.set(key, { id, key, loop: def.loop === true, length: def.animation_length ?? 0, bones, start: 0 });
    }
    const ctl = controllers ? Object.values(controllers)[0] : null;
    this.controller = ctl
      ? {
          initial: ctl.initial_state ?? "default",
          states: Object.fromEntries(Object.entries(ctl.states).map(([name, st]) => [name, {
            animations: st.animations ?? [],
            transitions: (st.transitions ?? []).flatMap((tr) => Object.entries(tr).map(([to, cond]) => ({ to, cond: molang(cond) }))),
          }])),
        }
      : null;
    this.ctx = { query: { life_time: 0, anim_time: 0, modified_move_speed: 0, modified_distance_moved: 0, is_on_ground: 1, hurt_time: 0, all_animations_finished: 0 }, variable: {}, property: {} };
    this.moving = false;
    this.airborne = false;
    this.mode = this.controller ? "controller" : [...this.anims.keys()][0];
    this.state = this.controller?.initial;
    this.stateSince = 0;
  }

  /** Animation keys for the UI: the controller first if there is one. */
  get modes() { return [...(this.controller ? ["controller"] : []), ...this.anims.keys()]; }

  setMode(mode) { this.mode = mode; this.state = this.controller?.initial; this.enter(this.mode === "controller" ? this.controller.states[this.state].animations : [mode]); }

  enter(keys) { for (const k of keys) { const a = this.anims.get(k); if (a) a.start = this.ctx.query.life_time; } this.stateSince = this.ctx.query.life_time; }

  active() {
    if (this.mode !== "controller") return [this.mode];
    return this.controller.states[this.state].animations;
  }

  update(dt) {
    const q = this.ctx.query;
    q.life_time += dt;
    q.modified_move_speed = this.moving ? 1 : 0;
    q.modified_distance_moved += (this.moving ? 4.3 : 0) * dt; // blocks per second at a walk
    q.is_on_ground = this.airborne ? 0 : 1;
    q.all_animations_finished = this.active().every((k) => { const a = this.anims.get(k); return !a || a.loop || a.length === 0 || q.life_time - a.start >= a.length; }) ? 1 : 0;

    if (this.mode === "controller") {
      const st = this.controller.states[this.state];
      for (const tr of st.transitions) {
        if (tr.cond(this.ctx)) { this.state = tr.to; this.enter(this.controller.states[tr.to].animations); break; }
      }
    } else {
      // Previewing a one-shot on its own: replay it with a short rest between runs.
      const a = this.anims.get(this.mode);
      if (a && !a.loop && a.length > 0 && q.life_time - a.start > a.length + 0.6) a.start = q.life_time;
    }

    // Rest pose, then every active animation added on top.
    for (const { group, rest, restPos } of this.groups.values()) {
      group.rotation.copy(euler(rest));
      group.position.copy(restPos);
      group.scale.set(1, 1, 1);
    }
    for (const key of this.active()) {
      const a = this.anims.get(key);
      if (!a) continue;
      const local = q.life_time - a.start;
      q.anim_time = a.loop && a.length > 0 ? local % a.length : a.length > 0 ? Math.min(local, a.length) : local;
      for (const b of a.bones) {
        const g = this.groups.get(b.bone);
        if (!g) continue;
        if (b.rotation) {
          const [x, y, z] = b.rotation(this.ctx);
          const cur = g.group.rotation;
          const d = Math.PI / 180;
          g.group.rotation.set(cur.x - x * d, cur.y - y * d, cur.z + z * d, "ZYX");
        }
        if (b.position) { const [x, y, z] = b.position(this.ctx); g.group.position.x += x; g.group.position.y += y; g.group.position.z += z; }
        if (b.scale) { const [x, y, z] = b.scale(this.ctx); g.group.scale.x *= x; g.group.scale.y *= y; g.group.scale.z *= z; }
      }
    }
  }
}

/** World-space point for a catalogue particle entry, honouring the x mirror. */
function particleOrigin(entry, geo, spec) {
  let at = spec.at;
  if (spec.locator) {
    for (const bone of geo.bones) {
      const l = bone.locators?.[spec.locator];
      if (l) at = l;
    }
  }
  if (!at) return new THREE.Vector3(0, 0.5, 0);
  return new THREE.Vector3(-at[0] / 16, at[1] / 16, at[2] / 16);
}

let emitters = [];
const clock = new THREE.Clock();

// ---------------------------------------------------------------------------

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1c22);
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(2, 4, 3);
scene.add(sun);
const grid = new THREE.GridHelper(4, 16, 0x3a3c48, 0x2a2b33);
scene.add(grid);

let current = null; // { entry, geo, textures: Map<name, THREE.Texture>, root, groups }
let animator = null;
// Screenshot tooling can freeze the clock and step it: viewer.pause(); viewer.step(1 / 12).
let paused = false;
window.viewer = {
  pause: () => (paused = true),
  resume: () => (paused = false),
  step: (dt) => { advance(dt); renderer.render(scene, camera); },
  get animator() { return animator; },
};
const loader = new THREE.TextureLoader();

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

function frame(root, kind) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.5);
  controls.target.copy(center);
  // Look at the front: entities face -z, directional blocks +z.
  const front = kind === "entity" ? -1 : 1;
  camera.position.set(center.x + radius * 1.6, center.y + radius * 1.1, center.z + front * radius * 1.6);
  camera.near = radius / 100;
  camera.far = radius * 100;
  camera.updateProjectionMatrix();
  grid.position.y = box.min.y - 0.001;
}

async function loadTexture(url) {
  const t = await loader.loadAsync(url);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

async function show(entry) {
  if (current) scene.remove(current.root);
  const geoFile = await (await fetch(entry.geometry)).json();
  const geo = geoFile["minecraft:geometry"][0];
  const textures = new Map();
  for (const [name, url] of Object.entries(entry.textures)) textures.set(name, await loadTexture(url));
  const first = textures.keys().next().value;
  const { root, groups } = buildModel(geo, textures.get(first));
  scene.add(root);
  current = { entry, geo, textures, root, groups };
  frame(root, entry.kind);

  // Particles
  for (const e of emitters) scene.remove(e.points);
  emitters = [];
  for (const spec of entry.particles ?? []) {
    try {
      const def = await (await fetch(spec.definition)).json();
      const tex = await loadTexture(spec.texture);
      const em = new Emitter(def, tex, particleOrigin(entry, geo, spec), spec.every);
      scene.add(em.points);
      emitters.push(em);
    } catch (err) {
      console.warn("particle failed", spec, err);
    }
  }

  // Animations
  animator = null;
  const animBox = document.getElementById("animation");
  const animSel = document.getElementById("anim");
  const stateLine = document.getElementById("anim-state");
  animSel.innerHTML = "";
  stateLine.textContent = "";
  if (entry.animations) {
    try {
      const file = await (await fetch(entry.animations.file)).json();
      const ctl = entry.animations.controller ? await (await fetch(entry.animations.controller)).json() : null;
      animator = new Animator(file.animations, ctl?.animation_controllers ?? null, groups);
      for (const mode of animator.modes) {
        const o = document.createElement("option");
        o.value = mode;
        o.textContent = mode === "controller" ? "controller (auto)" : mode;
        animSel.appendChild(o);
      }
      animSel.onchange = () => animator.setMode(animSel.value);
      const moving = document.getElementById("moving");
      const airborne = document.getElementById("airborne");
      moving.checked = airborne.checked = false;
      moving.onchange = () => (animator.moving = moving.checked);
      airborne.onchange = () => (animator.airborne = airborne.checked);
    } catch (err) {
      console.warn("animation failed", entry.animations, err);
    }
  }
  animBox.hidden = document.getElementById("animation-h").hidden = !animator;

  // Texture variants
  const sel = document.getElementById("texture");
  sel.innerHTML = "";
  for (const name of textures.keys()) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  }
  sel.onchange = () => {
    const t = textures.get(sel.value);
    root.traverse((m) => { if (m.isMesh) { m.material.map = t; m.material.needsUpdate = true; } });
  };

  // Bones
  const bones = document.getElementById("bones");
  bones.innerHTML = "";
  const defaults = new Set(entry.defaultVisible ?? [...groups.keys()]);
  for (const [name, { group }] of groups) {
    group.visible = defaults.has(name);
    const label = document.createElement("label");
    label.className = "row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = group.visible;
    cb.onchange = () => (group.visible = cb.checked);
    label.append(cb, document.createTextNode(name));
    bones.appendChild(label);
  }

  const cubes = geo.bones.reduce((n, b) => n + (b.cubes?.length ?? 0), 0);
  document.getElementById("info").textContent =
    `${entry.pack} · ${entry.kind}\n${geo.description.identifier}\n` +
    `${geo.bones.length} bones, ${cubes} cubes\natlas ${geo.description.texture_width}×${geo.description.texture_height}` +
    (entry.particles?.length ? `\nparticles: ${entry.particles.map((p) => p.effect).join(", ")}` : "") +
    (animator ? `\nanimations: ${[...animator.anims.keys()].join(", ")}` : "") +
    (entry.notes ? `\n\n${entry.notes}` : "");

  for (const b of document.querySelectorAll("#models button")) b.classList.toggle("active", b.dataset.id === entry.id);
  location.hash = entry.id;
}

function advance(dt) {
  for (const e of emitters) e.update(dt);
  if (animator) {
    animator.update(dt);
    const line = document.getElementById("anim-state");
    line.textContent = animator.mode === "controller" ? `state: ${animator.state}` : "";
  }
}

async function main() {
  const catalog = await (await fetch("catalog.json")).json();
  const list = document.getElementById("models");
  for (const entry of catalog.models) {
    const b = document.createElement("button");
    b.dataset.id = entry.id;
    b.innerHTML = `${entry.name}<small>${entry.pack}</small>`;
    b.onclick = () => show(entry);
    list.appendChild(b);
  }
  const byHash = () => catalog.models.find((m) => m.id === location.hash.slice(1));
  await show(byHash() ?? catalog.models[0]);
  // Deep links: #pipe, #turret_head. A hash change is not a navigation, so listen.
  window.addEventListener("hashchange", () => {
    const m = byHash();
    if (m && m.id !== current?.entry.id) show(m);
  });
  renderer.setAnimationLoop(() => {
    resize();
    const dt = Math.min(0.05, clock.getDelta());
    if (!paused) advance(dt);
    controls.update();
    renderer.render(scene, camera);
  });
}

main().catch((e) => {
  document.getElementById("info").textContent = `failed: ${e}`;
  console.error(e);
});
