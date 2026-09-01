/**
 * Lens - spawn-proofing overlay.
 *
 * Marks nearby positions where hostile mobs can spawn. Built on measured engine
 * behaviour, not assumptions - see docs/lens-light-results.md.
 *
 * v1 deliberately ships no custom item: that would need a resource pack for its
 * texture and name, and the overlay is fully usable from a command. The item is
 * a later phase, where ItemCustomComponent.onUse is already stable and waiting.
 */
import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system,
  world,
  type CustomCommandResult,
} from "@minecraft/server";
import { deviceScale, runScan, type Mode, type ScanSettings } from "./engine/scan";

const TAG = "[Lens]";
// console.warn always reaches the content log; console.log only at Verbose/Info.
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

/** Defaults. Pack settings will back these in a follow-up; see README. */
const BASE: ScanSettings = { radius: 12, height: 4, mode: "danger", density: 1 };

/** Ticks between refreshes while the overlay is on. */
const REFRESH_TICKS = 40;

interface Session {
  mode: Mode;
  /** runJob handle, so a slow scan is not double-started. */
  busy: boolean;
}

const active = new Map<string, Session>();
let ticker: number | undefined;

function settingsFor(player: Player, mode: Mode): ScanSettings {
  const scale = deviceScale(player);
  return {
    ...BASE,
    mode,
    radius: Math.max(4, Math.round(BASE.radius * scale)),
    height: Math.max(2, Math.round(BASE.height * scale)),
    // Thin markers on weaker devices rather than dropping the radius further -
    // a small accurate picture beats a large sparse one.
    density: scale < 0.7 ? 2 : 1,
  };
}

function tick(): void {
  if (active.size === 0) return;
  for (const player of world.getAllPlayers()) {
    const session = active.get(player.id);
    if (!session || session.busy) continue;
    session.busy = true;
    runScan(player, settingsFor(player, session.mode), () => {
      session.busy = false;
    });
  }
}

function toggle(player: Player, mode?: Mode): void {
  const existing = active.get(player.id);

  // Same mode -> off. Different mode -> switch without an off/on round trip.
  if (existing && (mode === undefined || existing.mode === mode)) {
    active.delete(player.id);
    player.sendMessage("§7Lens off.");
    return;
  }

  const next = mode ?? existing?.mode ?? BASE.mode;
  active.set(player.id, { mode: next, busy: false });
  player.sendMessage(
    next === "danger"
      ? "§cLens on §7— marking where hostiles can spawn. §8Grey = uncertain (open sky masks block light)."
      : "§aLens on §7— marking spawn-proofed positions.",
  );
}

function parseMode(message: string): Mode | undefined {
  const m = message.trim().toLowerCase();
  if (m === "danger" || m === "safe") return m;
  return undefined;
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
        // Command callbacks are read-only; defer anything that touches the world.
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
  ticker = system.runInterval(tick, REFRESH_TICKS);

  // Fallback that works immediately after /reload, unlike a custom command.
  // Optional argument: "danger" or "safe".
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "lens:toggle") return;
    const player = ev.sourceEntity;
    if (!(player instanceof Player)) {
      log("scriptevent lens:toggle: run this as a player");
      return;
    }
    toggle(player, parseMode(ev.message));
  });

  world.afterEvents.playerLeave.subscribe((ev) => active.delete(ev.playerId));

  log(`ready at tick ${system.currentTick}, refresh every ${REFRESH_TICKS} ticks (job ${ticker})`);
});
