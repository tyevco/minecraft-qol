# Guardian — Design Document

**Per-role difficulty and safety for a family realm**

Target: `@minecraft/server` 2.9.0 · no experiments · pack settings panel, no commands · v0.2, updated alongside the Phase 1–2 implementation

> **Status:** Phases 1 and 2 are built (`packages/guardian`). Sections marked
> *as built* record where the implementation settled a question this proposal
> left open. The pet shield (§4) is **built**; pet insurance is still open.

---

## 1. The pitch

The kids die to things the adults shrug off: a fall, a lava pocket, a creeper
at the door, a drowned in the pond. Difficulty is a world setting, so the only
lever today is to make the whole realm easier for everyone.

Guardian makes **how much damage a player takes** a per-role choice in the
pack's settings panel, alongside a few switches for the deaths that hurt most.
Kids as Members take half damage and never fall to their deaths; parents as
Operators play vanilla.

### Design stance

Guardian only ever **reduces** what would have happened. It never adds damage,
never touches a player whose role is set to vanilla, and never changes what
mobs do — only what lands. A Member still gets chased by the creeper; they just
survive it.

---

## 2. The mechanic: one before-event

`world.beforeEvents.entityHurt` is stable in 2.9.0 and exposes exactly what is
needed: `hurtEntity`, `damageSource.cause`, a **writable `damage`** and
`cancel`. So the whole feature is one handler:

```
on entityHurt (before):
  if hurtEntity is not a Player: return
  role = role of the player
  rule = table[role][damageSource.cause]
  if rule is "immune": cancel
  else damage = damage * rule.multiplier
```

The table is pure — `(role, cause) → multiplier | immune` — and tests
exhaustively over every `EntityDamageCause` × role. That is the same shape as
the QOL Times rules layer and the Lens spawn predicate: a decision table with
the engine kept out of it.

Before-event handlers run in read-only mode, which is fine here: setting
`damage` and `cancel` on the event is the one write they permit.

---

## 3. The panel

| Setting | Type | Default |
| --- | --- | --- |
| Visitors take | dropdown 100% / 75% / 50% / 25% / no damage | 25% |
| Members take | dropdown | 50% |
| Operators take | dropdown | 100% |
| Members and Visitors: no fall damage | toggle | on |
| Members and Visitors: no fire, lava or magma damage | toggle | on |
| Members and Visitors: no drowning | toggle | off |
| Void catch for Members and Visitors | toggle | on |
| Tell a player when Guardian softened a hit | toggle | off |

The multiplier is a dropdown rather than a slider so the choices read as
sentences (“Members take half damage”) and the values stay to a small tested
set. The immunity toggles apply only to the protected roles; an Operator set
to 100% is untouched by any of them.

*As built:* "protected" means **Visitors and Members, full stop**, not "any
role below 100%". The switches are the specific promise ("never falls to
their death") and hold for a Member at 100%; an Operator at 50% gets the
scale and none of the switches. That keeps "set Operators to 50%" a one-line
change with no surprise attached. The switches cover: fall, stalagmite and
elytra crash; fire, burning, lava, magma, campfires; drowning. `override`
(the `/kill` and `/damage` commands) and `none` are never touched by anything.

**Void catch** reuses Graves' ground tracker: a protected player whose `y`
drops below the dimension floor is teleported to where they last stood, with a
message, instead of dying. The tracker moves to `packages/shared/engine/` for
both packs.

*As built:* the tracker is `packages/shared/engine/groundTracker.ts` and
Graves now uses it too. The catch fires two blocks below the dimension floor,
trusts a footing up to twenty seconds old (the age of the sample is the length
of the fall), falls back to the player's spawn point when the tracker has
nothing for them (a `/reload` mid-fall), and otherwise leaves vanilla to it.
Falls are cancelled for three seconds after a catch, whatever the panel says,
in case the fall distance survives the teleport.

Script reads the panel with `world.getPackSettings()` and polls, exactly as
Graves does; a malformed value falls back to its default, never to vanilla.

---

## 4. Pets

Tamed animals dying is the other thing that ends a session, and the same
before-event covers the first half:

**Pet shield.** *Built, with one correction.* The design said to look for
`minecraft:tameable` with a `tamedToPlayerId`. There is no such thing on a
bonded pet: a tame event swaps the wild group away and the tameable component
goes with it, so what says "somebody's pet" is the `minecraft:is_tamed`
marker, and the owner's id is not readable at all. That is why the two panel
switches are about pets rather than about whose pet it is — falls, fire and
drowning off, and a player's blow off. Hostile mobs still hurt pets: a wolf
that could not die would break the wolf. One extra `entityHurt` subscription,
filtered to the causes the rules can act on; `decidePet` in `core/rules.ts` is
the decision, walked exhaustively by the unit tests, and
`guardian_shields_a_tamed_pet` pins it in game.

**Pet insurance** (phase 2, probe first). On a tamed pet's `entityDie`, spawn a
fresh one of the same type at the spot, call `tameable.tame(owner)`, restore
`nameTag` and the `minecraft:color` value (collar colour). `tame(player)` does
exist in 2.9.0 after all (the corrections table in `docs/README.md` used to say
otherwise), but the owner is the problem now: it cannot be read off a bonded
pet, so insurance needs a pack that recorded its own owner, as Hatchling will
have to (issue #98). Also unknown until measured: whether `tame()` accepts an
offline owner, and whether a respawned cat or parrot keeps its variant
(`minecraft:variant` is read-only from script, so the answer decides scope).

---

## 5. Performance

`entityHurt` fires for every damage event in loaded chunks — mobs fighting,
fall damage on cows, cactus. The handler's first line rejects non-players, so
the common case is one `instanceof` and a return. No intervals, no scans.

---

## 6. Risks and open questions

**Must prototype:**

1. That a cancelled `entityHurt` really lands no damage and plays no hurt
   animation, and that a scaled `damage` is honoured after armour — i.e. is
   `damage` pre- or post-armour? Decides whether “50%” means what the panel
   says.
2. Whether `entityHurt` fires for void damage at all. If not, void catch is
   the only cover, which is why it is a separate toggle.
   *Answered at the typings:* **there is no `void` in `EntityDamageCause`
   2.9.0.** Whatever the event does, the void cannot be matched by cause, so
   the catch is the cover. `none` is left untouched so that if the void does
   arrive unattributed, a 0% role is never cancelled into an endless fall.
3. The pet questions in §4.

Items 1 and 3 are measured by `qolprobe:hurt` in the probe pack; the pack
README lists the one-line change for each outcome.

**Design questions:**

- Should a protected player *see* that they were protected? A brief action-bar
  “§7Guardian softened that” makes the mechanic legible. Leaning yes, as a
  toggle, default off — the whole point is that dying stops being an event.
  *As built:* yes, as the last toggle, default off, at most once a second.
- Does 25% for Visitors make sense, or should Visitors simply be immune?
  Visitors cannot build, so they are spectators with a health bar.

---

## 7. Fit with the wider program

Guardian, Graves and Hearthstone are three answers to one question — *what
happens when a kid dies* — at three points in time: before (take less damage),
during (keep or store the items), after (respawn near home). They share the
role-based panel shape and, once extracted, the ground tracker.

---

## 8. Phasing

**Phase 1 — Damage table.** The before-event, the role × cause table, the
three dropdowns and three immunity toggles. Shippable alone. *Built.*

**Phase 2 — Void catch.** Extract the ground tracker to shared; teleport.
*Built.*

**Phase 3 — Pets.** Pet shield *built*; pet insurance once the owner can be
recovered and `tame()` is probed.
