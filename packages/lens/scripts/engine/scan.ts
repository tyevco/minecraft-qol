import {
  LiquidType,
  MemoryTier,
  system,
  type Dimension,
  type Player,
  type Vector3,
} from "@minecraft/server";
import { withBlock } from "@qol/shared/engine/safeBlock";
import { makeGrid, toIndex, type Grid } from "../core/grid";
import { classify, shouldMark } from "../core/spawn";
import {
  isClearSpace,
  isStandableFloor,
  passesLight,
  supportsTorch,
  type BlockFlags,
} from "../core/surface";
import type { Mark } from "./markers";

export type Mode = "danger" | "safe";

export interface ScanSettings {
  radius: number;
  /** Vertical half-height of the scanned box. */
  height: number;
  mode: Mode;
  /** Draw one marker every N qualifying positions, to thin dense results. */
  density: number;
  /** Whether to gather the data the lighting solver needs (tier 2 only). */
  wantSolver: boolean;
}

/** Per-cell flags, packed so the world is read exactly once. */
const F_LIGHT = 1; // light propagates through
const F_CLEAR = 2; // a mob could occupy it
const F_FLOOR = 4; // a mob could stand on it
const F_TORCH = 8; // a torch could stand on it

export interface Survey {
  grid: Grid;
  /** Local cell indices of confirmed-spawnable positions. */
  targets: number[];
  /** Local cell indices where a torch could legally be placed. */
  candidates: number[];
  /** Local index -> world position, for rendering solver output. */
  origin: Vector3;
}

export interface ScanResult {
  scanned: number;
  spawnable: number;
  uncertain: number;
  /** Highest sky light seen, so the UI can explain daytime greyness. */
  skyMax: number;
  /** Positions to draw, nearest first. */
  marks: Mark[];
  /** Present only when settings.wantSolver was set. */
  survey?: Survey;
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
 * Scale the scan down on weaker devices. A 12-radius box is ~15k cells; that is
 * fine on a desktop and not fine on a phone.
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

function sqDist(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Walk the volume around the player, classify every position, and - when the
 * solver needs it - build the passable grid in the same pass.
 *
 * Reading each block exactly once is the single biggest performance decision
 * here: engine calls cost far more per unit than array arithmetic, and the flood
 * fill that follows does hundreds of thousands of steps against these arrays.
 */
export function* scanAround(
  player: Player,
  settings: ScanSettings,
  onDone: (result: ScanResult) => void,
): Generator<void, void, void> {
  const dim = player.dimension;
  const r = settings.radius;
  const h = settings.height;
  const spanX = r * 2 + 1;
  const spanY = h * 2 + 1;
  const spanZ = r * 2 + 1;

  const centre = {
    x: Math.floor(player.location.x),
    y: Math.floor(player.location.y),
    z: Math.floor(player.location.z),
  };
  const origin = { x: centre.x - r, y: centre.y - h, z: centre.z - r };

  const grid = makeGrid(spanX, spanY, spanZ);
  const flags = new Uint8Array(spanX * spanY * spanZ);

  const result: ScanResult = {
    scanned: 0,
    spawnable: 0,
    uncertain: 0,
    skyMax: 0,
    marks: [],
  };

  let sinceYield = 0;

  // --- Pass 1: read every cell once. ---------------------------------------
  for (let lx = 0; lx < spanX; lx++) {
    for (let lz = 0; lz < spanZ; lz++) {
      for (let ly = 0; ly < spanY; ly++) {
        if (++sinceYield >= 64) {
          sinceYield = 0;
          yield;
        }
        const block = readFlags(dim, {
          x: origin.x + lx,
          y: origin.y + ly,
          z: origin.z + lz,
        });
        if (!block) continue;

        let f = 0;
        if (passesLight(block)) f |= F_LIGHT;
        if (isClearSpace(block)) f |= F_CLEAR;
        if (isStandableFloor(block)) f |= F_FLOOR;
        if (supportsTorch(block)) f |= F_TORCH;
        flags[toIndex(grid, lx, ly, lz)] = f;
      }
    }
  }

  for (let i = 0; i < flags.length; i++) {
    grid.passable[i] = flags[i]! & F_LIGHT ? 1 : 0;
  }

  // --- Pass 2: classify positions using the cached flags. ------------------
  const targets: number[] = [];
  const candidates: number[] = [];
  let qualifying = 0;

  for (let lx = 0; lx < spanX; lx++) {
    for (let lz = 0; lz < spanZ; lz++) {
      // ly starts at 1: a position needs a block beneath it, and ends one short
      // of the top because it needs headroom above.
      for (let ly = 1; ly < spanY - 1; ly++) {
        if (++sinceYield >= 128) {
          sinceYield = 0;
          yield;
        }
        const i = toIndex(grid, lx, ly, lz);
        const feet = flags[i]!;
        if (!(feet & F_CLEAR)) continue;

        const belowFlags = flags[toIndex(grid, lx, ly - 1, lz)]!;
        const headFlags = flags[toIndex(grid, lx, ly + 1, lz)]!;

        if (settings.wantSolver && feet & F_LIGHT && belowFlags & F_TORCH) {
          candidates.push(i);
        }

        if (!(belowFlags & F_FLOOR) || !(headFlags & F_CLEAR)) continue;

        const pos = { x: origin.x + lx, y: origin.y + ly, z: origin.z + lz };
        let total: number;
        let sky: number;
        try {
          total = dim.getLightLevel(pos);
          sky = dim.getSkyLightLevel(pos);
        } catch {
          continue;
        }

        result.scanned++;
        if (sky > result.skyMax) result.skyMax = sky;

        const verdict = classify({ light: { total, sky }, standable: true });
        if (verdict === "spawnable") {
          result.spawnable++;
          // Only confirmed-spawnable positions are solver targets. Feeding
          // "uncertain" in would, at midday outdoors, make every position a
          // target and bury the player in useless suggestions.
          if (settings.wantSolver) targets.push(i);
        }
        if (verdict === "uncertain") result.uncertain++;

        if (!shouldMark(verdict, settings.mode)) continue;
        if (settings.density > 1 && qualifying++ % settings.density !== 0) continue;
        result.marks.push({ pos, verdict });
      }
    }
  }

  // Nearest first, so a clipped marker budget keeps what the player stands among.
  result.marks.sort((a, b) => sqDist(centre, a.pos) - sqDist(centre, b.pos));

  if (settings.wantSolver) {
    result.survey = { grid, targets, candidates, origin };
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
