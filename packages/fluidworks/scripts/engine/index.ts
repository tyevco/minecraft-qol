import {
  createPositionIndex,
  type Position,
} from "@qol/shared/engine/positionIndex";

/** A funnel we placed. */
export interface FunnelRow extends Position {
  /** Concrete wear accumulated against the tank at the spout. Persisted. */
  wear: number;
  /** Tick before which this funnel is not worth looking at. Runtime only. */
  sleepUntil: number;
}

type Packed = [dimId: string, x: number, y: number, z: number, wear: number];

export const funnels = createPositionIndex<FunnelRow, Packed>({
  property: "fw:funnels",
  schemaProperty: "fw:v",
  schema: 1,
  pack: (r) => [r.dimId, r.x, r.y, r.z, r.wear],
  unpack: (p) => {
    if (!Array.isArray(p) || p.length < 5) return undefined;
    const [dimId, x, y, z, wear] = p as Packed;
    if (typeof dimId !== "string") return undefined;
    return {
      dimId,
      x,
      y,
      z,
      wear: typeof wear === "number" ? wear : 0,
      sleepUntil: 0,
    };
  },
  log: (...parts) => console.warn("[Fluidworks]", ...parts),
});
