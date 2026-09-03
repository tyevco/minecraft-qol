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
   one is what puts script errors on stdout. Leaving `allow-list=true` with
   `online-mode=false` is fatal, not ignored: the server refuses to start.
5. **Allow `bedrock_server.exe` through the Windows Firewall.** It binds 19132
   and 19133 on first run and blocks on the prompt, which is invisible to a
   script driving it — the run just stalls before `Server started.`. The
   harness now says so after 60s rather than timing out silently.

Deploy into it without touching `.env`:

```
CUSTOM_DEPLOYMENT_PATH="C:/bds/server" MINECRAFT_PRODUCT="Custom" npx just-scripts local-deploy
```

## Sequential tests contaminate each other

`--seq` places every test in the **same x/z column, one block higher** than the
last. Reloading a structure restores *blocks* — it does not remove entities,
item drops, or a pack's own position-keyed records. So a test inherits the
previous one's leavings, and three separate mechanisms were measured:

- **Entities.** A Bulwark test found the previous test's turret head sitting
  ~0.8 blocks inside its own placement cell — within the pack's 1.5-block
  `headsAt` radius — so the new turret was never placed.
  `turret_replaces_killed_head` **failed in a sequence and passed alone**.
- **A pack's own sweep.** Bulwark retires a stale turret record every 200 ticks
  and drops its buffered ammo. Landing mid-test, that gave
  `turret_break_returns_arrows` **20 arrows where it wanted 10**.
- **Loose items.** Whatever the previous test dropped is still lying there.

The harness now does all three before each test: `gametest clearall`, then a
`--gap` (default 12s) so each pack's sweep drops what it is going to drop
*before* the next test starts, then `kill @e[type=item]`. With that, all four
Bulwark tests pass in sequence.

**Both "turret failures" were this, not Bulwark.** A failing test here is not
evidence about a pack until it has also been run alone.

`harvester_funnel` still passes alone and intermittently fails in sequence
("crop tile is air; expected it replanted"), so the sweep is not yet complete.

## A SimulatedPlayer is invisible to every other pack

On headless BDS a `SimulatedPlayer` marshals as **`undefined`** into any
behaviour pack that does not itself bind `@minecraft/server-gametest` — every
`world.getAllPlayers()` entry and every after-event `.player`.

The evidence is in `dist/bds/seq3.log`: `cannot read property 'id' of undefined`
from Graves, Hearthstone and Lens begins at the first `Player Spawned: gv_tester`
and never stops. It is the same hole as the `sourceEntity=undefined` finding
above — a simulated player is not a player to anyone but its own test.

This makes `anchor_sets_spawn` a harness artefact, not a Hearthstone bug.
Hearthstone never saw the player, so it never assigned anything; the spawn point
the test read back is the **engine's own** spawn cell for the simulated player,
which is why the reported offset is exactly the rig's player-to-anchor
separation and not any candidate `chooseRespawn` could return.

### What makes it visible, and why we do not keep it

Binding the module is exactly what does it. Tested by adding
`@minecraft/server-gametest` to Hearthstone's and Guardian's manifest
dependencies, their `external` lists **and** a side-effect `import` in each
`main.ts` — all three are needed, and the declaration alone does nothing: with
the dependency declared but never imported the bundle contained no reference to
the module and the errors were unchanged.

With the module genuinely bound:

- the `cannot read property 'id' of undefined` errors from those two packs
  **stopped** (the ones that remain are Graves and Lens, which were left unbound);
- **`guardian_void_catch` passed.** Guardian's void catch was never broken; the
  player was invisible to it;
- `anchor_sets_spawn` still failed, which led to the finding below.

**The binding was then removed and must stay removed.** `@minecraft/server-gametest`
is a Beta API: it flags the pack experimental, and the Realm keeps its
achievements. This was a measurement, not a change. To reproduce it, add the
dependency, the `external` entry and the import together, and revert all three.

### A SimulatedPlayer spawns WITH a spawn point

`docs/hearthstone-spawn-results.md` measured that a real player who has never
slept returns `undefined` from `getSpawnPoint()` — the load-bearing fact for
Hearthstone's whole design. **A SimulatedPlayer does not behave that way.**
Measured: immediately after `spawnSimulatedPlayer`, `getSpawnPoint()` returned
its own spawn cell, before any anchor was placed.

