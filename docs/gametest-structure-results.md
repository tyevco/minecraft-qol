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

Setup is one command, on Windows or Linux:

```
npm run bds:setup      download the server, deploy the packs, make the world
npm run bds:test       the whole suite, one test at a time, and judge it
```

`bds:setup` does, in order, what used to be a hand-made list:

1. Downloads the server build — the URL comes from
   `https://net-secondary.web.minecraft-services.net/api/v1.0/download/links`
   (`serverBedrockWindows` / `serverBedrockLinux`). **The CDN resets the
   connection without a browser `User-Agent`**; one is sent.
2. Unzips to `dist/bds/server` (`C:/bds/server` remains the Windows default for
   `run.mjs`; either way `BDS_DIR` overrides it).
3. Writes `server.properties`: `allow-cheats=true`, `online-mode=false`,
   `allow-list=false`, and `content-log-console-output-enabled=true` — that last
   one is what puts script errors on stdout. Leaving `allow-list=true` with
   `online-mode=false` is fatal, not ignored: the server refuses to start.
4. Builds and deploys every pack into the server's
   `development_behavior_packs/` — BDS reads that folder just as the client
   does. The deployment root comes from the environment, so `.env` and a
   developer's own game install are untouched:
   `CUSTOM_DEPLOYMENT_PATH=<server> MINECRAFT_PRODUCT=Custom`.
5. Boots once to generate the world, then turns the experiment on in its
   `level.dat` (below), and lists every pack in `world_behavior_packs.json` /
   `world_resource_packs.json` — a pack missing from those loads as if it did
   not exist, with no error to say why.

On Windows, **allow `bedrock_server.exe` through the Firewall**. It binds 19132
and 19133 on first run and blocks on the prompt, which is invisible to a script
driving it — the run just stalls before `Server started.`. The harness says so
after 60s rather than timing out silently.

## Experiments can be turned on without a client-made world

Experiments cannot be set from `server.properties`; they arrive with the world.
That was taken to mean **copying a world a person had toggled in the client**,
which is not available on a CI runner. It is not required.

`level.dat` is uncompressed little-endian NBT behind an 8-byte header (storage
version, then the body length), and a world BDS generates itself already carries
an `experiments` compound:

```
experiments: { experiments_ever_used: 0b, saved_with_toggled_experiments: 0b }
```

Adding `gametest: 1b` and setting both flags to 1 — `tools/bds/enable-experiments.mjs`,
which rewrites that one compound and fixes the length header — is enough. The
next boot logs:

```
Experiment(s) active: gtst
```

and `@minecraft/server-gametest` binds. The suite then runs on a world no client
has ever touched.

## In CI

`.github/workflows/gametest.yml` runs the whole thing on `ubuntu-latest`:
`npm ci`, `npx tsc --noEmit`, `npm test`, then `npm run bds:setup` and
`npm run bds:test`, and uploads the content log as an artifact whether it passed
or failed. That log is the same evidence a person would have pasted out of the
client.

Measured on the Linux build of BDS 1.26.45.1, glibc 2.39 (Ubuntu 24.04, which is
what `ubuntu-latest` is): the server runs, loads every pack, and reports the same
verdicts as the Windows build. The one environment requirement is **IPv6**: BDS
binds 19132 (v4) and 19133 (v6) and, if the kernel has no `AF_INET6` at all, it
reports *both* ports as "may be in use by another process" and exits — a
misleading message for a machine that simply has IPv6 compiled out.

`npm run bds:test` decides what a run means:

- tests come from the suite sources, so adding one to
  `packages/gametest/scripts/suites/` is all it takes to have it run;
- a failure is re-run **alone, up to twice**, before it is believed, because
  sequential tests contaminate each other (below). `turret_break_returns_arrows`
  does exactly this most runs: 20 arrows in the sequence, 10 alone;
- `packages/gametest/known-failures.json` lists the tests that fail for a reason
  that is not a bug, with the reason. One of those **passing** fails the run: the
  reason has expired and the entry should go;
- a test that reports nothing at all fails the run;
- script errors are printed but do not by themselves fail it. A simulated player
  made Graves, Lens, Guardian and Hearthstone throw on every spawn — 184 error
  lines in a clean run, over 500 by the time the villages suite existed —
  which was the harness, not those packs (below); since issue #31 the packs
  skip it and the count sits near zero.

## What the first full headless runs found

