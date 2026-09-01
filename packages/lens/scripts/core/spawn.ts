/**
 * Pure spawn-light logic. No @minecraft imports - unit-tested in plain Node.
 *
 * Measured on Bedrock 1.26.45 via the probe's light matrix (see
 * docs/lens-light-results.md). The engine gives us two numbers:
 *
 *   getLightLevel(pos)    -> total = max(blockLight, effectiveSky)
 *   getSkyLightLevel(pos) -> effectiveSky, already darkened by time of day
 *                            (measured: 12 at noon, 4 at midnight, 0 enclosed)
 *
 * Neither is block light on its own, and `total - sky` is NOT block light - that
 * only appeared to work in the first hand sample because nothing was emitting.
 */

export interface LightSample {
  /** getLightLevel: max(blockLight, effectiveSky). */
  total: number;
  /** getSkyLightLevel: time-darkened sky contribution. 0 when fully enclosed. */
  sky: number;
}

/**
 * Recover block light, or undefined when the sky term masks it.
 *
 * Exact in two cases:
 *   total > sky  -> block light dominates the max, so it IS total
 *   sky === 0    -> there is no sky term, so total IS block light
 *
 * Otherwise total === sky > 0 and all we know is blockLight <= sky. Under open
 * sky at midnight that means block light 0..4 are indistinguishable; at noon,
 * 0..12. That ambiguity is a property of the engine API, not of this code.
 */
export function blockLight(sample: LightSample): number | undefined {
  const { total, sky } = sample;
  // total < sky cannot happen if total is a max of sky and something else.
  // Treat it as unusable rather than inventing a value.
  if (total < sky) return undefined;
  if (sky === 0) return total;
  if (total > sky) return total;
  return undefined;
}

/**
 * Highest block light level at which hostile mobs still spawn.
 *
 * Bedrock moved to "block light must be 0" in the 1.18 spawning rework, matching
 * Java. Kept as a named constant because it is a game rule we infer rather than
 * read from an API: if an in-world test shows otherwise, this is the one line to
 * change and every test below re-runs against it.
 */
export const HOSTILE_MAX_BLOCK_LIGHT = 0;

export type Verdict =
  /** A hostile mob can spawn here. */
  | "spawnable"
  /** Confirmed lit enough, or not a valid standing position. */
  | "safe"
  /** Sky light masks block light here; cannot tell. Treated as a warning. */
  | "uncertain";

export interface Candidate {
  light: LightSample;
  /**
   * Whether a mob could physically stand here: solid full top face below, and
   * two blocks of clear space. Determined by the engine adapter, not here.
   */
  standable: boolean;
}

/**
 * Classify one position.
 *
 * "uncertain" is deliberately a distinct outcome rather than being folded into
 * "spawnable". Reporting a guess as a fact is how a tool like this loses trust -
 * the UI shows it in a third colour and the README says why.
 */
export function classify(candidate: Candidate): Verdict {
  if (!candidate.standable) return "safe";
  const light = blockLight(candidate.light);
  if (light === undefined) return "uncertain";
  return light <= HOSTILE_MAX_BLOCK_LIGHT ? "spawnable" : "safe";
}

/** Positions worth drawing in each mode. */
export function shouldMark(verdict: Verdict, mode: "danger" | "safe"): boolean {
  return mode === "danger"
    ? verdict === "spawnable" || verdict === "uncertain"
    : verdict === "safe";
}
