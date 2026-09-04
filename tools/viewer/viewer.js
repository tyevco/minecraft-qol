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

// ---------------------------------------------------------------------------
// Structures. A building preview from tools/structures is a sparse list of
// blocks with a colour per palette entry. It is drawn as one mesh: a quad for
// every block face that is not against another block, coloured by the block
// and shaded by which way it faces, so a cottage reads as a cottage without
// any textures. A cutaway slider hides the layers above a height so the
// inside can be seen.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Structures: coloured or vanilla-textured blocks.
//
// The build step fetches the vanilla block textures Mojang publishes in
// bedrock-samples into vanilla/ and writes vanilla.json, a block name to six
// face textures (the game's own mapping from blocks.json). Without it every
// block is a flat-coloured cube. Shading is the game's: top 1.0, north and
// south 0.8, east and west 0.6, bottom 0.5, no lights.
// ---------------------------------------------------------------------------

const SHADE = { up: 1, down: 0.5, north: 0.8, south: 0.8, east: 0.6, west: 0.6 };
const FACE_NEIGHBOUR = { up: [0, 1, 0], down: [0, -1, 0], north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };
const FACE_NAMES = Object.keys(SHADE);

let vanilla = null; // false when the build had no network; the set otherwise
const vanillaTextures = new Map();

async function loadVanilla() {
  if (vanilla !== null) return vanilla;
  try {
    const res = await fetch("vanilla.json");
    vanilla = res.ok ? await res.json() : false;
  } catch {
    vanilla = false;
  }
  return vanilla;
}

async function vanillaTexture(file) {
  if (vanillaTextures.has(file)) return vanillaTextures.get(file);
  const t = await loadTexture(file);
  // Animated textures are vertical strips of frames; show the first.
  const { width, height } = t.image;
  if (height > width) {
    t.repeat.set(1, width / height);
    t.offset.set(0, 1 - width / height);
  }
  vanillaTextures.set(file, t);
  return t;
}

/**
 * The corners and texture coordinates of one face of a box given in
 * sixteenths, the way block models are. Textures are 16 px per block, so a
 * partial box takes the matching part of the texture, as fences and panes do
 * in the game. `uv` overrides that with a pixel rectangle [u0, v0, u1, v1]
 * measured from the texture's top-left.
 */
function boxFace(face, [x0, y0, z0, x1, y1, z1], uv) {
  const P = (x, y, z) => [x / 16, y / 16, z / 16];
  let corners, uvs;
  switch (face) {
    case "up":
      corners = [P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)];
      uvs = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]].map(([u, v]) => [u, v]);
      break;
    case "down":
      corners = [P(x0, y0, z1), P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1)];
      uvs = [[x0, z1], [x0, z0], [x1, z0], [x1, z1]];
      break;
    case "north":
      corners = [P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), P(x0, y0, z0)];
      uvs = [[16 - x1, 16 - y0], [16 - x1, 16 - y1], [16 - x0, 16 - y1], [16 - x0, 16 - y0]];
      break;
    case "south":
      corners = [P(x0, y0, z1), P(x0, y1, z1), P(x1, y1, z1), P(x1, y0, z1)];
      uvs = [[x0, 16 - y0], [x0, 16 - y1], [x1, 16 - y1], [x1, 16 - y0]];
      break;
    case "east":
      corners = [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)];
      uvs = [[16 - z1, 16 - y0], [16 - z1, 16 - y1], [16 - z0, 16 - y1], [16 - z0, 16 - y0]];
      break;
    case "west":
      corners = [P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)];
      uvs = [[z0, 16 - y0], [z0, 16 - y1], [z1, 16 - y1], [z1, 16 - y0]];
      break;
  }
  if (uv) {
    // Map the face's own extent onto the given rectangle.
    const us = uvs.map((c) => c[0]), vs = uvs.map((c) => c[1]);
    const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
    uvs = uvs.map(([u, v]) => [uv[0] + ((u - u0) / (u1 - u0 || 1)) * (uv[2] - uv[0]), uv[1] + ((v - v0) / (v1 - v0 || 1)) * (uv[3] - uv[1])]);
  }
  return { corners, uvs: uvs.map(([u, v]) => [u / 16, 1 - v / 16]) };
}

