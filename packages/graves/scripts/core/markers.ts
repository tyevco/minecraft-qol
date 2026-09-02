/**
 * Which gravestones to mark on a player's locator bar. Pure - no @minecraft
 * imports.
 *
 * A stone is marked for its owner alone, from the moment it is placed until it
 * is emptied and crumbles - the same events that add and remove it from the
 * registry, so the registry is the whole input. Only stones in the player's
 * current dimension are marked: a bar pointing at Overworld coordinates from
 * the Nether points the wrong way (the eight-to-one scale).
 */
export interface GraveRef {
  id: string;
  owner: string;
  dimId: string;
  x: number;
  y: number;
  z: number;
}

export interface GraveMarker {
  key: string;
  dimId: string;
  x: number;
  y: number;
  z: number;
}

const KEY_PREFIX = "gv:grave:";

export const graveKey = (id: string): string => `${KEY_PREFIX}${id}`;

export const isGraveKey = (key: string): boolean => key.startsWith(KEY_PREFIX);

export function graveMarkers(
  graves: readonly GraveRef[],
  owner: string,
  dimId: string,
  enabled: boolean,
): GraveMarker[] {
  if (!enabled) return [];
  return graves
    .filter((g) => g.owner === owner && g.dimId === dimId)
    .map((g) => ({ key: graveKey(g.id), dimId: g.dimId, x: g.x, y: g.y, z: g.z }));
}
