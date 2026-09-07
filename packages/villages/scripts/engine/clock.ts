/**
 * The restart marker (issue #71). `system.currentTick` counts from the
 * server's boot, and every stamp in the index is one, so a stamp from the
 * last boot has to be recognised as such. The last tick seen is kept in a
 * world property; at load, a stored tick ahead of the clock means the clock
 * restarted, and every record's waits are treated as over. A `/reload`
 * keeps the clock running, so it is not a restart.
 */
import { system, world } from "@minecraft/server";
import { clockRestarted } from "../core/record";
import * as storage from "./storage";

const PROPERTY = "vl:tick";
let sawRestart = false;

/** Whether this boot's clock is a fresh one (read at install): every stamp from before it is over. */
export const restarted = (): boolean => sawRestart;

/** Call once at load, after the index is loaded. Returns how many records were reset. */
export function install(log: (...parts: unknown[]) => void): number {
  let reset = 0;
  try {
    const last = world.getDynamicProperty(PROPERTY);
    if (clockRestarted(last, system.currentTick)) {
      sawRestart = true;
      reset = storage.resetAfterRestart();
      log(`the clock restarted (last saw tick ${String(last)}, now ${system.currentTick}); ${reset} record(s) had their waits ended`);
    }
  } catch (e) {
    log(`could not read the restart marker: ${e}`);
  }
  touch();
  return reset;
}

/** Remember the tick; called every few seconds so the marker is never far behind. */
export function touch(): void {
  try {
    world.setDynamicProperty(PROPERTY, system.currentTick);
  } catch {
    /* the next touch will */
  }
}
