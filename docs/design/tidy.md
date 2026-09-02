# Tidy — Proposal

**Chest sorting, deposit-all, and an item magnet**

Target: `@minecraft/server` 2.9.0 · no experiments · Proposal v0.1

---

## 1. The pitch

Three small inventory conveniences, one pack, each a toggle:

- **Sort.** Sneak-interact a chest and its contents are sorted and merged.
- **Deposit.** Sneak-interact a chest while holding nothing and every stack in
  your inventory that the chest *already contains* moves into it — the
  “dump matching” button from every inventory mod, without the button.
- **Magnet.** Dropped items within a few blocks drift to you, so a kid who
  knocked their diamonds into the lake gets them back.

### Design stance

Tidy moves items; it never creates, destroys or transforms them. A sorted
chest holds exactly what it held. Deposit only ever fills a chest with what
the chest's owner already chose to keep there, which is what makes it safe to
give to everyone: it cannot be used to stuff someone else's chest with junk.

---

## 2. The mechanics

**Sort and Deposit** hang off `playerInteractWithBlock` (before, cancellable)
gated on `player.isSneaking` and a block whose `minecraft:inventory`
component is present — chests, barrels, shulker boxes. The sort itself is a
pure function over a list of `(slot, typeId, amount, isStackableWith)`
descriptors: group by type, merge stacks that `isStackableWith` each other,
order by a stable key (type id, then amount descending). The engine applies
the result with `Container.moveItem`/`swapItems`/`setItem`. Sorting a
double chest sorts both halves as one; the engine reports it as one container.

Merging is where a bug would lose items, so the pure function is written to
be checked: the multiset of `(typeId, amount)` in equals out, asserted in the
test suite over random inventories.

**Magnet** is an interval every ten ticks: for each opted-in player,
`dimension.getEntities({ type: "minecraft:item", location, maxDistance })`
and `teleport` each item to the player's feet. Item pickup then happens in the
engine as normal. Items with a pickup delay (just thrown) are skipped by
checking they are older than a few ticks via the QOL Times `entitySpawn`
tracking pattern, so throwing something away still works.

---

## 3. The panel

| Setting | Type | Default |
| --- | --- | --- |
| Sneak-interact to sort a chest | toggle | on |
| Sneak-interact with an empty hand to deposit matching items | toggle | on |
| Item magnet for Visitors | dropdown off / 2 / 4 / 8 blocks | 4 |
| Item magnet for Members | dropdown | 4 |
| Item magnet for Operators | dropdown | off |

---

## 4. Risks and open questions

**Must prototype:**

1. That cancelling `playerInteractWithBlock` on a chest while sneaking does
   not also cancel the *non*-sneaking open — sneak-interact is how blocks are
   placed against chests, so the handler must require an empty hand or a
   non-placeable item for the sort, or the deposit will fire when a player
   meant to place a torch on the chest.
2. `Container.moveItem` semantics on a full destination slot.
3. Whether `teleport` on an item entity resets its pickup delay.

**Design questions:**

- Sort order: by type id is deterministic but not intuitive (all
  `minecraft:` prefixes). Grouping by creative-menu category would read
  better; the item's `getTags()` may be enough to approximate it.
- Should Deposit also fill *empty* slots with the player's matching stacks
  when the chest is full of that item? Yes — “already contains” is about type,
  not free space.

---

## 5. Phasing

**Phase 1 —** Sort and Deposit, with the empty-hand rule.

**Phase 2 —** Magnet, per role.
