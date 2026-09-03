/**
 * A small builder for Bedrock entity animation and animation-controller files.
 *
 * Why generate rather than hand-write: an animation names bones, and a bone
 * name that does not exist in the geometry is not an error in game, it is
 * silence. Here every bone an animation touches is checked against the bones
 * the model generator wrote, every keyframe time against the animation's
 * length, and every controller transition against the states and animation
 * keys the set actually defines. A file that builds cannot point at nothing.
 *
 * Values are numbers or Molang strings, as in the vanilla files. Keyframed
 * channels are keyed by time in seconds.
 */

export type Expr = number | string;
export type Vec3Expr = readonly [Expr, Expr, Expr];
/** Keyframes: time in seconds (as a number) to a value. */
export type Keyframes = ReadonlyArray<readonly [time: number, value: Vec3Expr]>;

export interface BoneAnimation {
  rotation?: Vec3Expr | Keyframes;
  position?: Vec3Expr | Keyframes;
  scale?: Vec3Expr | Keyframes;
}

export interface AnimationSpec {
  /** Short key; the identifier is `<prefix>.<key>` and the controller uses the key. */
  key: string;
  loop?: boolean | "hold_on_last_frame";
  /** Seconds. Required for keyframed animations; optional for expression-only loops. */
  length?: number;
  bones: Record<string, BoneAnimation>;
  /** Particle effects to fire, by time: the effect key from the client entity and a locator. */
  particles?: ReadonlyArray<readonly [time: number, effect: string, locator: string]>;
}

export interface StateSpec {
  animations: readonly string[];
  /** Ordered `[target state, Molang condition]` pairs, tested top to bottom. */
  transitions?: ReadonlyArray<readonly [state: string, condition: string]>;
  blendTransition?: number;
}

export interface ControllerSpec {
  /** Short key; the identifier is `controller.animation.<name>.<key>`. */
  key: string;
  initial: string;
  states: Record<string, StateSpec>;
}

export interface AnimationSetSpec {
  /** Used for identifiers: `animation.<name>.<key>` and `controller.animation.<name>.<key>`. */
  name: string;
  /** Bone names the geometry defines; every animated bone must be one. */
  bones: readonly string[];
  animations: readonly AnimationSpec[];
  controllers?: readonly ControllerSpec[];
}

function isKeyframes(v: Vec3Expr | Keyframes): v is Keyframes {
  return Array.isArray(v[0]);
}

function channel(
  where: string,
  v: Vec3Expr | Keyframes,
  length: number | undefined,
): unknown {
  if (!isKeyframes(v)) return [...v];
  if (length === undefined)
    throw new Error(`${where}: keyframed channel needs an animation length`);
  const out: Record<string, unknown> = {};
  let last = -1;
  for (const [t, value] of v) {
    if (t < 0 || t > length)
      throw new Error(`${where}: keyframe at ${t}s is outside 0..${length}s`);
    if (t <= last) throw new Error(`${where}: keyframes must be in ascending order`);
    last = t;
    out[t.toFixed(t % 1 === 0 ? 1 : 4).replace(/0+$/, "").replace(/\.$/, ".0")] = [
      ...value,
    ];
  }
  return out;
}

export function buildAnimations(set: AnimationSetSpec): object {
  const known = new Set(set.bones);
  const animations: Record<string, unknown> = {};
  for (const a of set.animations) {
    const id = `animation.${set.name}.${a.key}`;
    if (id in animations) throw new Error(`${id} defined twice`);
    const bones: Record<string, unknown> = {};
    for (const [bone, channels] of Object.entries(a.bones)) {
      if (!known.has(bone))
        throw new Error(`${id}: bone "${bone}" is not in the geometry (${[...known].join(", ")})`);
      const b: Record<string, unknown> = {};
      if (channels.rotation) b.rotation = channel(`${id}/${bone}.rotation`, channels.rotation, a.length);
      if (channels.position) b.position = channel(`${id}/${bone}.position`, channels.position, a.length);
      if (channels.scale) b.scale = channel(`${id}/${bone}.scale`, channels.scale, a.length);
      bones[bone] = b;
    }
    const particle_effects: Record<string, unknown> = {};
    for (const [t, effect, locator] of a.particles ?? []) {
      if (a.length !== undefined && t > a.length)
        throw new Error(`${id}: particle at ${t}s is past the end`);
      particle_effects[t.toFixed(1)] = { effect, locator };
    }
    animations[id] = {
      ...(a.loop !== undefined ? { loop: a.loop } : {}),
      ...(a.length !== undefined ? { animation_length: a.length } : {}),
      bones,
      ...(a.particles?.length ? { particle_effects } : {}),
    };
  }
  return { format_version: "1.8.0", animations };
}

export function buildControllers(set: AnimationSetSpec): object | undefined {
  if (!set.controllers?.length) return undefined;
  const keys = new Set(set.animations.map((a) => a.key));
  const controllers: Record<string, unknown> = {};
  for (const c of set.controllers) {
    const id = `controller.animation.${set.name}.${c.key}`;
    if (!(c.initial in c.states))
      throw new Error(`${id}: initial state "${c.initial}" is not a state`);
    const states: Record<string, unknown> = {};
    for (const [name, s] of Object.entries(c.states)) {
      for (const a of s.animations)
        if (!keys.has(a))
          throw new Error(`${id}/${name}: animation "${a}" is not in the set (${[...keys].join(", ")})`);
      for (const [target] of s.transitions ?? [])
        if (!(target in c.states))
          throw new Error(`${id}/${name}: transition to unknown state "${target}"`);
      states[name] = {
        animations: [...s.animations],
        ...(s.transitions?.length
          ? { transitions: s.transitions.map(([state, cond]) => ({ [state]: cond })) }
          : {}),
        ...(s.blendTransition !== undefined ? { blend_transition: s.blendTransition } : {}),
      };
    }
    controllers[id] = { initial_state: c.initial, states };
  }
  return { format_version: "1.10.0", animation_controllers: controllers };
}

/** The bone names a generated geometry file defines, read back from disk. */
export function geometryBones(geo: unknown): string[] {
  const g = geo as { "minecraft:geometry": { bones: { name: string }[] }[] };
  return g["minecraft:geometry"][0]!.bones.map((b) => b.name);
}
