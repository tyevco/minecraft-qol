import type { Block, Dimension } from "@minecraft/server";
import { isCauldron } from "@qol/shared/engine/cauldron";
import { safeGetBlock } from "@qol/shared/engine/safeBlock";
import type { Vec3 } from "../core/facing";
import { route } from "../core/network";
import { PIPE } from "../core/pipes";

export interface Resolved {
  block: Block | undefined;
  pos: Vec3;
  viaPipes: boolean;
  /** The pipes between the funnel and `pos`, nearest the funnel first. Empty when direct. */
  path: Vec3[];
}

/**
 * Resolve what a funnel's mouth or spout actually meets, through pipes.
 *
 * If the adjacent block is a pipe, the nearest cauldron or source block next
 * to the connected run stands in for it; otherwise the adjacent block itself.
 * Returns the block to describe, whether pipes were involved (for diagnostics
 * and labels), and the pipes the fluid is shown travelling through.
 */
export function resolveThroughPipes(
  dim: Dimension,
  funnel: Vec3,
  adjacent: Vec3,
  usePipes: boolean,
): Resolved {
  const direct = safeGetBlock(dim, adjacent);
  if (!usePipes || !direct || !direct.isValid || direct.typeId !== PIPE) {
    return { block: direct, pos: adjacent, viaPipes: false, path: [] };
  }

  const found = route(adjacent, funnel, {
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
  if (!found) return { block: undefined, pos: adjacent, viaPipes: true, path: [] };
  return {
    block: safeGetBlock(dim, found.terminal),
    pos: found.terminal,
    viaPipes: true,
    path: found.path,
  };
}
