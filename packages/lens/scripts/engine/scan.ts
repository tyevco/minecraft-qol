import {
  LiquidType,
  MemoryTier,
  system,
  type Dimension,
  type Player,
  type Vector3,
} from "@minecraft/server";
import { withBlock } from "@qol/shared/engine/safeBlock";
import { classify, shouldMark } from "../core/spawn";
import { isClearSpace, isStandableFloor, type BlockFlags } from "../core/surface";
import type { Mark } from "./markers";

function sqDist(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export type Mode = "danger" | "safe";

export interface ScanSettings {
  radius: number;
  /** Vertical half-height of the scanned box. */
  height: number;
  mode: Mode;
  /** Draw one marker every N qualifying positions, to thin dense results. */
  density: number;
}

function readFlags(dim: Dimension, loc: Vector3): BlockFlags | undefined {
  return withBlock(dim, loc, (b) => ({
    typeId: b.typeId,
    isAir: b.isAir,
    isLiquid: b.isLiquid,
    blocksWater: b.isLiquidBlocking(LiquidType.Water),
  }));
}

/**
 * Scale the scan down on weaker devices. A 16-radius box is ~35k positions;
 * that is fine on a desktop and not fine on a phone.
 */
export function deviceScale(player: Player): number {
  try {
    switch (player.clientSystemInfo.memoryTier) {
      case MemoryTier.SuperLow:
        return 0.4;
      case MemoryTier.Low:
        return 0.6;
      case MemoryTier.Mid:
        return 0.8;
      default:
        return 1;
    }
  } catch {
    return 1; // never let device probing break the feature
  }
}

export interface ScanResult {
  scanned: number;
  spawnable: number;
  uncertain: number;
  /**
   * Highest sky light seen. Distinguishes "grey because it is daytime outdoors"
   * from "grey for some other reason", so the UI can explain itself.
   */
  skyMax: number;
  /**
   * Positions to draw, nearest first. Rendering is deliberately not done here -
   * the scan decides what is true, the marker pool decides how it looks.
   */
  marks: Mark[];
}

/**
 * Walk the volume around the player and mark qualifying positions.
 *
 * Runs as a generator driven by system.runJob so a large scan spreads across
 * frames instead of spiking the watchdog. The engine gives each generator at
 * least one iteration per tick, so the yield granularity is what keeps a single
 * iteration inside the tick budget.
 */
export function* scanAround(
  player: Player,
  settings: ScanSettings,
  onDone: (result: ScanResult) => void,
): Generator<void, void, void> {
  const dim = player.dimension;
  const origin = {
    x: Math.floor(player.location.x),
    y: Math.floor(player.location.y),
    z: Math.floor(player.location.z),
  };

  const result: ScanResult = {
    scanned: 0,
    spawnable: 0,
    uncertain: 0,
    skyMax: 0,
    marks: [],
  };
  const r = settings.radius;
  const h = settings.height;
  let sinceYield = 0;
  let qualifying = 0;

  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dy = -h; dy <= h; dy++) {
        // Yield often enough that one iteration is trivially cheap. The engine
        // guarantees at least one iteration per tick, so this is the knob that
        // keeps a big scan off the watchdog.
        if (++sinceYield >= 64) {
          sinceYield = 0;
          yield;
        }

        const feetPos = { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz };
        const feet = readFlags(dim, feetPos);
        if (!feet || !isClearSpace(feet)) continue;

        const below = readFlags(dim, { ...feetPos, y: feetPos.y - 1 });
        if (!below || !isStandableFloor(below)) continue;

        const head = readFlags(dim, { ...feetPos, y: feetPos.y + 1 });
        if (!head || !isClearSpace(head)) continue;

        let total: number;
        let sky: number;
        try {
          total = dim.getLightLevel(feetPos);
          sky = dim.getSkyLightLevel(feetPos);
        } catch {
          continue;
        }

        result.scanned++;
        if (sky > result.skyMax) result.skyMax = sky;
        const verdict = classify({ light: { total, sky }, standable: true });
        if (verdict === "spawnable") result.spawnable++;
        if (verdict === "uncertain") result.uncertain++;
        if (!shouldMark(verdict, settings.mode)) continue;

        // Thin dense results rather than marking every single position.
        if (settings.density > 1 && qualifying++ % settings.density !== 0) continue;

        result.marks.push({ pos: feetPos, verdict });
      }
    }
  }

  // Nearest first, so that when the marker budget clips the list it keeps the
  // positions the player is actually standing among.
  result.marks.sort((a, b) => sqDist(origin, a.pos) - sqDist(origin, b.pos));

  onDone(result);
}

/** Convenience wrapper so callers do not touch runJob directly. */
export function runScan(
  player: Player,
  settings: ScanSettings,
  onDone: (result: ScanResult) => void,
): number {
  return system.runJob(scanAround(player, settings, onDone));
}
