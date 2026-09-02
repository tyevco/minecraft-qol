/**
 * The settings panel, parsed. Pure - no @minecraft imports.
 */
import type { Policy } from "./machine";

export const SETTING = {
  concrete: "fluidworks:concrete",
  buckets: "fluidworks:buckets",
  bottles: "fluidworks:bottles",
  dye: "fluidworks:dye",
  wash: "fluidworks:wash",
  transfer: "fluidworks:transfer",
  rain: "fluidworks:rain",
  harvest: "fluidworks:harvest",
  collect: "fluidworks:collect",
  pipes: "fluidworks:pipes",
  labels: "fluidworks:labels",
  cycleSeconds: "fluidworks:cycle_seconds",
  concretePerLevel: "fluidworks:concrete_per_level",
} as const;

/** Setting name -> rule id, for the machines that are cauldron rules. */
export const RULE_SETTINGS: Readonly<Record<string, string>> = {
  [SETTING.concrete]: "cauldron_concrete",
  [SETTING.buckets]: "cauldron_buckets",
  [SETTING.bottles]: "cauldron_bottles",
  [SETTING.dye]: "cauldron_dye",
  [SETTING.wash]: "cauldron_wash",
};

export interface Settings {
  policy: Policy;
  /** Ticks between cycles. */
  cycleTicks: number;
  /** Funnels read and write through connected pipes. */
  pipes: boolean;
  /** Floating level labels over tanks that funnels use. */
  labels: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  policy: {
    rules: {
      cauldron_concrete: true,
      cauldron_buckets: true,
      cauldron_bottles: true,
      cauldron_dye: true,
      cauldron_wash: true,
    },
    transfer: true,
    rain: true,
    harvest: true,
    collect: true,
    concretePerLevel: 16,
  },
  cycleTicks: 40,
  pipes: true,
  labels: true,
};

export function parseSettings(
  raw: Readonly<Record<string, unknown>>,
): Settings {
  const bool = (key: string, fallback: boolean) =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : fallback;
  const num = (key: string, fallback: number, min: number, max: number) => {
    const v = raw[key];
    return typeof v === "number" && Number.isFinite(v)
      ? Math.min(max, Math.max(min, Math.round(v)))
      : fallback;
  };
  const rules: Record<string, boolean> = {};
  for (const [setting, ruleId] of Object.entries(RULE_SETTINGS)) {
    rules[ruleId] = bool(
      setting,
      DEFAULT_SETTINGS.policy.rules[ruleId] ?? true,
    );
  }
  return {
    policy: {
      rules,
      transfer: bool(SETTING.transfer, DEFAULT_SETTINGS.policy.transfer),
      rain: bool(SETTING.rain, DEFAULT_SETTINGS.policy.rain),
      harvest: bool(SETTING.harvest, DEFAULT_SETTINGS.policy.harvest),
      collect: bool(SETTING.collect, DEFAULT_SETTINGS.policy.collect),
      concretePerLevel: num(
        SETTING.concretePerLevel,
        DEFAULT_SETTINGS.policy.concretePerLevel,
        1,
        64,
      ),
    },
    cycleTicks:
      num(SETTING.cycleSeconds, DEFAULT_SETTINGS.cycleTicks / 20, 1, 10) * 20,
    pipes: bool(SETTING.pipes, DEFAULT_SETTINGS.pipes),
    labels: bool(SETTING.labels, DEFAULT_SETTINGS.labels),
  };
}

export function sameSettings(a: Settings, b: Settings): boolean {
  if (a.cycleTicks !== b.cycleTicks) return false;
  const p = a.policy;
  const q = b.policy;
  if (
    p.transfer !== q.transfer ||
    p.rain !== q.rain ||
    p.concretePerLevel !== q.concretePerLevel
  )
    return false;
  const ids = new Set([...Object.keys(p.rules), ...Object.keys(q.rules)]);
  for (const id of ids) if (!!p.rules[id] !== !!q.rules[id]) return false;
  return true;
}

export function describeSettings(s: Settings): string {
  const on = Object.entries(s.policy.rules)
    .filter(([, v]) => v)
    .map(([k]) => k.replace("cauldron_", ""))
    .join(",");
  return (
    `rules=[${on}] transfer=${s.policy.transfer} rain=${s.policy.rain} harvest=${s.policy.harvest}` +
    ` collect=${s.policy.collect} pipes=${s.pipes} labels=${s.labels}` +
    ` concretePerLevel=${s.policy.concretePerLevel} cycle=${s.cycleTicks}t`
  );
}
