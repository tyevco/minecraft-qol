import {
  BlockComponentTypes,
  type Block,
  type Dimension,
} from "@minecraft/server";
import { cropOf, isMature } from "@qol/shared/core/crops";
import type { ItemRef } from "@qol/shared/core/fluids";
import {
  isCauldron,
  readCauldron,
  readItemColor,
  readPotionEffectId,
} from "@qol/shared/engine/cauldron";
import type { Endpoint } from "../core/machine";

const WATER_SOURCE = "minecraft:water";
const LAVA_SOURCE = "minecraft:lava";

/**
 * What the planner needs to know about a block. Never throws.
 * `sky` says whether an air block here is open to the weather; the caller
 * knows the column, so it decides.
 */
export function describeBlock(block: Block | undefined, sky = false): Endpoint {
  if (!block || !block.isValid) return { kind: "other" };
  try {
    if (block.isAir) return { kind: "open", sky };
    const crop = cropOf(block.typeId);
    if (crop)
      return {
        kind: "crop",
        mature: isMature(
          crop,
          block.permutation.getState(crop.ageState as never),
        ),
      };
    if (isCauldron(block)) {
      const state = readCauldron(block);
      return state ? { kind: "cauldron", state } : { kind: "other" };
    }
    const container = block.getComponent(
      BlockComponentTypes.Inventory,
    )?.container;
    if (container && container.isValid) {
      const items: (ItemRef | undefined)[] = [];
      for (let i = 0; i < container.size; i++) {
        const stack = container.getItem(i);
        items.push(
          stack
            ? {
                typeId: stack.typeId,
                amount: stack.amount,
                colorRgb: readItemColor(stack),
                potionEffectId: readPotionEffectId(stack),
              }
            : undefined,
        );
      }
      return { kind: "container", items };
    }
    // Flowing water is "minecraft:flowing_water"; only a source block is infinite.
    if (block.typeId === WATER_SOURCE)
      return { kind: "source", fluid: "water" };
    if (block.typeId === LAVA_SOURCE) return { kind: "source", fluid: "lava" };
  } catch {
    /* fall through */
  }
  return { kind: "other" };
}

/**
 * Whether nothing solid stands above `pos` in its column - the rain collector's
 * question. `getTopmostBlock` answers it: if the highest block in the column is
 * at or below the funnel, the funnel's mouth sees the sky.
 */
export function isOpenSky(
  dim: Dimension,
  pos: { x: number; y: number; z: number },
): boolean {
  try {
    const top = dim.getTopmostBlock({ x: pos.x, z: pos.z });
    return !top || top.y <= pos.y;
  } catch {
    return false;
  }
}
