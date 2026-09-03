import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every manifest in the repo, held to the same standard. Nothing here needs
 * a game: it reads the JSON and checks what the pack list and the engine
 * will see. A mismatch between a behavior pack and its resource pack fails
 * silently in game (the resource pack just does not come along), so it is
 * caught here instead.
 */

const ROOT = resolve(__dirname, "../../..");
const REPO_URL = "https://github.com/tyevco/minecraft-qol";

interface Manifest {
  format_version: number;
  header: { name: string; description: string; uuid: string; version: string | number[]; min_engine_version: string | number[] };
  modules: { type: string; uuid: string; version: string | number[]; description?: string }[];
  dependencies?: { module_name?: string; uuid?: string; version: string | number[] }[];
  metadata?: { authors?: string[]; url?: string; product_type?: string };
}

function read(path: string): Manifest {
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

const packs = readdirSync(resolve(ROOT, "packages")).filter((d) =>
  existsSync(resolve(ROOT, "packages", d, "behavior_pack/manifest.json")),
);
const probe = resolve(ROOT, "packages/probe/manifest.json");

const all: { path: string; manifest: Manifest }[] = [];
for (const pack of packs) {
  const bp = resolve(ROOT, "packages", pack, "behavior_pack/manifest.json");
  all.push({ path: bp, manifest: read(bp) });
  const rp = resolve(ROOT, "packages", pack, "resource_pack/manifest.json");
  if (existsSync(rp)) all.push({ path: rp, manifest: read(rp) });
}
if (existsSync(probe)) all.push({ path: probe, manifest: read(probe) });

const versionString = (v: string | number[]): string => (typeof v === "string" ? v : v.join("."));

describe("manifests", () => {
  it("finds every pack", () => {
    expect(packs.length).toBeGreaterThanOrEqual(9);
  });

  it.each(all.map((m) => [m.path.replace(ROOT + "/", ""), m.manifest] as const))(
    "%s has a name, a pack-list description and full metadata",
    (_path, m) => {
      expect(m.header.name.trim().length).toBeGreaterThan(0);
      expect(m.header.description.trim().length).toBeGreaterThan(20);
      expect(m.metadata?.authors).toEqual(["tyevco"]);
      expect(m.metadata?.url).toBe(REPO_URL);
      expect(m.metadata?.product_type).toBe("addon");
      expect(versionString(m.header.min_engine_version)).toBe("1.26.40");
    },
  );

  it.each(all.map((m) => [m.path.replace(ROOT + "/", ""), m.manifest] as const))(
    "%s uses the version shape its format demands",
    (_path, m) => {
      const isString = (v: unknown) => typeof v === "string";
      const isTriple = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isInteger(n));
      const ok = m.format_version === 3 ? isString : isTriple;
      expect(ok(m.header.version)).toBe(true);
      expect(ok(m.header.min_engine_version)).toBe(true);
      for (const mod of m.modules) expect(ok(mod.version)).toBe(true);
      if (m.format_version === 3) expect(m.metadata?.authors?.length).toBeGreaterThan(0);
    },
  );

  it("never reuses a UUID: a reused one makes two packs mutually exclusive in game", () => {
    const seen = new Map<string, string>();
    for (const { path, manifest } of all) {
      for (const uuid of [manifest.header.uuid, ...manifest.modules.map((x) => x.uuid)]) {
        expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        const where = seen.get(uuid);
        expect(where, `${uuid} in ${path} already used in ${where}`).toBeUndefined();
        seen.set(uuid, path);
      }
    }
  });

  it.each(packs)("%s's behavior pack depends on its resource pack, at its version, and on nothing else by uuid", (pack) => {
    const bp = read(resolve(ROOT, "packages", pack, "behavior_pack/manifest.json"));
    const rpPath = resolve(ROOT, "packages", pack, "resource_pack/manifest.json");
    const byUuid = (bp.dependencies ?? []).filter((d) => d.uuid);
    if (!existsSync(rpPath)) {
      expect(byUuid).toEqual([]);
      return;
    }
    const rp = read(rpPath);
    expect(byUuid).toHaveLength(1);
    expect(byUuid[0]!.uuid).toBe(rp.header.uuid);
    expect(versionString(byUuid[0]!.version)).toBe(versionString(rp.header.version));
    expect(rp.header.description).toContain(`Enabled automatically with the ${bp.header.name} behavior pack`);
  });

  it.each(packs)("%s's script module depends on the engine modules it imports", (pack) => {
    const bp = read(resolve(ROOT, "packages", pack, "behavior_pack/manifest.json"));
    const hasScript = bp.modules.some((m) => m.type === "script");
    const modules = (bp.dependencies ?? []).filter((d) => d.module_name).map((d) => d.module_name);
    if (hasScript) expect(modules).toContain("@minecraft/server");
    else expect(modules).toEqual([]);
  });
});
