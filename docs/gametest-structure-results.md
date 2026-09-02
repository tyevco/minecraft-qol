# GameTest structure block — measured

Why every test in the suite failed on its first line, and how the suite is now
run without launching the client.

Measured on **Bedrock Dedicated Server 1.26.45.1** (`Build ID 49559486`,
branch `r/26_u4`) against the same world and packs the client uses.

## The finding

**Test-relative `(0,0,0)` holds the test's own structure block. Writing to it
destroys the test.**

Every subsequent call through the `Test` object then throws:

```
GameTestError: Could not find StructureBlockActor associated to this test
```

`rig.floor()` laid an 8×8 floor starting at `x=0, z=0, y=0`. Its **first**
write removed the structure block; the **second** write threw. All fifteen
tests died on their first statement, which is why the failure looked like a
framework or structure problem rather than a coordinate.

### The controls that established it

Each is a whole test, run alone, differing by one ingredient:

| Control | What it did | Result |
| --- | --- | --- |
| `ctl_empty` | no block writes | **pass** |
| `ctl_setblock` | one write at `(0,0,0)`, then succeed | **pass** |
| `ctl_async_setblock` | async, one write at `(0,0,0)`, then succeed | **pass** |
| `ctl_idle_then_setblock` | `await idle(1)`, then write `(0,0,0)` | **fail** |
| `ctl_origin_then_next` | write `(0,0,0)`, then `(1,0,0)` | **fail on the second write** |
| `ctl_floor64` | all 64 floor cells | **fail** |
| `ctl_floor63_no_origin` | the same 64 cells minus `(0,0,0)` | **pass** |

The last two are the proof: identical but for one cell.

A single write to `(0,0,0)` "passes" only because the test succeeds in the same
tick, before anything needs the structure block again. The damage is already
done — it just goes unobserved.

### What this ruled out

Things that were suspected and are **not** the cause: the structure failing to
load (`onTestStructureLoaded` fires every time), malformed structure NBT,
duplicate pack UUIDs, `registerAsync` versus `register`, awaiting inside a
test, concurrent tests interfering, and unloaded chunks.

The `await test.idle(1)` added earlier was **not** a fix and has been removed
along with the `async` it forced onto `floor()` and `placeTurret()`.

## The fix

`rig.floor()` skips `(0,0,0)`. Nothing is lost: the structure block occupies
that cell, so the floor still reads as a full 8×8, and no rig in the suite uses
`x = 0` or `z = 0` — the lowest coordinate anywhere is 1.

**Treat the `(0, *, 0)` column as reserved.** A rig that writes there will fail
in a way that points nowhere near the real cause.

## Running the suite headlessly

`tools/bds/run.mjs` drives a Bedrock Dedicated Server over stdin and reads its
content log from stdout — the same log the client writes, without launching the
client. A full suite run takes about a minute.

```
node tools/bds/run.mjs --seq "gametest run qol:dispenser_fills_cauldron"
```

Setup, once:

1. Download the server build matching the client — the URL comes from
   `https://net-secondary.web.minecraft-services.net/api/v1.0/download/links`
   (`serverBedrockWindows`). **The CDN resets the connection without a browser
   `User-Agent`**; pass one to `curl`.
2. Unzip to `C:/bds/server` (override with `BDS_DIR`).
3. Copy a world that already has the **Beta APIs** experiment saved into
   `worlds/`, and the packs into `development_behavior_packs/` — BDS reads that
   folder just as the client does. Experiments cannot be enabled from
   `server.properties`; they have to come in with the world. A correct boot logs
   `Experiment(s) active: gtst`.
4. In `server.properties`: `allow-cheats=true`, `online-mode=false`,
   `allow-list=false`, and `content-log-console-output-enabled=true` — that last
   one is what puts script errors on stdout.

Deploy into it without touching `.env`:

```
CUSTOM_DEPLOYMENT_PATH="C:/bds/server" MINECRAFT_PRODUCT="Custom" npx just-scripts local-deploy
```

### Run tests one at a time

`--seq` waits for each `onTestPassed`/`onTestFailed` before sending the next.

`gametest runset qol` fans the tests out across hundreds of blocks. With no
player online nothing holds those chunks loaded, so the far tests fail with
`Could not setBlock 'stone'` — an artefact of the harness, not a real failure,
and it moves between runs. Sequential runs keep every test near the console's
origin and are reproducible. A ticking area does not rescue `runset`: BDS caps
one at 100 chunks, far less than the spread.

## What the suite says now

Infrastructure failures are gone. As of this measurement, five pass and ten
fail on **their own assertions**, which is the point — each message carries the
observed value:

**Passing:** `dispenser_fills_cauldron`, `death_keeps_items`,
`guardian_never_adds_damage`, `turret_grows_head`,
`turret_drains_feeding_hopper`.

**Failing, and now diagnosable:**

- All six Fluidworks tests report the tank or chest still empty. The tests do
  ask the pack to notice their blocks — a simulated player runs
  `scriptevent fluidworks:rescan 8` — but the pack logs nothing in reply and
  still reports `0 funnel(s) indexed`. Whether the script event arrives at all
  is the first thing to check.
- `turret_replaces_killed_head` (regrew 0 heads) and
  `turret_break_returns_arrows` (hopper still holds 10) — Bulwark's other two
  turret tests pass, so the block and head basics work.
- `guardian_void_catch` — the player was still at `y=-104` and not caught.
- `anchor_sets_spawn` — a spawn point was set, but three blocks off the anchor.

None of these has been investigated yet. They are recorded here as observations,
not as verdicts about the packs: some may still turn out to be artefacts of
running with no real player.
