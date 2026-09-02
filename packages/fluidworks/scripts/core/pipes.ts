/**
 * Which arms a pipe shows. Pure - no @minecraft imports.
 *
 * The pipe block carries six boolean states, one per face, and its geometry
 * shows one bone per true state. This decides them from what the six
 * neighbours are: pipes join pipes, funnels and cauldrons, and nothing else -
 * which is the whole reason the pipe has its own states instead of riding the
 * fence-connection trait.
 */
import type { Facing } from "./facing";

export const PIPE = "fluidworks:pipe";
export const FUNNEL = "fluidworks:funnel";
export const CAULDRON = "minecraft:cauldron";

export const CONNECTABLE: ReadonlySet<string> = new Set([
  PIPE,
  FUNNEL,
  CAULDRON,
]);

export type Neighbours = Readonly<Partial<Record<Facing, string | undefined>>>;

export function connections(neighbours: Neighbours): Record<Facing, boolean> {
  const at = (f: Facing) => CONNECTABLE.has(neighbours[f] ?? "");
  return {
    down: at("down"),
    up: at("up"),
    north: at("north"),
    south: at("south"),
    west: at("west"),
    east: at("east"),
  };
}

/** Block state name for a face. */
export function stateFor(face: Facing): string {
  return `fluidworks:${face}`;
}
