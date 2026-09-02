# Waystones — Design Document

**Placed teleport points for Minecraft: Bedrock Edition**

Target: `@minecraft/server` 2.9.0 / `@minecraft/server-ui` 2.1.0 · no experiments · pack settings panel, no commands · Draft v0.2, verified against the installed typings

---

## 1. The pitch

The Hearthstone design doc wrote the tagline before either half existed:

> **Anchors catch you when you die. Waystones move you when you don't.**

A waystone is a placed block. Interact with it and a menu lists every other
waystone you have visited; pick one and you are standing beside it. It is the
fast-travel system Hearthstone deliberately refused to be, built on the same
substrate, and kept honest by one rule: **you must have touched a waystone to
travel to it.** Discovery still happens on foot. The network is something a
family builds together, one walk at a time, and the map of it is the map of
where they have been.

The problem it solves is the one behind every pack in this repo: on a realm
where the base, the village, the mine and the kids' outposts are each a
thousand blocks apart, "come and see what I built" costs ten minutes each way,
and "I don't know how to get back" ends sessions. Hearthstone and Graves
soften the consequences of being lost. Waystones remove the walk.

### Design stance

Waystones are **infrastructure, not loot.** No charge, no consumable, no
cooldown by default: a family realm wants the kids to get home, not to ration
it. The panel can add a cooldown or an experience cost for a server that wants
a brake.

Two rules the implementation must never break:

1. **Never move a player who did not ask.** A waystone acts only on the
   player who picked a destination from its menu, and only then. Nothing
   pulls, pushes or summons anyone.
2. **Never leave a player somewhere worse than where they started.** Arrival
   is validated after the teleport, and if the destination turns out to be
   walled in, flooded or gone, the player goes back to where they were, with
   anything they paid refunded. The same stance as Graves' "the player keeps
   the item": a feature whose purpose is to get you somewhere cannot itself
   be a way to get stuck.

---

## 2. The mechanic

### 2.1 Three verbs

- **Place** a waystone: it registers into the world index with a minted id,
  its position, the direction its rune face points, the placer, a default
  name, and a cached arrival spot (§3.2). The placer has visited it.
- **Interact** with a waystone: the player is marked as having visited it,
  and a menu lists every *other* waystone they have visited. Picking one
  teleports them to the validated standing spot in front of it. A player who
  has visited nothing else is told so, and told how to fix it.
- **Break** it: the row leaves the index. Its id is dead, so every visited
  set that still names it prunes it the next time that player opens a menu.

That is the entire feature. Everything below is how to do those three things
without surprising anyone.

### 2.2 Visited, not known

The visited set is the design's one deliberate constraint, and it should be
defended when someone asks for a "list all waystones" mode.

- It makes the network **earned**: a kid who has walked to the far outpost
  has a link the others do not, and can show them the way.
- It keeps the menu **short**: a realm accumulates stones for years, and a
  player's menu only ever holds the ones they care about.
- It **reveals nothing**: a player cannot learn where the others' bases are
  from a list. The Waypoints proposal's stance, "markers are for places you
  own or have earned", applies here too.

The panel has an escape hatch for operators (§5), which is the parent case:
"I want to pop over to where the kids are without walking there first."

### 2.3 Ids, not positions

A waystone's identity is a minted id (`seq` plus a random suffix), not its
coordinates. Visited sets store ids. So a stone broken and replaced on the
same spot is a new stone that nobody has visited, which is the honest
reading: the old link was to the old stone. It also means a rename never
touches anyone's visited set.

### 2.4 One interaction, one menu

`world.beforeEvents.playerInteractWithBlock` is the hook, in the same shape
Graves uses for its gravestone: cancel the vanilla interaction so a held block
is not placed against the stone, then open the menu from `system.run`, since
before-event handlers are read-only. Two guards:

- `isFirstEvent` is false for the second of the two events one interaction
  can raise (one per hand); ignore it, or the menu opens twice.
