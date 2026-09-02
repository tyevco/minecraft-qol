import { compound, encodeRoot, int, list, string, type Tag } from "./nbt";

/**
 * A .mcstructure filled with one block type.
 *
 * GameTest needs a structure per test to define the test area, and nothing
 * more: every rig in packages/gametest builds itself with setBlockType so the
 * test reads as code rather than as a binary nobody can review. So the
 * structures are uniform - all air - and the block index order, which this
 * writer does not otherwise need to get right, does not matter.
 */
export function uniformStructure(
  size: [number, number, number],
  blockName = "minecraft:air",
): Buffer {
  const [sx, sy, sz] = size;
  const count = sx * sy * sz;
  const indices: Tag[] = new Array<Tag>(count).fill(int(0));
  // Bedrock's second layer is the waterlogging layer; -1 means "none".
  const waterlogged: Tag[] = new Array<Tag>(count).fill(int(-1));

  return encodeRoot(
    compound({
      format_version: int(1),
      size: list([int(sx), int(sy), int(sz)]),
      structure: compound({
        block_indices: list([list(indices), list(waterlogged)]),
        entities: list([]),
        palette: compound({
          default: compound({
            block_palette: list([
              compound({
                name: string(blockName),
                states: compound({}),
                // 1.21.x block version; the engine upgrades anything older.
                version: int(18163713),
              }),
            ]),
            block_position_data: compound({}),
          }),
        }),
      }),
      structure_world_origin: list([int(0), int(0), int(0)]),
    }),
  );
}
