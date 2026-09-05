/**
 * Greenery shared by the village pieces: trees, scattered flowers, a grove.
 * Pure painters over a Blueprint; villages.ts and furfolk.ts both use them.
 */
import type { Blueprint } from "./blueprint";

// ---------------------------------------------------------------------------
// Greenery
// ---------------------------------------------------------------------------

/**
 * A tree: a trunk and a two-layer crown. The crown is clipped to the piece,
 * so a tree on a verge leans out of frame rather than failing. The leaves
 * are not persistent: every leaf is within reach of the trunk, so they stay
 * while it stands and decay once a lumberjack has felled it (§5.1).
 */
export function tree(bp: Blueprint, x: number, y: number, z: number, log: string, leaves: string, height = 4): void {
  const L = { persistent_bit: false, update_bit: false };
  const leaf = (i: number, j: number, k: number) => {
    if (i < 0 || k < 0 || j < 0 || i >= bp.sx || k >= bp.sz || j >= bp.sy) return;
    if (bp.at(i, j, k) === undefined) bp.set(i, j, k, leaves, L);
  };
  bp.fill(x, y, z, 1, height, 1, log);
  const top = y + height;
  for (let i = -2; i <= 2; i++)
    for (let k = -2; k <= 2; k++) {
      if (Math.abs(i) === 2 && Math.abs(k) === 2) continue;
      for (let j = top - 2; j < top; j++) leaf(x + i, j, z + k);
    }
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) if (Math.abs(i) + Math.abs(k) < 2) leaf(x + i, top, z + k);
  leaf(x, top + 1, z);
}

export const FLOWERS = ["poppy", "dandelion", "cornflower", "oxeye_daisy", "azure_bluet"];

/**
 * A grove: three grown trees, a lumberjack's post and a chest for the logs
 * (docs/design/villages.md §5.1). The post's person is spawned south of the
 * post, so the post stands with open grass in front of it.
 */
export function grove(log: string, leaves: string): (bp: Blueprint, rand: () => number, y: number) => void {
  return (bp, rand, y) => {
    tree(bp, 2, y, 2, log, leaves, 4);
    tree(bp, 6, y, 2, log, leaves, 5);
    tree(bp, 2, y, 6, log, leaves, 4);
    bp.set(7, y, 5, "chest");
    bp.set(6, y, 5, "villages:post", { "villages:people": 0, "villages:job": 1 });
    scatter(bp, rand, 4, y, 4, 5, 5, 5);
  };
}

/** Flowers and grass tufts scattered over a grass floor at y, about one cell in `every`. */
export function scatter(bp: Blueprint, rand: () => number, x: number, y: number, z: number, w: number, d: number, every = 4): void {
  for (let i = x; i < x + w; i++)
    for (let k = z; k < z + d; k++) {
      if (bp.at(i, y, k) !== undefined || bp.at(i, y - 1, k) !== "minecraft:grass") continue;
      const r = rand();
      if (r < 1 / every / 2) bp.set(i, y, k, FLOWERS[Math.floor(rand() * FLOWERS.length)]!);
      else if (r < 1 / every) bp.set(i, y, k, "short_grass");
    }
}


/** An orchard: four small trees and a few sweet berry bushes between them. */
export function orchard(log: string, leaves: string): (bp: Blueprint, rand: () => number, y: number) => void {
  return (bp, rand, y) => {
    for (const [x, z] of [[2, 2], [6, 2], [2, 6], [6, 6]] as const) tree(bp, x, y, z, log, leaves, 3);
    for (let i = 0; i < 4; i++) { const x = Math.floor(rand() * 9), z = Math.floor(rand() * 9); if (bp.at(x, y, z) === undefined) bp.set(x, y, z, "sweet_berry_bush", { growth: 3 }); }
  };
}