- A **sneaking** player is left to vanilla, so a builder can still place
  blocks against a waystone.

`BlockCustomComponent.onPlayerInteract` is the other option and is stable in
2.9.0. It is not used here because custom components register in
`system.beforeEvents.startup`, which `/reload` does not re-fire, and every
pack in this repo is built to survive `/reload`. If that ever changes, the
component is a drop-in.

---

## 3. Travel

### 3.1 What happens when a destination is picked

```
plan    verdict = tripAllowed(role, policy, lastTripMs, now, level)    pure
        if verdict is not ok: tell the player why, stop
        spot = row.spot                                             cached, §3.2
        if spot is undefined: "<name> is walled in", stop
        origin = { dimension, location, rotation }                 the way back

do      if policy.costLevels > 0: player.addLevels(-cost)            consume first
        player.camera.fade(...)                                     §3.4
        player.teleport(spot, { dimension, facingLocation: stone })
        record lastTripMs; lit-state and label refresh as normal

verify  after ARRIVAL_TICKS:
          if standing spot at player's feet: done, message "You arrive at <name>"
          else search up to 4 blocks for a clear gap; nudge there if found
          else teleport back to origin, refund levels, "Couldn't arrive at <name>"
```

Every stable API this needs was checked against the typings: `Entity.teleport`
and `tryTeleport` take `TeleportOptions` with `dimension`, `facingLocation`,
`rotation`, `keepVelocity` and `checkForBlocks`; `Player.addLevels` and
`level` exist; `Player.camera.fade` takes a colour and fade-in / hold /
fade-out seconds.

### 3.2 The arrival spot is cached, because the chunk is not loaded

This is the one technical wrinkle that shapes the data model. When a player
picks a destination, nobody is there, so its chunk is almost certainly
**unloaded**, and `getBlock` there throws `LocationInUnloadedChunkError`. The
standing spot **cannot be validated at travel time.**

So it is validated when it can be, and cached in the row:

- **On placement**, using Hearthstone's `chooseRespawn` (a two-block gap with
  a solid floor, four horizontal neighbours tried in order), preferring the
  block the rune face points at so builders can predict where people land.
- **Whenever the stone is touched** (interact, rename), and on every
  label/lit sweep for stones in loaded chunks (§7), it is re-validated. A
  builder who walls a stone in and then walks off sees the cached spot go
  `undefined` and the menu entry read "walled in" before anyone tries it.
- **On arrival**, when the travelling player has loaded the chunk, it is
  checked again and the row corrected. The player is a ticking entity, so
  the chunk is loaded by the time they are there; how many ticks that takes
  is the first thing to measure (§10).

`TeleportOptions.checkForBlocks` is passed as well, but it is belt and
braces: its semantics are undocumented and it cannot see an unloaded chunk
either. Our own validation is the one that counts.

### 3.3 Cross-dimension

`TeleportOptions.dimension` is stable, so a stone in the Nether is a
destination like any other. The panel can turn this off. Two things to
respect:

- The menu shows the dimension for a stone that is not in the player's, and
  no distance, since the number would be meaningless.
- The End is the case to prototype: floating islands, `heightRange`, and
  whether the arrival validator's "search up for a gap" can ever nudge
  someone off an edge. It cannot, by construction, since it only moves the
  player to a spot with a solid floor, but it is the first place to test.

### 3.4 Making it read as intentional

A bare teleport is a glitch. A teleport with a fade is a mechanic.

- `camera.fade` to black, fading in over 0.2 s, holding 0.4 s, out over
  0.4 s; the teleport fires at the start of the hold, so chunk pop-in
  happens behind the black.
- The enderman teleport sound (`mob.endermen.portal`) at both ends via
  `Player.playSound` and `Dimension.playSound`, and a burst of vanilla portal
  particles at the departure spot via `Dimension.spawnParticle`. Particle ids
  are confirmed against the vanilla list before shipping.