Twenty-two tests, three consecutive runs on Linux BDS 1.26.45.1 in a slow
container, plus the first run on a GitHub `ubuntu-latest` runner; each failure
re-run alone. **Twenty pass on the runner** — seventeen on the slow host, which
is itself a finding, below. The rest:

| Test | Result | What is established |
| --- | --- | --- |
| `turret_break_returns_arrows` | fails in sequence, passes alone | The contamination below, exactly as described. The harness's re-run alone is what makes the suite usable in CI. |
| `hatchling_egg_hatches_into_its_variant` | same, once in three runs | Same class. Nothing else seen from it. |
| `harvester_funnel` | passes on the runner; on the slow host, passes twice and fails once — **alone as well as in a sequence** | The intermittency noted below is not only contamination: `crop tile is minecraft:air; expected it replanted` came back from an isolated run too. This is why a failure is re-run alone twice rather than once. |
| `guardian_void_catch` | **passes, measuring nothing** | On a dedicated server a `SimulatedPlayer` is an **operator**, so the test's own first branch skips it — the switches never touch operators. It succeeds in seconds while Guardian's sweep is still throwing `cannot read property 'name' of undefined` in the same log. Setting `default-player-permission-level=member` does not change it; the world's stored level wins. |
| `anchor_sets_spawn` | fails | The marshalling hole, as already measured. In `known-failures.json`. |
| `rain_collector` | **fails everywhere** — alone, in sequence, and on the CI runner | `tank level 0, want >= 1 in rain`. Not the settings (`rain` defaults to true) and not the weather map's key (`WeatherChangeAfterEvent.dimension` is a `string` in 2.9.0, which is what `weather.ts` stores). Either the funnel reads its column as roofed, or `weatherChange` does not arrive on a server. `fluidworks:debug` cannot answer it from a console: like `rescan` before it, the handler drops an event with no `sourceEntity`. The one test that is red on every machine tried. |
| `funnel_places_into_clicked_tank` | fails on a slow host, **passes on `ubuntu-latest`** | The funnel is never placed at all on the slow host — the cell is air, not a funnel facing the wrong way. Four failures in a row there, including with `@minecraft/server-gametest` bound into Fluidworks, so it is not the marshalling hole. Then it passed first time on the CI runner. |
| `pipes_join_when_placed` | same: fails on a slow host, **passes on `ubuntu-latest`** | Both pipes place and neither gets an arm state — on the slow host. Passes on the runner. |

**The machine changes the answer, and that is the finding.** Same commit, same
world recipe, same server build: two tests failed four times each in a slow
container and passed first time on `ubuntu-latest`. Both drive a
`SimulatedPlayer` through `useItemOnBlock` and then wait **five ticks**, which is
about 250ms of a server that is keeping up and unbounded on one that is not. A
host too slow to place a block in five ticks is the leading explanation, not
confirmed. Treat a failure from either as "run it somewhere faster" before
treating it as a fact about Fluidworks — and prefer `test.succeedWhen` over a
fixed `idle` when writing a test that waits on the engine.

None of these is in `known-failures.json`: an unexplained failure is exactly the
one that should stay red. They are tracked in issue #29.

## A test in flight is silent, so the idle timer cannot end the run

The harness stops the server when output goes quiet, which is right between
tests and wrong during one: `rain_collector` waits out the weather and prints
nothing while it does. With only an 8s idle timer, the server was stopped in the
middle of it and **the twelve tests after it never ran** — reported as no result,
not as failures, which is at least honest but wasted a run.

`--seq` now waits for the verdict line of the test it sent, with its own
`--test-timeout` (180s), and the idle timer only applies between tests.

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

## A re-run alone is a clean room for blocks, not for records

The runner re-runs a failure **alone** before believing it, and CLAUDE.md says
to do the same by hand. That rule is sound for the three mechanisms above —
and it does nothing at all for a pack's own position-keyed records, because of
how the isolation is built: `runSession` in `tools/bds/test.mjs` boots a
**fresh server against the same world**. The world dynamic property the records
live in survives that restart, and test cells repeat across sessions, so the
re-run hands the test whatever the last session left on that cell.

Measured on `main` at `3783e6f`, from one `npm run bds:test` and the retry logs
it writes beside it. Every line is the same test, the same packs and the same
world file; the only thing that differs is the Bulwark boot line:

