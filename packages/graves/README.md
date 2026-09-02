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

## Layout

```
scripts/core/       pure: policy parsing, placement, transfer planning   <- vitest
scripts/engine/     settings poll, keep-on-death sweep, gravestone IO, index
behavior_pack/      manifest (format 3, with the settings panel), the gravestone entity
resource_pack/      gravestone model + texture (generated, see root README)
```

## To confirm in game

See §5 of the design doc. Two things the design rests on, measured by
`qolprobe:death` in the probe pack: that a dead player's inventory is still
readable inside `entityDie`, and that a script-set `keepOnDeath` really stops
the drop. Plus one thing about the panel: that a dropdown reads back as its
option name (`"grave"`), which `graves:debug` shows.
