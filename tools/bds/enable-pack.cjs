/**
 * Enable a pack in the headless test world.
 *
 * A newly added pack is deployed into development_behavior_packs but is NOT in
 * the world until its UUID is listed in the world's pack files - so it loads as
 * if it did not exist, with no error to say why. This adds it.
 *
 *   node tools/bds/enable-pack.cjs hatchling
 *
 * Reads the UUIDs out of the pack's own manifests, so there is nothing to keep
 * in sync by hand. Re-running is safe.
 */
const fs = require("fs");
const path = require("path");

const pack = process.argv[2];
if (!pack) {
  console.error("usage: node tools/bds/enable-pack.cjs <pack-dir-name>");
  process.exit(2);
}

const REPO = path.resolve(__dirname, "..", "..");
const WORLD =
  process.env.BDS_WORLD ?? "C:/bds/server/worlds/qoltest";

/** The pack's source folder, which is not always named like the pack. */
function sourceDir() {
  const direct = path.join(REPO, "packages", pack);
  if (fs.existsSync(direct)) return direct;
  throw new Error(`no packages/${pack}`);
}

function uuidOf(manifest) {
  if (!fs.existsSync(manifest)) return undefined;
  return JSON.parse(fs.readFileSync(manifest, "utf8")).header.uuid;
}

const src = sourceDir();
const targets = [
  ["world_behavior_packs.json", uuidOf(path.join(src, "behavior_pack", "manifest.json"))],
  ["world_resource_packs.json", uuidOf(path.join(src, "resource_pack", "manifest.json"))],
];

for (const [file, uuid] of targets) {
  if (!uuid) continue;
  const p = path.join(WORLD, file);
  const list = JSON.parse(fs.readFileSync(p, "utf8"));
  if (list.some((e) => e.pack_id === uuid)) {
    console.log(`already enabled in ${file}: ${uuid}`);
    continue;
  }
  list.push({ pack_id: uuid, version: [0, 1, 0] });
  fs.writeFileSync(p, JSON.stringify(list, null, 2));
  console.log(`enabled ${pack} in ${file} (${list.length} packs)`);
}