const LEFT = { north: "west", west: "south", south: "east", east: "north" }; // counter-clockwise seen from above
const RIGHT = { north: "east", east: "south", south: "west", west: "north" };
const OPPOSITE = { north: "south", south: "north", east: "west", west: "east" };
const WEIRDO = ["east", "west", "south", "north"];
const BED_DIRECTION = ["south", "west", "north", "east"];
const LADDER_FACING = { 2: "north", 3: "south", 4: "west", 5: "east" };

/** The half of a block on a side, in sixteenths: [x0, z0, x1, z1]. */
function half(side) {
  switch (side) {
    case "north": return [0, 0, 16, 8];
    case "south": return [0, 8, 16, 16];
    case "west": return [0, 0, 8, 16];
    case "east": return [8, 0, 16, 16];
  }
}
function intersect(a, b) {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
}

/**
 * The shape of a stair from its neighbours, as the game computes it: a
 * perpendicular stair in front makes an outer corner, one behind makes an
 * inner corner. `facing` is the high side. Returns the top-half footprints.
 */
function stairTop(facing, upsideDown, neighbour) {
  const isStair = (n) => n && n.def.shape === "stairs" && !!n.states.upside_down_bit === upsideDown;
  const facingOf = (n) => WEIRDO[n.states.weirdo_direction ?? 0];
  const sameStair = (side) => {
    const n = neighbour(side);
    return isStair(n) && facingOf(n) === facing;
  };
  const front = neighbour(facing);
  if (isStair(front)) {
    const f = facingOf(front);
    if (f !== facing && f !== OPPOSITE[facing] && !sameStair(OPPOSITE[f])) return [intersect(half(facing), half(f))];
  }
  const back = neighbour(OPPOSITE[facing]);
  if (isStair(back)) {
    const f = facingOf(back);
    if (f !== facing && f !== OPPOSITE[facing] && !sameStair(f)) return [half(facing), intersect(half(OPPOSITE[facing]), half(f))];
  }
  return [half(facing)];
}

/**
 * The boxes a block draws, by shape, in sixteenths. `connect(face)` says
 * whether the neighbour on that side is something to join to; `states` are
 * the block's; `neighbour(face)` gives the block on that side. Each box may
 * limit which faces it draws and override textures per face.
 */
