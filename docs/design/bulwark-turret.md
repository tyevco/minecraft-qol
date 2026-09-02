# Bulwark — Design Document

**Automated base defense for Minecraft: Bedrock Edition**

Target: `@minecraft/server` 2.9.0+ / `@minecraft/server-ui` 2.1.0+ · Entity format version 1.26.40+ · Draft v0.1

---

## 1. The pitch

A placeable turret that acquires and attacks hostile mobs in range, upgraded by feeding it items.

### Scoping note, up front

**This is not a QOL feature and should not ship inside a QOL pack.** QOL removes friction from things the game already lets you do. Bulwark adds a mechanic the game does not have. Bundling them muddies what the pack is for and produces an incoherent settings screen.

It does have a natural home, though: a **base defense** pack pairing the turret with the light-level spawn-proofing lens.

- **Lens (passive):** shows you where hostiles can spawn, so you can build them out.
- **Turret (active):** kills the ones that get in anyway.

Two tools, one problem, one clear product. `Block.getLightLevel()` is stable and Bedrock has no debug screen, so the lens is a genuinely unserved need on its own — together they make a pack with an obvious reason to exist.

---

## 2. Architecture: hybrid block + entity

Neither a pure block nor a pure entity works. Use both.

| | Custom block alone | Entity alone | **Hybrid** |
|---|---|---|---|
| Rotating turret head | No | Yes | Yes |
| Reliable persistence | Yes | No | Yes |
| Config storage | Yes (1 KB) | Properties only | Yes |
| Survives entity cap / despawn | Yes | No | Yes |
| Vanilla targeting AI | No | Yes | Yes |

**The design:**

- **Block** is the anchor. Placement, persistence, ownership, tier and ammo state in `minecraft:block_entity` with `dynamic_properties`. Config form on interact.
- **Entity** is the head. Invisible base geometry with a visible turret model, does all targeting and shooting.
- **Link** stored as coordinates in block data and as a dynamic property on the entity, so either side can find the other.
- **Reconciliation** on chunk load: if the block exists and its entity doesn't, respawn and relink. If an entity exists with no block, remove it.

---

## 3. Let vanilla AI do the shooting

This is the decision that determines whether the pack is viable at scale.

**Use engine AI, not script targeting.**

```
minecraft:behavior.nearest_attackable_target   — acquisition, with entity_types filters
minecraft:behavior.ranged_attack               — timing and firing
minecraft:shooter                              — projectile definition
```

All three run in engine code. Target acquisition, aim leading, and projectile spawning come free and already tuned. Script then only executes on upgrade and config changes, which means **a hundred turrets cost effectively nothing on the script budget.**

The alternative — `dimension.getEntities()` with `EntityQueryOptions` on an interval, then hand-rolled ballistics via `spawnEntity` and `applyImpulse` — gives finer control but puts every turret on the script clock every cycle. Only reach for it if targeting logic genuinely can't be expressed in AI JSON. Assume it can.

### 3.1 The 26.40 validation trap

Entity JSON validation went strict at `format_version` 1.26.40+. Invalid data now **fails to load** instead of being silently ignored, and two of the changes land directly on this design:

- **`ranged_attack.attack_interval`** replaces the previous min/max pair. Any turret tutorial written before this will not load.
- **`on_kill` was previously misrouted to `on_attack`** and now fires correctly. This is good news here — `on_kill` is exactly what you want for kill counts and tier progression, and it now works as documented.

Also relevant if the turret has any wander or idle behaviour: `float_wander.float_duration` must now be a min/max object.

---

## 4. Upgrades

### 4.1 Component groups, not entity swaps

Keep **one** entity definition with a component group per tier per axis. When the block's stored tier changes, call `Entity.triggerEvent` to swap groups in place.

Do not destroy and respawn the entity to change its stats — it loses its current target mid-fight, and the visual pop is ugly.

Pair with `minecraft:variant` and a texture array on the client entity so tiers are visually distinct.

### 4.2 Upgrade axes

Four axes, three tiers each. Enough depth to make choices interesting without a skill tree.

