# Fluidworks — Design Document

**A fluid logistics system for Minecraft: Bedrock Edition**

Target: `@minecraft/server` 2.9.0+ / `@minecraft/server-ui` 2.1.0+ · Format version 1.26.20+ · Draft v0.1

---

## 1. The pitch

Bedrock has no fluid logistics. Cauldrons are the only fluid container in the game and nothing can automate them — you fill them by hand, you empty them by hand, and every recipe that touches them costs a click per item. Concrete is the worst offender: turning a stack of powder into concrete is 64 manual clicks, and building-scale survival needs thousands.

Fluidworks generalizes that gap into one system:

> **Cauldrons are tanks. Funnels are pipes. Dispensers are ports.**

Every machine in the pack is an application of that single sentence. A player who understands it can predict what any two blocks will do when placed next to each other, which is the property that makes vanilla redstone teachable and most tech addons opaque.

### Why this instead of a grab-bag QOL pack

- It fills a **platform gap**, not a convenience shortcut. There is no vanilla path to this, so it doesn't read as cheating.
- It is **shaped like vanilla** — reuses cauldrons, hoppers, and dispensers rather than introducing a parallel machine ecosystem.
- It has **natural growth**: fluids today, item routing and wireless linking tomorrow, all on the same block-entity substrate.
- Several recipes are **Bedrock-exclusive**, because Bedrock cauldrons hold dyed water and potions where Java's do not. This is content Java modpacks cannot copy.

---

## 2. Design principles

1. **One mental model.** If a player has to read a wiki to know which block goes where, the design failed.
2. **No new inventory paradigm.** Use hoppers and chests for item movement. Fluidworks only adds the fluid layer.
3. **Vanilla-first visuals.** Blocks should look like they were always there. No neon energy cables.
4. **Failure is visible.** A machine that isn't working shows why — particles, a label, or a message on interact. Never silent.
5. **Everything is optional.** Every machine and every convenience toggles independently via pack settings. Someone who only wants the concrete mixer should be able to have only the concrete mixer.
6. **Config survives the pickaxe.** Break a configured funnel, place it back, it remembers. This is what separates a finished feature from a prototype.

---

## 3. Core model

### 3.1 Tanks

A **cauldron** is a tank. Vanilla cauldrons work unchanged; Fluidworks simply reads and writes their state.

Contents recognized:

| Content | Source | Notes |
|---|---|---|
| Water | Vanilla | Base case |
| Lava | Vanilla | Heat source for some recipes |
| Powder snow | Vanilla | Harvestable from snowfall |
| Dyed water | Vanilla (Bedrock only) | Colour data lives in block entity NBT — see §9 risks |
| Potion | Vanilla (Bedrock only) | Potion identity lives in block entity NBT — see §9 risks |

A **Reinforced Cauldron** (custom block, optional tier) holds more, shows its level as a floating label, and can be filtered to accept one fluid type.

### 3.2 Conduits

The **Funnel** is the core custom block. It is a directional block that moves one fluid unit per operation from a source face to a destination face.

- Placed with `minecraft:placement_direction` for orientation
- Carries a `minecraft:block_entity` with `dynamic_properties` for its configuration
- Configured via a `CustomForm` on interact
- Chains: a funnel accepts from a cauldron, another funnel, or a port, and outputs to any of the same

**Fluid Pipe** (cosmetic tier) is a funnel variant that only connects funnel-to-funnel, uses `minecraft:connection` states for visual joining, and does not accept a filter. Cheaper to craft, cheaper to tick.

### 3.3 Ports

- **Dispenser** — fluid output. Fed by a funnel, dispenses buckets/bottles into an adjacent container.
- **Dropper** — item input into a fluid process.
- **Hopper** — item input and output, unchanged.

### 3.4 The processing rule

When a funnel delivers an item into a cauldron whose contents form a valid pair, a **recipe** fires. The item is consumed, the fluid level may drop, and the product is pushed out of the cauldron's designated output face.

