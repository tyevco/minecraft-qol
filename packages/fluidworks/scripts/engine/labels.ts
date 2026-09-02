import {
  TextPrimitive,
  world,
  type Dimension,
  type Vector3,
} from "@minecraft/server";
import type { CauldronState } from "@qol/shared/core/fluids";

/**
 * Floating level labels over the tanks funnels use, so a wall of machines
 * reads at a glance. One TextPrimitive per tank, keyed by position, recycled
 * between cycles; anything not refreshed this cycle is removed.
 *
 * TextPrimitive and PrimitiveShapesManager are stable (the Lens's markers use
 * the same API). Labels are visible to everyone; the pack's panel turns them
 * off as a whole.
 */
const RENDER_DISTANCE = 24;
/** Never take more than this share of the engine's shape budget. */
const BUDGET_SHARE = 0.25;

interface Label {
  shape: TextPrimitive;
  text: string;
}

const labels = new Map<string, Label>();
let wanted = new Map<
  string,
  { dim: Dimension; pos: Vector3; state: CauldronState }
>();

const keyOf = (dimId: string, p: Vector3) => `${dimId}|${p.x},${p.y},${p.z}`;

const NAMES: Record<CauldronState["fluid"], string> = {
  empty: "§7Empty",
  water: "§bWater",
  lava: "§6Lava",
  powder_snow: "§fPowder snow",
  potion: "§dPotion",
};

export function describe(state: CauldronState): string {
  if (state.level <= 0 || state.fluid === "empty") return NAMES.empty;
  return `${NAMES[state.fluid]} §f${state.level}§7/6`;
}

/** Called by the cycle for every tank it touched. */
export function want(dim: Dimension, pos: Vector3, state: CauldronState): void {
  wanted.set(keyOf(dim.id, pos), { dim, pos, state });
}

function budget(): number {
  try {
    return Math.max(
      0,
      Math.floor(world.primitiveShapesManager.maxShapes * BUDGET_SHARE),
    );
  } catch {
    return 0;
  }
}

/** Reconcile shapes with what this cycle wanted, then forget the wants. */
export function sync(enabled: boolean): void {
  const target = enabled
    ? wanted
    : new Map<string, { dim: Dimension; pos: Vector3; state: CauldronState }>();
  wanted = new Map();

  for (const [k, label] of labels) {
    if (target.has(k)) continue;
    try {
      world.primitiveShapesManager.removeText(label.shape);
    } catch {
      /* already gone */
    }
    labels.delete(k);
  }

  const max = budget();
  for (const [k, w] of target) {
    const text = describe(w.state);
    const existing = labels.get(k);
    if (existing) {
      if (existing.text !== text) {
        try {
          existing.shape.setText(text);
          existing.text = text;
        } catch {
          labels.delete(k);
        }
      }
      continue;
    }
    if (labels.size >= max) break;
    try {
      const shape = new TextPrimitive(
        { x: w.pos.x + 0.5, y: w.pos.y + 1.3, z: w.pos.z + 0.5 },
        text,
      );
      shape.maximumRenderDistance = RENDER_DISTANCE;
      shape.scale = 0.6;
      world.primitiveShapesManager.addText(shape, w.dim);
      labels.set(k, { shape, text });
    } catch {
      break; // engine cap or dimension gone; try again next cycle
    }
  }
}

export function count(): number {
  return labels.size;
}