- An action-bar line on arrival: "You arrive at Riverside Camp."

### 3.5 What travel refuses

All of these are messages, never silent failures:

| Condition | Message | Source |
| --- | --- | --- |
| Role may not travel | "Waystones are off for visitors on this realm." | panel |
| Cooldown running | "You can travel again in 42 s." | `ws:last` vs `Date.now()` |
| Not enough levels | "Travelling costs 2 levels; you have 1." | `Player.level` |
| Destination walled in | "Riverside Camp is walled in." | cached spot |
| Destination gone | "Riverside Camp is gone." and the row is evicted | type mismatch on a loaded stone |
| Other dimension, travel off | "Cross-dimension travel is off." | panel |
| Riding something | "Dismount first." | `EntityRidingComponent` present |

The "gone" case is hard rule 6 in action: a stone removed by `/fill`, a
piston or an explosion is evicted the first time anyone finds it missing, and
that costs the player one wasted click, nothing else.

---

## 4. The menu

`ActionFormData` from server-ui 2.1.0, which is stable (`title`, `body`,
`button`, `divider`, `header`, `label`, `show`). One form per interaction:

```
Riverside Camp                                  title = this stone's name
  "You are at Riverside Camp. Pick a waystone."  body
  ├ button  Home Base            §7120 m          same dimension, nearest first
  ├ button  The Mine             §7640 m
  ├ button  Kids' Treehouse      §71.2 km
  ├ divider
  ├ button  Fortress Camp        §cNether         other dimensions after, by name
  ├ divider
  ├ button  Rename this waystone…                placer or operator only
  └ button  More…                                 page 2, if more than 8
```

- **Sorting** is pure and tested: same dimension by distance, then other
  dimensions by name. Stable, so the list does not reorder between openings.
- **Pagination** at eight per page with a "More…" button. The v0.1 proposal
  worried about twenty buttons on a controller; `Player.inputInfo.lastInputModeUsed`
  is stable and reports `Gamepad` / `Touch` / `KeyboardAndMouse`, so the page
  size can shrink for gamepad and touch if eight turns out to be too many.
- **Empty list**: the body reads "You haven't visited any other waystones
  yet. Find one on foot and touch it to link it here." The stone is still
  marked visited, so the very first stone a player touches is a discovery
  even though it opens an empty menu.
- **`UserBusy`**: `FormCancelationReason.UserBusy` means the client had
  another screen up. Retry once on the next tick, then give up quietly.
  Whether opening from `system.run` inside a cancelled before-event ever
  hits this is on the prototype list.
- **Distances** are shown in metres, rounded, switching to kilometres at a
  thousand. Enough to choose by, not a coordinate readout.

---

## 5. Configuration — the settings panel, no commands

The behaviour pack manifest is **format version 3** with a `settings`
section, in the shape Graves already ships (SemVer versions, `metadata.authors`
set). Script reads it with `world.getPackSettings()` through the shared
`createSettingsPoller`, polling every five seconds and diffing, since the
change event is beta-only. A missing or malformed value falls back to its
default, never to "off".

Behaviour-pack settings are per world, so "per player" means **per permission
role**, exactly as Graves and Guardian do it: on a Realm every player has one,
set from the member list.

| Setting | Type | Default |
| --- | --- | --- |
| Who may travel | dropdown: everyone / members and operators / operators | everyone |
| Who may place waystones | dropdown: everyone / members and operators / operators | members and operators |
| Who may travel to waystones they have not visited | dropdown: nobody / operators / everyone | operators |
| Cross-dimension travel | toggle | on |
| Cooldown between trips (seconds) | slider 0–300, step 5 | 0 |
| Travel costs experience levels | slider 0–10 | 0 |
| Show floating names over waystones | toggle | on |
| Show visited waystones on the locator bar | toggle | on |
| Only the placer or an operator may break a waystone | toggle | on |