| Axis | Fed with | Effect |
|---|---|---|
| **Damage** | Iron → Diamond → Netherite | Projectile damage per hit |
| **Fire rate** | Redstone → Redstone block → Quartz | Lowers `attack_interval` |
| **Range** | Ender pearl → Eye of ender → Ender chest | Raises acquisition radius |
| **Projectile** | Arrow → Fire charge → Snowball | Plain / incendiary / slowing |

Tier state lives in block dynamic properties. 1 KB is enormous for four small integers plus ammo and ownership — keep the encoding short anyway and leave headroom.

### 4.3 Targeting priority

A fifth, non-upgrade axis set in the config form: **nearest** (default), **weakest**, or **strongest**. Expressible through `nearest_attackable_target` priority entries and filter ordering, so it stays in engine.

---

## 5. Ammo and feeding

### 5.1 Require ammo

Infinite ammo makes turrets set-and-forget, which is the least interesting version of this feature. Ammo consumption creates a supply chain — and a supply chain is where this pack connects to logistics work.

**Recommendation: ammo required, hopper-fed.**

### 5.2 How to feed it

Custom blocks cannot have containers yet. Mojang's roadmap lists block entities with containers and ticking blocks as upcoming, but until then:

- **Primary: adjacent hopper.** Read it via `BlockInventoryComponent`, pull ammo into the turret's virtual buffer. This is vanilla-shaped, gives a free automation hook, and matches the pattern used elsewhere.
- **Secondary: interact-to-feed.** `onPlayerInteract` exposes the held `ItemStack`. Good for upgrade items and for a quick manual top-up.

Design so that a real container can slot in later without a data migration when the API lands.

### 5.3 Buffer

Store ammo count in block data with a modest cap (say 64). Small enough that a busy turret needs resupply, large enough that a hopper and a chest solve it permanently.

---

## 6. Safety and social design

These are the settings that decide whether server admins allow the pack at all.

### 6.1 Player targeting off by default

The single biggest concern with any turret addon. Ship it **off**, behind a pack setting, clearly labelled. PvP servers can turn it on deliberately.

### 6.2 Friendly fire

Store the owner's `persistentId` in block data. Exclude from targeting:

