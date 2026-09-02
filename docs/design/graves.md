# Graves — Design Document

**Item preservation on death, chosen per player role, for Minecraft: Bedrock Edition**

Target: `@minecraft/server` 2.9.0 · no experiments · Draft v0.2, written alongside the implementation

---

## 1. The pitch

Some players on a family realm find dying frustrating — younger ones especially,
for whom "I lost everything" ends the session. Others want the vanilla stakes.
The `keepInventory` game rule cannot serve both: it is one switch for the whole
world.

Graves makes the choice **per player role**, from the pack's settings panel:

| Mode | On death |
| --- | --- |
| `off` | Vanilla. Items drop where you died and despawn in five minutes. |
| `grave` | Items move into a **gravestone** at the death site. Walk back and interact to take them. |
| `keep` | Items stay in your inventory. Like `keepInventory`, for you alone. |

Behaviour-pack settings are per world, so the panel cannot name individual
players. The handle it does have is the **permission role** — visitor, member,
operator — which on a Realm is already assigned per player from the member
list. Kids as Members and parents as Operators is per-player control from the
panel, with nothing for a child to toggle back.

### Design stance

**Nothing here may lose an item that vanilla would have kept.** Every failure
path resolves to "the player keeps the item". A feature whose purpose is to
stop items being lost cannot itself be a way to lose them.

---

## 2. The substrate: `ItemStack.keepOnDeath`

The obvious implementation — catch the drops as item entities on the death tick
and pour them into a container — has an ordering problem (do drops spawn before
or after `entityDie`?), an attribution problem (which drop belonged to whom?),
and a duplication risk if either guess is wrong. QOL Times spent a probe and a
results document on exactly this class of question for dispensers.

None of that is needed. `ItemStack.keepOnDeath` is a **stable, settable flag**
in 2.9.0, and the engine honours it: a flagged stack never drops when its
carrier dies. So:

- A sweep every second sets the flag on every stack a participating player
  carries — inventory, armour, offhand — and clears it on every stack a vanilla
  player carries. It writes only stacks whose flag is wrong, so the steady-state
  cost is a few dozen reads per player.
- `keep` mode is that sweep and nothing else. The engine does all the work.
- `grave` mode adds one step at `entityDie`: the inventory is guaranteed intact,
  so the items are **moved** from the dead player into a gravestone. No drops
  are ever involved.

The flag travels with the stack. An item handed to another player carries the
giver's setting until the next sweep, under a second. That is the one known
imperfection and it only matters if the receiver dies inside the window.

---

## 3. The gravestone

A **custom entity**, not a block. Custom blocks cannot hold a container in
retail (experimental only), but a custom entity can carry `minecraft:inventory`,
and script reads and writes it through the stable `EntityInventoryComponent`.
Items are stored as real `ItemStack`s in a real container — enchantments,
durability, names, lore and dynamic properties all survive, because nothing is
serialised by hand.

The entity is persistent, has no gravity or collision, is immune to damage and
knockback, cannot be pushed, and shows its name (“Steve's grave”) permanently.
Ownership and the armour-slot map are entity dynamic properties, so the stone
is self-describing; a world-level index exists only so `/graves:list` can print
coordinates without scanning.

**Placement** (`core/placement.ts`, pure): the death spot if the player was
standing inside the world; otherwise the most recent place they stood on the
ground within the last ten seconds — the case for void deaths and being shot
out of the air; otherwise the death spot clamped into the world.

**Transfer** (`core/transfer.ts`, pure): armour first, then inventory slots in
order. If the stone turns out to hold fewer slots than the player carried,
whatever does not fit stays in the player's inventory, still flagged — a short
stone loses nothing.

**Retrieval:** the owner (or any operator) interacts with the stone. Armour goes
back on if the slot is free, everything else into the inventory, and anything
that does not fit stays in the stone for a second visit. The stone removes
itself only when empty. If the stone is destroyed by `/kill`, vanilla spills an
entity inventory onto the ground, so even that loses nothing.

---

## 4. Configuration — the settings panel, no commands

The behaviour pack's `manifest.json` is **format version 3**, the first in the
repo, which is what unlocks a `settings` section: SemVer strings for every
version, and `metadata.authors` set (a documented temporary requirement). The
panel is reachable from the world's pack list, and in game from Settings →
Behavior Packs → the pack → the gear icon.

| Setting | Type | Default |
| --- | --- | --- |
| Visitors | dropdown off / grave / keep | keep |
| Members | dropdown | grave |
| Operators | dropdown | off |
| Tell a player where their gravestone is | toggle | on |
| Anyone can open any gravestone | toggle | off |

Defaults are deliberate: Members is the role a Realm gives a new player, so a
newcomer gets a gravestone; operators keep vanilla; visitors, who cannot build
anyway, keep everything.

Script reads the panel with `world.getPackSettings()`, which is stable. The
change event is beta-only, so the pack polls every five seconds and diffs; a
change takes effect on the next keep-on-death sweep after it, under a second.
A missing or malformed value falls back to its **default**, not to vanilla, so a
half-loaded settings blob never silently unprotects anyone.

There are no commands. The one script event, `/scriptevent graves:debug`,
prints what the pack believes the panel says, the caller's role and mode, and
their gravestones — the same diagnostic shape as Hearthstone's `hs:debug`.

## 5. What was verified, and what to measure

Against the installed 2.9.0 typings: `ItemStack.keepOnDeath` is settable;
`EntityInventoryComponent.container` and `Container.setItem/addItem` are stable;
`EntityDieAfterEvent.deadEntity` is the player; `playerInteractWithEntity` has
a cancellable before-event; `Dimension.heightRange` and `Player.isOnGround`
exist; `world.getEntity(id)` resolves a loaded entity.

**To measure in game** (the probe pack has `qolprobe:death` and
`qolprobe:keepflag` for it):

0. That the format-version-3 manifest loads and the panel appears with all five
   controls, and that `getPackSettings()` returns the dropdown's option **name**
   (`"grave"`), not its display text. `graves:debug` shows what was read.

1. Is a dead player's inventory container readable and writable inside
   `entityDie`? If not, `grave` degrades to `keep` — the flag still holds — and
   the transfer should move to `playerSpawn`.
2. Does the engine honour `keepOnDeath` set from script exactly as it honours
   the `keep_on_death` item component? Expected yes; the probe compares a death
   with and without the flag.
3. Does `inventory_size: 45` on a custom entity really yield 45 slots? A player
   carries at most 41. If the engine caps lower, the tail stays with the player.
4. Whether the flag shows anything in the item tooltip.

## 6. Not built, deliberately

- **XP.** Vanilla drops experience orbs regardless; Graves does not touch them.
  Recording `getTotalXp()` at death and re-granting it would duplicate whatever
  the player then walks over. Needs the orbs removed on the death tick, which is
  the drop-chasing this design avoided. Backlog.
- **Public graves after a timeout.** Owner-or-operator only. A timeout is a
  small addition if wanted.
- **Hearthstone integration.** None needed: a player who dies near an anchor
  respawns near their gravestone, which is the composition the Hearthstone doc
  predicted.
