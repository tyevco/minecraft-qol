import {
  LiquidType,
  MemoryTier,
  system,
  type Dimension,
  type Player,
  type Vector3,
} from "@minecraft/server";
import { withBlock } from "@qol/shared/engine/safeBlock";
import { classify, shouldMark, type Verdict } from "../core/spawn";
import { isClearSpace, isStandableFloor, type BlockFlags } from "../core/surface";

export type Mode = "danger" | "safe";

export interface ScanSettings {
  radius: number;
  /** Vertical half-height of the scanned box. */
  height: number;
  mode: Mode;
  /** Draw one marker every N qualifying positions, to thin dense results. */
  density: number;
}

/**
 * Particle per verdict. Wrapped in try/catch at the call site: an unknown
 * particle id must not kill the scan, and we only want to hear about it once.
 */
const PARTICLE: Record<Exclude<Verdict, "safe"> | "safe", string> = {
  spawnable: "minecraft:basic_flame_particle",
  uncertain: "minecraft:basic_smoke_particle",
  safe: "minecraft:villager_happy",
};

let particleWarned = false;

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
  marked: number;
  spawnable: number;
  uncertain: number;
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

  const result: ScanResult = { scanned: 0, marked: 0, spawnable: 0, uncertain: 0 };
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
        const verdict = classify({ light: { total, sky }, standable: true });
        if (verdict === "spawnable") result.spawnable++;
        if (verdict === "uncertain") result.uncertain++;
        if (!shouldMark(verdict, settings.mode)) continue;

        // Thin dense results rather than drawing every single position.
        if (settings.density > 1 && qualifying++ % settings.density !== 0) continue;

        try {
          dim.spawnParticle(PARTICLE[verdict], {
            x: feetPos.x + 0.5,
            y: feetPos.y + 0.1,
            z: feetPos.z + 0.5,
          });
          result.marked++;
        } catch (e) {
          if (!particleWarned) {
            particleWarned = true;
            console.warn(`[Lens] particle ${PARTICLE[verdict]} failed: ${e}`);
          }
        }
      }
    }
  }

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
