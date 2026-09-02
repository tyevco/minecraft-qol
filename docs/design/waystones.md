# Waystones — Proposal

**Placed teleport points for Minecraft: Bedrock Edition**

Target: `@minecraft/server` 2.9.0 / `@minecraft/server-ui` 2.1.0 · no experiments · Proposal v0.1

---

## 1. The pitch

The Hearthstone design doc wrote the tagline before either existed:
**anchors catch you when you die, waystones move you when you don't.**

A waystone is a placed block. Interact with it and a menu lists every other
waystone you have visited; pick one and you are there. It is the fast-travel
system the Hearthstone doc deliberately refused to be, built on the same
substrate, kept honest by one rule: **you must have touched a waystone to
travel to it.** Discovery still happens on foot.

### Design stance

Waystones are infrastructure, not loot. No charge, no consumable, no cooldown
by default — a family realm wants the kids to get home, not to ration it. The
panel can add a cooldown for servers that want one.

---

## 2. The mechanic

- **Place** a waystone: it registers into the world index (the Hearthstone
  `registry.ts` pattern, extracted to shared) with its position and a name.
- **Interact** with a waystone: the player is marked as having visited it,
  and an `ActionFormData` (stable in server-ui 2.1.0) lists every other
  visited waystone by name with distance and dimension. Pick one: `teleport()`
  to the validated standing spot beside it — the same `chooseRespawn` logic
  Hearthstone already tests.
- **Break** it: deregister, and clear it from every player's visited set on
  their next interaction.

**Naming.** There is no text field in the settings panel and no sign-like
input on a custom block. Two options that need no typing: name it after the
nearest Hearthstone within its radius, or take the name from a name tag used
on it — `ItemStack.nameTag` is readable in `playerInteractWithBlock`, so
“use a renamed name tag on the stone” names it. Falls back to “Waystone at
x, z”.

**Visited set** lives in a player dynamic property as a list of waystone
ids. Cheap and private to the player.

---

## 3. The panel

| Setting | Type | Default |
| --- | --- | --- |
| Who may travel | dropdown everyone / members and operators / operators | everyone |
| Cooldown between trips | slider 0–300 s | 0 |
| Cross-dimension travel | toggle | on |
| Show waystones on the locator bar | toggle | on |
| Travel to unvisited waystones | toggle | off |

The last toggle is the escape hatch for a realm that wants the kids to be able
to reach the parents' outpost without walking there first.

---

## 4. The block

Custom block with a generated model and texture through `tools/`, in the
style of the Hearthstone: a waist-high standing stone on a plinth, with a rune
face that could later glow when the stone is “active” (a block state flipped
by script). `minecraft:light_emission` low, so it reads at night.

Per-block state is exactly what Hearthstone already handles without block
entities: position-keyed rows in a world dynamic property, deregistered on
break.

---

## 5. Risks and open questions

**Must prototype:**

1. `teleport()` across dimensions with `TeleportOptions.dimension` — stable in
   the typings, unverified in game for the End's floating islands.
2. That a chest-sized `ActionFormData` with twenty buttons is usable on a
   controller. Probably paginate at ten.
3. `LocationWaypoint` per waystone on the locator bar: is the per-player
   `maxCount` large enough for a realm's worth of stones? The typings expose
   `count`/`maxCount`, so the pack can degrade to “nearest five”.

**Design questions:**

- Should travel cost anything? The doc says no, but a realm could want XP
  levels as a soft brake. A slider in the panel, default 0, costs nothing to
  add later.
- Should there be a “home” waystone bound to each player, reachable from any
  other? That is Hearthstone's job when you die; alive, it may be too much.

---

## 6. Fit with the wider program

Shares the world index, the block pipeline, the model generators, the
settings poll and the respawn-spot validation with Hearthstone. Enough of the
implementation is reuse that this is mostly a form and a block.

---

## 7. Phasing

**Phase 1 — Stone and menu.** Block, index, visited set, `ActionFormData`
travel, panel. Shippable.

**Phase 2 — Names and waypoints.** Name-tag naming, locator-bar waypoints,
active-rune state.

**Phase 3 — Policy.** Cooldown, cost, unvisited travel.
