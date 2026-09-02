import { WeatherType, world } from "@minecraft/server";

/**
 * Whether it is raining, per dimension.
 *
 * There is no stable way to READ the weather in 2.9.0 - `Dimension.getWeather`
 * is beta-only, only `setWeather` shipped - but `weatherChange` is a stable
 * after-event, so the pack tracks it from the moment it loads. The one gap:
 * weather at load time is unknown until it next changes, and is assumed clear.
 * A rain collector that starts a session mid-storm waits for the next change;
 * nothing else depends on it.
 */
const weather = new Map<string, WeatherType>();

export function install(): void {
  world.afterEvents.weatherChange.subscribe((ev) => {
    weather.set(ev.dimension, ev.newWeather);
  });
}

export function isRaining(dimId: string): boolean {
  const w = weather.get(dimId);
  return w !== undefined && w !== WeatherType.Clear;
}

/** For diagnostics: "unknown" until the first change of the session. */
export function describe(dimId: string): string {
  return weather.get(dimId) ?? "unknown (assumed clear)";
}
