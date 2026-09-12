/**
 * A blueprint as the pack sees it: the cells of a shipped `.mcstructure`
 * (docs/design/settlements.md §5), read once by engine/structures.ts and
 * handed here as plain data. Everything in core/ works on this shape and
 * nothing here touches the game.
 */
export type States = Record<string, string | number | boolean>;

export interface Cell {
  x: number;
  y: number;
  z: number;
  /** The block's full identifier, `minecraft:cobblestone`. */
  name: string;
  /** Every state the structure carries for it, aliases included (measured: a chest reads both `minecraft:cardinal_direction` and `facing_direction`). */
  states: States;
  /** The structure's second layer: the block stands in water. */
  waterlogged?: boolean;
}

export interface Size {
  x: number;
  y: number;
  z: number;
}

export interface Building {
  key: string;
  size: Size;
  cells: Cell[];
}

/** The catalogue the pack ships (settlements.md §3), by structure key. */
export interface CatalogueEntry {
  key: string;
  title: string;
  description: string;
  /** Stands in water (settlements.md §5.2): its footing may rest on water, never on air, and the river is not part of it. */
  stilts?: true;
}

export const STRUCTURE_NAMESPACE = "villages";
export const BLUEPRINT_ITEM_PREFIX = "villages:blueprint_";

export const CATALOGUE: readonly CatalogueEntry[] = [
  { key: "tallfolk_well", title: "Well", description: "A cobblestone ring round water, a little roof on fence posts." },
  { key: "shared_larder", title: "Larder", description: "A stone-floored hut of chests, with a door to the south." },
  { key: "shared_wall", title: "Wall Segment", description: "Cobblestone, four high, a walkway behind and battlements on top. Segments join side by side." },
  { key: "tallfolk_gatehouse", title: "Gatehouse", description: "A log palisade with three gates and a walkway behind. Wall segments continue it either side." },
  { key: "tallfolk_farmhouse", title: "Farmhouse", description: "Oak and cobblestone under a dark oak gable: two beds, a table, a chest and a barrel." },
  { key: "tallfolk_barn", title: "Barn", description: "A dark oak barn on coarse dirt, gates on the south wall, hay in the loft." },
  { key: "shared_inn", title: "Inn", description: "Two floors, four beds up a ladder, a table by the door. Where a settlement's respawn point goes." },
  { key: "tinker_stall", title: "Market Stall", description: "Barrel counters under a striped wool awning on fence posts. The trader's stall for every people; the stripes take the people's colour." },
  { key: "shared_bridge", title: "Bridge Span", description: "Three wide and nine long on log posts that stand in the water, fence rails, a lantern each end. Spans join end to end; stand in the shallows to place one, and the deck comes one above the surface.", stilts: true },
  { key: "tallfolk_field", title: "Field", description: "Rows of wheat either side of a water channel, fenced, with a gate on the street and a chest for the harvest. Farmland and the path cost dirt, the wheat costs seeds." },
];

/** A surveyed building's key: `survey_<n>`, the n-th survey taken in this world. */
export const SURVEY_ITEM = "villages:blueprint_survey";
export const surveyKey = (n: number): string => `survey_${n}`;
export const isSurveyKey = (key: string): boolean => /^survey_[1-9]\d*$/.test(key);

/** The catalogue's entry, or a synthesised one for a survey: "Survey 3". */
export function catalogueEntry(key: string): CatalogueEntry | undefined {
  const fixed = CATALOGUE.find((e) => e.key === key);
  if (fixed) return fixed;
  if (isSurveyKey(key)) return { key, title: `Survey ${key.slice("survey_".length)}`, description: "A building the kids surveyed between two stakes." };
  return undefined;
}
export const structureId = (key: string): string => `${STRUCTURE_NAMESPACE}:${key}`;
export const blueprintItemId = (key: string): string => `${BLUEPRINT_ITEM_PREFIX}${key}`;
/** The catalogue key a blueprint item names, or undefined for any other item. */
export function keyOfBlueprintItem(itemId: string): string | undefined {
  if (!itemId.startsWith(BLUEPRINT_ITEM_PREFIX)) return undefined;
  const key = itemId.slice(BLUEPRINT_ITEM_PREFIX.length);
  return catalogueEntry(key) ? key : undefined;
}

export const WATER = "minecraft:water";
export const isWater = (name: string): boolean => name === WATER || name === "minecraft:flowing_water";

/**
 * Blocks with no item of their own, and what they cost instead: tilled and
 * trodden ground costs the dirt it was made from, a crop costs what is
 * planted to grow it. The same item comes back when the building is taken
 * down, so a field is dirt and seeds either way.
 */
export const ITEM_FOR: Readonly<Record<string, string>> = {
  "minecraft:farmland": "minecraft:dirt",
  "minecraft:grass_path": "minecraft:dirt",
  "minecraft:dirt_path": "minecraft:dirt",
  "minecraft:wheat": "minecraft:wheat_seeds",
  "minecraft:carrots": "minecraft:carrot",
  "minecraft:potatoes": "minecraft:potato",
  "minecraft:beetroot": "minecraft:beetroot_seeds",
  "minecraft:melon_stem": "minecraft:melon_seeds",
  "minecraft:pumpkin_stem": "minecraft:pumpkin_seeds",
};

/**
 * The item one cell costs, or undefined when it costs nothing: water is
 * placed for nothing (a bucket is not consumed by a well), and the second
 * half of a two-block thing (a door's upper half, a bed's head) came with
 * the first. A block with no item of its own costs what it is made from
 * (`ITEM_FOR`). Every other block gives back an item of its own name, which
 * is what `BlockPermutation.getItemStack` reported for all three buildings'
 * palettes (docs/settlements-results.md).
 */
export function itemFor(cell: Cell): string | undefined {
  if (isWater(cell.name)) return undefined;
  if (cell.states.upper_block_bit === true) return undefined;
  if (cell.states.head_piece_bit === true) return undefined;
  return ITEM_FOR[cell.name] ?? cell.name;
}

/** What the table asks for: item counts, most first, ties by name. */
export function materials(cells: readonly Cell[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of cells) {
    const item = itemFor(c);
    if (item) m[item] = (m[item] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(m).sort(([a, n], [b, k]) => k - n || (a < b ? -1 : a > b ? 1 : 0)));
}

/** A block's name as a person reads it: `minecraft:dark_oak_stairs` is "dark oak stairs". */
export const plainName = (id: string): string => id.replace(/^[^:]+:/, "").replace(/_/g, " ");
