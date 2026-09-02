/**
 * Bulwark - automated base defense. SCAFFOLD ONLY, nothing implemented yet.
 *
 * A placeable turret that acquires and attacks hostile mobs, upgraded by feeding
 * it items. See docs/design/bulwark-turret.md, and read the corrections in
 * docs/README.md first - several of that document's assumptions do not hold.
 *
 * Start here: packages/bulwark/README.md
 */
import { system, world } from "@minecraft/server";

const TAG = "[Bulwark]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

world.afterEvents.worldLoad.subscribe(() => {
  log(`scaffold loaded at tick ${system.currentTick} - no features implemented yet`);
});