function blockBoxes(shape, connect, hanging, states = {}, neighbour = () => undefined) {
  const box = (b, extra = {}) => ({ box: b, ...extra });
  switch (shape) {
    case "stairs": {
      const facing = WEIRDO[states.weirdo_direction ?? 0];
      const up = !!states.upside_down_bit;
      const out = [box(up ? [0, 8, 0, 16, 16, 16] : [0, 0, 0, 16, 8, 16])];
      for (const [x0, z0, x1, z1] of stairTop(facing, up, neighbour)) out.push(box(up ? [x0, 0, z0, x1, 8, z1] : [x0, 8, z0, x1, 16, z1]));
      return out;
    }
    case "slab":
      return [box(states["minecraft:vertical_half"] === "top" ? [0, 8, 0, 16, 16, 16] : [0, 0, 0, 16, 8, 16])];
    case "door": {
      const facing = states["minecraft:cardinal_direction"] ?? "south";
      const panel = { north: [0, 0, 0, 16, 16, 3], south: [0, 0, 13, 16, 16, 16], west: [0, 0, 0, 3, 16, 16], east: [13, 0, 0, 16, 16, 16] }[facing];
      return [box(panel)];
    }
    case "bed": {
      // The mattress, with the head end's pillow drawn white by the shader below.
      const out = [box([0, 3, 0, 16, 9, 16])];
      const facing = BED_DIRECTION[states.direction ?? 0];
      const legs = states.head_piece_bit ? half(facing) : half(OPPOSITE[facing]);
      // Legs at the outer end.
      const [x0, z0, x1, z1] = legs;
      const cx = x0 === 0 && x1 === 16;
      if (cx) out.push(box([0, 0, z0 === 0 ? 0 : 13, 3, 3, z0 === 0 ? 3 : 16]), box([13, 0, z0 === 0 ? 0 : 13, 16, 3, z0 === 0 ? 3 : 16]));
      else out.push(box([x0 === 0 ? 0 : 13, 0, 0, x0 === 0 ? 3 : 16, 3, 3]), box([x0 === 0 ? 0 : 13, 0, 13, x0 === 0 ? 3 : 16, 3, 16]));
      return out;
    }
    case "ladder": {
      const facing = LADDER_FACING[states.facing_direction ?? 3] ?? "south";
      const panel = { south: [0, 0, 0, 16, 16, 1], north: [0, 0, 15, 16, 16, 16], east: [0, 0, 0, 1, 16, 16], west: [15, 0, 0, 16, 16, 16] }[facing];
      return [box(panel, { faces: [facing] })];
    }
    case "gate": {
      const facing = states["minecraft:cardinal_direction"] ?? "south";
      if (facing === "north" || facing === "south")
        return [box([0, 5, 7, 2, 16, 9]), box([14, 5, 7, 16, 16, 9]), box([2, 6, 7, 14, 9, 9]), box([2, 12, 7, 14, 15, 9])];
      return [box([7, 5, 0, 9, 16, 2]), box([7, 5, 14, 9, 16, 16]), box([7, 6, 2, 9, 9, 14]), box([7, 12, 2, 9, 15, 14])];
    }
    case "water":
      return [box([0, 0, 0, 16, 14, 16], { faces: ["up"] })];
    case "pane": {
      const e = connect("east"), w = connect("west"), n = connect("north"), s = connect("south");
      const out = [];
      const edge = { tex: { up: "east", down: "east" } };
      if (e || w) out.push(box([w ? 0 : 7, 0, 7, e ? 16 : 9, 16, 9], edge));
      if (n || s) out.push(box([7, 0, n ? 0 : 7, 9, 16, s ? 16 : 9], edge));
      if (!out.length) out.push(box([7, 0, 7, 9, 16, 9], edge));
      return out;
    }
    case "fence": {
      const out = [box([6, 0, 6, 10, 16, 10])];
      if (connect("east")) out.push(box([10, 12, 7, 16, 15, 9]), box([10, 6, 7, 16, 9, 9]));
      if (connect("west")) out.push(box([0, 12, 7, 6, 15, 9]), box([0, 6, 7, 6, 9, 9]));
      if (connect("north")) out.push(box([7, 12, 0, 9, 15, 6]), box([7, 6, 0, 9, 9, 6]));
      if (connect("south")) out.push(box([7, 12, 10, 9, 15, 16]), box([7, 6, 10, 9, 9, 16]));
      return out;
    }
    case "wall": {
      const out = [box([4, 0, 4, 12, 16, 12])];
      if (connect("east")) out.push(box([12, 0, 5, 16, 14, 11]));
      if (connect("west")) out.push(box([0, 0, 5, 4, 14, 11]));
      if (connect("north")) out.push(box([5, 0, 0, 11, 14, 4]));
      if (connect("south")) out.push(box([5, 0, 12, 11, 14, 16]));
      return out;
    }
    case "lantern": {
      // lantern.png: body sides at (0,2)-(6,9), body top at (0,0)-(6,2), cap at (1,9)-(5,11), chain at (11,1)-(14,7).
      const y = hanging ? 1 : 0;
      const out = [
        box([5, y, 5, 11, y + 7, 11], { uv: { north: [0, 2, 6, 9], south: [0, 2, 6, 9], east: [0, 2, 6, 9], west: [0, 2, 6, 9], up: [0, 0, 6, 2], down: [0, 0, 6, 2] } }),
        box([6, y + 7, 6, 10, y + 9, 10], { uv: { north: [1, 9, 5, 11], south: [1, 9, 5, 11], east: [1, 9, 5, 11], west: [1, 9, 5, 11], up: [1, 9, 5, 11], down: [1, 9, 5, 11] } }),
      ];
      if (hanging) out.push(box([7, 10, 7, 9, 16, 9], { uv: { north: [11, 1, 14, 7], south: [11, 1, 14, 7], east: [11, 1, 14, 7], west: [11, 1, 14, 7] }, faces: ["north", "south", "east", "west"] }));
      return out;
    }
    case "campfire": {
      const log = { tex: { up: "down", down: "down", north: "down", south: "down", east: "down", west: "down" } };
      return [
        box([1, 0, 0, 5, 4, 16], log),
        box([11, 0, 0, 15, 4, 16], log),
        box([0, 3, 1, 16, 7, 5], log),
        box([0, 3, 11, 16, 7, 15], log),
        // The fire: two crossed cut-out quads.
        box([8, 3, 2, 8, 16, 14], { faces: ["east", "west"], tex: { east: "up", west: "up" } }),
        box([2, 3, 8, 14, 16, 8], { faces: ["north", "south"], tex: { north: "up", south: "up" } }),
      ];
    }
    case "chest":
      return [box([1, 0, 1, 15, 14, 15])];
    case "anvil":
      return [
        box([2, 0, 2, 14, 4, 14]),
        box([4, 4, 4, 12, 5, 12]),
        box([6, 5, 6, 10, 10, 10]),
        box([3, 10, 0, 13, 16, 16]),
      ];
    default:
      return [box([0, 0, 0, 16, 16, 16])];
  }
}

