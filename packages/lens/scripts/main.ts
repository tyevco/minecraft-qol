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
import { MarkerPool } from "./engine/markers";
import { deviceScale, runScan, type Mode, type ScanSettings } from "./engine/scan";

const TAG = "[Lens]";
// console.warn always reaches the content log; console.log only at Verbose/Info.
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

/** Defaults. Pack settings will back these in a follow-up; see docs/backlog.md. */
const BASE: ScanSettings = { radius: 12, height: 4, mode: "danger", density: 1 };

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
}

const active = new Map<string, Session>();

function settingsFor(player: Player, mode: Mode): ScanSettings {
  const scale = deviceScale(player);
  return {
    ...BASE,
    mode,
    radius: Math.max(4, Math.round(BASE.radius * scale)),
    height: Math.max(2, Math.round(BASE.height * scale)),
    // Thin markers on weaker devices rather than shrinking the radius further -
    // a small accurate picture beats a large sparse one.
    density: scale < 0.7 ? 2 : 1,
  };
}

/**
 * Slots that activate the Lens, in priority order.
 *
 * Worn is first so a helmet keeps working when something unrelated is held.
 * getEquipment reads any slot identically - there is no API-level distinction -
 * so offhand support is only a matter of looking there.
 */
const CARRY_SLOTS: readonly EquipmentSlot[] = [
  EquipmentSlot.Head,
  EquipmentSlot.Offhand,
  EquipmentSlot.Mainhand,
];

/** Which mode, if any, the item in a given slot selects. */
function modeForItem(item: ItemStack | undefined, slot: EquipmentSlot): Mode | undefined {
  if (!item) return undefined;
  const name = item.nameTag?.toLowerCase();

  // The legacy renamed-helmet path stays scoped to the head slot, so a sword
  // that happens to be called "lens" does not switch the overlay on.
  const isLegacy = slot === EquipmentSlot.Head && (name?.includes(LENS_KEYWORD) ?? false);
  if (item.typeId !== LENS_ITEM && !isLegacy) return undefined;

  // Renaming the item still switches mode, so "Safe Spawn Lens" works.
  return name?.includes("safe") ? "safe" : "danger";
}

/** Which mode, if any, the player is currently carrying the Lens for. */
function carriedMode(player: Player): Mode | undefined {
  try {
    const equippable = player.getComponent(EntityComponentTypes.Equippable);
    if (!equippable) return undefined;
    for (const slot of CARRY_SLOTS) {
      const mode = modeForItem(equippable.getEquipment(slot), slot);
      if (mode) return mode;
    }
    return undefined;
  } catch {
    return undefined; // never let equipment probing break the feature
  }
}

function enable(player: Player, mode: Mode, source: Source): void {
  const existing = active.get(player.id);
  // Reuse the pool across a mode switch so markers recolour instead of blinking.
  const markers = existing?.markers ?? new MarkerPool(player);
  active.set(player.id, { mode, busy: false, reported: false, markers, source });
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
  const worn = carriedMode(player);
  const session = active.get(player.id);

  if (worn === undefined) {
    if (session?.source === "item") disable(player, true);
    return;
  }
  if (!session) {
    enable(player, worn, "item");
    return;
  }
  if (session.source === "item" && session.mode !== worn) {
    session.mode = worn;
    session.reported = false;
  }
}

function scanTick(): void {
  if (active.size === 0) return;
  for (const player of world.getAllPlayers()) {
    const session = active.get(player.id);
    if (!session || session.busy) continue;

    session.busy = true;
    runScan(player, settingsFor(player, session.mode), (result) => {
      session.busy = false;
      session.markers.update(result.marks);

      if (session.reported) return;
      session.reported = true;

      player.sendMessage(
        `§7Lens: §c${result.spawnable} spawnable§7, §8${result.uncertain} uncertain§7 ` +
          `of ${result.scanned} standable position(s).`,
      );

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
