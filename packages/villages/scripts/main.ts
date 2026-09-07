/**
 * Villages - found villages of five peoples, peopled by job posts.
 *
 * The world generator raises the villages from jigsaw structures (behavior
 * pack `worldgen/`); every building carries a job post block, and the post
 * keeps one person beside it. Design: docs/design/villages.md, with the
 * measurements in docs/villages-jigsaw-results.md.
 */
import { Player, system, world, type ItemCustomComponent } from "@minecraft/server";
import * as clock from "./engine/clock";
import * as debug from "./engine/debug";
import * as buildings from "./engine/buildings";
import * as hatches from "./engine/hatches";
import * as jobs from "./engine/jobs";
import { COMPONENT_ID, markPlacedByPlayer, postComponent } from "./engine/post";
import * as structures from "./engine/structures";
import { COMPONENT_ID as TABLE_COMPONENT, TABLE, tableComponent } from "./engine/table";
import { tell } from "./engine/tell";
import * as settings from "./engine/settings";
import * as storage from "./engine/storage";
import * as follow from "./engine/follow";
import * as standing from "./engine/standing";
import * as storehouse from "./engine/storehouse";
import * as visitors from "./engine/visitors";

const log = (...parts: unknown[]): void => console.warn("[Villages]", ...parts);
let registered = 0;
const COMPONENTS = 3;

export const BLUEPRINT_COMPONENT = "villages:blueprint";

/** The blueprint item does nothing on its own; the table reads it from the hand. */
const blueprintComponent: ItemCustomComponent = {
  onUse(ev) {
    tell(ev.source, "Take this to a blueprint table and tap the table while holding it.");
  },
  onUseOn(ev) {
    if (ev.block.typeId === TABLE) return; // the table's own hook takes it from here
    if (ev.source instanceof Player) tell(ev.source, "Tap a blueprint table while holding this.");
  },
};

// Module scope: startup fires before worldLoad, and not on /reload.
system.beforeEvents.startup.subscribe((event) => {
  for (const [id, component] of [[COMPONENT_ID, postComponent], [TABLE_COMPONENT, tableComponent]] as const) {
    try {
      event.blockComponentRegistry.registerCustomComponent(id, component);
      registered++;
      log(`registered block component ${id}`);
    } catch (e) {
      log(`FAILED to register ${id}: ${e}`);
    }
  }
  try {
    event.itemComponentRegistry.registerCustomComponent(BLUEPRINT_COMPONENT, blueprintComponent);
    registered++;
  } catch (e) {
    log(`FAILED to register ${BLUEPRINT_COMPONENT}: ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  const known = storage.load();
  const knownBuildings = buildings.load();
  structures.install(log);
  clock.install(log);
  settings.install(log);
  visitors.install(log);
  standing.install(log);
  storehouse.install(log);
  follow.install(log);
  system.runInterval(() => {
    settings.refresh();
    clock.touch();
  }, 200);
  debug.install();
  hatches.install();
  // Building jobs the world was saved mid-way through carry on once the chunks near spawn have had a moment to load.
  system.runTimeout(() => log(`${jobs.resume()} building job(s) resumed`), 100);
  log(`ready at tick ${system.currentTick}: ${known} post(s) and ${knownBuildings} building(s) known; ${registered}/${COMPONENTS} components registered${registered < COMPONENTS ? " - re-enter the world" : ""}`);
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
