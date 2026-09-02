/**
 * Shared rig-building helpers. Every test builds its own rig on an all-air
 * structure so the rig is readable here rather than locked in a binary.
 *
 * Coordinates are test-relative: (0,0,0) is the structure's corner, y = 0 is
 * the floor layer this file lays down.
 */
import {
  BlockComponentTypes,
  BlockPermutation,
  ItemStack,
  type Container,
  type Vector3,
} from "@minecraft/server";
import type { SimulatedPlayer, Test } from "@minecraft/server-gametest";

export const STRUCTURE = "qol:arena";
export const SIZE = 8;

/**
 * Lay the floor.
 *
 * The leading idle was an attempt at "Could not find StructureBlockActor
 * associated to this test", which every test in the suite throws at the
 * setBlockType below. It did NOT fix it - the error simply moved to after the
 * await - so do not read the idle as load-bearing. It is kept only because a
 * tick's grace before the first block write is harmless.
 *
 * Ruled out so far: the structure loads (/structure load qol:arena clears an
 * 8x8x8 volume), its NBT is complete with structure_world_origin 0,0,0,
 * structureName is set on every test, all pack UUIDs are unique, and the module
 * resolves (the suite registers). The open question is whether the structure
 * block is placed at all when the runner starts a test.
 */
export async function floor(test: Test, type = "minecraft:stone"): Promise<void> {
  await test.idle(1);
  for (let x = 0; x < SIZE; x++)
    for (let z = 0; z < SIZE; z++) test.setBlockType(type, { x, y: 0, z });
}

export function cauldron(
  test: Test,
  pos: Vector3,
  level: number,
  liquid = "water",
): void {
  test.setBlockPermutation(
    BlockPermutation.resolve("minecraft:cauldron", {
      fill_level: level,
      cauldron_liquid: liquid,
    }),
    pos,
  );
}

export function cauldronLevel(test: Test, pos: Vector3): number {
  const b = test.getBlock(pos);
  if (!b.isValid || b.typeId !== "minecraft:cauldron") return -1;
  return (b.permutation.getState("fill_level") as number | undefined) ?? -1;
}

export function container(test: Test, pos: Vector3): Container | undefined {
  const c = test
    .getBlock(pos)
    .getComponent(BlockComponentTypes.Inventory)?.container;
  return c && c.isValid ? c : undefined;
}

export function count(test: Test, pos: Vector3, typeId: string): number {
  const c = container(test, pos);
  if (!c) return 0;
  let n = 0;
  for (let i = 0; i < c.size; i++) {
    const item = c.getItem(i);
    if (item?.typeId === typeId) n += item.amount;
  }
  return n;
}

export function put(test: Test, pos: Vector3, item: ItemStack, slot = 0): void {
  const c = container(test, pos);
  if (!c) throw new Error(`no container at ${pos.x},${pos.y},${pos.z}`);
  c.setItem(slot, item);
}

/** How many of `typeId` a player carries across their inventory. */
export function carried(player: SimulatedPlayer, typeId: string): number {
  const c = player.getComponent(BlockComponentTypes.Inventory)?.container;
  if (!c) return 0;
  let n = 0;
  for (let i = 0; i < c.size; i++) {
    const item = c.getItem(i);
    if (item?.typeId === typeId) n += item.amount;
  }
  return n;
}

export const item = (typeId: string, amount = 1): ItemStack =>
  new ItemStack(typeId, amount);
