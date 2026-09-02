# Guardian

Per-role damage scaling and safety switches, from the pack's settings panel.
The kids take less damage and never fall to their deaths; the adults play
vanilla. Guardian only ever **reduces** what would have happened: it never
adds damage, never touches a role at 100% with no switches on, and never
changes what mobs do, only what lands.

Design: [`docs/design/guardian.md`](../../docs/design/guardian.md). Phases 1
(damage table) and 2 (void catch) are built; pets are phase 3.

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

The four switches apply to **Visitors and Members only**, whatever their
percentage: they are the specific promise ("never falls to their death") and
hold even for a role at 100%. Operators are never affected by them; an adult
who wants less damage sets their own dropdown.

Behaviour-pack settings are per world, so the role is the per-player handle:
on a Realm every player has one, set from the member list. Kids as Members
and parents as Operators is the family setup.

No commands. `/scriptevent guardian:debug` prints what the pack read from the
panel, your role and percentage, the verdict for four sample causes, and
where the void catch would put you.

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

## Layout

```
scripts/core/       pure: the damage table, the panel parser, the rescue choice   <- vitest
scripts/engine/     settings poll, the hurt handler, the void sweep
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
2. **Does the void fire `entityHurt`, and with what cause?** Expected: `none`,
   or not at all. If it arrives as some other cause, add it to `PASS_THROUGH`
   in `rules.ts` so nobody is left falling forever with the catch off.
3. **Does a fractional `damage` land as a fraction?** 25% of a 1-damage cactus
   tick is 0.25. If the engine rounds it to 0, the smallest hits vanish for
   the 25% roles, which is fine, but worth knowing.
4. **Does a teleport reset fall distance?** If a rescued player takes landing
   damage in the three-second grace, the grace is doing its job; if they take
   it after, lengthen `RESCUE_GRACE_TICKS` in `engine/shield.ts`.
5. **Does the format-3 panel read dropdowns back as the option name**
   (`"50"`)? `parseScale` accepts the number too, and `guardian:debug` shows
   what was read.

The GameTest pack pins the invariants: `guardian_never_adds_damage` and
`guardian_void_catch`.