Defaults are deliberate:

- **Unvisited travel for operators** is the parent's tool: reach the kids'
  outpost without walking there first. For everyone else the discovery rule
  holds, which is the point of the feature.
- **Placement for members and operators** rather than everyone: visitors
  cannot build anyway, and the dropdown exists so a realm can hand placement
  to operators alone if stones start appearing everywhere.
- **Break protection on**: a family realm's network should survive a kid
  with a pickaxe. The placer can always break their own; operators can break
  anything. Implemented with the cancellable `playerBreakBlock` before-event,
  the same shape as the interact hook.
- **No cooldown, no cost**: infrastructure, not loot. Both sliders exist so
  a survival-purist realm can add a brake without a code change.

Every control here has shipped before: Graves proved dropdowns and toggles,
and Fluidworks ships two sliders (`min`, `max`, `step`, `default` in the
manifest, read back as a number and clamped in its `core/policy.ts`). Copy
those shapes; `waystones:debug` prints what was read.

There are no commands. The one script event, `/scriptevent waystones:debug`,
prints what the pack believes the panel says, the caller's role and what it
permits, the stones the index holds, and the caller's visited set. The same
diagnostic shape as `hs:debug` and `graves:debug`.

---

## 6. Naming

Names are what make a waystone menu usable, so naming has to be easy on every
device the realm is played from, including a console with no keyboard.

### 6.1 Default

"Waystone (120, -340)": the word plus x and z. Good enough to tell two apart,
obviously a placeholder, and never wrong.

### 6.2 Rename from the menu

The v0.1 proposal said there was no typed input available. There is:
`ModalFormData.textField` is stable in 2.1.0, and so is the DDUI `CustomForm`
with `textField` bound to an `ObservableString`. The panel has no text field,
and a custom block has no sign-like input, but a form does, and on console
and mobile it opens the on-screen keyboard.

The DDUI form is the one to use, for one reason: **text filtering.**
`ObservableString.getFilteredText(player)` is stable and runs the typed text
through the same profanity filter as chat, returning either the filtered
string or a `TextFilteringError[]` (`DisabledByPlayer`,
`TextProcessorServiceUnreachable`, `Unknown`). A waystone's name is shown to
everyone on the realm, over the stone and in every menu, so it goes through
the filter before it is stored. If the filter is unreachable, the name is
stored as typed, which is the same fallback vanilla chat has.

Then a pure `sanitiseName`: strip `§` formatting codes, trim, cap at 24
characters, and an empty result restores the default. Who may rename: the
placer and operators.

The DDUI rule to design around: wait one tick between the `ActionFormData`
closing and the `CustomForm` opening, and `show()` resolves to a
`DataDrivenScreenClosedReason`, not a response object; the name is read from
the observable in the Save button's `onClick`.

### 6.3 Rename with a name tag

The no-keyboard path, and it costs nothing: use a **name tag** renamed at an
anvil on the stone. `PlayerInteractWithBlockAfterEvent.itemStack` carries the
held item and `ItemStack.nameTag` is readable, so a tag with a name renames
the stone and is consumed, exactly like naming a mob. A tag with no name does
nothing and is kept. This runs from the after-event, which may mutate, and it
skips the menu.

---

## 7. Legibility in the world

### 7.1 The block

A custom block with a generated model and texture through `tools/`, in the
Hearthstone's family: a waist-high standing stone on a plinth, a carved rune
on its front face. `minecraft:placement_direction` with
`minecraft:cardinal_direction` so the rune faces the placer, with the front
authored on +z as `tools/models/generate.ts` requires; the arrival spot is
the block in front of the rune. Low `minecraft:light_emission` so it reads at
night, `explosion_resistance` high enough that a creeper does not delete a
link in the family's network, and a `waystones:lit` boolean state driving a
`bone_visibility` swap on the rune, the pattern the Fluidworks pipe already
uses for its connection states (cast the state name, as `pipes.ts` does).

