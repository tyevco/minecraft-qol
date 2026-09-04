/**
 * Lens - spawn-proofing overlay.
 *
 * Marks nearby positions where hostile mobs can spawn. Built on measured engine
 * behaviour, not assumptions - see docs/lens-light-results.md.
 *
 * Two ways to switch it on:
 *   - carry a Spawn Lens: worn on the head, in the offhand, or held
 *   - (legacy) wear any helmet renamed "Lens" in an anvil
 *   - /lens:toggle
 *
 * The worn trigger deliberately keys off the item's NAME rather than a custom
 * item type: a custom item would need a resource pack for its texture and name,
 * and this works today with vanilla gear and an anvil.
 */
import {
  CommandPermissionLevel,
  CustomCommandStatus,
  EntityComponentTypes,
  EquipmentSlot,
  Player,
  system,
  world,
  type CustomCommandResult,
  type ItemStack,
} from "@minecraft/server";
import { fromIndex, toIndex } from "./core/grid";
import { solve } from "./core/solver";
import {
  MAX_TIER,
  bestByTier,
  nextTier,
  tierLabel,
  tierSuggestsLighting,
  type Tier,
} from "./core/tier";
import { hasTier, readTier, stampTier } from "./engine/itemTier";
import { MarkerPool, type Mark } from "./engine/markers";
import {
  deviceScale,
  runScan,
  type Mode,
  type ScanResult,
  type ScanSettings,
  type Survey,
} from "./engine/scan";

const TAG = "[Lens]";
// console.warn always reaches the content log; console.log only at Verbose/Info.
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

/** Defaults. Pack settings will back these in a follow-up; see issue #51. */
const BASE: ScanSettings = {
  radius: 12,
  height: 4,
  mode: "danger",
  density: 1,
  wantSolver: false,
};

/** Ticks between rescans while the overlay is on. */
const REFRESH_TICKS = 40;
/** Ticks between equipment checks. Cheap, so it can be much faster than a scan. */
const EQUIP_CHECK_TICKS = 10;
/** Sky light above this means outdoor readings carry little information. */
const DAYLIGHT_SKY = 4;
/** The real item. Matching by typeId has no false-positive surface. */
const LENS_ITEM = "lens:spawn_lens";
/**
 * Legacy fallback: any head item *named* "lens", which is how this worked before
 * the real item existed. Kept so an already-renamed helmet does not stop working;
 * delete once nobody is relying on it.
 */
const LENS_KEYWORD = "lens";

type Source = "command" | "item";

interface Session {
  mode: Mode;
  /** Guards against starting a second scan while one is still running. */
  busy: boolean;
  /** Summary is sent once per activation, not every refresh. */
  reported: boolean;
  /** Persistent markers, moved rather than respawned between scans. */
  markers: MarkerPool;
  /** Whether a command or a worn item switched this on - they must not fight. */
  source: Source;
  /** Tier of the carrying item. Command sessions run at the maximum. */
  tier: Tier;
  /** Last solve's output, for the summary message and /scriptevent lens:debug. */
  lastSuggestions?: number;
  lastUnreachable?: number;
  lastTargets?: number;
  lastCandidates?: number;
}

const active = new Map<string, Session>();

function settingsFor(player: Player, mode: Mode, tier: Tier): ScanSettings {
  const scale = deviceScale(player);
  return {
    ...BASE,
    mode,
    wantSolver: tierSuggestsLighting(tier),
    radius: Math.max(4, Math.round(BASE.radius * scale)),
    height: Math.max(2, Math.round(BASE.height * scale)),
    // Thin markers on weaker devices rather than shrinking the radius further -
    // a small accurate picture beats a large sparse one.
    density: scale < 0.7 ? 2 : 1,
  };
}

/**
 * Slots that can activate the Lens.
 *
 * Order is only a tie-break: the BEST tier wins, not the first slot checked.
 * Carrying a tier 2 in the offhand and a tier 1 on your head must give you tier
 * 2 - anything else silently downgrades you for wearing a spare.
 *
 * getEquipment reads every slot identically; there is no API-level distinction.
 */
const CARRY_SLOTS: readonly EquipmentSlot[] = [
  EquipmentSlot.Head,
  EquipmentSlot.Offhand,
  EquipmentSlot.Mainhand,
];

interface Carried {
  mode: Mode;
  tier: Tier;
  /** Where it was found, so a first-sight tier stamp can be written back. */
  slot: EquipmentSlot;
  /** True when this is the real item and it has never been stamped. */
  needsStamp: boolean;
}

