# Graves

Per-player item preservation on death. Chosen per player, not per world, so the
players who find dying frustrating are protected without changing the game for
everyone else.

Design: [`docs/design/graves.md`](../../docs/design/graves.md).

```
/graves:mode                    show your mode
/graves:mode off|grave|keep     set it
/graves:admin <player> <mode>   operator: set someone else's
/graves:lock on|off             operator: stop others changing their own
/graves:list                    where your gravestones are
```

`off` is vanilla. `grave` puts your items in a gravestone where you died;
interact with it to take them back. `keep` leaves them in your inventory.

## How it works

`ItemStack.keepOnDeath` is a stable flag the engine honours. A sweep keeps
every stack a participating player carries flagged, so nothing drops. `keep`
is exactly that. `grave` adds one step at death: with the inventory guaranteed
intact, move it into a gravestone entity, which holds real `ItemStack`s in a
real container. No drop-chasing, no serialisation, no duplication path.

Every failure lands on "the player keeps the item".

## Layout

```
scripts/core/       pure: modes, placement, transfer planning   <- vitest
scripts/engine/     keep-on-death sweep, gravestone IO, commands, index
behavior_pack/      manifest, the gravestone entity
resource_pack/      gravestone model + texture (generated, see root README)
```

## For a family realm

Set the kids to `keep` and lock it:

```
/graves:admin Kid1 keep
/graves:admin Kid2 keep
/graves:lock on
```

## To confirm in game

See §5 of the design doc. `qolprobe:death` in the probe pack measures the two
things the design rests on: that a dead player's inventory is still readable
inside `entityDie`, and that a script-set `keepOnDeath` really stops the drop.