### 7.2 Floating name

A `TextPrimitive` over each stone showing its name, exactly as Fluidworks'
tank labels do it (`engine/labels.ts`): one shape per stone, keyed by
position, recycled between sweeps, within 24 blocks of a player, never more
than a quarter of `PrimitiveShapesManager.maxShapes`. Off from the panel.

### 7.3 Lit when someone is near

The rune lights when a player is within four blocks. It is set on the same
sweep that refreshes labels and re-validates arrival spots, so it is free,
and it makes the stone feel like it noticed you. It carries no per-player
meaning, because a block state is one value for everyone.

### 7.4 Locator bar

Each visited stone is a `LocationWaypoint` on the player's `LocatorBar`
(`WaypointTexture.SmallSquare`, coloured by dimension), through the shared
`waypoints.ts` module the Waypoints proposal specifies, keyed `ws:<id>`.
Re-added on `playerSpawn` since the bar is not persisted; removed when the
stone is broken or the player un-visits it by pruning. `LocatorBar.maxCount`
is readable, so the pack degrades to "nearest N" when a realm's worth of
stones exceeds the bar; how many that is, and whether a marker in another
dimension shows at all, are shared unknowns with the Waypoints proposal.

---

## 8. Data model and architecture

### 8.1 Storage

Per-block state lives in a world dynamic property keyed by position, on the
shared `positionIndex.ts`, because `minecraft:block_entity` is still
experimental in retail. Waystones is its second consumer after Fluidworks;
Hearthstone and Graves still carry their own copies of the pattern.

**World index** (`ws:stones`, schema in `ws:v`), one packed row per stone:

```
id      minted: seq + random suffix; what visited sets reference
dimId, x, y, z
name    display name, sanitised
owner   placer's minted player id (§8.3)
face    cardinal the rune points at; arrival is the block in front
spot    cached arrival spot [x, y, z], or null when walled in
seq     placement order, for stable ordering and the id
```

**Per player** (player dynamic properties, persisted across sessions):

```
ws:visited   JSON array of stone ids
ws:last      wall-clock ms of the last trip, for the cooldown
qol:pid      minted stable id, shared with Graves (§8.3)
```

A hundred ids in a visited set is around a kilobyte; the world index is well
inside the per-property cap at realm scale. Chunk keying stays where the
backlog has it: needed when a pack has thousands of rows, not dozens.

### 8.2 Index invalidation

Registered on `playerPlaceBlock`, removed on `playerBreakBlock`, per hard
rule 6. A stone that disappears any other way (`/fill`, a piston, an
explosion the resistance did not absorb) is caught by **eviction on type
mismatch** the next time the row is examined in a loaded chunk: on a travel
attempt (the "gone" message), on the label sweep, and on interact. Skip, never
evict, an unloaded chunk. `world.afterEvents.blockExplode` is stable and
worth subscribing so an exploded stone leaves the index immediately rather
than on first contact.

### 8.3 What moves to `packages/shared`

Waystones is where three copies of the same code become one. This is the
first commit of the implementation, before any waystone code:

| Today | Becomes | Consumers |
| --- | --- | --- |
| `graves/scripts/engine/identity.ts` (`gv:pid`) | `shared/engine/identity.ts` reading `qol:pid`, copying a `gv:pid` forward if present | Graves, Waystones, Bulwark's owner |
| `hearthstone/scripts/core/anchors.ts#chooseRespawn` + `main.ts#isStandingSpot` | `shared/core/standing.ts` (pure) + `shared/engine/standing.ts` | Hearthstone, Waystones, Guardian's void catch |
| `hearthstone/scripts/engine/registry.ts` | retired in favour of `shared/engine/positionIndex.ts` | Hearthstone |
| `fluidworks/scripts/engine/labels.ts` | `shared/engine/labels.ts`, parameterised on the text | Fluidworks, Waystones |
| (new, from the Waypoints proposal) | `shared/engine/waypoints.ts` | Waystones, then Graves and Hearthstone |

