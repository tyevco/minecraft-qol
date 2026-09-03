/**
 * Hatchling - a pet dragon for the kids.
 *
 * Craft an egg (a chicken egg ringed with coal, bone meal or snowballs, for an
 * ember, moss or frost egg), put it down, and warm it with the same thing a
 * few times; the shell cracks and it hatches. Feed the hatchling sweet
 * berries to make friends, then keep feeding it and it grows through two more
 * sizes. It follows, sits, takes a name and a lead, and never fights.
 *
 * Every number is on the settings panel: warmings to hatch, feedings per
 * size, the rest between each, and whether anyone or only the owner may tend.
 * No commands; the only script event is `hatchling:debug`.
 *
 * Design: docs/design/hatchling.md. Start here: packages/hatchling/README.md
 */
import { system, world } from "@minecraft/server";
import { describePolicy } from "./core/rules";
import * as debug from "./engine/debug";
import * as egg from "./engine/egg";
import * as pet from "./engine/pet";
import * as settings from "./engine/settings";

const TAG = "[Hatchling]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

/** Ticks between settings-panel polls. The change event is beta-only. */
const SETTINGS_TICKS = 100;

let itemComponentRegistered = false;

// Must run at module scope: startup fires before worldLoad, and not on /reload.
system.beforeEvents.startup.subscribe((event) => {
  try {
    event.itemComponentRegistry.registerCustomComponent(egg.ITEM_COMPONENT, egg.eggItemComponent);
    itemComponentRegistered = true;
    log(`registered item component ${egg.ITEM_COMPONENT}`);
  } catch (e) {
    log(`FAILED to register ${egg.ITEM_COMPONENT}: ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  // /reload discards module state, so everything is re-established here.
  settings.install(log);
  egg.install(log);
  pet.install(log);
  debug.install();
  system.runInterval(() => settings.refresh(), SETTINGS_TICKS);

  log(
    `ready at tick ${system.currentTick}: ${describePolicy(settings.policy())}; egg item ` +
      `${itemComponentRegistered ? "registered" : "NOT registered - re-enter the world"}`,
  );
});