/** What the item in a given slot activates, if anything. */
function carriedForItem(item: ItemStack | undefined, slot: EquipmentSlot): Carried | undefined {
  if (!item) return undefined;
  const name = item.nameTag?.toLowerCase();

  // The legacy renamed-helmet path stays scoped to the head slot, so a sword
  // that happens to be called "lens" does not switch the overlay on.
  const isLegacy = slot === EquipmentSlot.Head && (name?.includes(LENS_KEYWORD) ?? false);
  const isReal = item.typeId === LENS_ITEM;
  if (!isReal && !isLegacy) return undefined;

  return {
    // Renaming the item still switches mode, so "Safe Spawn Lens" works.
    mode: name?.includes("safe") ? "safe" : "danger",
    // A legacy renamed helmet has no tier property; it stays tier 1.
    tier: isReal ? readTier(item) : 1,
    slot,
    needsStamp: isReal && !hasTier(item),
  };
}

/**
 * The best Lens the player is carrying, across every slot.
 *
 * Highest tier wins; slot order breaks ties only. Picking the first slot with a
 * Lens instead would mean a spare tier 1 on your head silently overrides the
 * tier 2 in your hand.
 */
function carried(player: Player): Carried | undefined {
  try {
    const equippable = player.getComponent(EntityComponentTypes.Equippable);
    if (!equippable) return undefined;

    const found: Carried[] = [];
    for (const slot of CARRY_SLOTS) {
      const item = carriedForItem(equippable.getEquipment(slot), slot);
      if (item) found.push(item);
    }
    return bestByTier(found);
  } catch {
    return undefined; // never let equipment probing break the feature
  }
}

function enable(player: Player, mode: Mode, source: Source, tier: Tier = MAX_TIER): void {
  const existing = active.get(player.id);
  // Reuse the pool across a mode switch so markers recolour instead of blinking.
  const markers = existing?.markers ?? new MarkerPool(player);
  active.set(player.id, { mode, busy: false, reported: false, markers, source, tier });
  player.sendMessage(
    mode === "danger"
      ? "§cLens on §7— marking where hostiles can spawn."
      : "§aLens on §7— marking spawn-proofed positions.",
  );
}

function disable(player: Player, quiet = false): void {
  const session = active.get(player.id);
  if (!session) return;
  session.markers.clear();
  active.delete(player.id);
  if (!quiet) player.sendMessage("§7Lens off.");
}

/** Command toggle. Always wins over the worn state for this player. */
function toggle(player: Player, mode?: Mode): void {
  const existing = active.get(player.id);
  if (existing && (mode === undefined || existing.mode === mode)) {
    disable(player);
    return;
  }
  enable(player, mode ?? existing?.mode ?? BASE.mode, "command");
}

/**
 * Keep the overlay in step with what the player is wearing.
 *
 * Only ever touches sessions it owns: taking off the helmet must not cancel a
 * deliberate /lens:toggle, and toggling off by command must not be immediately
 * undone by the helmet still being worn.
 */
function syncWorn(player: Player): void {
  const worn = carried(player);
  const session = active.get(player.id);

  // A freshly crafted Lens has no tier written, so it shows no lore. Stamp it
  // once on first sight so the item describes itself.
  if (worn?.needsStamp) stampInitialTier(player, worn.slot);

  if (worn === undefined) {
    if (session?.source === "item") disable(player, true);
    return;
  }
  if (!session) {
    enable(player, worn.mode, "item", worn.tier);
    return;
  }
  if (session.source === "item" && (session.mode !== worn.mode || session.tier !== worn.tier)) {
    session.mode = worn.mode;
    session.tier = worn.tier;
    session.reported = false;
  }
}

function stampInitialTier(player: Player, slot: EquipmentSlot): void {
  try {
    const equippable = player.getComponent(EntityComponentTypes.Equippable);
    const item = equippable?.getEquipment(slot);
    if (!equippable || item?.typeId !== LENS_ITEM || hasTier(item)) return;
    stampTier(item, 1);
    equippable.setEquipment(slot, item);
  } catch (e) {
    log(`initial tier stamp failed: ${e}`);
  }
}

/** The block whose light is absorbed to promote a Lens. */
const UPGRADE_BLOCK = "minecraft:glowstone";

/**
 * Upgrade ritual: use a Spawn Lens on glowstone and it absorbs the block.
 *
 * Driven from the cancellable beforeEvent because that is the only interaction
 * event carrying the itemStack - the after-event and itemStartUseOn both omit
 * it. Before-events are read-only, so the actual work is deferred a tick.
 *
 * Deliberately avoids ItemCustomComponent: `minecraft:custom_components` is
 * schema-attested at format 1.21.80 but absent from 1.21.90 onward, and this
 * global event needs no component registration at all.
 */
