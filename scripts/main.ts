/**
 * QOL Times entrypoint.
 *
 * Scripting V2 runs modules in "early execution": most of `world` throws if
 * touched at module top level, so all real initialisation happens inside
 * worldLoad. Custom commands are the exception - they must be registered in
 * system.beforeEvents.startup, which fires before `world` is usable.
 */
import { system, world } from "@minecraft/server";
import { install } from "./dispenser/interceptor";
import { restore, startPolling, rigCount } from "./dispenser/rigRegistry";
import { load as loadSettings } from "./settings/store";

const TAG = "[QOL Times]";

// console.warn always reaches the content log; console.log only shows at
// Verbose/Info, so warn is the only reliable channel for diagnostics.
export const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

world.afterEvents.worldLoad.subscribe(() => {
  // /reload discards all module state, so everything durable is rehydrated here
  // rather than assumed to have survived.
  loadSettings();
  restore();
  startPolling();
  install(log);

  log(`ready at tick ${system.currentTick}, ${rigCount()} known rig(s)`);
});
