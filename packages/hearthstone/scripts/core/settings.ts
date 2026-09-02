/**
 * Hearthstone's settings panel, as policy. Pure - no @minecraft imports.
 *
 * Behaviour-pack settings are per world, chosen from the pack list before the
 * world loads or from Settings -> Behavior Packs in game. The two toggles here
 * decide which locator-bar markers players get; a missing or malformed value
 * falls back to its default, never to off.
 */
export interface Settings {
  /** Mark the player's own spawn point (bed or respawn anchor). */
  showBed: boolean;
  /** Mark the Hearthstone the player will respawn at. */
  showHearth: boolean;
}

export const DEFAULT_SETTINGS: Settings = { showBed: true, showHearth: true };

/** Setting names as declared in behavior_pack/manifest.json. */
export const SETTING = {
  showBed: "hearthstone:show_bed",
  showHearth: "hearthstone:show_hearth",
} as const;

export function parseSettings(raw: Readonly<Record<string, unknown>>): Settings {
  const bool = (key: string, fallback: boolean): boolean =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : fallback;
  return {
    showBed: bool(SETTING.showBed, DEFAULT_SETTINGS.showBed),
    showHearth: bool(SETTING.showHearth, DEFAULT_SETTINGS.showHearth),
  };
}

export function sameSettings(a: Settings, b: Settings): boolean {
  return a.showBed === b.showBed && a.showHearth === b.showHearth;
}

export function describeSettings(s: Settings): string {
  return `show_bed=${s.showBed} show_hearth=${s.showHearth}`;
}
