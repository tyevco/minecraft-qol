# QOL Times

Dispenser automation and Java-parity fixes for Minecraft Bedrock. Stable scripting
APIs only — **no experimental toggles**, so worlds keep achievements and are never
permanently flagged experimental.

Targets `@minecraft/server` 2.9.0 / `@minecraft/server-ui` 2.1.0
(`min_engine_version` 1.26.40). Intended for a Realm, shipped as `.mcaddon`.

## Headline feature

Dispensers interact with cauldrons: fill and drain with buckets and bottles, dye
the water, wash leather armour.

Worth knowing: **this does not exist in Java Edition either.** Mojang closed the
Java requests as Invalid (MC-9910, MC-220164, MC-165196) and Java players use
mods for it. So this is net-new automation on both editions, not a parity fix.
The genuine parity gaps handled here are armour-stand placement (MCPE-80145) and
equipping armour onto villagers and wandering traders (MCPE-41432, MCPE-76479).

## Setup

```bash
npm install
cp .env.example .env     # then edit CUSTOM_DEPLOYMENT_PATH
```

`.env` is gitignored because it holds a machine-specific absolute path and an XUID.

### Why `MINECRAFT_PRODUCT="Custom"`

Since Bedrock 1.21.120 the Windows build moved from UWP to GDK. Mojang's
`BedrockGDK` target resolves to
`%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang`, but on machines
migrated from the old UWP build **that path is a dangling symlink** pointing at a
`LocalState\games\com.mojang` that no longer exists. Real data lives under the
numeric per-user (XUID) folder, so we use `Custom` and point at it directly.

Check yours before trusting either path:

```bash
ls "$APPDATA/Minecraft Bedrock/Users/Shared/games/com.mojang"   # broken here
ls "$APPDATA/Minecraft Bedrock/Users"/*/games/com.mojang        # the real one
```

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Vitest over the pure rules layer. No game required. |
| `npm run build` | `tsc` typecheck, then esbuild bundle to `dist/scripts/main.js`. |
| `npx just-scripts package` | Copy the pack + bundle into `development_behavior_packs`. |
| `npm run local-deploy` | Build + deploy, then watch and repeat on save. |
| `npm run mcaddon` | Produce `dist/packages/qol_times.mcaddon` for Realm upload. |

In game, `/reload` re-runs scripts. Turn on **Settings → Creator → Content Log
GUI** to see output; `console.warn()` always appears there, `console.log()` only
at Verbose/Info, which is why the code uses `warn` throughout.

## Architecture in one paragraph

There is **no dispenser event** in the Bedrock scripting API, and custom block
components can only attach to custom blocks, never to vanilla `minecraft:dispenser`.
So we use vanilla's own failure mode: a dispenser that cannot use its item ejects
it as an item entity. We detect that ejection via `entitySpawn`, attribute it to a
dispenser geometrically, and convert it into the interaction we wanted — but only
after diffing the dispenser's container against a recent snapshot to *prove* it
actually just lost that item. Without that proof, anyone could throw an empty
bucket beside a dispenser full of cobblestone and mint a free lava bucket.

`scripts/core/` is pure: no `@minecraft/*` imports, so it unit-tests in plain Node.
Everything engine-facing lives outside it, and `scripts/dispenser/io.ts` is the
single adapter that knows how a cauldron is represented.

## Status

- **Done** — project scaffold, build/deploy/package pipeline, pure rules layer for
  buckets / bottles / dye / wash, 28 passing unit tests.
- **Next: Phase 0** — the probe below must be run before the interceptor is built.
- **Then** — interceptor + rig registry, settings UI (`/qol:settings`), parity
  features, GameTest pack.

## Phase 0 — run the probe first

Two unanswerable-from-docs questions can invalidate the whole design, so the probe
pack answers them before any real code depends on them. It **only logs**; it
mutates nothing unless you explicitly arm the removal test.

It is already deployed to `development_behavior_packs/qol_times_probe`.

1. Make a **creative, flat, cheats-enabled** test world (not the Realm).
2. Enable the **QOL Times PROBE** behavior pack. Turn on **Content Log GUI**
   (Settings → Creator) and set GUI Log Level to Info.
3. Build a rig: a dispenser facing a cauldron. Put a **water bucket** in the
   dispenser and a button/lever on it.
4. Run `/scriptevent qolprobe:scan` while standing near the rig.
5. Pulse the dispenser.
6. Run `/scriptevent qolprobe:arm`, then pulse it again.

### What to look for

| Log line | Question it answers |
| --- | --- |
| `U1 ITEM SPAWN ... item=minecraft:water_bucket` | **Blocking.** If this never appears, `entitySpawn` does not fire for items and the architecture must fall back to polling. |
| `U2 remove() verdict=...` | **Blocking.** `SUCCEEDED` is what we need. `SILENT NO-OP` is the dangerous one — it would dupe an item on every pulse. |
| `U3 vs PREV-TICK` / `vs SAME-TICK` | Whether the dispenser has already decremented its slot when the event fires. Decides how container snapshots are timed. |
| `U4` — the `vel=` field | Whether velocity is populated at spawn, i.e. usable as a corroborating signal. |
| `U5 triggered_bit ...` | The waveform across a pulse: one-tick pulse or latched while powered. |
| `U6` — `fluid_container=PRESENT fillLevel=N` | Whether the stable component exists on a vanilla cauldron, and whether `fillLevel` is 0–6 or 0–1. Fill a cauldron to different levels by hand and re-run `scan` to read the scale off directly. |
| `mappingAgrees=true` | Confirms `facing_direction` really is 0=down, 1=up, 2=north, 3=south, 4=west, 5=east. |

Also confirm the premise itself: the dispenser should **eject the bucket onto the
floor** rather than placing water inside the cauldron block. Repeat with a lava
bucket, and with an empty bucket against a full cauldron.

Paste the `[QOLPROBE]` lines back and the interceptor can be built against real
behaviour instead of assumptions.
