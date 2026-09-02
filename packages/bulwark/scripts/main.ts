/**
 * Bulwark - automated base defense. Phase 2: the turret core.
 *
 * A placeable turret block paired with an entity head that uses vanilla AI to
 * acquire and shoot hostile mobs. Ammo comes from an adjacent hopper or by
 * hand; the block and its head reconcile each other so neither can go missing
 * or double up.
 *
 * Design: docs/design/bulwark-turret.md, corrected by docs/README.md.
 * Probe protocol for the unknowns: docs/bulwark-turret-probe.md.
 * Start here: packages/bulwark/README.md
 */
import { system, world } from "@minecraft/server";
import * as debug from "./engine/debug";
import * as hooks from "./engine/hooks";
import * as storage from "./engine/storage";
import { COMPONENT_ID, turretComponent } from "./engine/turret";

const TAG = "[Bulwark]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

let componentRegistered = false;

// Must run at module scope: startup fires before worldLoad, and not on /reload.
// Registration is logged either way so a turret block that does nothing can be
// traced to its cause in the content log rather than guessed at.
system.beforeEvents.startup.subscribe((event) => {
  try {
    event.blockComponentRegistry.registerCustomComponent(COMPONENT_ID, turretComponent);
    componentRegistered = true;
    log(`registered block component ${COMPONENT_ID}`);
  } catch (e) {
    log(`FAILED to register ${COMPONENT_ID}: ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  // /reload discards module state, so everything is re-established here.
  const known = storage.load();
  hooks.install();
  debug.install();

  log(
    `ready at tick ${system.currentTick}: ${known} turret(s) known; block component ` +
      `${componentRegistered ? "registered" : "NOT registered - re-enter the world"}`,
  );
});
