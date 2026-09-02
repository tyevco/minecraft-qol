/**
 * Fluidworks - fluid logistics.
 *
 *   Cauldrons are tanks. Funnels are pipes. Dispensers are ports.
 *
 * A funnel has a mouth and a spout. Each cycle it looks at the block behind
 * its mouth and the block in front of its spout, and if the spout points at a
 * cauldron it does one thing:
 *
 *   container behind it   -> feed one item through the cauldron rules
 *                            (concrete, buckets, bottles, dye, washing);
 *                            the product leaves through the bottom of the tank
 *   water or lava source  -> one level into the tank
 *   another cauldron      -> one level across
 *   the open sky (facing down, in rain) -> one level of rainwater
 *
 * Everything is configured from the pack's settings panel. No commands; the
 * one script event is `fluidworks:debug`.
 *
 * Design: docs/design/fluidworks.md, read with docs/README.md's corrections.
 * The rules themselves are shared with QOL Times (packages/shared/core/fluids).
 */
import { Player, system, world } from "@minecraft/server";
import { createSettingsPoller } from "@qol/shared/engine/packSettings";
import { safeGetBlock } from "@qol/shared/engine/safeBlock";
import {
  DEFAULT_SETTINGS,
  describeSettings,
  parseSettings,
  sameSettings,
} from "./core/policy";
import { FUNNEL } from "./core/pipes";
import { cycle } from "./engine/funnel";
import { funnels } from "./engine/index";
import { isConnectable, refreshAround } from "./engine/pipes";
import * as weather from "./engine/weather";

const TAG = "[Fluidworks]";
const log = (...parts: unknown[]): void => console.warn(TAG, ...parts);

/** Ticks between settings-panel polls. The change event is beta-only. */
const SETTINGS_TICKS = 100;

const settings = createSettingsPoller(
  parseSettings,
  sameSettings,
  DEFAULT_SETTINGS,
  log,
  describeSettings,
);

let inFlight = false;

function scheduleCycle(): void {
  system.runTimeout(() => {
    if (!inFlight && funnels.count() > 0) {
      inFlight = true;
      system.runJob(
        (function* () {
          try {
            yield* cycle(settings.current(), log);
          } finally {
            inFlight = false;
          }
        })(),
      );
    }
    scheduleCycle();
  }, settings.current().cycleTicks);
}

world.afterEvents.worldLoad.subscribe(() => {
  funnels.load();
  settings.refresh();
  weather.install();
  system.runInterval(() => settings.refresh(), SETTINGS_TICKS);
  scheduleCycle();

  world.afterEvents.playerPlaceBlock.subscribe((ev) => {
    const b = ev.block;
    if (!b.isValid) return;
    if (b.typeId === FUNNEL) {
      funnels.put({
        dimId: b.dimension.id,
        x: b.x,
        y: b.y,
        z: b.z,
        wear: 0,
        sleepUntil: 0,
      });
    }
    if (isConnectable(b.typeId)) refreshAround(b.dimension, b);
  });

  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    const id = ev.brokenBlockPermutation.type.id;
    const b = ev.block;
    if (id === FUNNEL)
      funnels.remove({ dimId: b.dimension.id, x: b.x, y: b.y, z: b.z });
    if (isConnectable(id)) refreshAround(b.dimension, b);
  });

  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    const player = ev.sourceEntity;
    if (!(player instanceof Player)) return;

    // The design's `rebuild`: index every funnel near the caller. Pistons,
    // /fill and structures do not fire playerPlaceBlock, so this is how a
    // funnel that arrived any other way gets picked up - GameTest rigs included.
    if (ev.id === "fluidworks:rescan") {
      const r = Math.min(32, Math.max(1, Number(ev.message) || 16));
      const o = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
      const dim = player.dimension;
      let found = 0;
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++)
          for (let dz = -r; dz <= r; dz++) {
            const pos = { x: o.x + dx, y: o.y + dy, z: o.z + dz };
            const b = safeGetBlock(dim, pos);
            if (!b || !b.isValid || b.typeId !== FUNNEL) continue;
            found++;
            if (!funnels.find({ dimId: dim.id, ...pos })) funnels.put({ dimId: dim.id, ...pos, wear: 0, sleepUntil: 0 });
          }
      player.sendMessage(`§7rescan r=${r}: §f${found}§7 funnel(s) found, §f${funnels.count()}§7 indexed`);
      return;
    }

    if (ev.id !== "fluidworks:debug") return;
    player.sendMessage(`§7panel: §f${describeSettings(settings.current())}`);
    player.sendMessage(
      `§7weather here: §f${weather.describe(player.dimension.id)}`,
    );
    const here = player.location;
    const near = funnels
      .all()
      .filter(
        (r) =>
          r.dimId === player.dimension.id &&
          Math.abs(r.x - here.x) < 16 &&
          Math.abs(r.z - here.z) < 16,
      );
    player.sendMessage(
      `§7funnels: §f${funnels.count()}§7 indexed, §f${near.length}§7 within 16 blocks`,
    );
    for (const r of near) {
      const asleep = r.sleepUntil > system.currentTick ? " §8(idle)" : "";
      player.sendMessage(
        `§7- §f${r.x} ${r.y} ${r.z}§7 wear ${r.wear}${asleep}`,
      );
    }
  });

  log(
    `ready at tick ${system.currentTick}, ${funnels.count()} funnel(s) indexed`,
  );
});
