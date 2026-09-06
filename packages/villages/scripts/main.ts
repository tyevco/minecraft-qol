/**
 * Villages - found villages of five peoples, peopled by job posts.
 *
 * The world generator raises the villages from jigsaw structures (behavior
 * pack `worldgen/`); every building carries a job post block, and the post
 * keeps one person beside it. Design: docs/design/villages.md, with the
 * measurements in docs/villages-jigsaw-results.md.
 */
import { system, world } from "@minecraft/server";
import * as clock from "./engine/clock";
import * as debug from "./engine/debug";
import { COMPONENT_ID, markPlacedByPlayer, postComponent } from "./engine/post";
import * as settings from "./engine/settings";
import * as storage from "./engine/storage";
import * as follow from "./engine/follow";
import * as standing from "./engine/standing";
import * as visitors from "./engine/visitors";

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
  clock.install(log);
  settings.install(log);
  visitors.install(log);
  standing.install(log);
  follow.install(log);
  system.runInterval(() => {
    settings.refresh();
    clock.touch();
  }, 200);
  debug.install();
  log(`ready at tick ${system.currentTick}: ${known} post(s) known; block component ${componentRegistered ? "registered" : "NOT registered - re-enter the world"}`);
});

// A post a player placed is the kids' own (docs/design/villages.md §6.1):
// it spawns nobody and waits for a visitor to settle. The block's onPlace
// fires for structure loads too, so this event is what tells them apart.
// Logged with whether the record existed yet, which measures which of the
// two events the engine fires first.
world.afterEvents.playerPlaceBlock.subscribe((ev) => {
  if (ev.block.typeId !== "villages:post") return;
  const pos = { dimId: ev.dimension.id, x: ev.block.location.x, y: ev.block.location.y, z: ev.block.location.z };
  const existed = markPlacedByPlayer(pos);
  log(`a player placed a post at ${pos.x},${pos.y},${pos.z}; its record ${existed ? "already existed (onPlace first)" : "did not exist yet (playerPlaceBlock first)"}`);
});
