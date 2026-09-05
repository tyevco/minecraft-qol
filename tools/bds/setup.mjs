/**
 * Prepare a Bedrock Dedicated Server that can run the GameTest suite.
 *
 * Everything the "setup, once" list in `docs/gametest-structure-results.md`
 * describes by hand, done in one command, so a fresh machine - or a CI runner -
 * gets the same server every time:
 *
 *   npm run bds:setup
 *
 * 1. Resolve and download the server build (the URL comes from Mojang's own
 *    download-links API; the CDN resets the connection without a browser
 *    User-Agent, so one is sent).
 * 2. Unzip it into dist/bds/server, keeping any world already there.
 * 3. Write server.properties: cheats on, allow-list off, and content logging to
 *    the console - that last one is what puts script errors on stdout.
 * 4. Build and deploy every pack into the server's development_behavior_packs.
 * 5. Boot once to generate the world, then turn on the Beta APIs experiment in
 *    its level.dat. Experiments cannot be set from server.properties; they have
 *    to arrive with the world, and in CI there is no client-made world to copy.
 * 6. List every pack in the world's pack files, which is what actually loads
 *    them.
 *
 * Options:
 *   --dir <path>     install root (default dist/bds/server, or BDS_DIR)
 *   --version <v>    pin a server build (default: latest stable, or BDS_VERSION)
 *   --force          re-download and re-unzip even if a server is installed
 *   --fresh          delete the world first, so the next run starts clean
 *   --no-deploy      skip the build-and-deploy step
 *   --no-experiments leave the world plain: no Beta APIs, so the GameTest pack
 *                    cannot load, but a shipped pack is measured as the Realm
 *                    would run it (the jigsaw probe, docs/design/villages.md §7.1)
 *   --level-type <t> FLAT (default) or DEFAULT, for a probe that needs terrain
 *   --world <name>   the world folder and level-name (default qoltest)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const WINDOWS = process.platform === "win32";

const LINKS_API = "https://net-secondary.web.minecraft-services.net/api/v1.0/download/links";
/** The CDN resets the connection without one of these. Measured, not guessed. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const args = process.argv.slice(2);
let serverDir = process.env.BDS_DIR ?? join(REPO, "dist", "bds", "server");
let version = process.env.BDS_VERSION ?? "";
let force = false;
let fresh = false;
let deploy = true;
let experiments = true;
let levelType = "FLAT";
let WORLD_NAME = "qoltest";

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dir") serverDir = resolve(args[++i]);
  else if (a === "--version") version = args[++i];
  else if (a === "--force") force = true;
  else if (a === "--fresh") fresh = true;
  else if (a === "--no-deploy") deploy = false;
  else if (a === "--no-experiments") experiments = false;
  else if (a === "--level-type") levelType = args[++i];
  else if (a === "--world") WORLD_NAME = args[++i];
  else {
    console.error(`unknown argument: ${a}`);
    process.exit(2);
  }
}

const exe = join(serverDir, WINDOWS ? "bedrock_server.exe" : "bedrock_server");
const worldDir = join(serverDir, "worlds", WORLD_NAME);

function step(text) {
  console.log(`\n=== ${text}`);
}

/** Run a command, inheriting stdio, and stop the setup if it fails. */
function must(command, commandArgs, options = {}) {
  const r = spawnSync(command, commandArgs, { stdio: "inherit", shell: WINDOWS, ...options });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    console.error(`${command} exited ${r.status}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 1. Resolve the download
// ---------------------------------------------------------------------------

/**
 * The URL for this platform's server build.
 *
 * Mojang's links API is the only machine-readable source: the download page
 * itself is behind bot protection. A pinned version is spelled the same way the
 * API spells the latest one, so pinning is a string swap.
 */
async function resolveDownload() {
  const kind = WINDOWS ? "serverBedrockWindows" : "serverBedrockLinux";
  const response = await fetch(LINKS_API, { headers: { "User-Agent": BROWSER_UA } });
  if (!response.ok) throw new Error(`links API ${response.status} ${response.statusText}`);
  const { result } = await response.json();
  const link = result.links.find((l) => l.downloadType === kind);
  if (!link) throw new Error(`no ${kind} in the links API response`);
  const latest = /bedrock-server-([\d.]+)\.zip/.exec(link.downloadUrl)?.[1] ?? "unknown";
  if (!version || version === latest) return { url: link.downloadUrl, version: latest };
  return { url: link.downloadUrl.replace(latest, version), version };
}

async function install() {
  if (existsSync(exe) && !force) {
    console.log(`server already installed at ${exe} (--force to re-download)`);
    return;
  }
  const { url, version: resolved } = await resolveDownload();
  console.log(`downloading BDS ${resolved}\n  ${url}`);

  const response = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!response.ok) throw new Error(`download ${response.status} ${response.statusText}`);
  const zip = join(REPO, "dist", "bds", `bedrock-server-${resolved}.zip`);
  await mkdir(dirname(zip), { recursive: true });
  await writeFile(zip, Buffer.from(await response.arrayBuffer()));

  await mkdir(serverDir, { recursive: true });
  console.log(`unzipping into ${serverDir}`);
  // The zip has no worlds/ of its own, so an existing world survives the
  // overwrite. Node ships no unzip, so this borrows the platform's.
  if (WINDOWS) {
    must("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${zip}' -DestinationPath '${serverDir}' -Force`,
    ]);
  } else {
    must("unzip", ["-q", "-o", zip, "-d", serverDir]);
    await chmod(exe, 0o755);
  }
}

