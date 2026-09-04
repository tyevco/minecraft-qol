/**
 * Enable one or more packs in the headless test world.
 *
 * A newly added pack is deployed into development_behavior_packs but is NOT in
 * the world until its UUID is listed in the world's pack files - so it loads as
 * if it did not exist, with no error to say why. This adds it.
 *
 *   node tools/bds/enable-pack.cjs hatchling
 *   node tools/bds/enable-pack.cjs --all
 *
 * Reads the UUIDs and versions out of the pack's own manifests, so there is
 * nothing to keep in sync by hand. The pack files are created if the world does
 * not have them yet, which is the case for a world BDS generated itself.
 * Re-running is safe: an entry already present is refreshed, never duplicated.
 */
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const WORLD = process.env.BDS_WORLD ?? "C:/bds/server/worlds/qoltest";

const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: node tools/bds/enable-pack.cjs <pack-dir-name>... | --all");
  process.exit(2);
}

const packs = args.includes("--all")
  ? fs
      .readdirSync(path.join(REPO, "packages"))
      .filter((d) => fs.existsSync(path.join(REPO, "packages", d, "behavior_pack", "manifest.json")))
  : args;

/** The pack's source folder, which is not always named like the pack. */
function sourceDir(pack) {
  const direct = path.join(REPO, "packages", pack);
  if (fs.existsSync(direct)) return direct;
  throw new Error(`no packages/${pack}`);
}

/**
 * Identity of a pack, as the world's pack list wants it.
 *
 * `version` is a SemVer string in a format-version-3 manifest and a three-number
 * array in a format-version-2 one; the world list only takes the array. A wrong
 * version here loads nothing and says nothing, same as a wrong uuid.
 */
function identityOf(manifest) {
  if (!fs.existsSync(manifest)) return undefined;
  const { header } = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const version = Array.isArray(header.version)
    ? header.version
    : String(header.version)
        .split(".")
        .map((n) => Number.parseInt(n, 10));
  return { pack_id: header.uuid, version };
}

function readList(file) {
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

for (const [file, kind] of [
  ["world_behavior_packs.json", "behavior_pack"],
  ["world_resource_packs.json", "resource_pack"],
]) {
  const p = path.join(WORLD, file);
  const list = readList(p);
  let changed = false;

  for (const pack of packs) {
    const identity = identityOf(path.join(sourceDir(pack), kind, "manifest.json"));
    if (!identity) continue;
    const at = list.findIndex((e) => e.pack_id === identity.pack_id);
    if (at >= 0) {
      if (JSON.stringify(list[at]) === JSON.stringify(identity)) {
        console.log(`already enabled in ${file}: ${pack} ${identity.pack_id}`);
        continue;
      }
      list[at] = identity;
    } else {
      list.push(identity);
    }
    changed = true;
    console.log(`enabled ${pack} in ${file} (${identity.version.join(".")})`);
  }

  if (changed) fs.writeFileSync(p, JSON.stringify(list, null, 2));
}