Each is a behaviour-preserving move with the existing tests carried along,
and Hearthstone's GameTest guards the one that touches shipped code.

### 8.4 Layout

```
packages/waystones/
  scripts/core/       pure, under vitest:
    stones.ts           row type, default name, id minting, sorting, pagination
    policy.ts           panel parsing, mayTravel / mayPlace / mayBreak, tripAllowed
    names.ts            sanitiseName
    visited.ts          mark, prune
  scripts/engine/     index, settings poll, menu, travel + arrival verify,
                      rename forms, labels, lit sweep, waypoints
  scripts/main.ts     wiring: events, the sweep, waystones:debug
  behavior_pack/      manifest (format 3, settings), block, recipe
  resource_pack/      model + texture, generated from tools/
  tests/              policy table, sorting, sanitiseName, prune, tripAllowed
```

The decision is in `core/`, the mutation in `engine/`. `tripAllowed` is the
Guardian-style pure table: `(role, policy, lastTripMs, now, level) → verdict`,
tested exhaustively across roles and settings with no mocks.

### 8.5 Build

A new `PACKS` entry in `just.config.ts` with `external` listing **both**
`@minecraft/server` and `@minecraft/server-ui`, matching the manifest's
`dependencies`: Waystones is the first pack besides QOL Times to need forms,
and a mismatch fails at runtime with no build error. `hasResourcePack: true`.
Fresh UUIDs for the pack and both modules.

---

## 9. Performance

Nothing runs per tick. The feature is interaction-driven.

1. **The menu and the teleport** happen on interact and on a form response.
   Zero cost while nobody is touching a stone.
