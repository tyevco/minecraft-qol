# Graves

Item preservation on death, chosen per player role from the pack's settings
panel. The players who find dying frustrating are protected without changing
the game for everyone else, and there is nothing for a child to toggle back.

Design: [`docs/design/graves.md`](../../docs/design/graves.md).

## The panel

Open it from the world's pack list, or in game from Settings → Behavior Packs
→ Graves → the gear icon.

| Setting | Meaning |
| --- | --- |
| Visitors / Members / Operators | one of **Off** (items drop, vanilla), **Gravestone** (items wait in a gravestone where they died; interact to take them back), **Keep** (items stay in their inventory) |
| Tell a player where their gravestone is | a chat line with coordinates on death |
| Anyone can open any gravestone | otherwise only the owner and operators can |
| Show a player's gravestone on their locator bar | a red circle at each stone the player owns, in the dimension they are in, until it is emptied |

Behaviour-pack settings are per world, so the role is the per-player handle:
on a Realm every player has one, set from the member list. Kids as Members
and parents as Operators is the family setup.

No commands. `/scriptevent graves:debug` prints what the pack read from the
panel, your role and mode, and where your gravestones are.

## How it works

`ItemStack.keepOnDeath` is a stable flag the engine honours. A sweep keeps
every stack a participating player carries flagged, so nothing drops. `keep`
is exactly that. `grave` adds one step at death: with the inventory guaranteed
intact, move it into a gravestone entity, which holds real `ItemStack`s in a
real container. No drop-chasing, no serialisation, no duplication path.

Every failure lands on "the player keeps the item".

The locator-bar marker is drawn through `packages/shared/engine/waypoints.ts`
(design: [`docs/design/waypoints.md`](../../docs/design/waypoints.md)). The
gravestone registry is its whole input: a stone placed or emptied by any path
shows or clears on the next sync, without a second bookkeeping trail. Each
player sees only their own stones; an operator emptying someone else's clears
the owner's marker on their next sync.

## Layout

```
scripts/core/       pure: policy parsing, placement, transfer planning,
                    which stones to mark                                 <- vitest
scripts/engine/     settings poll, keep-on-death sweep, gravestone IO, index
behavior_pack/      manifest (format 3, with the settings panel), the gravestone entity
resource_pack/      gravestone model + texture (generated, see root README)
```

## To confirm in game

A pale wisp should rise from in front of the inscription: the client entity's
idle animation emits `graves:wisp` at the `wisp` locator, engine-driven.

See §5 of the design doc. Two things the design rests on, measured by
`qolprobe:death` in the probe pack: that a dead player's inventory is still
readable inside `entityDie`, and that a script-set `keepOnDeath` really stops
the drop. Plus one thing about the panel: that a dropdown reads back as its
option name (`"grave"`), which `graves:debug` shows.

The locator-bar marker is unmeasured; `qolprobe:waypoint` covers the engine
questions and issue #37 lists the fallbacks. For this pack: die with
items in `grave` mode and, on respawn, a red circle points at the stone
(`graves:debug` lists `gv:grave:<id>@x,y,z`); empty the stone and the circle
goes; die twice without collecting and two circles show. If the marker sits
one block off the stone, `placeGrave` floors the position and the marker
centres on that block - check which the stone entity itself renders at.