Hearthstone treats a spawn point it did not assign as `"foreign"` and
deliberately never touches it — that is the branch that makes a real bed always
win. So the test was asking the pack to do the one thing it is designed to
refuse, and **Hearthstone was correct throughout**. `setSpawnPoint()` with no
argument clears it (the parameter is optional in 2.9.0); with the spawn point
cleared and the module bound, `anchor_sets_spawn` passes.

**Consequence: any test whose subject is one pack reacting to a player cannot be
written with a simulated player on headless BDS.** `guardian_void_catch` and
`anchor_sets_spawn` therefore stay red in a normal run — not because either pack
is broken, but because both have been shown to work only under a binding that
must not ship. Both are confirmed; neither is pinned.

### Run tests one at a time

`--seq` waits for each `onTestPassed`/`onTestFailed` before sending the next.

`gametest runset qol` fans the tests out across hundreds of blocks. With no
player online nothing holds those chunks loaded, so the far tests fail with
`Could not setBlock 'stone'` — an artefact of the harness, not a real failure,
and it moves between runs. Sequential runs keep every test near the console's
origin and are reproducible. A ticking area does not rescue `runset`: BDS caps
one at 100 chunks, far less than the spread.

## A script event run by anything but a real player has no `sourceEntity`

Measured while the six Fluidworks tests were all failing with an empty tank.

`SimulatedPlayer.runCommand("scriptevent fluidworks:rescan 8")` **does** reach
`system.afterEvents.scriptEventReceive`, but it arrives as:

```
id=fluidworks:rescan  sourceType=Entity  sourceEntity=undefined
```

`sourceType` says `Entity` while `sourceEntity` is undefined, so the pack's
`instanceof Player` guard dropped the event and nothing was ever indexed.
Waiting two ticks after spawning the player does not populate it — this is not
a timing problem. The same hole applies to a rescan typed at a server console.

The absence of a reply was **not** the evidence: the handler answered with
`player.sendMessage`, which goes to the caller, not the log. It took a probe
logging every event before any filtering to see what actually arrived.

So `fluidworks:rescan` now takes an optional origin, and reports to the content
log as well as to the caller:

```
scriptevent fluidworks:rescan <radius> [x y z]
```

Coordinates carry no dimension, so an explicit origin is scanned in the
overworld. Omitting them keeps the old behaviour exactly. Tests pass
`test.worldBlockLocation(...)` and need no simulated player at all.

## What the suite says now

**Eleven of fifteen pass**, and — this is the finding, not a footnote — **no
shipped pack code has been changed to get there.** Every failure investigated so
far has been the harness or the test, not the add-on.

**Passing:** `dispenser_fills_cauldron`, `funnel_makes_concrete`,
`funnel_fills_from_source`, `funnel_through_pipes`, `collector_funnel`,
`death_keeps_items`, `guardian_never_adds_damage`, and all four Bulwark turret
tests. `harvester_funnel` passes alone (see the sequence flake above).

`funnel_makes_concrete` passing answers what it was written to ask: the funnel's
facing state names the **spout's** direction, not the mouth's.

**Still failing:**

- `anchor_sets_spawn` — **the pack is correct; proven.** Hearthstone cannot see
  a simulated player, so it assigns nothing ("spawn point still unset"). Under a
  temporary gametest binding, with the player's engine-assigned spawn point
  cleared, it **passes**.
- `guardian_void_catch` — **the pack is correct; proven.** Under the same
  temporary binding it **passes**. Guardian's sweep walks `getAllPlayers()`,
  which is exactly what a simulated player is missing from.
- `rain_collector` — **not yet measured, and deliberately not fixed.** Two
  mechanisms produce this identical symptom and nothing in any log separates
  them: either `weatherChange` does not fire for a scripted `setWeather`, or it
  fires with a `dimension` string that does not match the `Dimension.id` the
  funnel rows are keyed by. `WeatherChangeAfterEvent.dimension` is `string` and
  is the *only* `dimension: string` in the whole 2.9.0 surface, so its format is
  a legacy special case that this repo has never measured. The next step is a
  `qolprobe:weather` handler in `packages/probe` logging the raw value —
  probe first, then build, per CLAUDE.md. Changing `weather.ts` now would edit a
  shipped pack on a coin flip.
- `harvester_funnel` — passes alone, intermittent in sequence.
