# Hearthstone — Design Document

**Regional spawn anchors for Minecraft: Bedrock Edition**

Target: `@minecraft/server` 2.9.0+ / `@minecraft/server-ui` 2.1.0+ · Format version 1.26.20+ · Draft v0.1

---

## 1. The pitch

A placed block that catches players who die nearby without a spawn point set, and sends them back to it instead of to world spawn.

The problem it solves is specific and common. A new player joins a realm, wanders out with the group, dies in a cave, and wakes up a thousand blocks away at world spawn with no idea how to get back. Beds solve this, but only for people who know to place one, and only after they've already found wool. The gap is worst for exactly the players least equipped to handle it.

Hearthstone closes that gap without touching anyone who has already set their own spawn. It is deliberately invisible to experienced players.

### Design stance

This is a **safety net, not a fast-travel system**. It never overrides a player's own choice, never teleports anyone who didn't die, and never competes with beds. If a player has taken any action to set their spawn, Hearthstone stops managing them permanently.

---

## 2. Core mechanic

### 2.1 The inversion

The naive implementation intercepts death and corrects the respawn location afterward. Don't do that. There is no before-event that lets you override a respawn destination, so the correction happens after the player has already materialized at world spawn. The result is a visible teleport flicker and a moment of confusion — the exact experience the feature exists to prevent.

**Instead, assign pre-emptively.**

When a player is within an anchor's radius and has no spawn point set, silently call `setSpawnPoint()` to that anchor. Vanilla respawn then does all the work, instantly and correctly. Death handling requires zero code.

```
on evaluation tick:
  for each player:
    if player.getSpawnPoint() is undefined:
      anchor = nearest registered anchor within radius
      if anchor exists:
        player.setSpawnPoint(anchor.respawnLocation)
        record ownership in player dynamic properties
```

### 2.2 Ownership tracking

Once you set a spawn point, the player has one — so by the naive eligibility test they'd never be eligible again. Track that you set it.

Store in player dynamic properties:

```
hs:owned  : "x,y,z,dim"   — the location Hearthstone assigned
hs:v      : number         — schema version
```

On each evaluation, compare `getSpawnPoint()` against `hs:owned`:

| Comparison | Meaning | Action |
|---|---|---|
| Matches | Hearthstone still owns this player's spawn | A nearer anchor may take over |
| Differs | Player slept in a bed or used a respawn anchor | Clear `hs:owned`, stop managing this player |
| Undefined | Spawn was reset somehow | Eligible again |

This gives correct precedence for free. A real bed always wins, permanently, and the system never fights the player's own decisions.

### 2.3 Nearest wins

Overlapping anchors resolve by straight-line distance. Ties break by placement order (earlier wins) so the result is stable rather than flickering between two equidistant anchors.

---

## 3. The block

**Hearthstone** — a custom block, crafted mid-early game.

- `minecraft:block_entity` with `dynamic_properties` for name, radius, owner, and mode
- `TextPrimitive` floating label showing its name and, optionally, its radius
- `LocationWaypoint` on the locator bar so players can find it, respecting the `playerWaypoints` game rule
- Interact opens a `CustomForm` for configuration
- Subtle ambient particles so it reads as active

### 3.1 Block data

```
name   : string   — display name, shown on the label and in respawn message
rad    : number   — effective radius, clamped to config bounds
owner  : string   — player persistentId, or empty for public
mode   : number   — 0 public, 1 owner only, 2 allowlist
allow  : string   — comma-joined persistentIds when mode = 2
v      : number   — schema version
```

Configuration persists through being mined and re-placed via the `carry_over_block_entity_data` loot function (26.40). This is what makes a configured anchor feel like a real object rather than a script side effect.

### 3.2 Respawn location, not block location

Never set the spawn point to the anchor block's own coordinates — the player will spawn inside it or on top of it awkwardly. Compute a validated offset:

1. Check the four horizontal neighbours at the anchor's Y for a two-block-tall air gap with a solid floor.
2. Prefer the face the anchor was placed against, so builders can predict where players land.
3. Cache the resolved location in block data; re-validate on placement and when a neighbouring block changes.
4. If no valid spot exists, mark the anchor as **obstructed**, show it on the label, and skip it during evaluation.

Visible failure over silent failure. An obstructed anchor that says so is debuggable; one that quietly does nothing is a support ticket.

---

## 4. Evaluation and performance

Anchors are cheap, but only if you never scan for them.

**Rules:**

