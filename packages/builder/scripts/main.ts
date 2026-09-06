/**
 * Builder - a blueprint table, blueprint items, and a builder who raises the
 * building one block at a time from the chest beside the table.
 *
 * Hold a blueprint and tap the table: it shows the building, its size and
 * materials, checks the ground and the chest, and places it from where you
 * stand, the door facing the way you face. The builder walks to each spot
 * and puts one block down every few seconds (the panel's slider), bottom
 * layer up. Tap the table empty-handed to take a building down into the
 * chest. Nothing is ever lost: a block goes down only as its item leaves the
 * chest, and comes up only once its item is back in.
 *
 * A prototype of the settlements' builder (docs/design/settlements.md §5),
 * standing alone so it can be measured before it joins the villages pack.
 * Start here: packages/builder/README.md; measurements in
 * docs/settlements-results.md.
 */
import { Player, system, world, type ItemCustomComponent } from "@minecraft/server";
import { describePolicy } from "./core/settings";
import * as debug from "./engine/debug";
import * as jobs from "./engine/jobs";
import * as settings from "./engine/settings";
import * as storage from "./engine/storage";
import * as structures from "./engine/structures";
import { COMPONENT_ID, TABLE, tableComponent } from "./engine/table";
import { log, tell } from "./engine/tell";

export const BLUEPRINT_COMPONENT = "builder:blueprint";

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

let registered = 0;

// Module scope: startup fires before worldLoad, and not on /reload.
system.beforeEvents.startup.subscribe((event) => {
  try {
    event.blockComponentRegistry.registerCustomComponent(COMPONENT_ID, tableComponent);
    registered++;
  } catch (e) {
    log(`FAILED to register ${COMPONENT_ID}: ${e}`);
  }
  try {
    event.itemComponentRegistry.registerCustomComponent(BLUEPRINT_COMPONENT, blueprintComponent);
    registered++;
  } catch (e) {
    log(`FAILED to register ${BLUEPRINT_COMPONENT}: ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  // /reload discards module state, so everything is re-established here.
  const known = storage.load();
  structures.install(log);
  settings.install(log);
  debug.install();
  system.runInterval(() => settings.refresh(), 200);
  // Jobs the world was saved mid-way through carry on once the chunks near
  // spawn have had a moment to load.
  system.runTimeout(() => log(`${jobs.resume()} job(s) resumed`), 100);
  log(`ready at tick ${system.currentTick}: ${describePolicy(settings.policy())}; ${known} building(s) known; ${registered}/2 components registered${registered < 2 ? " - re-enter the world" : ""}`);
});