| session | `[Bulwark] ready ... N turret(s) known` | result |
| --- | --- | --- |
| `retry-5-turret_throws_splash_from_hopper-1` | **1** | fail — "the ammo gate materials were not taken (tier 3)" |
| `retry-5-turret_throws_splash_from_hopper-2` | **1** | fail — same message |
| `retry-6-turret_gate_holds_tipped_until_upgraded-1` | **1** | fail — "tier I fired the tint: 3 shots, hopper holds 5 of 8" |
| `retry-6-turret_gate_holds_tipped_until_upgraded-2` | **1** | fail — same message |
| a hand run of the same test minutes later | **0** | **pass** |

Those are the failures issue #106 attributed to the hold-fire commit. The
commit is innocent, and the pack is right in both directions:

- a turret adopted from a record already at ammo tier III **fires the tint**
  in a test that asserts tier I refuses it;
- a turret whose gate is already maxed **correctly takes nothing** when the
  test feeds it a fire charge, and the test, which waits for the material to
  leave the hopper, reads that as "the materials were not taken".

One cause, two opposite-looking symptoms, and a re-run cannot tell either from
a bug because the re-run is itself such a session.

The fix is the escape hatch `builder:forget` already had: a rig asks the pack
to forget the cell before it places anything there. `bulwark:forget x y z
[radius]` and `villages:forget x y z [radius]` now exist beside it, all three
taking their position on the line so they need no sender — a command from a
SimulatedPlayer or the console arrives with no `sourceEntity` at all. With
`placeTurret` calling it, a session that boots `1 turret(s) known` logs

```
[Bulwark] bulwark:forget ok: 1 turret(s) forgotten near 5,-27,8 in minecraft:overworld; 0 record(s) left
```

and both tests pass on the world that had failed them four times running.

Villages showed the same shape from the other side. A new test for the stale-
post sweep failed three times, always at its first step — "expected a person at
the post before the sweep, found 0" — in sessions booting `1 post(s) known`.
The record left on that cell was a post the **kids** had placed, and `tick`'s
"same post" check keeps such a record when a post of the same people and job is
set over it (right for a plaque being turned, wrong here). A kids' post spawns
nobody by design, so the test waited for a person that was never coming. With
`villages:forget` in `placePost` it passes, and the log finally reaches the
thing it was written to measure:

```
[Villages] villages:forget ok: 1 post(s) forgotten near 4,-27,6; 0 record(s) left
[Villages] retired the record of a post that is no longer there at 4,-26,6; 0 post(s) left
```

**So: read the pack's own "N known" line before believing any failure**, even
one that survived the re-run. A green line from a session that booted with
records is worth as much as a green line from a test with a skip branch.

## A SimulatedPlayer is invisible to every other pack

On headless BDS a `SimulatedPlayer` marshals as **`undefined`** into any
behaviour pack that does not itself bind `@minecraft/server-gametest` — every
`world.getAllPlayers()` entry and every after-event `.player`.

The evidence is in `dist/bds/seq3.log`: `cannot read property 'id' of undefined`
from Graves, Hearthstone and Lens begins at the first `Player Spawned: gv_tester`
and never stops. It is the same hole as the `sourceEntity=undefined` finding
above — a simulated player is not a player to anyone but its own test.

