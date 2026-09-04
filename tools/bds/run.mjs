/**
 * Drive a Bedrock Dedicated Server headlessly.
 *
 * BDS reads commands from stdin and writes the content log to stdout, which is
 * the same log we had been reading off screenshots. Driving it from a script
 * turns "ask the user to restart and paste the log" into a command that returns
 * in about a minute.
 *
 * Usage:
 *   node tools/bds/run.mjs "gametest run qol:dispenser_fills_cauldron"
 *   node tools/bds/run.mjs --idle 400 "gametest runset qol"
 *
 * Every positional argument is a console command, sent in order once the server
 * reports itself started. The server is stopped when the commands have gone
 * quiet (no new output for --idle ticks worth of wall time) or --timeout is hit.
 *
 * Exit code is 1 if any line matched a failure pattern, so this is CI-usable.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

/**
 * Where the server lives.
 *
 * On Windows this is a hand-unzipped install, so the historical C:/bds/server
 * stays the default. Everywhere else (a Linux box, and CI) `setup.mjs` installs
 * into the repo's own dist/, which needs no configuration and is gitignored.
 */
const WINDOWS = process.platform === "win32";
const SERVER_DIR =
  process.env.BDS_DIR ?? (WINDOWS ? "C:/bds/server" : join(REPO, "dist", "bds", "server"));
const EXE = join(SERVER_DIR, WINDOWS ? "bedrock_server.exe" : "bedrock_server");

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const commands = [];
let idleMs = 8000;
let timeoutMs = 240000;
let logPath = join(REPO, "dist", "bds", "last-run.log");
let quiet = false;

let sequential = false;
/** Wall time between sequential tests, for each pack's sweep to settle. */
let gapMs = 12000;
let waiting = false;
/**
 * How long one test may run before the harness gives up on it.
 *
 * A test in flight is silent by design - `rain_collector` waits out the weather
 * without printing anything - so the idle timer cannot be what ends it. Waiting
 * on the test's own verdict line and timing it separately is the difference
 * between "the suite finished" and "the server was stopped mid-suite", which
 * cost a whole run: everything from `rain_collector` on reported nothing.
 */
let testTimeoutMs = 180000;
let inFlight;
let testStartedAt = 0;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--idle") idleMs = Number(args[++i]);
  else if (a === "--timeout") timeoutMs = Number(args[++i]);
  else if (a === "--test-timeout") testTimeoutMs = Number(args[++i]);
  else if (a === "--log") logPath = resolve(args[++i]);
  else if (a === "--quiet") quiet = true;
  else if (a === "--seq") sequential = true;
  else if (a === "--gap") gapMs = Number(args[++i]);
  else commands.push(a);
}