/** A block name's vanilla entry, or a stand-in cube in the preview colour. */
function blockDef(name, color, states = {}) {
  const v = vanilla && vanilla.blocks[name];
  if (!v) return { shape: name === "minecraft:water" ? "water" : "cube", flat: true, color };
  // A log on its side shows its end grain on the faces its axis points at.
  const axis = states.pillar_axis;
  if (axis === "x" || axis === "z") {
    const ends = axis === "x" ? ["east", "west"] : ["north", "south"];
    const faces = {};
    for (const f of FACE_NAMES) faces[f] = ends.includes(f) ? v.faces.up : v.faces.north;
    return { ...v, faces };
  }
  return v;
}

function buildStructure(preview, maxY) {
  const occ = new Map();
  for (const [x, y, z, i] of preview.blocks) if (y < maxY) occ.set(`${x},${y},${z}`, i);
  const [sx, , sz] = preview.size;
  const defs = preview.palette.map((p) => blockDef(p.name, p.color, p.states));
  const at = (x, y, z) => {
    const i = occ.get(`${x},${y},${z}`);
    return i === undefined ? undefined : { name: preview.palette[i].name, def: defs[i], states: preview.palette[i].states ?? {} };
  };
  const joinable = (b) => b && ["cube", "cutout", "pane", "fence", "wall"].includes(b.def.shape);

  // One bucket per texture (or one flat bucket for coloured cubes).
  const buckets = new Map();
  const bucket = (key) => {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { pos: [], uv: [], col: [], idx: [] }));
    return b;
  };

  for (const [key, i] of occ) {
    const [x, y, z] = key.split(",").map(Number);
    const { name, def } = { name: preview.palette[i].name, def: defs[i] };
    const states = preview.palette[i].states ?? {};
    const shape = def.shape;
    const neighbour = (face) => {
      const d = FACE_NEIGHBOUR[face];
      return at(x + d[0], y + d[1], z + d[2]);
    };
    const connect = (face) => {
      const n = neighbour(face);
      if (!n) return false;
      if (shape === "pane") return n.def.shape === "pane" || n.def.shape === "cube" || n.def.shape === "cutout";
      return joinable(n) && n.def.shape !== "pane";
    };
    const above = neighbour("up");
    const hanging = shape === "lantern" && above && (above.def.shape === "cube" || above.def.shape === "cutout");
    const boxes = blockBoxes(shape, connect, hanging, states, neighbour);
    const faces = shape === "door" && states.upper_block_bit && def.variants?.upper ? def.variants.upper : def.faces;
    const tint = def.tint ?? 0xffffff;
    const tr = ((tint >> 16) & 255) / 255, tg = ((tint >> 8) & 255) / 255, tb = (tint & 255) / 255;
    const fr = def.flat ? ((def.color >> 16) & 255) / 255 : 1, fg = def.flat ? ((def.color >> 8) & 255) / 255 : 1, fb = def.flat ? (def.color & 255) / 255 : 1;

    for (const b of boxes) {
      for (const face of b.faces ?? FACE_NAMES) {
        // Cull faces between full cubes; glass against the same glass; water against water.
        if (shape === "cube" || shape === "cutout" || shape === "water") {
          const n = neighbour(face);
          if (n) {
            if (n.def.shape === "cube" && shape !== "water") continue;
            if (n.name === name) continue;
          }
        }
        const texFace = b.tex?.[face] ?? face;
        const file = def.flat ? "flat" : faces[texFace];
        const bk = bucket(shape === "water" ? `water|${file}` : file);
        const { corners, uvs } = boxFace(face, b.box, b.uv?.[face]);
        const shade = SHADE[face];
        const base = bk.pos.length / 3;
        for (let k = 0; k < 4; k++) {
          const c = corners[k];
          bk.pos.push(x + c[0] - sx / 2, y + c[1], z + c[2] - sz / 2);
          bk.uv.push(uvs[k][0], uvs[k][1]);
          bk.col.push(fr * tr * shade, fg * tg * shade, fb * tb * shade);
        }
        bk.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        // An overlay layer, a hair outside the face so it draws on top.
        const over = def.overlay?.faces[face];
        if (over && !def.flat) {
          const ob = bucket(over);
          const d = FACE_NEIGHBOUR[face];
          const ot = def.overlay.tint;
          const or = ((ot >> 16) & 255) / 255, og = ((ot >> 8) & 255) / 255, ob_ = (ot & 255) / 255;
          const obase = ob.pos.length / 3;
          for (let k = 0; k < 4; k++) {
            const c = corners[k];
            ob.pos.push(x + c[0] - sx / 2 + d[0] * 0.002, y + c[1] + d[1] * 0.002, z + c[2] - sz / 2 + d[2] * 0.002);
            ob.uv.push(uvs[k][0], uvs[k][1]);
            ob.col.push(or * shade, og * shade, ob_ * shade);
          }
          ob.idx.push(obase, obase + 1, obase + 2, obase, obase + 2, obase + 3);
        }
      }
    }
  }

  const root = new THREE.Group();
  for (const [key, bk] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(bk.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(bk.uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(bk.col, 3));
    geo.setIndex(bk.idx);
    const water = key.startsWith("water|");
    const file = water ? key.slice(6) : key;
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    if (file !== "flat") {
      material.map = vanillaTextures.get(file);
      material.alphaTest = water ? 0 : 0.5;
    }
    if (water) {
      material.transparent = true;
      material.opacity = 0.8;
      material.depthWrite = false;
    }
    root.add(new THREE.Mesh(geo, material));
  }
  return root;
}

