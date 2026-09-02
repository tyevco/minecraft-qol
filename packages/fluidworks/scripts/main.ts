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
import * as labels from "./engine/labels";
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
    // The design's `rebuild`: index every funnel near a point. Pistons,
    // /fill and structures do not fire playerPlaceBlock, so this is how a
    // funnel that arrived any other way gets picked up - GameTest rigs included.
    //
    //   scriptevent fluidworks:rescan <radius> [x y z]
    //
    // The origin is the caller's own position, or the coordinates when they are
    // given. Coordinates are not a convenience: a command run by anything other
    // than a real player - a SimulatedPlayer, or the server console - arrives
    // with sourceType Entity and *no* sourceEntity (measured on BDS 1.26.45.1,
    // see docs/gametest-structure-results.md), so there is no position to read
    // and no player to reply to. Without them the hatch is unreachable from a
    // test or a console.
    if (ev.id === "fluidworks:rescan") {
      const caller = ev.sourceEntity instanceof Player ? ev.sourceEntity : undefined;
      const parts = ev.message.trim().split(/\s+/).filter(Boolean);
      const r = Math.min(32, Math.max(1, Number(parts[0]) || 16));
      const [cx, cy, cz] = parts.slice(1, 4).map(Number);
      const at =
        cx !== undefined &&
        cy !== undefined &&
        cz !== undefined &&
        Number.isFinite(cx) &&
        Number.isFinite(cy) &&
        Number.isFinite(cz)
          ? { x: cx, y: cy, z: cz }
          : caller?.location;
      if (!at) {
        console.warn(
          "[Fluidworks] rescan: no caller position to scan from - pass x y z",
        );
        return;
      }
      const o = {
        x: Math.floor(at.x),
        y: Math.floor(at.y),
        z: Math.floor(at.z),
      };
      // An origin given as coordinates carries no dimension with it.
      const dim = caller?.dimension ?? world.getDimension("minecraft:overworld");
      let found = 0;
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++)
          for (let dz = -r; dz <= r; dz++) {
            const pos = { x: o.x + dx, y: o.y + dy, z: o.z + dz };
            const b = safeGetBlock(dim, pos);
            if (!b || !b.isValid || b.typeId !== FUNNEL) continue;
            found++;
            if (!funnels.find({ dimId: dim.id, ...pos }))
              funnels.put({ dimId: dim.id, ...pos, wear: 0, sleepUntil: 0 });
          }
      const report = `rescan r=${r} at ${o.x},${o.y},${o.z}: ${found} funnel(s) found, ${funnels.count()} indexed`;
      caller?.sendMessage(`§7${report}`);
      // Also to the content log, so a console-run rescan reports somewhere.
      console.warn(`[Fluidworks] ${report}`);
      return;
    }

    const player = ev.sourceEntity;
    if (!(player instanceof Player)) return;
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