if (!existsSync(EXE)) {
  console.error(`No server at ${EXE}. Set BDS_DIR, or run: npm run bds:setup`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const STARTED = /Server started\./i;
/** A test has finished, either way. Drives --seq. */
const DONE = /onTest(?:Passed|Failed):/;
/**
 * Lines that mean the run failed. Kept deliberately narrow: BDS logs plenty of
 * warnings on a healthy boot, and a harness that cries wolf gets ignored.
 */
const FAILURE = [
  /\[Scripting\]\[error\]/i,
  /\[Actor\]\[error\]/i,
  /\bFailed to (?:load|register|compile)\b/i,
  /Tests failed:\s*[1-9]/i,
  /\bFAILED\b.*\btest\b/i,
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const child = spawn(EXE, {
  cwd: SERVER_DIR,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

const lines = [];
let lastOutput = Date.now();
let started = false;
let stopping = false;

function onChunk(buf) {
  const text = buf.toString("utf8");
  lastOutput = Date.now();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    lines.push(line);
    if (!quiet) console.log(line);
    if (!started && STARTED.test(line)) {
      started = true;
      queueMicrotask(sendCommands);
    }
    // In sequential mode one test is in flight at a time, so each lands at the
    // same spot near the console's origin. Run as a set they fan out across
    // hundreds of blocks, and with no player online the far ones sit in
    // unloaded chunks and fail with "Could not setBlock".
    if (sequential && started && DONE.test(line)) {
      inFlight = undefined;
      queueMicrotask(sendNext);
    }
  }
}

child.stdout.on("data", onChunk);
child.stderr.on("data", onChunk);

function send(cmd) {
  if (!quiet) console.log(`>>> ${cmd}`);
  lines.push(`>>> ${cmd}`);
  child.stdin.write(`${cmd}\n`);
}

let next = 0;

/**
 * Send commands until one is sent that will report back.
 *
 * Only `gametest run` produces an onTestPassed/onTestFailed line, so anything
 * else (setup like `tickingarea add`) is sent and stepped straight past -
 * otherwise the chain waits forever for a marker that never comes.
 *
 * Before each test the previous one's leavings are swept up, because sequential
 * tests are placed in the same x/z column one block higher each time and a
 * structure reload restores blocks but NOT entities, item drops, or a pack's own
 * position-keyed records. Measured, all three separately:
 *
 *   without `gametest clearall`, a turret test inherits the previous test's head
 *     sitting inside its own placement cell, and the regrow test fails in a
 *     sequence while passing alone;
 *   the gap lets each pack's sweep (Bulwark retires a stale turret every 200
 *     ticks) finish and drop what it is going to drop BEFORE the next test
 *     starts, rather than in the middle of it;
 *   `kill @e[type=item]` then clears those drops, so the break test counts its
 *     own 10 arrows instead of the previous test's as well.
 */
function sendNext() {
  while (next < commands.length) {
    const cmd = commands[next++];
    if (!/^gametest\s+run/i.test(cmd)) {
      send(cmd);
      lastOutput = Date.now();
      continue;
    }
    send("gametest clearall");
    waiting = true;
    setTimeout(() => {
      waiting = false;
      send("kill @e[type=item]");
      send(cmd);
      inFlight = cmd;
      testStartedAt = Date.now();
      lastOutput = Date.now();
    }, gapMs).unref();
    lastOutput = Date.now();
    return;
  }
}

function sendCommands() {
  if (sequential) sendNext();
  else for (const c of commands) send(c);
  lastOutput = Date.now();
}

function stop() {
  if (stopping) return;
  stopping = true;
  try {
    child.stdin.write("stop\n");
  } catch {
    /* already gone */
  }
  // The server flushes and exits on its own; kill only if it hangs.
  setTimeout(() => child.kill(), 20000).unref();
}

/**
 * How long to wait for "Server started." before saying why it probably has not.
 *
 * A healthy boot takes a few seconds. On Windows the usual cause of a hang is
 * the Firewall prompt: BDS binds 19132/19133 on first run and blocks on the
 * dialog, which is invisible from here and otherwise just looks like a silent
 * stall. Elsewhere the usual cause is another server still holding the ports -
 * BDS says "may be in use by another process" and exits.
 */
const STARTUP_GRACE_MS = 60000;
let warnedSlowStart = false;

const startedAt = Date.now();
const tick = setInterval(() => {
  if (!started && !warnedSlowStart && Date.now() - startedAt > STARTUP_GRACE_MS) {
    warnedSlowStart = true;
    const hint = WINDOWS
      ? `harness: no "Server started." after ${STARTUP_GRACE_MS / 1000}s. ` +
        `If this is the first run, check for a Windows Firewall prompt for ` +
        `bedrock_server.exe - it blocks startup until answered. Allow it once, ` +
        `or pre-authorise with: netsh advfirewall firewall add rule ` +
        `name="BDS" dir=in action=allow program="${EXE}" enable=yes`
      : `harness: no "Server started." after ${STARTUP_GRACE_MS / 1000}s. ` +
        `Check the log above for "may be in use by another process" - another ` +
        `bedrock_server is probably still holding 19132/19133.`;
    lines.push(`>>> ${hint}`);
    console.error(hint);
  }
  if (Date.now() - startedAt > timeoutMs) {
    lines.push(`>>> harness: timeout after ${timeoutMs}ms`);
    stop();
    return;
  }
  if (started && !stopping && !waiting) {
    if (inFlight) {
      if (Date.now() - testStartedAt > testTimeoutMs) {
        const note = `harness: no verdict for "${inFlight}" after ${testTimeoutMs / 1000}s`;
        lines.push(`>>> ${note}`);
        console.error(note);
        stop();
      }
    } else if (Date.now() - lastOutput > idleMs) stop();
  }
}, 500);

child.on("exit", async (code) => {
  clearInterval(tick);
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, lines.join("\n"), "utf8");

  const failures = lines.filter((l) => FAILURE.some((re) => re.test(l)));
  console.log(`\n--- ${lines.length} lines, server exit ${code} ---`);
  console.log(`--- log: ${logPath} ---`);
  if (failures.length) {
    console.log(`--- ${failures.length} failure line(s) ---`);
    for (const f of failures.slice(0, 40)) console.log(f);
  }
  process.exit(failures.length ? 1 : 0);
});