1. **Index on place.** Anchors register into a world dynamic property index keyed by chunk on `onPlace`, and deregister on `onPlayerDestroy`. Never call `getBlock` across a region hunting for anchors.
2. **Walk players, not anchors.** One `system.runInterval` at 40–100 ticks iterates online players and tests each against nearby indexed anchors. Player count is small and bounded; anchor count is not.
3. **Extra triggers.** Also evaluate on `playerSpawn` (including `initialSpawn`) and on dimension change, so a new player is covered the moment they arrive rather than up to five seconds later.
4. **Short-circuit the common case.** A player with a bed-set spawn is checked with a single `getSpawnPoint()` call and a string compare. That's the majority of players in an established world, and it should cost nothing.
5. **Chunk with `runJob`** if player counts get large — relevant on BDS, irrelevant on a four-player realm.
6. **Guard against unloaded chunks.** `LocationInUnloadedChunkError` is a real throw. Validate before touching an anchor block.

**Budget target:** no measurable cost with 50 anchors and 20 online players.

---

## 5. Configuration

### 5.1 Per-anchor — DDUI

`CustomForm`, opened on interact. Reactive, so the obstructed state and current claim count update live while it's open.

```
Hearthstone
  ├ label     status: active / obstructed
  ├ label     players currently anchored here: N
  ├ divider
  ├ textField name
  ├ slider    radius (bounded by pack settings)
  ├ dropdown  access: public | owner only | allowlist
  ├ toggle    show waypoint marker
  └ button    Save
```

DDUI constraints to respect: wait a tick between closing one form and opening another; controls can't be added to a shown form, only Observable values updated; `show()` resolves to `DataDrivenScreenClosedReason`.

### 5.2 Pack settings

Server-level policy belongs in pack settings, not an in-game menu, so it's decided before the world loads.

```
[x] Hearthstone enabled
    Default radius:        [slider  16–256]
    Maximum radius:        [slider  16–512]
    Max anchors per player: [slider  0 = unlimited]
[x] Show waypoint markers
[x] Show floating labels
[ ] Allow anchors in Nether / End
[x] Notify player on respawn ("You woke at <name>")
```

Use `world.getPackSettings()` and subscribe to `PackSettingsChangeAfterEvent` so radius changes apply live.

---

## 6. Risks and open questions

**Must prototype:**

1. **Non-Overworld anchors.** Beds don't set spawn in the Nether or End, and respawn anchors are the vanilla Nether mechanic. Whether `setSpawnPoint()` accepts a Nether or End `DimensionLocation` and survives an actual respawn needs a direct test. **If it doesn't work, scope Hearthstone to the Overworld and remove the pack setting.** This is a fifteen-minute experiment and should happen before anything else is built.

2. **World spawn versus undefined.** Confirm that a player who has never slept genuinely returns `undefined` from `getSpawnPoint()` rather than the world spawn coordinates. The documented example branches on undefined, so this looks right, but verify on a fresh world and on a world converted from an older version.

3. **Respawn point clearing.** When a player's bed is destroyed, vanilla clears their spawn point. Confirm `getSpawnPoint()` returns undefined afterward — if so, Hearthstone correctly picks them back up, which is exactly the desired behaviour and a nice emergent detail.

4. **`persistentId` for ownership.** The field formerly called `playfabId` was renamed `persistentId`. Confirm it is stable and consistent across sessions before using it as an ownership key.

**Design questions:**

- **Should anchors cost anything to use?** Respawn anchors consume glowstone. A charge cost makes anchors a managed resource; free makes them infrastructure. Leaning free — this is a safety net, and a safety net that runs out isn't one.
- **Public or owner-scoped by default?** Public suits the "new player on a realm" case, which is the whole point. Owner-scoped suits faction servers. Default public, configurable.
- **Should the player be told?** A one-line message on respawn ("You woke at Riverside Camp") makes the mechanic legible instead of magic. Recommend yes, with a toggle.
- **Anchor limit per player.** Unlimited invites spam; a limit invites frustration. A pack setting defaulting to unlimited seems right for a QOL framing.

---

## 7. Fit with the wider pack

Hearthstone shares its substrate with three features already scoped:

- **Waystones** — same block-entity config pattern, same `CustomForm` shape, same waypoint registration. Build one, and the second is mostly reuse.
- **Graves** — a player who dies near an anchor respawns close to their grave, which makes both features better than either alone.
- **Tank labels / TextPrimitive** — the same label system, drawn at the same distance, honouring the same pack setting.

If Hearthstone ships alongside waystones, the framing writes itself: **anchors catch you when you die, waystones move you when you don't.**

---

## 8. Phasing

**Phase 1 — Core.**
Anchor block, pre-emptive assignment, ownership tracking, world index, respawn offset validation. No config form; fixed radius from pack settings. This is already shippable.

**Phase 2 — Legibility.**
`CustomForm` config, naming, floating labels, waypoint markers, respawn notification.

**Phase 3 — Policy.**
Access modes, allowlists, per-player anchor caps, admin command to list and jump to anchors.

**Phase 4 — Reach.**
Non-Overworld anchors if the prototype allows. Linked anchor networks. Anchor-to-anchor travel, if it can be added without turning a safety net into a fast-travel system.
