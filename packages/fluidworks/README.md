# Fluidworks — scaffold

Fluid logistics. **Nothing is implemented yet**; this is a buildable, deployable
shell so work can start without fighting the toolchain.

> **Cauldrons are tanks. Funnels are pipes. Dispensers are ports.**

Design: [`docs/design/fluidworks.md`](../../docs/design/fluidworks.md).
**Read [`docs/README.md`](../../docs/README.md) first** — several of that
document's assumptions turned out to be false.

## What is already answered

The design doc lists open questions that are now settled, some of them by work
already in this repo.

**Cauldron fill level is 0–6**, not Java's 0–3 (§9.2 answered). Bedrock uses one
`minecraft:cauldron` block with `fill_level` and `cauldron_liquid` states, so
Java datapack logic does not transfer. Measured — see
[`lens-light-results.md`](../../docs/lens-light-results.md) and
[`phase0-results.md`](../../docs/phase0-results.md).

**Dyed water is fully solvable.** `BlockFluidContainerComponent` is stable and
exposes `fluidColor` as a read *and* write property, plus `addDye()`. The design
doc calls this "the single biggest unknown"; it is not.

**Potions are the real gap.** There is `setPotion` and **no `getPotion`**.
`getFluidType()` returns only a coarse enum, so you can set a cauldron's potion
and detect that one is present, but never read back *which*. Any recipe needing
"what potion is in this cauldron" must shadow the value itself. This affects the
Bottling Line directly.

**Four machines already exist at the rules layer**, in
`packages/qol-times/scripts/core/rules/`: Snow Harvester fully, Wash Station for
leather and wolf armour, Bottling Line for water only, and the *charging* half of
the Dye Vat. Those rules contain no dispenser references and are pure — they
transfer nearly verbatim. The coupling is in `types.ts`, where `Residue` models
return-to-source rather than emit-to-destination, and `addDye?: string` leaks an
engine call name into a pure type. Generalising that is type surgery, not a
rewrite.

## What the design doc gets wrong

| Doc says | Reality |
| --- | --- |
| `minecraft:block_entity` no longer needs the toggle | **Still experimental.** Per-block config must use world dynamic properties keyed by position — the pattern in `packages/hearthstone/scripts/engine/registry.ts`. |
| `carry_over_block_entity_data` carries config to the dropped item | Experimental and never released. **"Config survives the pickaxe" cannot ship** — §2.6 is not achievable. |
| Use `floodSearch` with `directionMask` for network discovery | **Does not exist anywhere.** Write the flood fill with `system.runJob` — `packages/lens/scripts/core/lighting.ts` already has one. |
| `onPlayerDestroy` | It is `onPlayerBreak`. |
| `minecraft:custom_components: [...]` | That array is V1. List them inline in `components`. |
| Custom blocks can have containers | Experimental in a 26.50 preview only. Funnels need a virtual buffer. |

`minecraft:connection` for visual pipe joining **is** real and de-experimented —
but it is cardinal-only (no up/down) and rides the fence/pane connection system,
so pipes will try to connect to fences and walls too.

## Suggested first step

The design doc's Phase 1 is Funnel + Concrete Mixer, and that is still right: it
is the flagship, and turning a stack of powder into concrete is the single most
tedious job in building-scale survival.

Take the recipe registry from `qol-times/scripts/core/rules/` first, generalise
`Residue` into an emit-to-destination `OutputSpec`, and replace `addDye?: string`
with a structured effect — before adding machines, so the shape is right while
there are only four rules to migrate.
