/**
 * Guardian - per-role damage scaling and safety switches.
 *
 * The kids die to things the adults shrug off: a fall, a lava pocket, a
 * creeper at the door. Difficulty is a world setting, so the only vanilla
 * lever is to make the whole realm easier for everyone. Guardian makes how
 * much damage a player takes a per-role choice in the pack's settings panel,
 * with switches for the deaths that hurt most:
 *
 *   Visitors / Members / Operators take   100% / 75% / 50% / 25% / no damage
 *   Visitors and Members                  no fall, no burn, no drowning
 *   Void catch                            a faller is put back where they stood
 *
 * Guardian only ever reduces what would have happened. It never adds damage,
 * never touches a role at 100% with no switches on, and never changes what
 * mobs do - only what lands. A Member still gets chased by the creeper; they
 * just survive it.
 *
 * No commands. Everything is configured from the panel; the only script event
 * is `guardian:debug`, which prints what the pack thinks the panel says.
 */
import { Player, system, world } from "@minecraft/server";
import { describePolicy, isProtectedRole } from "./core/rules";
import * as settings from "./engine/settings";
import * as shield from "./engine/shield";
import * as voidCatch from "./engine/voidCatch";

const TAG = "[Guardian]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

/** Ticks between settings-panel polls. The change event is beta-only. */
const SETTINGS_TICKS = 100;

world.afterEvents.worldLoad.subscribe(() => {
  settings.install(log);
  shield.install(log);

  system.runInterval(() => settings.refresh(), SETTINGS_TICKS);
  system.runInterval(() => voidCatch.sweep(log), voidCatch.SWEEP_TICKS);

  world.afterEvents.playerLeave.subscribe((ev) => {
    shield.forget(ev.playerId);
    voidCatch.forget(ev.playerId);
  });

  // Diagnostics, in the same shape as the other packs: /reload-safe because
  // scriptEventReceive is subscribed here rather than at startup.
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "guardian:debug") return;
    const player = ev.sourceEntity;
    if (!(player instanceof Player)) return;

    const pol = settings.policy();
    const { role, scale } = settings.roleAndScale(player);
    const tick = system.currentTick;
    player.sendMessage(`§7panel: §f${describePolicy(pol)}`);
    player.sendMessage(
      `§7you: role §f${role}§7, take §f${scale}%§7, switches ${
        isProtectedRole(role) ? "§aapply" : "§8do not apply (operator)"
      }`,
    );
    for (const cause of ["fall", "lava", "drowning", "entityAttack"]) {
      const v = shield.verdictFor(player, cause, tick);
      const what =
        v.kind === "vanilla" ? "vanilla" : v.kind === "immune" ? `immune (${v.why})` : `x${v.multiplier}`;
      player.sendMessage(`§7- ${cause}: §f${what}`);
    }
    const ground = voidCatch.tracker.get(player.id);
    player.sendMessage(
      ground
        ? `§7last ground: §f${Math.floor(ground.pos.x)} ${Math.floor(ground.pos.y)} ${Math.floor(ground.pos.z)}§7, ${tick - ground.tick} ticks ago`
        : "§7last ground: §cnot yet sampled",
    );
    player.sendMessage(
      `§7floor here: y=§f${player.dimension.heightRange.min}§7, catch ${pol.voidCatch ? "§aon" : "§8off"}`,
    );
  });

  log(`ready at tick ${system.currentTick}: ${describePolicy(settings.policy())}`);
});
