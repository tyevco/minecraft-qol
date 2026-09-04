/**
 * Run the whole GameTest suite on a headless server and judge the results.
 *
 *   npm run bds:test                     every test
 *   npm run bds:test -- funnel_makes_concrete rain_collector
 *   npm run bds:test -- --list           what would run
 *
 * Needs a server prepared by `npm run bds:setup`.
 *
 * The test list is read out of the suite sources, so a test added there is run
 * here without anything to remember. Tests are sent one at a time (`run.mjs
 * --seq`): `gametest runset qol` fans them across hundreds of blocks and the far
 * ones land in unloaded chunks with no player online, which fails them for a
 * reason that has nothing to do with the pack.
 *
 * Judging, in the order it matters:
 *
 * - a test that fails, then fails again when re-run **alone**, fails the run.
 *   Sequential tests contaminate each other - entities, a pack's own sweep, and
 *   loose items all survive a structure reload - so a single failure is not
 *   evidence about a pack until it has also been run by itself. That is a
 *   measured finding, not caution: see docs/gametest-structure-results.md.
 * - a test in packages/gametest/known-failures.json is allowed to fail. If it
 *   PASSES, the run fails: the reason it was listed has expired.
 * - a test that reports nothing at all fails the run. That is what a crashed
 *   test, or a suite that never registered, looks like.
 *
 * Script errors are counted and printed but do not by themselves fail the run:
 * a simulated player makes Graves and Lens throw on every spawn, which is
 * documented behaviour of the harness rather than of those packs.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const SUITES = join(REPO, "packages", "gametest", "scripts", "suites");
const KNOWN_FAILURES = join(REPO, "packages", "gametest", "known-failures.json");
const LOG_DIR = join(REPO, "dist", "bds");

const args = process.argv.slice(2);
const only = [];
let list = false;
let gapMs = 12000;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--list") list = true;
  else if (a === "--gap") gapMs = Number(args[++i]);
  else only.push(a.replace(/^qol:/, ""));
}

// ---------------------------------------------------------------------------
// What to run
// ---------------------------------------------------------------------------

/** Every `registerAsync("qol", "<name>", ...)` in the suite sources, in file order. */
function discoverTests() {
  const found = [];
  for (const file of readdirSync(SUITES).filter((f) => f.endsWith(".ts")).sort()) {
    const source = readFileSync(join(SUITES, file), "utf8");
    for (const m of source.matchAll(/register(?:Async)?\(\s*"qol"\s*,\s*"([^"]+)"/g)) {
      found.push({ name: m[1], suite: file.replace(/\.ts$/, "") });
    }
  }
  return found;
}

const known = JSON.parse(readFileSync(KNOWN_FAILURES, "utf8"));
const expectedToFail = (name) => Object.hasOwn(known, name) && name !== "$comment";

const all = discoverTests();
const tests = only.length ? all.filter((t) => only.includes(t.name)) : all;

const missing = only.filter((n) => !all.some((t) => t.name === n));
if (missing.length) {
  console.error(`no such test: ${missing.join(", ")}`);
  process.exit(2);
}
if (!tests.length) {
  console.error(`no tests found under ${SUITES}`);
  process.exit(2);
}