2. **One slow sweep** every 40 ticks walks **players, not stones**
   (Hearthstone's rule): for each online player, filter the in-memory index
   to stones in their dimension within label distance, then refresh that
   stone's label, lit state and cached arrival spot. That is integer distance
   maths over a small array, followed by a handful of `withBlock` calls for
   the stones that are actually nearby.
3. **Settings poll** every 100 ticks, as every pack does.
4. **Arrival verification** is one `system.runTimeout` per trip.
5. **Guard unloaded chunks** everywhere with `withBlock`; the sweep skips a
   stone whose chunk is not loaded, which is most of them.

**Budget target:** 100 stones and 20 online players with no measurable cost,
and a trip that lands inside a second.

---

## 10. Risks and open questions

**Must prototype** (the probe pack gets `qolprobe:tp` and `qolprobe:arrive`
for the first two; each is a fifteen-minute measurement and a results
document):

1. **Teleport into an unloaded chunk in another dimension.** Does the player
   land at the coordinates, and how many ticks until `getBlock` at their
   feet works? This sets `ARRIVAL_TICKS` and decides whether verification
   needs to retry. Also whether `tryTeleport` ever returns false in
   practice, and what `checkForBlocks` does.
2. **The End.** Teleport to a cached spot on an outer island and check the
   verifier's behaviour at the edge.
3. **Forms from a cancelled before-event.** Whether `ActionFormData.show()`
   from `system.run` inside `playerInteractWithBlock` shows reliably or
   returns `UserBusy`, and whether `isFirstEvent` is the right double-fire
   guard.
4. **`getFilteredText` on a Realm** with a child account, and the one-tick
   rule between an `ActionFormData` closing and a `CustomForm` opening.
5. **Name tag readability.** That `itemStack.nameTag` is set on an
   anvil-renamed name tag in the interact event, and that decrementing it
   from the after-event works.
6. **Pistons on a custom block.** Whether a waystone can be pushed. If it
   can, the type-mismatch eviction covers it; if there is a component that
   prevents it, use it.
7. **Locator bar** limits and cross-dimension visibility, shared with the
   Waypoints proposal.
8. **Fade timing.** That `camera.fade` starts before the teleport lands, so
   the black covers the pop-in rather than following it.

**Design questions:**

- **Should an operator be able to summon a player to a stone?** The parent
  case again: a lost kid, a parent at the base. It breaks rule 1 ("never
  move a player who did not ask") unless the kid consents, which is a
  `MessageFormData` yes/no on their screen. Worth building as a consented
  pull in Phase 4, never as a silent one.
- **A "home" stone per player, reachable from anywhere?** Hearthstone covers
  this when you die; alive, it makes every other stone redundant. Not built.
- **Should a waystone next to a Hearthstone share its name?** Hearthstone
  rows have no names yet. When they do, a stone placed within a few blocks
  of an anchor could adopt its name, and the pair reads as one place:
  "Riverside Camp" catches you when you die and moves you when you don't.
  Phase 4, and only if Hearthstone grows names first.
- **Combat lock?** No travel within a few seconds of being hurt
  (`entityHurt` after-event is stable). A survival-server rule, not a family
  one. Behind a panel toggle in Phase 3 if asked for, default off.

---

## 11. Verification

**Unit (no game).** Vitest over `scripts/core/`: `tripAllowed` across every
role, cooldown and cost combination; menu sorting and pagination against
fixed positions; `sanitiseName` edge cases (codes, whitespace, length,
empty); `prune` against a live-id set; the arrival-spot chooser once it is
shared.

**GameTest.** `waystone_registers_and_lights`: a simulated player places two
stones with `useItemOnBlock` (so `playerPlaceBlock` fires and the pack
indexes them), walks to each and `interactWithBlock`s it. The test asserts
what it can see from outside the pack: both blocks present, and the
`waystones:lit` state true on the stone the player is standing beside, which
proves the sweep found it in the index. If a dynamic property written by one
pack is readable from another (to confirm; the Graves test could not read
Graves' panel, but pack settings are pack-scoped by design), it also asserts
the player's `ws:visited` set holds both ids. The teleport itself is behind
a form, which a simulated player cannot answer, so the trip is verified by
hand and by the probe; everything up to it is pinned.

**In game.** The probe measurements above, then: place two stones a
thousand blocks apart, walk between them, travel back, check arrival is in
front of the rune and facing it; wall one in and confirm the menu says so;
`/fill` one away and confirm the "gone" eviction; try the End.

---

## 12. Fit with the wider program

Waystones shares nearly everything with something already built: the
position index and settings poll with Fluidworks, the role-based panel with
Graves and Guardian, the standing-spot validator and the block pipeline with
Hearthstone, the label pattern with Fluidworks, the model and texture
generators with all of them, and the waypoints module with the Waypoints
proposal. The extraction table in §8.3 is the concrete list; once it is done,
Waystones is a form, a block, and the travel sequence in §3.1.

With both halves built, the pairing is the product: a Hearthstone beside a
waystone is a place you can always get back to, whether you died or not.

---

## 13. Phasing

**Phase 0 — Extract.** The §8.3 moves into `packages/shared`, with tests
carried along and Hearthstone's GameTest still green. No waystone code.

**Phase 1 — Stone and menu.** Block with generated model, index, visited set,
`ActionFormData` menu with sorting and pagination, teleport with arrival
verification and revert, format-3 panel with the three role dropdowns and the
cross-dimension toggle, `waystones:debug`, the GameTest. Shippable.

**Phase 2 — Legibility.** Rename via `CustomForm` with text filtering, name
tag rename, floating names, lit rune, fade and sound, locator-bar waypoints.

**Phase 3 — Policy.** Cooldown, experience cost, break protection, combat
lock if wanted.

**Phase 4 — Reach.** Consented summon, Hearthstone name adoption, and
whatever block entities reaching retail unlocks.
