/**
 * Find every entity model in the repo, and say which of them can be posed.
 *
 * Discovery rather than a list: the sheet set is derived from the geometry on
 * disk, so a new entity model gets a sheet the run after it is generated and
 * nobody has to remember to add it. Split out from the generator so
 * tools/sheets/tests can check the set without writing a PNG.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { isPosable, readGeometry, type Geometry } from "./pose";

const ROOT = resolve(__dirname, "../..");

export interface Variant {
  /** Suffix after the model's name, e.g. "guard"; undefined for a lone texture. */
  readonly name: string | undefined;
  readonly path: string;
}

export interface Entity {
  readonly id: string;
  readonly name: string;
  readonly pack: string;
  readonly geometryPath: string;
  readonly geometry: Geometry;
  readonly variants: Variant[];
}

export interface Skipped {
  readonly id: string;
  readonly reason: string;
}

/** snake_case to Title Case, for a label nobody has to maintain by hand. */
export function title(id: string): string {
  return id.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function listFiles(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(suffix)).sort().map((f) => join(dir, f));
}

/** `<stem>.png`, or every `<stem>_<variant>.png` beside it. */
export function findVariants(dir: string, stem: string): Variant[] {
  const variants: Variant[] = [];
  for (const path of listFiles(dir, ".png")) {
    const file = basename(path, ".png");
    if (file === stem) variants.push({ name: undefined, path });
    else if (file.startsWith(`${stem}_`)) variants.push({ name: file.slice(stem.length + 1), path });
  }
  return variants;
}

/**
 * Every entity model in the repo: each pack's resource pack, plus the concept
 * entities, which ship in no pack but are judged as models all the same.
 */
export function findEntities(root = ROOT): { models: Entity[]; skipped: Skipped[] } {
  const sources: { pack: string; models: string; textures: string }[] = [];
  const packs = resolve(root, "packages");
  if (existsSync(packs))
    for (const pack of readdirSync(packs).sort()) {
      const models = join(packs, pack, "resource_pack/models/entity");
      if (existsSync(models))
        sources.push({ pack, models, textures: join(packs, pack, "resource_pack/textures/entity") });
    }
  const conceptModels = resolve(root, "concepts/entities/models");
  if (existsSync(conceptModels))
    sources.push({ pack: "concept", models: conceptModels, textures: resolve(root, "concepts/entities/textures") });

  const models: Entity[] = [];
  const skipped: Skipped[] = [];
  for (const source of sources) {
    for (const path of listFiles(source.models, ".geo.json")) {
      const stem = basename(path, ".geo.json");
      const id = source.pack === "concept" ? `concept_${stem}` : `${source.pack}_${stem}`;
      const geometry = readGeometry(JSON.parse(readFileSync(path, "utf8")));
      if (!isPosable(geometry)) {
        skipped.push({ id, reason: "no limb bones to pose" });
        continue;
      }
      const variants = findVariants(source.textures, stem);
      if (variants.length === 0) {
        skipped.push({ id, reason: "no texture found" });
        continue;
      }
      models.push({ id, name: title(stem), pack: source.pack, geometryPath: path, geometry, variants });
    }
  }
  return { models, skipped };
}