if (list) {
  for (const t of tests) {
    console.log(`${t.name}${expectedToFail(t.name) ? "  (known failure)" : ""}  [${t.suite}]`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

/**
 * Drive one server session through some tests, and read back what happened.
 *
 * run.mjs owns the server; this owns the verdict, so its exit code is not
 * consulted - its failure patterns cannot tell a known failure from a real one.
 */
function runSession(names, logName) {
  const logPath = join(LOG_DIR, logName);
  const commands = names.map((n) => `gametest run qol:${n}`);
  const child = spawn(
    process.execPath,
    [
      join(HERE, "run.mjs"),
      "--seq",
      "--gap",
      String(gapMs),
      "--timeout",
      String(120000 + names.length * 45000),
      "--log",
      logPath,
      ...commands,
    ],
    { stdio: "inherit" },
  );
  return new Promise((done) => {
    child.on("exit", () => done(readResults(logPath)));
  });
}

/**
 * What the framework said, per test.
 *
 * A verdict line is `onTestFailed: qol:<name> - <the assertion message>`, so the
 * message the suite author wrote - which by convention carries the observed
 * value - comes back with the result and is what gets reported.
 */
function readResults(logPath) {
  if (!existsSync(logPath)) {
    // run.mjs writes the log as it exits, so a missing one means it never got
    // that far - no server installed is the usual reason.
    console.error(`no log at ${logPath}; the server did not run. Try: npm run bds:setup`);
    process.exit(2);
  }
  const lines = readFileSync(logPath, "utf8").split("\n");
  const results = new Map();
  const errors = [];
  for (const line of lines) {
    const outcome = /^onTest(Passed|Failed):\s*(?:qol:)?(\S+)(?:\s+-\s+(.*))?$/.exec(line.trim());
    if (outcome) {
      results.set(outcome[2], { passed: outcome[1] === "Passed", detail: outcome[3]?.trim() });
      continue;
    }
    if (/\[error\]|\[Scripting\].*(?:error|Error:)/.test(line)) errors.push(line.trim());
  }
  return { results, errors, logPath };
}

console.log(`${tests.length} test(s), one at a time, ${gapMs / 1000}s apart\n`);
const first = await runSession(
  tests.map((t) => t.name),
  "gametest.log",
);

// A test that failed in a sequence is re-run alone before it is believed. A
// test that reported nothing is re-run whatever was expected of it: no verdict
// is not a failure, it is a missing measurement.
const suspects = tests.filter((t) => {
  const r = first.results.get(t.name);
  return !r || (!r.passed && !expectedToFail(t.name));
});

/**
 * Twice, because one clean room is not always enough.
 *
 * `harvester_funnel` has failed alone and passed alone across otherwise
 * identical runs. Two isolated attempts is the point where a red line has been
 * earned rather than drawn.
 */
const RETRIES = 2;

const retried = new Map();
if (suspects.length) {
  console.log(
    `\n=== re-running ${suspects.length} failed test(s) alone, to rule out contamination\n`,
  );
  for (const [i, t] of suspects.entries()) {
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      const session = await runSession([t.name], `retry-${i}-${t.name}-${attempt}.log`);
      const result = session.results.get(t.name);
      retried.set(t.name, result ? { ...result, attempts: attempt } : undefined);
      if (result?.passed) break;
    }
  }
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const rows = tests.map((t) => {
  const firstRun = first.results.get(t.name);
  const alone = retried.get(t.name);
  const final = alone ?? firstRun;
  const passed = final?.passed === true;
  const expected = expectedToFail(t.name);

  let status;
  if (!final) status = "NO RESULT";
  else if (passed && expected) status = "UNEXPECTED PASS";
  else if (passed) status = "pass";
  else if (expected) status = "known failure";
  else status = "FAIL";

  return {
    ...t,
    status,
    ok: status === "pass" || status === "known failure",
    detail: final?.detail,
    recovered: alone?.passed === true,
    attempts: alone?.attempts,
  };
});

const width = Math.max(...rows.map((r) => r.name.length));
console.log("\n=== results\n");
for (const r of rows) {
  const note = r.recovered
    ? `  (failed in the sequence, passed alone${r.attempts > 1 ? ` on attempt ${r.attempts}` : ""})`
    : "";
  console.log(`${r.ok ? " " : "!"} ${r.name.padEnd(width)}  ${r.status}${note}`);
  if (!r.ok && r.detail) console.log(`  ${" ".repeat(width)}  ${r.detail}`);
}

const bad = rows.filter((r) => !r.ok);
const passed = rows.filter((r) => r.status === "pass").length;
const summary =
  `${passed}/${rows.length} passed, ` +
  `${rows.filter((r) => r.status === "known failure").length} known failure(s), ` +
  `${bad.length} problem(s), ${first.errors.length} script error line(s)`;
console.log(`\n${summary}`);
console.log(`log: ${first.logPath}`);

if (first.errors.length) {
  console.log("\n=== script errors (not themselves a failure)\n");
  for (const e of first.errors.slice(0, 20)) console.log(`  ${e}`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    "## GameTest suite",
    "",
    summary,
    "",
    "| Test | Suite | Result |",
    "| --- | --- | --- |",
    ...rows.map((r) => `| \`${r.name}\` | ${r.suite} | ${r.status} |`),
    "",
  ];
  for (const r of bad) {
    if (r.detail) md.push(`- \`${r.name}\`: ${r.detail}`, "");
  }
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n"));
}

if (bad.some((r) => r.status === "UNEXPECTED PASS")) {
  console.log(
    "\nA known failure passed. If that is real, drop it from " +
      "packages/gametest/known-failures.json - it is pinning behaviour now.",
  );
}

process.exit(bad.length ? 1 : 0);
