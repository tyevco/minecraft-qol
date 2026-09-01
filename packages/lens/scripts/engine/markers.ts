import { TextPrimitive, world, type Player, type RGBA, type Vector3 } from "@minecraft/server";
import type { Verdict } from "../core/spawn";

/**
 * Persistent marker pool.
 *
 * Particles were the obvious first choice and the wrong one: they spawn, animate
 * and fade, so a periodic rescan produces visible flicker. TextPrimitive shapes
 * persist until removed, so instead of recreating markers each scan we keep a
 * pool and call setLocation on it. Nothing appears or disappears while the
 * overlay is on and the view is stable.
 *
 * Two properties make this work well that particles cannot offer at all:
 * per-player visibility, and an explicit colour per verdict.
 */

/**
 * The glyph drawn at each position. One constant, deliberately, because font
 * coverage is the one thing here that cannot be verified from the type
 * definitions - swap it if it does not render.
 */
const GLYPH = "+";

/**
 * What a marker means. Beyond the spawn verdicts, tier 2 adds two:
 * `suggested` (put a torch here) and `covered` (a suggestion already fixes this).
 */
export type MarkKind = Verdict | "suggested" | "covered";

const COLORS: Record<MarkKind, RGBA> = {
  spawnable: { red: 1, green: 0.15, blue: 0.1, alpha: 1 },
  uncertain: { red: 0.65, green: 0.65, blue: 0.7, alpha: 0.75 },
  safe: { red: 0.25, green: 1, blue: 0.35, alpha: 1 },
  // Warm gold: reads as "place a light here" rather than as a warning.
  suggested: { red: 1, green: 0.85, blue: 0.2, alpha: 1 },
  // Dimmed, so shaded positions recede behind the suggestions that fix them.
  covered: { red: 0.45, green: 0.35, blue: 0.15, alpha: 0.7 },
};

/** Suggestions get their own glyph so they read as actions, not warnings. */
const GLYPHS: Partial<Record<MarkKind, string>> = { suggested: "*" };

/** Beyond this the markers fade out, keeping dense scans readable. */
const RENDER_DISTANCE = 48;

/** Per-player ceiling, applied in addition to the world-wide maxShapes cap. */
const PER_PLAYER_LIMIT = 400;

export interface Mark {
  pos: Vector3;
  verdict: MarkKind;
}

export class MarkerPool {
  private shapes: TextPrimitive[] = [];

  constructor(private readonly player: Player) {}

  /** How many markers we may draw, respecting the engine's global cap. */
  static budget(): number {
    try {
      const max = world.primitiveShapesManager.maxShapes;
      return Math.max(0, Math.min(PER_PLAYER_LIMIT, Math.floor(max * 0.5)));
    } catch {
      return PER_PLAYER_LIMIT;
    }
  }

  /**
   * Point the pool at a new set of positions.
   *
   * Existing shapes are moved and recoloured rather than replaced, which is the
   * whole reason this class exists. Surplus shapes are removed; missing ones are
   * created once and then reused on every subsequent scan.
   */
  update(marks: Mark[]): void {
    const wanted = marks.slice(0, MarkerPool.budget());

    for (let i = 0; i < wanted.length; i++) {
      const mark = wanted[i];
      if (!mark) continue;
      const center = { x: mark.pos.x + 0.5, y: mark.pos.y + 0.25, z: mark.pos.z + 0.5 };

      let shape = this.shapes[i];
      if (!shape) {
        try {
          shape = new TextPrimitive(center, GLYPH);
          shape.visibleTo = [this.player];
          shape.maximumRenderDistance = RENDER_DISTANCE;
          shape.scale = 0.5;
          world.primitiveShapesManager.addText(shape, this.player.dimension);
          this.shapes[i] = shape;
        } catch {
          // Hit the engine cap, or the dimension went away. Stop growing.
          break;
        }
      } else {
        try {
          shape.setLocation(center);
        } catch {
          continue;
        }
      }

      try {
        shape.color = COLORS[mark.verdict];
        // Shapes are recycled between scans, so the glyph must be set every
        // time - a reused shape may have been something else last round.
        shape.setText(GLYPHS[mark.verdict] ?? GLYPH);
      } catch {
        /* shape became invalid; it will be pruned on the next clear */
      }
    }

    // Drop anything we no longer need rather than leaving stale markers behind.
    for (let i = wanted.length; i < this.shapes.length; i++) {
      this.removeAt(i);
    }
    this.shapes.length = Math.min(this.shapes.length, wanted.length);
  }

  private removeAt(index: number): void {
    const shape = this.shapes[index];
    if (!shape) return;
    try {
      world.primitiveShapesManager.removeText(shape);
    } catch {
      /* already gone */
    }
  }

  clear(): void {
    for (let i = 0; i < this.shapes.length; i++) this.removeAt(i);
    this.shapes = [];
  }
}
