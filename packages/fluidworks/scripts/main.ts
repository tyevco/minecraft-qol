/**
 * Fluidworks - fluid logistics. SCAFFOLD ONLY, nothing implemented yet.
 *
 * The model, in one sentence: cauldrons are tanks, funnels are pipes, dispensers
 * are ports. See docs/design/fluidworks.md, and read the corrections in
 * docs/README.md first - several of that document's assumptions do not hold.
 *
 * Start here: packages/fluidworks/README.md
 */
import { system, world } from "@minecraft/server";

const TAG = "[Fluidworks]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

world.afterEvents.worldLoad.subscribe(() => {
  log(`scaffold loaded at tick ${system.currentTick} - no features implemented yet`);
});