**What was done about the noise (issue #31).** Every pack now reads players
through `packages/shared/engine/players.ts`: `players()` is
`world.getAllPlayers()` with anything that is not a valid `Player` dropped,
and `isPlayer(ev.player)` guards each player after-event before it is used.
A real player marshals correctly, so nothing changes in play; a simulated
one is skipped instead of aborting the sweep. The finding below stands: the
packs still cannot see a simulated player, they just no longer throw about it.

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
- `rain_collector` — **measured since, and a known failure.** At the time two
  mechanisms produced this identical symptom: either `weatherChange` does not
  fire for a scripted `setWeather`, or it fires with a `dimension` string that
  does not match the `Dimension.id` the funnel rows are keyed by. The probe
  pack's module-scope subscription (`qolprobe` W1) settled it: the event never
  fires on a headless server at all, not for `setWeather`, not for the
  console's `weather rain`, not with a SimulatedPlayer present. So the test is
  in `known-failures.json`, `weather.ts` was right to leave alone, and whether
  the collector works in a real session is on the Fluidworks in-game list
  (#33). The corrections table in `docs/README.md` has the row.
- `harvester_funnel` — passes alone, intermittent in sequence.

## The suite reaches every pack (2026-09)

Lens had no in-game test at all, QOL Times had one of its four cauldron
machines covered, and Graves, Guardian and Hearthstone had one or two apiece —
each of them a test that a simulated player cannot make measure anything. The
suite grew by twenty tests, run on BDS 1.26.45.1. What follows is what they
measured; the tests themselves carry the numbers in their assertion messages,
so a future failure reads as a measurement rather than a shrug.

### The strategy for a pack a SimulatedPlayer cannot drive

Lens, Graves, Guardian and Hearthstone all hang off a player, and a
SimulatedPlayer marshals as `undefined` into every one of them (above). Driving
them through one measures the harness — that is what `anchor_sets_spawn` and
`guardian_void_catch` do.

What is worth pinning instead is the layer underneath: each of those packs is a
**pure decision applied to a handful of engine readings**, the pure half is
already exhaustively unit-tested with no game, and the engine half had never
been tested at all. So the new tests read the engine the way the pack reads it
and hand the answer to the pack's own `core/` function. The GameTest pack binds
`@minecraft/server-gametest`, so a SimulatedPlayer is an ordinary `Player` to
**it** even while being invisible to the pack under test, which is what makes
the equipment and respawn legs possible.

### What was measured

- **Light is what Lens says it is.** A sealed cell reads total 0, sky 0. A
  torch's own cell reads 14, and light down a sealed corridor is exactly
  `14 - d` at every step from 0 to 4 — a 6-connected flood losing one per step,
  not a radius and not a falloff curve. That is the model `core/lighting`'s
  `TORCH_EMISSION`, `TORCH_REACH` and every tier 2 torch suggestion are built
  on, and it had never been measured on a server.
- **The surface flags still read as `core/surface`'s header says.**
  `isLiquidBlocking(Water)` is true for dirt, a bottom slab and glass, false for
  a torch; water reads `isLiquid`. Glass is the block the three predicates
  disagree about in both directions, and they still disagree correctly: not a
  mob floor, passes light.
- **An item's dynamic property and its lore survive both a chest and an
  equipment slot.** That write-back is the Lens upgrade ritual's whole
  mechanism.
- **`ev.damage` and `ev.cancel` are honoured.** Measured on a cow, so Guardian's
  own player filter cannot interfere: a 4-damage hit halved in the handler costs
  exactly 2, and a cancelled hit costs nothing. Every scale on Guardian's panel
  rests on those two writes, and neither had been tested.
- **`setSpawnPoint` is honoured by vanilla respawn**, and setting one below the
  dimension floor throws. Hearthstone's entire mechanic is the first; its
  `try`/`catch` around `assignSpawn` is the second.
- **A water bottle built by script really is the water variant**
  (`potionEffectType.id === "minecraft:water"`), so the bottle rule's match on
  the potion component fires — two levels in, a glass bottle back, and two
  levels out again the other way.
- **A dye reaches `addDye` and moves the water's colour without costing a
  level**, which is the one cauldron effect the rules layer cannot express as a
  state change.
- **The gravestone holds 45 slots** — more than the 36 + 5 a player can carry,
  so `planTransfer` never has leftovers to leave on a corpse — and refuses
  damage.

### `EntityDamageCause` has a member the typings do not

`guardian_causes_match_the_engine` walks `Object.values(EntityDamageCause)`
against Guardian's hand-written table, and found exactly one difference:
**`void`**, which is in the 2.9.0 runtime and not in the published 2.9.0
typings. `docs/README.md` had a correction saying there is no such cause,
written from the d.ts. Reading a d.ts is not a measurement.

Confirmed from a pack that binds nothing but `@minecraft/server` 2.9.0 — the
probe's new `qolprobe:causes`, so the beta gametest binding cannot be what
conjures it:

```
G4 EntityDamageCause holds 36: anvil,...,temperature,thorns,void,wither
G4 has "void": true
```

This was a live bug, not a documentation tidy-up. While the table did not name
the cause, a void hit fell through `decide` to the role's scale: a role at 0%
was **cancelled out of void damage while still falling through the void**, and a
visitor at 25% was made harder to kill by it — the exact failure the `none`
pass-through was written to prevent. `void` is now in `CAUSES` and in
`PASS_THROUGH`.

### A SimulatedPlayer's death drops nothing

`keep_on_death_stops_the_drop` carries two stacks and flags only one, so that a
world which never drops cannot pass for the flag working. **Both come back.**
Twice, run alone. The world's `level.dat` reads `keepinventory` byte 0, so it is
not the gamerule and nothing the harness can set makes it measurable.

That is a harness finding, so the test is in `known-failures.json` — but it also
means **`death_keeps_items` is green for a reason that is not Graves working**,
the same way `guardian_void_catch` passes vacuously. Two tests in this suite now
prove nothing about their pack; both say so in their own text, and a green line
from either is not evidence.

### `Could not setBlock 'stone'` is still only a chunk-loading artefact

Four of the twenty new tests failed inside `rig.floor()` with
`gameTest.assert.couldNotSetBlock` on their first pass, three of them in a
strict alternating pattern, and **all three passed when the runner re-ran them
alone**. (The fourth, `keep_on_death_stops_the_drop`, re-ran to a different and
real result — the one below.) It is the
same unloaded-chunk artefact documented above under "Run tests one at a time",
and it now shows up in sequential runs too, not just `runset`. It moves between
runs and it is not a fact about any pack: read a first-pass `couldNotSetBlock`
as "not yet run", which is what the runner's re-run-alone rule is for.

### A leather item built by script has no colour to wash off

`new ItemStack("minecraft:leather_helmet")` carries **no
`minecraft:dyeable` component**, the same shape as the food components only
data-driven items have. `readItemColor` reads that component, so a script-built
helmet always looks undyed and the wash rule correctly refuses it — which is its
own test (`dispenser_leaves_undyed_leather_alone`, no level spent on a no-op).
Reaching the wash path at all would mean dyeing the helmet **in the world**
first, and that does not work either: `dispenser_washes_leather` uses a helmet
on a cauldron of dyed water four times and the component stays `undefined` —
the cauldron swallowing a simulated player's click, the same way it swallows a
placement (corrections table). So the happy path is unreachable headlessly and
the test is in `known-failures.json` with both halves of the reason; the
refusal half is measured and passing.

### A re-used world makes the two visitor tests fail, and the pack says so

A full local run of the grown suite came back 100/109 with five failures. Three
were the Bulwark ammo tests that are red on `main` too. The other two were
`villages_visitor_settles` and `villages_visitor_leaves_at_dawn`, which pass on
CI — and they failed **alone**, three times each, so the re-run rule did not
excuse them.

The Villages pack had already written the answer in the content log:

```
[Villages] ready at tick 84551: 11 post(s) known; block component registered
[Villages] a player placed a post at 4,-9,6; its record already existed (onPlace first)
[Villages] no visitor comes: visiting
```

A visitor from an **earlier run against the same world** was still recorded as
visiting, so the pack correctly refused to send another, and the test that asks
for one found none. The same world also carried eleven post records and the
posts the test places itself. `npm run bds:setup -- --fresh` deletes the world;
on a clean one both tests pass first time.

So this is the entity-and-records contamination already documented above, one
level up: not between two tests in a run, but **between runs**, through a
pack's own world dynamic properties. CI never sees it because every CI run
starts from a world that does not exist yet. Locally, a suite result from a
world that has been run against before is worth exactly as much as a re-run in
sequence — read the pack's own log lines before believing it, and re-run
`--fresh` before reporting a failure that CI does not have.

**Since fixed in the pack, and `--fresh` is no longer the answer to this one.**
The dangling flag was a real bug, of the same family as the stale post records
(issue #104): `state.visit` was cleared only when the visitor left at dawn, so
a visitor removed by anything else — killed, despawned, or taken by a structure
reload — left the settlement occupied by nobody for good. On the suite, where
the clock is set per test, the leaving dawn may never come, so
`villages_visitor_leaves_at_dawn` failed with "expected a visitor before dawn"
on a world booting `0 post(s) known`. The visitor poll now gives a visit up
after three consecutive polls that cannot find its visitor — three, not one,
because `world.getEntity` returns nothing for an entity in an unloaded chunk
exactly as it does for one that is gone (`core/visitors.ts` `visitLost`):

```
[Villages] the visitor (-124554051208) is no longer in the world; the visit is given up and the next comes on day 2
```

Both visitor tests then pass on a world that had just failed one of them.

What remains for those two is **not** contamination, and is issue #108: an
arriving visitor is put on the ground under `edgeSpot(settlement.centre)`, a
settlement's radius is 48 blocks, and the rig's `floor()` paints 8x8 - so an
edge spot off that square finds the world's own terrain about a hundred blocks
down. Measured: the settlement was right (`2 posts` at y = 44, the test's own
cell) and the visitor arrived correctly at **y = -60**, outside the test's
40-block search. It passes alone because the random draw sometimes lands on
the painted square, which is luck rather than isolation.
