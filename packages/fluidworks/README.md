# Fluidworks

Fluid logistics, built on one sentence:

> **Cauldrons are tanks. Funnels are pipes. Dispensers are ports.**

Design: [`docs/design/fluidworks.md`](../../docs/design/fluidworks.md).
**Read [`docs/README.md`](../../docs/README.md) first** — several of that
document's assumptions turned out to be false.

## Phase 1, built

A **funnel** has a mouth (back) and a spout (front). Every cycle it looks at
the block behind its mouth and the block in front of its spout. If the spout
points at a cauldron, it does exactly one thing:

| Behind the mouth | What happens |
| --- | --- |
| a chest, hopper, barrel or dropper | one item goes through the cauldron rules: concrete powder → concrete, buckets fill and drain, bottles fill and drain, dye colours the water, leather and wolf armour are washed |
| a water or lava **source** block | one level into the tank |
| another cauldron | one level across, if the fluids match |
| the open sky, with the funnel facing **down** | one level of rainwater while it rains — the Rain Collector |

**Products leave through the bottom of the tank**: into a container directly
below the cauldron; failing that, back into the container that fed the funnel
(so an empty bucket returns to its hopper); failing that, dropped on top of
the tank. Nothing is ever lost, and the output is only ever built after the
input is gone, so nothing is ever duplicated.

**Concrete does not drain a level per block.** Each block adds one unit of
wear to the funnel; when wear reaches the panel's “concrete blocks per water
level”, one level goes. Default 16.

The rules are the same ones QOL Times uses from a dispenser, moved to
`packages/shared/core/fluids/` and generalised as the earlier version of this
README asked: `Residue` became an `Output` (what the item becomes, delivered
wherever the caller wants), `addDye` became a structured `CauldronEffect`, and
`concrete` joined them. Both packs run the same 28-case rule suite.

## Phase 3, built: logistics

| Rig | What happens |
| --- | --- |
| a **pipe** at the mouth or spout | the funnel reads or writes through the connected run of pipes: the nearest cauldron (or water/lava source) next to any pipe in the run stands in for the adjacent block. Up to 64 pipes. Placing a pipe, funnel or cauldron next to a pipe sets its arm states so it joins up visually. |
| a mature **crop** at the mouth, a container at the spout | the **Harvester**: the crop is harvested with the engine's own loot table, one seed is withheld to replant it, the rest goes into the container. Wheat, carrots, potatoes, beetroot, nether wart, cocoa. Crops need farmland, so the rig lies sideways: farmland and crop, funnel, chest. |
| an **open** mouth, a container at the spout | the **Collector**: dropped items within two and a half blocks of the mouth go into the container. An item entity is removed only once the container took all of it. |
| any tank a funnel uses | a floating **label** over it with the fluid and level, visible to everyone, refreshed each cycle. |

Every one is a toggle in the panel.

**Phase 2 (potions) is blocked on the stable API.** `setPotion` exists but
there is no `getPotion` and, decisively, no `ItemStack.createPotion` and the
potion component is read-only: script cannot build a potion of a chosen
effect, so a Bottling Line for potions cannot exist however the cauldron
side is solved. Recorded in `docs/README.md`.

**Not built:** the Filter Funnel (there is no per-block configuration surface
without commands or block entities) and the Linked Pair.

## The panel

One toggle per machine (Concrete Mixer, buckets, Bottling Line, Dye Vat, Wash
Station, fluid transfer, Rain Collector, Harvester, Collector, pipes, labels),
a slider for seconds between cycles (default 2), and a slider for concrete
blocks per water level (default 16).
No commands; `/scriptevent fluidworks:debug` prints the panel, the weather the
pack believes, and the funnels near you with their wear.

## Layout

```
scripts/core/       pure: facing, the cycle planner, pipe walk and connections, the panel   <- vitest
scripts/engine/     funnel index, endpoints, the cycle executor, pipe resolution, labels, weather
behavior_pack/      manifest (format 3, with the panel), funnel + pipe blocks, recipes
resource_pack/      models and textures (generated, see root README)
```

Funnels are indexed on place and removed on break, through
`packages/shared/engine/positionIndex.ts` — the generic form of Hearthstone's
registry, with a schema version. Pistons, explosions and `/fill` are not
observed; a funnel that is no longer a funnel is evicted the next time it is
looked at, and one in an unloaded chunk is skipped, never evicted.

## What the design doc gets wrong

| Doc says | Reality |
| --- | --- |
| `minecraft:block_entity` no longer needs the toggle | **Still experimental.** Per-block state is a position-keyed world property. |
| `carry_over_block_entity_data` carries config to the dropped item | Experimental and never released. **"Config survives the pickaxe" cannot ship.** |
| Use `floodSearch` with `directionMask` for network discovery | **Does not exist anywhere.** |
| `onPlayerDestroy` | It is `onPlayerBreak`. Phase 1 uses the world place/break events, as Hearthstone does. |
| `minecraft:connection` for pipes | Learn (June 2026) still lists it as experimental. The pipe carries six states of its own. |
| Custom blocks can have containers | Experimental in a 26.50 preview only. |
| Read the weather for the Rain Collector | **There is no stable read.** `Dimension.getWeather` is beta; only `setWeather` shipped. The pack tracks the stable `weatherChange` event, so weather is unknown (assumed clear) from load until it next changes. |

## To confirm in game

1. **Funnel orientation.** The spout is authored on +z and the permutations
   copy Learn's arrow-block sign convention. If the spout points the wrong
   way relative to the player, add `"y_rotation_offset": 180` to the trait.
   `core/facing.ts` assumes the state is the spout's direction.
2. **The panel loads** (format-version-3 manifest) — `fluidworks:debug`
   prints what was read.
3. **A hopper behind a funnel, a cauldron of water in front, a chest under
   the cauldron, concrete powder in the hopper.** Concrete should appear in
   the chest every cycle and the water should drop a level every 16 blocks.
4. **`getTopmostBlock` semantics** for the Rain Collector: it is assumed to
   return the funnel itself when nothing stands above it.
5. **Powder snow** transfer: `cauldron_liquid: "powder_snow"` is unverified,
   and the adapter falls back to the fluid-container component if rejected.
6. **Crop age state names** (`growth` for wheat, carrots, potatoes and
   beetroot; `age` for nether wart and cocoa) - `qol:harvester_funnel` in the
   GameTest pack checks wheat.
7. **Labels**: that a `TextPrimitive` with no `visibleTo` is visible to all.
