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
    controls.update();
    renderer.render(scene, camera);
  });
}

main().catch((e) => {
  document.getElementById("info").textContent = `failed: ${e}`;
  console.error(e);
});
