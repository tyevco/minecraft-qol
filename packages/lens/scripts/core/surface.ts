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

/**
 * Full cubes that block water but still let light through. Glass is the whole
 * point of this list: it is the one common block where "blocks water" and
 * "blocks light" disagree.
 */
const LIGHT_PASSING_SOLIDS = ["glass", "_pane", "barrier"];

/**
 * Does light propagate through this cell?
 *
 * A THIRD predicate, deliberately separate from spawn floors and torch support -
 * they disagree on glass in both directions. Reusing either here would be wrong.
 *
 * Conservative by design: liquids are treated as blocking even though they only
 * dampen, because the exact per-step dampening values are unconfirmed and the
 * sources contradict each other. Under-claiming coverage means suggesting a few
 * more torches than strictly needed, which is the safe direction.
 */
export function passesLight(block: BlockFlags): boolean {
  if (block.isAir) return true;
  if (block.isLiquid) return false;
  // Non-solid clutter - torches, levers, plants - does not block light.
  if (!block.blocksWater) return true;
  return LIGHT_PASSING_SOLIDS.some((p) => block.typeId.includes(p));
}

/**
 * Blocks a torch will not attach to even though they block water.
 *
 * Sources conflict on fences, slabs and glass sides, and there is no
 * canPlaceBlock in the stable API to delegate to. Bedrock also *snaps* a
 * rejected placement to a nearby valid face, which would silently put the torch
 * somewhere other than suggested - so when in doubt, refuse to suggest.
 */
const NO_TORCH_SUPPORT = ["_leaves", "scaffolding", "barrier", "ice", "slime", "honey", "_pane"];

/** Can a torch stand on top of this block? */
export function supportsTorch(below: BlockFlags): boolean {
  if (below.isAir || below.isLiquid) return false;
  if (!below.blocksWater) return false; // torches, levers and the like
  return !NO_TORCH_SUPPORT.some((p) => below.typeId.includes(p));
}