function installUpgradeRitual(): void {
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    // Interactions can fire twice; only act on the first.
    if (!ev.isFirstEvent) return;
    if (ev.itemStack?.typeId !== LENS_ITEM) return;
    if (!ev.block.isValid || !ev.block.matches(UPGRADE_BLOCK)) return;
    if (nextTier(readTier(ev.itemStack)) === undefined) return;

    // Stop the normal interaction so the Lens does not also try to place.
    ev.cancel = true;
    const { player, block } = ev;
    const location = { x: block.x, y: block.y, z: block.z };
    system.run(() => upgrade(player, location));
  });
}

function upgrade(player: Player, location: { x: number; y: number; z: number }): void {
  try {
    const equippable = player.getComponent(EntityComponentTypes.Equippable);
    const held = equippable?.getEquipment(EquipmentSlot.Mainhand);
    if (!equippable || held?.typeId !== LENS_ITEM) return;

    const promoted = nextTier(readTier(held));
    if (promoted === undefined) return;

    // Re-check the block: a tick has passed since the interaction.
    const block = player.dimension.getBlock(location);
    if (!block?.isValid || !block.matches(UPGRADE_BLOCK)) return;

    // Consume the glowstone first. If stamping the tier then failed we would
    // rather have eaten a block than minted a free upgrade.
    block.setType("minecraft:air");
    stampTier(held, promoted);
    equippable.setEquipment(EquipmentSlot.Mainhand, held);

    player.dimension.playSound("random.levelup", player.location);
    player.sendMessage(`§eThe Lens drinks the light. §7Spawn Sight ${promoted === 2 ? "II" : "I"}.`);
  } catch (e) {
    log(`upgrade failed: ${e}`);
  }
}

/** Most torch suggestions to show at once. More than this is not actionable. */
const MAX_SUGGESTIONS = 8;

/**
 * Run the solver over a completed survey, then redraw with suggestions and
 * coverage shading folded in.
 */
function* solveAndRender(
  session: Session,
  result: ScanResult,
  survey: Survey,
): Generator<void, void, void> {
  try {
    const solving = solve(survey.grid, survey.targets, survey.candidates, {
      maxPicks: MAX_SUGGESTIONS,
    });
    let step = solving.next();
    while (!step.done) {
      yield;
      step = solving.next();
    }
    const solved = step.value;

    // Cell index -> world position, so solver output can be drawn.
    const toWorld = (index: number) => {
      const local = fromIndex(survey.grid, index);
      return {
        x: survey.origin.x + local.x,
        y: survey.origin.y + local.y,
        z: survey.origin.z + local.z,
      };
    };

    // Positions a suggestion would fix get shaded rather than left alarming red.
    const coveredCells = new Set<number>();
    for (const pick of solved.picks) for (const c of pick.covered) coveredCells.add(c);

    const shaded: Mark[] = result.marks.map((mark) => {
      if (mark.verdict !== "spawnable") return mark;
      const local = {
        x: mark.pos.x - survey.origin.x,
        y: mark.pos.y - survey.origin.y,
        z: mark.pos.z - survey.origin.z,
      };
      const index = toIndex(survey.grid, local.x, local.y, local.z);
      return coveredCells.has(index) ? { ...mark, verdict: "covered" as const } : mark;
    });

    // Suggestions first so they survive the marker budget being clipped.
    const suggestions: Mark[] = solved.picks.map((p) => ({
      pos: toWorld(p.candidate),
      verdict: "suggested" as const,
    }));

    session.markers.update([...suggestions, ...shaded]);
    session.lastSuggestions = solved.picks.length;
    session.lastUnreachable = solved.uncovered.length;
    session.lastTargets = survey.targets.length;
    session.lastCandidates = survey.candidates.length;
  } catch (e) {
    log(`solver failed: ${e}`);
    session.markers.update(result.marks);
  } finally {
    session.busy = false;
  }
}

