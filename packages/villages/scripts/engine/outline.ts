/**
 * Where the building goes: sparks along the box's edges while a job runs
 * (settlements.md §7, "draw the outline with particles"). The footing layer
 * replaces the turf, so until the walls rise there is nothing to see of a
 * building; seen in game on the well, the first look at the pack. The
 * outline is a row of particles round the box just above the footing and
 * up its four corners, pulsed every second by the job.
 */
import type { Dimension } from "@minecraft/server";
import type { Box } from "../core/checks";

const PARTICLE = "minecraft:endrod";

export function pulse(dim: Dimension, box: Box): void {
  const y = box.y + 1.1;
  const x0 = box.x, x1 = box.x + box.sx, z0 = box.z, z1 = box.z + box.sz;
  const points: { x: number; y: number; z: number }[] = [];
  for (let x = x0; x <= x1; x++) points.push({ x, y, z: z0 }, { x, y, z: z1 });
  for (let z = z0 + 1; z < z1; z++) points.push({ x: x0, y, z }, { x: x1, y, z });
  for (let j = 1; j < box.sy; j++) {
    const yy = box.y + j + 1.1;
    points.push({ x: x0, y: yy, z: z0 }, { x: x1, y: yy, z: z0 }, { x: x0, y: yy, z: z1 }, { x: x1, y: yy, z: z1 });
  }
  try {
    for (const p of points) dim.spawnParticle(PARTICLE, p);
  } catch {
    /* an unloaded corner, or no one to see it */
  }
}