// ---------------------------------------------------------------------------
// 2. Configure
// ---------------------------------------------------------------------------

/**
 * A server the tests can drive.
 *
 * `allow-cheats` is what lets the console run `gametest`; the content log on the
 * console is what lets the harness read script output at all. `allow-list=true`
 * with `online-mode=false` is fatal rather than ignored - the server refuses to
 * start - so both are off together.
 */
const PROPERTIES = [
  "server-name=QOL GameTest server",
  "gamemode=creative",
  "difficulty=peaceful",
  "allow-cheats=true",
  "max-players=2",
  "online-mode=false",
  "allow-list=false",
  "server-port=19132",
  "server-portv6=19133",
  `level-name=${WORLD_NAME}`,
  `level-type=${levelType}`,
  "level-seed=1",
  "default-player-permission-level=operator",
  "player-idle-timeout=0",
  "content-log-file-enabled=true",
  "content-log-console-output-enabled=true",
  "emit-server-telemetry=false",
  "",
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

step("installing the server");
await install();

step("writing server.properties");
await writeFile(join(serverDir, "server.properties"), PROPERTIES.join("\n"), "utf8");

if (fresh && existsSync(worldDir)) {
  console.log(`removing ${worldDir}`);
  rmSync(worldDir, { recursive: true, force: true });
}

if (deploy) {
  step("building and deploying the packs");
  // The deployment root is read from the environment rather than .env, so this
  // never disturbs a developer's own game install.
  must("npx", ["just-scripts", "package"], {
    cwd: REPO,
    env: { ...process.env, MINECRAFT_PRODUCT: "Custom", CUSTOM_DEPLOYMENT_PATH: serverDir },
  });
}

if (!existsSync(join(worldDir, "level.dat"))) {
  step("booting once to generate the world");
  // run.mjs with no commands boots, idles, and stops - which is all it takes.
  await new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [join(HERE, "run.mjs"), "--idle", "5000", "--log", join(REPO, "dist", "bds", "world.log")],
      { stdio: "inherit", env: { ...process.env, BDS_DIR: serverDir } },
    );
    child.on("exit", (code) => (code === 0 ? done() : fail(new Error(`world boot exited ${code}`))));
  });
  if (!existsSync(join(worldDir, "level.dat"))) {
    console.error(`no world at ${worldDir} after the boot; see dist/bds/world.log`);
    process.exit(1);
  }
}

if (experiments) {
  step("turning on the Beta APIs experiment");
  must(process.execPath, [join(HERE, "enable-experiments.mjs"), worldDir]);
} else {
  step("leaving the world without experiments");
}

step("listing the packs in the world");
must(process.execPath, [join(HERE, "enable-pack.cjs"), "--all"], {
  env: { ...process.env, BDS_WORLD: worldDir },
});

console.log(`\nReady. ${serverDir}\n  npm run bds:test     the whole suite`);