This single rule generates every machine in §4.

---

## 4. Machine roster

Each entry is a recipe in the shared registry, not bespoke code.

### 4.1 Concrete Mixer — *flagship*

**Powder + water cauldron → concrete.**

The single most tedious task in building-scale survival. Hopper feeds powder, funnel meters water, concrete drops into the chest below. Consumes water level over time; refill via funnel from a water source.

Ship this first. It alone justifies the download.

### 4.2 Dye Vat — *Bedrock-exclusive*

**Leather armour + dyed water cauldron → dyed leather armour.**

Bedrock cauldrons hold dyed water, which Java's cannot. Fill a cauldron with a dye, feed a matched set of leather through, get uniform colour without clicking each piece. Supports mixing multiple dyes into a custom shade held in the cauldron.

### 4.3 Wash Station

**Dyed leather / banner / shulker box + water cauldron → cleaned item.**

Vanilla already supports this by hand. Fluidworks automates it. Cheap to implement, immediately understood.

### 4.4 Bottling Line — *Bedrock-exclusive*

**Glass bottle + potion cauldron → filled potion.**

Bedrock potion cauldrons exist and have no automation. Brew once, bottle a stack.

### 4.5 Snow Harvester

**Dispenser with empty bucket + full powder snow cauldron → powder snow bucket.**

Cauldrons fill from snowfall in cold biomes. Automating the emptying makes freeze farms buildable for the first time.

### 4.6 Lava Kiln (stretch)

**Item + lava cauldron → smelted output, no fuel.**

Slow, capped to a small recipe set, consumes lava. Deliberately worse throughput than a furnace array — it's for aesthetics and remote setups, not for replacing smelting.

### 4.7 Rain Collector

A funnel with an open top face fills a connected cauldron during rain. The simplest possible entry point into the system and a good tutorial block.

---

## 5. Related features (same substrate)

These reuse the block-entity + config-form machinery and ship as separate toggles.

### 5.1 Filter Funnel

A funnel configured with an item allowlist or denylist. Config lives in block dynamic properties and survives being mined thanks to `carry_over_block_entity_data`. Bedrock item sorters are notoriously fragile; a funnel that just does what you told it is a strong standalone selling point.

### 5.2 Linked Pair

Click block A, click block B, they're paired. Items or redstone signals travel between them regardless of distance within a loaded region. Pairing stored as coordinates in both blocks' dynamic properties so the link is bidirectional and self-healing.

Gate this behind a config toggle — it's the most "cheaty" feature in the pack and some servers will want it off.

### 5.3 Harvester Funnel

A funnel with an upward face harvests a mature crop above it and replants. Composes with the rest of the system: crop → funnel → chest.

### 5.4 Collector

Pulls dropped item entities within a small radius into its buffer. Sized deliberately small so it doesn't replace hopper minecart farms.

### 5.5 Tank Labels

`TextPrimitive` above every cauldron and funnel showing contents and level. Fades beyond a configurable distance. This is what makes a build of twenty machines readable at a glance.

---

## 6. Technical architecture

### 6.1 Block definitions

Custom blocks use format version 1.26.20+. Note the tag breaking change: tags must live inside a `minecraft:tags` component as namespaced strings, not as top-level entries in the components array.

```
BP/blocks/funnel.json
  minecraft:block_entity        { dynamic_properties: true }
  minecraft:placement_direction { minecraft:facing_direction }
  minecraft:tags                [ "fluidworks:conduit" ]
  minecraft:custom_components   [ "fluidworks:funnel" ]
```

`minecraft:block_entity` no longer requires the experimental toggle from format version 1.26.20 onward, as of the 26.50 preview line. Confirm this has reached your minimum stable target before shipping.

### 6.2 Custom components

Register on `system.beforeEvents.startup` via `event.blockComponentRegistry.registerCustomComponent`.