- The owner and, optionally, an allowlist
- Tamed mobs (any owner, not just the turret's)
- Villagers, iron golems, and traders
- Named mobs, as a general "this one is mine" convention

Enforce via `type_family` filters in `nearest_attackable_target`, which keeps it in engine. Use `EntityQueryOptions.families` only if you ever need a script-side pass.

### 6.3 Density cap

Turrets are an obvious lag-machine vector. Enforce a minimum spacing or a per-chunk cap on placement, with a clear message when the limit is hit. Cheaper to prevent than to diagnose later.

### 6.4 Destructibility

Open question worth deciding deliberately:

- **Destructible** creates real placement decisions — creepers become a threat to the defense itself, and players build walls around turrets.
- **Indestructible** is pure convenience and flattens the mechanic.

Leaning destructible with blast resistance roughly equal to stone, and a pack setting for players who want the simpler version.

---

## 7. Performance

Because acquisition and firing are in engine, the script budget is dominated by bookkeeping.

1. **No per-tick script per turret.** The entity handles combat. Script runs on interact, on upgrade, and on a slow reconciliation interval.
2. **Index turrets** in world dynamic properties keyed by chunk, same pattern as the fluid machines. Never scan for them.
3. **Reconcile lazily.** Block-entity pairing checks run every 100+ ticks and only for loaded chunks.
4. **Ammo pull on an interval**, not per shot — batch a hopper read every second or two, not every projectile.
5. **Use `remove()` not `kill()`** for any turret entity cleanup, or you fire `entityDie` for each one.
6. **Scale on weak devices.** `clientSystemInfo` and `graphicsMode` can reduce label draw distance and particle density automatically.

**Budget target:** 100 active turrets in loaded chunks with no measurable script cost and no frame impact on a mid-tier tablet.

---

## 8. UI and feedback

### 8.1 Config form — DDUI

`CustomForm` on interact, reactive so ammo count and tier update live while open.

```
Bulwark Turret
  ├ label      status: active / no ammo / obstructed
  ├ label      ammo: N / 64        kills: N
  ├ divider
  ├ image grid upgrade slots (damage / rate / range / projectile)
  ├ dropdown   targeting priority
  ├ dropdown   access: owner only | allowlist | public
  ├ toggle     show status label
  └ button     Save
```

`CustomForm.image` with `onClick` and `tooltip` (server-ui 2.2.0) is well suited to the upgrade grid — clickable icons showing current tier and what the next one costs.

### 8.2 In-world feedback

- **Working:** muzzle particle on fire, subtle idle hum
- **Out of ammo:** `TextPrimitive` label above the turret, plus a distinct sound
- **Tier visible:** `minecraft:variant` drives a different model or texture per damage tier
- **Waypoints:** optional `LocationWaypoint` per turret so you can audit your perimeter from anywhere

The status label doubles as the debugging tool. A turret that isn't firing should always say why.

---

## 9. The companion feature: spawn-proofing lens

Worth specifying here since it's half the product.

**Mechanic:** hold the lens item, and every block within a radius that can spawn a hostile mob is marked.

- `Block.getLightLevel()` is stable and returns total brightness
- Mark with particles or short-lived `TextPrimitive` shapes
- Two modes: **danger** (show spawnable) for base-proofing, **safe** (show non-spawnable) for farm building
- Refresh on movement with a debounce, chunked through `runJob`
- Radius bounded by a pack setting; default modest

This is the highest-demand, lowest-effort item in either pack. Bedrock has no debug screen, so players genuinely cannot check light levels today. Build it first — it's a complete feature in an afternoon and it gives the pack an identity while the turret work proceeds.

---

## 10. Risks and open questions

**Must prototype:**

1. **Entity reconciliation reliability.** The block-entity pairing is the load-bearing assumption. Test aggressively across chunk unload/reload, world reload, `/reload`, dimension travel, and server restart. If entities go missing in ways reconciliation can't catch, the whole architecture needs rethinking.
2. **`ranged_attack` tuning at short range.** Vanilla ranged AI is tuned for skeletons at skeleton distances. Verify it behaves sanely for a stationary shooter with a wide range band, particularly against fast targets and targets directly below.
3. **Turret head rotation.** Confirm the entity visually tracks its target rather than snapping, and that a stationary entity with no movement goals still rotates.
4. **Entity cap interaction.** Turret entities count toward mob caps in some contexts. Verify a large perimeter doesn't suppress legitimate spawns or get culled.

**Design questions:**

- Should turrets need redstone power, or is placement enough? Leaning placement-only for consistency with the fluid system's one-sentence model.
- Should kills grant progression (tier XP via `on_kill`), or is feeding items the only path? Kill-based progression is more satisfying but harder to balance.
- Do turrets target flying mobs? Phantoms are the obvious use case and the obvious reason someone installs this.
- Should there be a non-lethal variant — a repeller that pushes mobs back rather than killing them? Cheaper, less griefy, and interesting for farm design.

---

## 11. Distribution

Same fork as the other packs:

| | Marketplace | Sideloaded |
|---|---|---|
| Achievements | Preserved | Disabled |
| Console reach | Yes | No |
| Experiments allowed | No | Yes |
| Certification overhead | Yes | No |

Bulwark as specified needs no experiments. **Build to Marketplace constraints from day one** regardless of where it launches first — removing experiments later is painful, never adding them is free.

Pin exact module versions in the manifest. Never ship with `"beta"` as a dependency version.

---

## 12. Phasing

**Phase 1 — Lens.**
Spawn-proofing lens, both modes, pack settings for radius and marker style. Ship it. Complete product, immediate demand, zero dependency on the turret work.

**Phase 2 — Turret core.**
Block, paired entity, reconciliation, vanilla ranged AI, ammo via adjacent hopper, no upgrades. One tier that works reliably.

**Phase 3 — Upgrades.**
Four axes via component groups, DDUI config form with the image grid, visual tiers, targeting priority.

**Phase 4 — Policy and polish.**
Ownership and access modes, friendly-fire filters, density caps, player targeting toggle, waypoint markers, status labels.

**Phase 5 — Reach.**
Repeller variant, kill-based progression, and whatever the block-entity container work unlocks for ammo handling.
