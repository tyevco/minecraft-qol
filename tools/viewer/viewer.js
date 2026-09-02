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
    groups.set(bone.name, { group: g, pivot });
  }
  for (const bone of geo.bones) {
    const { group, pivot } = groups.get(bone.name);
    const parent = bone.parent ? groups.get(bone.parent) : undefined;
    if (parent) {
      group.position.set(pivot[0] - parent.pivot[0], pivot[1] - parent.pivot[1], pivot[2] - parent.pivot[2]);
      parent.group.add(group);
    } else root.add(group);
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
    (entry.notes ? `\n\n${entry.notes}` : "");

  for (const b of document.querySelectorAll("#models button")) b.classList.toggle("active", b.dataset.id === entry.id);
  location.hash = entry.id;
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
    for (const e of emitters) e.update(dt);
    controls.update();
    renderer.render(scene, camera);
  });
}

main().catch((e) => {
  document.getElementById("info").textContent = `failed: ${e}`;
  console.error(e);
});