async function showStructure(entry) {
  const preview = await (await fetch(entry.structure)).json();
  await loadVanilla();
  if (vanilla)
    for (const p of preview.palette) {
      const v = vanilla.blocks[p.name];
      if (v) {
        const files = [...Object.values(v.faces), ...Object.values(v.overlay?.faces ?? {})];
        for (const alt of Object.values(v.variants ?? {})) files.push(...Object.values(alt));
        for (const file of files) await vanillaTexture(file);
      }
    }
  let root = buildStructure(preview, preview.size[1]);
  scene.add(root);
  frame(root, "block");
  current = { entry, root, groups: new Map() };

  const slider = document.getElementById("cutaway");
  const label = document.getElementById("cutaway-label");
  slider.min = 1;
  slider.max = preview.size[1];
  slider.value = preview.size[1];
  const relabel = () => (label.textContent = `showing ${slider.value} of ${preview.size[1]} layers`);
  relabel();
  slider.oninput = () => {
    scene.remove(root);
    root = buildStructure(preview, Number(slider.value));
    scene.add(root);
    current.root = root;
    relabel();
  };

  const materials = Object.entries(preview.materials)
    .sort((a, b) => b[1] - a[1])
    .map(([n, c]) => `${c} ${n.replace("minecraft:", "")}`)
    .join(", ");
  const blocks = preview.blocks.length;
  const missing = vanilla ? preview.palette.filter((p) => !vanilla.blocks[p.name]).map((p) => p.name.replace("minecraft:", "")) : [];
  const textures = !vanilla
    ? "coloured cubes: the build had no vanilla textures"
    : missing.length
      ? `vanilla textures; no texture for: ${missing.join(", ")}`
      : "vanilla textures";
  document.getElementById("info").textContent =
    `${entry.pack} · building\n${preview.size.join("×")}, ${blocks} blocks · ${textures}\n\n${preview.notes}\n\nmaterials: ${materials}`;
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
  for (const e of emitters) scene.remove(e.points);
  emitters = [];
  animator = null;
  const isStructure = entry.kind === "structure";
  document.getElementById("structure").hidden = document.getElementById("structure-h").hidden = !isStructure;
  for (const id of ["texture", "bones", "animation", "animation-h"]) document.getElementById(id).hidden = isStructure;
  for (const h of document.querySelectorAll("aside h2")) if (["Texture", "Bones"].includes(h.textContent)) h.hidden = isStructure;
  for (const b of document.querySelectorAll("#models button")) b.classList.toggle("active", b.dataset.id === entry.id);
  location.hash = entry.id;
  if (isStructure) return showStructure(entry);
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
