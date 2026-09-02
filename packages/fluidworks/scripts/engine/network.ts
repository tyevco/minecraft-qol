import type { Block, Dimension } from "@minecraft/server";
import { isCauldron } from "@qol/shared/engine/cauldron";
import { safeGetBlock } from "@qol/shared/engine/safeBlock";
import type { Vec3 } from "../core/facing";
import { walk } from "../core/network";
import { PIPE } from "../core/pipes";

/**
 * Resolve what a funnel's mouth or spout actually meets, through pipes.
 *
 * If the adjacent block is a pipe, the nearest cauldron or source block next
 * to the connected run stands in for it; otherwise the adjacent block itself.
 * Returns the block to describe, plus whether pipes were involved (for
 * diagnostics and labels).
 */
export function resolveThroughPipes(
  dim: Dimension,
  funnel: Vec3,
  adjacent: Vec3,
  usePipes: boolean,
): { block: Block | undefined; pos: Vec3; viaPipes: boolean } {
  const direct = safeGetBlock(dim, adjacent);
  if (!usePipes || !direct || !direct.isValid || direct.typeId !== PIPE) {
    return { block: direct, pos: adjacent, viaPipes: false };
  }

  const found = walk(adjacent, funnel, {
    isPipe: (p) => safeGetBlock(dim, p)?.typeId === PIPE,
    isTerminal: (p) => {
      const b = safeGetBlock(dim, p);
      if (!b || !b.isValid) return false;
      return (
        isCauldron(b) ||
        b.typeId === "minecraft:water" ||
        b.typeId === "minecraft:lava"
      );
    },
  });
  if (!found) return { block: undefined, pos: adjacent, viaPipes: true };
  return { block: safeGetBlock(dim, found), pos: found, viaPipes: true };
}