function scanTick(): void {
  if (active.size === 0) return;
  for (const player of world.getAllPlayers()) {
    const session = active.get(player.id);
    if (!session || session.busy) continue;

    session.busy = true;
    runScan(player, settingsFor(player, session.mode, session.tier), (result) => {
      const survey = result.survey;
      if (survey && tierSuggestsLighting(session.tier)) {
        // The solve is its own job: it is the expensive half, and keeping it
        // separate means a slow solve never delays the level 1 markers.
        system.runJob(solveAndRender(session, result, survey));
      } else {
        session.busy = false;
        session.markers.update(result.marks);
      }

      if (session.reported) return;
      session.reported = true;

      player.sendMessage(
        `§7Lens §f${tierLabel(session.tier)}§7: §c${result.spawnable} spawnable§7, ` +
          `§8${result.uncertain} uncertain§7 of ${result.scanned} standable position(s).`,
      );

      if (tierSuggestsLighting(session.tier)) {
        // Deferred: the solve runs as its own job and finishes after this.
        system.runTimeout(() => {
          const picks = session.lastSuggestions ?? 0;
          const stranded = session.lastUnreachable ?? 0;
          const tail = stranded > 0 ? ` §8${stranded} out of reach of any torch spot.` : "";
          player.sendMessage(
            `§eSpawn Sight II: §6${picks} torch spot(s)§e marked §6*§e.${tail}`,
          );
        }, 40);
      }

      // Explain the grey rather than leaving it looking like a malfunction.
      if (result.uncertain > result.spawnable && result.skyMax > DAYLIGHT_SKY) {
        player.sendMessage(
          "§8Grey = sky light hides block light here. Readings under open sky " +
            "are far more useful at night; enclosed spaces are exact at any time.",
        );
      }
    });
  }
}

// Must run at module scope: startup fires before worldLoad, and does NOT fire
// again on /reload - so a newly added command needs a world re-entry to appear.
system.beforeEvents.startup.subscribe((event) => {
  try {
    event.customCommandRegistry.registerCommand(
      {
        name: "lens:toggle",
        description: "Toggle the spawn-proofing overlay",
        permissionLevel: CommandPermissionLevel.Any,
        // Defaults to true, which would make the command not exist on a
        // cheats-off Realm.
        cheatsRequired: false,
      },
      (origin): CustomCommandResult => {
        const player = origin.sourceEntity;
        if (!(player instanceof Player)) {
          return { status: CustomCommandStatus.Failure, message: "Run this as a player." };
        }
        // Command callbacks are read-only; defer anything touching the world.
        system.run(() => toggle(player));
        return { status: CustomCommandStatus.Success };
      },
    );
    log("registered /lens:toggle");
  } catch (e) {
    // Without this the only symptom in game is "unknown command".
    log(`FAILED to register /lens:toggle: ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  // /reload discards module state, so everything is re-established here.
  system.runInterval(scanTick, REFRESH_TICKS);
  installUpgradeRitual();
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) syncWorn(player);
  }, EQUIP_CHECK_TICKS);

  // Fallback that works immediately after /reload, unlike a custom command.
  // Optional argument: "danger" or "safe".
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "lens:toggle") return;
    const player = ev.sourceEntity;
    if (!(player instanceof Player)) {
      log("scriptevent lens:toggle: run this as a player");
      return;
    }
    const arg = ev.message.trim().toLowerCase();
    toggle(player, arg === "danger" || arg === "safe" ? arg : undefined);
  });

  // Reports the whole tier -> solver chain, so a missing suggestion can be
  // traced to the step that actually failed rather than guessed at.
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "lens:debug") return;
    const player = ev.sourceEntity;
    if (!(player instanceof Player)) return;

    const found = carried(player);
    const session = active.get(player.id);
    player.sendMessage(
      found
        ? `§7carried: §f${found.mode}§7 tier §f${found.tier}§7 in §f${found.slot}§7 ` +
            `(stamped: ${found.needsStamp ? "§cno" : "§ayes"}§7)`
        : "§7carried: §cnothing recognised",
    );
    player.sendMessage(
      session
        ? `§7session: tier §f${session.tier}§7 source §f${session.source}§7 ` +
            `solver §f${tierSuggestsLighting(session.tier) ? "on" : "off"}`
        : "§7session: §cnone active",
    );
    player.sendMessage(
      `§7last solve: §f${session?.lastTargets ?? "-"}§7 targets, ` +
        `§f${session?.lastCandidates ?? "-"}§7 torch spots available, ` +
        `§f${session?.lastSuggestions ?? "-"}§7 suggested`,
    );
  });

  world.afterEvents.playerLeave.subscribe((ev) => {
    // Markers are world-level objects, so a leaver's must be released or they
    // leak against the engine's shape cap for everyone else.
    active.get(ev.playerId)?.markers.clear();
    active.delete(ev.playerId);
  });

  log(
    `ready at tick ${system.currentTick}, marker budget ${MarkerPool.budget()}. ` +
      `Carry a Spawn Lens (head, offhand or hand) or run /lens:toggle.`,
  );
});
