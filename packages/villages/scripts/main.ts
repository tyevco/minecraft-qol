/**
 * Villages - found villages of four peoples, peopled by job posts.
 *
 * The world generator raises the villages from jigsaw structures (behavior
 * pack `worldgen/`); every building carries a job post block, and the post
 * keeps one person beside it. Design: docs/design/villages.md, with the
 * measurements in docs/villages-jigsaw-results.md.
 */
import { system, world } from "@minecraft/server";
import * as debug from "./engine/debug";
import { COMPONENT_ID, postComponent } from "./engine/post";
import * as storage from "./engine/storage";

const log = (...parts: unknown[]): void => console.warn("[Villages]", ...parts);
let componentRegistered = false;

// Module scope: startup fires before worldLoad, and not on /reload.
system.beforeEvents.startup.subscribe((event) => {
  try {
    event.blockComponentRegistry.registerCustomComponent(COMPONENT_ID, postComponent);
    componentRegistered = true;
    log(`registered block component ${COMPONENT_ID}`);
  } catch (e) {
    log(`FAILED to register ${COMPONENT_ID}: ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  const known = storage.load();
  debug.install();
  log(`ready at tick ${system.currentTick}: ${known} post(s) known; block component ${componentRegistered ? "registered" : "NOT registered - re-enter the world"}`);
});