| Handler | Purpose |
|---|---|
| `onPlace` | Register into the world network index |
| `onPlayerDestroy` | Deregister; drop configured item |
| `onPlayerInteract` | Open the config `CustomForm` |
| `onTick` | Deliberately unused — see §7 |

### 6.3 Data model

**Per-block (block dynamic properties, 1 KB cap per block entity):**

```
cfg   : packed string  — mode, filter list, output face
buf   : packed string  — buffered item + fluid unit
link  : "x,y,z,dim"    — paired block, if any
v     : number         — schema version
```

Keep it compact. 1 KB per block entity is generous for a filter list and catastrophic if you store JSON with long keys. Use short keys and a positional format.

**Per-world (world dynamic properties):**

```
fw:index:<chunkKey> : packed coordinate list of active machines
fw:schema           : number
```

The index is the performance mechanism. Never scan the world for machines; maintain the index on place and destroy.

### 6.4 Network discovery

When a machine needs to find its neighbours, use `floodSearch` with the `directionMask` parameter (26.50 beta) restricted to the funnel's connection faces. This is dramatically cheaper than manual neighbour recursion and is exactly the shape of problem the parameter was added for.

### 6.5 Reading and writing fluid state

- Cauldron fill level and liquid type: `Block.permutation.getState()` / `BlockPermutation.resolve()`
- Hopper, dropper, dispenser, chest contents: `BlockInventoryComponent` → `Container`
- Drop resolution for any product: `LootTableManager`, so Silk Touch and Fortune behave correctly if a recipe ever needs them

Avoid `runCommand` throughout. It is slow and degrades server performance as call volume grows.

### 6.6 Commands

Register through `CustomCommandRegistry` (requires `@minecraft/server` 2.1.0+, min engine 1.21.100):

```
/fluidworks:debug     — dump the network index near the player
/fluidworks:rebuild   — re-scan and rebuild the index for loaded chunks
/fluidworks:settings  — open the config form
```

`rebuild` is your escape hatch when a world migrates or an index desyncs. Ship it from day one.

---

## 7. Performance

Machines like these die on tick cost, and the watchdog will kill a world that gets it wrong.

**Rules:**

1. **Never tick every block.** No `onTick` on funnels. Run one `system.runInterval` at 10–20 ticks that walks the index.
2. **Chunk the walk with `runJob`.** Yield between machines so a large factory spreads over frames instead of spiking.
3. **Only process loaded chunks.** Check block validity before touching it; `LocationInUnloadedChunkError` is a real throw.
4. **Sleep idle machines.** A funnel with nothing to move goes into a slow tier (every 100 ticks) until a neighbour change wakes it.
5. **Cap throughput.** One operation per machine per cycle. Players who want speed build more machines — that's the fun part, and it keeps cost linear and predictable.
6. **Use `remove()` not `kill()`** on any item entity cleanup, or you'll fire `entityDie` for every stack.
7. **Scale down on weak devices.** `clientSystemInfo` and `graphicsMode` let you reduce label draw distance and tick rate automatically. `Player.getPing()` (beta) helps on servers.

**Budget target:** 200 active machines in loaded chunks with no measurable frame impact on a mid-tier tablet.

---

## 8. UI and configuration

### 8.1 Machine config — DDUI

`CustomForm` from `@minecraft/server-ui` 2.1.0+. Reactive: the form updates live as the machine's state changes while it's open.

```
Funnel
  ├ label      current contents / status
  ├ divider
  ├ dropdown   mode: pass-through | filter | harvest | collect
  ├ image grid filter items (CustomForm.image, onClick, tooltip — 2.2.0)
  ├ dropdown   output face
  └ button     Apply  (form stays open — DDUI callbacks fire in place)
```

Known DDUI constraints to design around:
- Wait one tick between closing one form and opening another
- Controls cannot be added to a form that is already shown; only Observable values update
- `show()` returns `Promise<DataDrivenScreenClosedReason>`, not a boolean
- `/reload` closes all DDUI screens

