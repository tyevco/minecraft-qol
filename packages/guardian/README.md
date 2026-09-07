# Guardian

Per-role damage scaling and safety switches, from the pack's settings panel.
The kids take less damage and never fall to their deaths, and neither do the
animals they tamed; the adults play vanilla. Guardian only ever **reduces**
what would have happened: it never adds damage, never touches a role at 100%
with no switches on, and never changes what mobs do, only what lands.

Design: [`docs/design/guardian.md`](../../docs/design/guardian.md). Phases 1
(damage table), 2 (void catch) and the pet shield half of phase 3 are built;
pet insurance is still to come (issue #52).

## The panel

Open it from the world's pack list, or in game from Settings → Behavior Packs
→ Guardian → the gear icon.

| Setting | Default | Meaning |
| --- | --- | --- |
| Visitors take / Members take / Operators take | 25% / 50% / 100% | how much of each hit lands: **100%** (vanilla, never touched), 75%, 50%, 25%, or **No damage** |
| No fall damage | on | falls, landing on a stalagmite, an elytra crash |
| No fire, lava or magma damage | on | fire, burning, lava, magma blocks, campfires |
| No drowning | off | |
| Void catch | on | a player who falls out of the world is put back where they last stood, with a message |
| Tell a player when Guardian softened a hit | off | a brief action-bar line, at most once a second |
| Pets never take fall, fire or drowning damage | on | every **tamed** animal in the world |
| Players cannot hurt a tamed pet | on | theirs or anyone else's: the sibling's sword, the stray arrow |

The pet switches are the exception to all of that: they are about pets, not
about roles. A pet has no permission level of its own, its owner may be
offline, and the owner's id is not even readable once the tame event has swapped
the tameable component away (see below) - so "whose pet is it" is not a
question the panel asks. A hostile mob can still hurt a pet: a wolf that
cannot lose a fight is not a wolf, and a pet that cannot lose is not one
anybody has to look after. What is taken away is the deaths nobody chose.

The four player switches apply to **Visitors and Members only**, whatever their
percentage: they are the specific promise ("never falls to their death") and
hold even for a role at 100%. Operators are never affected by them; an adult
who wants less damage sets their own dropdown.

Behaviour-pack settings are per world, so the role is the per-player handle:
on a Realm every player has one, set from the member list. Kids as Members
and parents as Operators is the family setup.

No commands. `/scriptevent guardian:debug` prints what the pack read from the
panel, your role and percentage, the verdict for four sample causes, the pet
verdicts, and where the void catch would put you.

## How it works

One before-event. `world.beforeEvents.entityHurt` is stable in 2.9.0 and
exposes `damageSource.cause`, a writable `damage` and `cancel`; those two
writes are the only thing a before-event handler may do, and they are all
this needs. The subscription is filtered to players in the engine, so mobs
fighting, cows falling and cactus never reach script.

The decision is a pure table, `(role, cause) -> vanilla | scale | immune`, in
`scripts/core/rules.ts`, walked exhaustively by the unit tests over every
`EntityDamageCause` × role × panel. Order: causes Guardian never touches
(`override`, i.e. `/kill`, and `none`); a recent void rescue forgives the
landing; the hazard switches; then the role's percentage. 0% is immunity to
everything scalable.

The void catch is a teleport, not a damage rule: **there is no `void` cause in
`EntityDamageCause` 2.9.0**, so a fall out of the world cannot be matched, and
cancelling its damage would leave a player falling forever anyway. A sweep
every half second remembers where each player last stood (the same tracker
Graves uses to place a gravestone after a void death, now in
`packages/shared/engine/groundTracker.ts`) and, when a protected player is
below the dimension floor, puts them back there, or at their spawn point if
the tracker has nothing (a `/reload` mid-fall). Falls are cancelled for three
seconds after a catch in case the fall distance survives the teleport.

**The pet shield is a second subscription**, not a wider filter on the first.
The player handler is filtered to `minecraft:player` in the engine, which is
what keeps every mob fight out of script; this one is filtered to the causes
the pet rules can act on (`PET_CAUSES`: the hazards, plus `entityAttack` and
`projectile`), and its first line is a boolean read of the panel, so with both
pet switches off it costs nothing. The decision is the same shape as the
player table - `decidePet(cause, byPlayer, policy) -> vanilla | immune` - and,
as there, `override` and `none` pass straight through, so `/kill` still works
on a pet that has to go.

What counts as somebody's pet is the **`minecraft:is_tamed` marker**, not the
tameable component. A tame event swaps the wild group out and
`minecraft:tameable` goes with it, so a bonded hatchling - and a vanilla pet,
built the same way - has no tameable component to ask. That is measured; the
owner's id is not readable at all, which is exactly why these switches do not
try to be per-owner. It is also what blocks pet insurance today.

Measured in game (`guardian_shields_a_tamed_pet`): a tamed hatchling takes no
lava damage, and a **wild** wolf in the same arena still takes its fall
damage - Guardian is not quietly shielding every animal in the world.

## Layout

```
scripts/core/       pure: the damage table, the panel parser, the rescue choice   <- vitest
scripts/engine/     settings poll, the hurt handler, the pet shield, the void sweep
behavior_pack/      manifest (format 3, with the settings panel); nothing else
```

No resource pack: Guardian has no blocks, items or visuals.

## To confirm in game

The probe pack has `qolprobe:hurt` for all of these. Disable Guardian while
probing, or its own writes show up in the numbers.

1. **Is `damage` pre- or post-armour?** Wear full iron, take a zombie hit,
   compare the before-event's `damage` with the health actually lost. If they
   match, "50%" means half of what would have landed. If the before-event
   number is larger, it is pre-armour and the panel's percentage is applied
   before armour reduces it further, so the kids are slightly *better* off
   than the label says. Either way the table is the same; only the README
   wording changes.
2. **Does the void fire `entityHurt`, and with what cause?** Half answered
   since, and not the half expected: there **is** a `void` member in the 2.9.0
   runtime enum, though the published typings have none. Measured by
   `guardian_causes_match_the_engine` and confirmed from a stable-only pack
   with `/scriptevent qolprobe:causes` (36 causes, `void` among them). It is in
   `CAUSES` and in `PASS_THROUGH` now — until it was, a void hit fell through
   `decide` to the role's scale, so a role at 0% was cancelled out of damage it
   cannot escape. What is still unmeasured is whether a real void death
   actually **arrives** with that cause rather than `none`; both are
   pass-through, so nothing depends on the answer, and `qolprobe:hurt` reports
   it the next time somebody jumps.
3. **Does a fractional `damage` land as a fraction?** 25% of a 1-damage cactus
   tick is 0.25. If the engine rounds it to 0, the smallest hits vanish for
   the 25% roles, which is fine, but worth knowing.
4. **Does a teleport reset fall distance?** If a rescued player takes landing
   damage in the three-second grace, the grace is doing its job; if they take
   it after, lengthen `RESCUE_GRACE_TICKS` in `engine/shield.ts`.
5. **Does the format-3 panel read dropdowns back as the option name**
   (`"50"`)? `parseScale` accepts the number too, and `guardian:debug` shows
   what was read.
6. **Can a player hurt a tamed pet?** Hit your own or a child's pet with a
   sword, then shoot one with an arrow. Both should do nothing while
   "Players cannot hurt a tamed pet" is on. This is the one pet rule a
   headless run cannot measure: a SimulatedPlayer marshals as `undefined`
   into Guardian, so `damagingEntity instanceof Player` is false however the
   blow was struck. If it turns out a player's hit arrives with no
   `damagingEntity` for a real player either, the rule has to key on the
   cause alone, which would also stop a hostile's blow - so measure before
   changing it.
7. **Does a vanilla pet keep working?** Feed a tamed wolf, sit it, let it
   fight a zombie. The zombie should still hurt it, and the wolf should
   still be able to die of that. A pet that cannot lose a fight is the one
   thing this shield must not do.

The GameTest pack pins the invariants: `guardian_never_adds_damage` and
`guardian_void_catch` — neither of which measures the pack on a headless
server, since Guardian cannot see a simulated player (issue #31) — plus three
that do:

- `guardian_causes_match_the_engine` walks `EntityDamageCause` itself against
  the hand-written `CAUSES`, both ways, and every hazard switch's members with
  it. The table is copied by hand so `core/` stays free of `@minecraft/*`, and
  this is the only thing in the repo that would notice the engine drifting from
  it. It has already caught one: `void`.
- `guardian_hurt_event_softens_and_cancels` proves the two writes the whole
  pack is built on — a reduced `ev.damage` is honoured, `ev.cancel` stops the
  hit — on a cow, so the pack's own player filter cannot interfere.
- `guardian_shields_a_tamed_pet` is the pet shield end to end: a tamed
  hatchling takes no lava damage, and a **wild** wolf in the same arena still
  takes its fall damage.
