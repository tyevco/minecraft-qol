/**
 * Pure standability logic - "could a hostile mob stand here?".
 *
 * `Block` exposes no `isSolid`, so this is built on measured flags. From
 * `/scriptevent qolprobe:solid` on Bedrock 1.26.45:
 *
 *   dirt                       blocksWater=true    <- floor
 *   smooth_stone_slab (bottom) blocksWater=true    <- floor
 *   glass                      blocksWater=true    <- full cube, but see DENY
 *   torch                      blocksWater=false   <- attachment
 *   lever                      blocksWater=false   <- attachment
 *
 * `isLiquidBlocking(Water)` cleanly separates real floors from attachments, and
 * correctly accepts a bottom slab. It is a good necessary condition. It is not
 * quite sufficient - see DENY below.
 */

export interface BlockFlags {
  typeId: string;
  isAir: boolean;
  isLiquid: boolean;
  /** Result of Block.isLiquidBlocking(LiquidType.Water). */
  blocksWater: boolean;
}

/**
 * Full cubes that block water but that hostile mobs still will not spawn on,
 * because vanilla spawning also requires an opaque surface.
 *
 * This encodes a game rule we infer rather than read from an API, so it is
 * deliberately a short, explicit list rather than a clever heuristic. Anything
 * wrongly included here shows as a missing warning; anything wrongly excluded
 * shows as a false warning. The second is the safer error, so keep this list
 * conservative and only add entries confirmed in game.
 */
export const DENY: readonly string[] = [
  "minecraft:glass",
  "minecraft:tinted_glass",
  "minecraft:hard_glass",
  "minecraft:barrier",
  "minecraft:ice",
  "minecraft:packed_ice",
  "minecraft:blue_ice",
  "minecraft:frosted_ice",
  "minecraft:slime",
  "minecraft:honey_block",
];

const DENY_SET = new Set(DENY);
/** Families whose every variant is denied, matched by suffix/substring. */
const DENY_PATTERNS = ["_stained_glass", "stained_glass", "_glass_pane", "glass_pane", "_leaves"];

export function isDeniedSurface(typeId: string): boolean {
  if (DENY_SET.has(typeId)) return true;
  return DENY_PATTERNS.some((p) => typeId.includes(p));
}

/** Can a mob stand ON this block - i.e. is it a valid floor? */
export function isStandableFloor(below: BlockFlags): boolean {
  if (below.isAir || below.isLiquid) return false;
  if (!below.blocksWater) return false; // torch, lever, and other attachments
  return !isDeniedSurface(below.typeId);
}

/** Is this block free enough for a mob to occupy? */
export function isClearSpace(block: BlockFlags): boolean {
  if (block.isAir) return true;
  // Liquids and attachments do not obstruct a spawn, but a solid block does.
  return !block.blocksWater;
}

/**
 * A mob needs a floor plus two blocks of clear space above it.
 * `feet` is the position being judged; `head` is directly above it.
 */
export function isStandable(below: BlockFlags, feet: BlockFlags, head: BlockFlags): boolean {
  return isStandableFloor(below) && isClearSpace(feet) && isClearSpace(head);
}