### 8.2 Feature toggles — pack settings

Do not build a settings menu. Use pack settings so players configure Fluidworks from the world's own pack screen before loading in. 26.50 added a multiselect setting type, `world.getPackSettings()` returning arrays, and `PackSettingsChangeAfterEvent` for live updates.

Settings surface:

```
[x] Concrete Mixer          [x] Filter Funnel
[x] Dye Vat                 [ ] Linked Pair
[x] Wash Station            [x] Harvester Funnel
[x] Bottling Line           [x] Collector
[x] Snow Harvester          [x] Tank Labels
[ ] Lava Kiln
    Label draw distance:  [slider]
    Machine tick rate:    [slider]
```

### 8.3 In-world feedback

- Working: subtle particles at the output face
- Blocked: a `TextPrimitive` warning above the machine ("output full")
- Misconfigured: message on interact explaining what's missing

---

## 9. Risks and open questions

**Must prototype before committing:**

1. **Dyed water and potion cauldron data.** In Bedrock, the dye colour and potion identity are stored in the cauldron's block entity NBT, not in a block state. The Script API may not expose this. If it doesn't, the Dye Vat and Bottling Line need a redesign — most likely a custom "Vat" block that holds this data itself instead of piggybacking on vanilla cauldrons. **This is the single biggest unknown in the design.**

2. **Cauldron fill-level state name and range.** Verify against the actual block palette rather than assuming Java's 0–3.

3. **Custom block containers.** Not available yet. Mojang's roadmap lists block entities with containers and ticking blocks as upcoming. Until then, funnels have a virtual buffer in dynamic properties and no inventory grid. Design so a real container can slot in later without a data migration.

4. **Block dynamic property storage format churn.** The storage format changed during the experimental period and existing saved properties were lost on migration. Version your schema (`v` field) from the first commit and write a migration path.

5. **Replacing a block with `minecraft:block_entity`.** As of 26.50, replacing such a block with a different definition creates a new block entity, so the old dynamic properties do not carry over. Handle this in upgrade paths.

---

## 10. Distribution

The fork that shapes everything else:

| | Marketplace | Sideloaded |
|---|---|---|
| Achievements | Preserved | Disabled |
| Console reach | Yes | No |
| Experiments allowed | No | Yes |
| Certification overhead | Yes | No |

Fluidworks as specified needs no experiments once `minecraft:block_entity` is stable, which keeps the Marketplace path open. **Recommendation: build to Marketplace constraints from day one** even if you launch sideloaded first. Retrofitting experiment removal is painful; never adding them is free.

Pin exact module versions in the manifest. Do not use `"beta"` as a dependency version in a shipping pack.

---

## 11. Phasing

**Phase 1 — Prove the model.**
Funnel block, block-entity config persistence, world index, Concrete Mixer, Rain Collector. Ship this. It's a complete product.

**Phase 2 — Fluid identity.**
Resolve the dyed-water/potion question. Add Dye Vat, Wash Station, Bottling Line, Snow Harvester.

**Phase 3 — Logistics.**
Filter Funnel, Harvester Funnel, Collector, Fluid Pipe cosmetic tier, Tank Labels.

**Phase 4 — Reach.**
Linked Pair, Lava Kiln, Reinforced Cauldron, and whatever the block-entity container work unlocks.

---

## 12. Open design questions

- Should funnels require power, or is "placed correctly" enough? Leaning toward no power — it keeps the mental model to one sentence.
- How far should a Linked Pair reach? Same-dimension-only is safe; cross-dimension is a much stronger feature and a much bigger balance question.
- Does the pack need a progression gate, or are all machines craftable from the start? Building-focused players will resent a gate; survival purists will want one. Probably a pack setting.
- Recipe costs: iron-tier for the base funnel feels right, but the Reinforced Cauldron and Linked Pair need a real sink.
