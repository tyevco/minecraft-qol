# Harvest — Proposal

**Interact a mature crop to harvest and replant it**

Target: `@minecraft/server` 2.9.0 · no experiments · Proposal v0.1

---

## 1. The pitch

Farming is break, pick up, replant, sixty-four times. Every modded Java
experience fixes this the same way — right-click a mature crop and it
harvests and replants itself — and Bedrock has no equivalent.

Harvest is that, and only that. One event, one rule.

### Design stance

**Same drops, same seeds, same growth.** Harvest never yields more than
breaking the crop would, never skips the seed cost of replanting, and never
grows anything. It removes clicks, not gameplay.

---

## 2. The mechanic

```
on playerInteractWithBlock (before):
  if block is not a crop at its mature age: return
  cancel
  next tick:
    drops = LootTableManager.generateLootFromBlock(block, held item)
    withhold one seed of the crop's own kind from drops (replant cost)
    if no seed among the drops: withhold nothing, do not replant, spawn drops
    set the block to age 0
    spawn the remaining drops as items at the block
```

Everything in that list is stable: `playerInteractWithBlock` is a cancellable
before-event with `block`, `player` and the held `itemStack`;
`LootTableManager.generateLootFromBlock(block, tool)` honours Fortune and Silk
Touch so the drops are exactly vanilla's; `Block.setPermutation` resets the
age; `Dimension.spawnItem` drops the rest.

**The crop table** is pure data: block id → age state name, mature value, and
the seed item that replants it. Wheat, carrots, potatoes, beetroot,
nether wart, and cocoa (whose “age” is on the log side and whose seed is the
bean). Melon and pumpkin stems are excluded: their fruit is a separate block
and breaking the stem is never what the player wants. Sweet berries and cave
vines already harvest on interact in vanilla and are left alone.

Cocoa is the one with a real edge: it faces a direction and its replant must
keep `direction`. The table carries a list of states to preserve.

---

## 3. The panel

| Setting | Type | Default |
| --- | --- | --- |
| Harvest on interact | toggle | on |
| Require an empty hand | toggle | off |
| Who may harvest | dropdown everyone / members and operators / operators | everyone |

“Require an empty hand” exists because a player holding bone meal on a mature
crop expects bone meal to fail, not a harvest, and a player holding a hoe
expects a hoe swing. Default off because the mature-only rule already makes
the ambiguity rare.

---

## 4. Risks and open questions

**Must prototype:**

1. That cancelling `playerInteractWithBlock` on a mature crop stops the
   vanilla interaction (there is none for most crops, but bone meal is an item
   use on a block and may be a different event path).
2. That `generateLootFromBlock` returns the crop's drops rather than the
   block's silk-touch form when given a tool — and returns *something* when
   given `undefined`.
3. Whether `isFirstEvent` distinguishes the main-hand from the offhand pass;
   the handler must fire once per click.

**Design questions:**

- Should Harvest also replant from the player's inventory when the drops carry
  no seed (a crop with an unlucky roll)? Vanilla would leave the tile bare, and
  so does the rule above. Leaning no — “same seeds” is the promise.
- Sneak to bypass, so a player can still break a crop deliberately? Cheap,
  and `isSneaking` is stable. Probably yes.

---

## 5. Fit with the wider program

Fluidworks' design lists a **Harvester Funnel** that does this from a block
instead of a hand. The crop table here is the one it would use; write it once,
in `packages/shared/core/`.

---

## 6. Phasing

**Phase 1 —** wheat, carrots, potatoes, beetroot, nether wart. Shippable.

**Phase 2 —** cocoa, the sneak bypass, the role dropdown.
