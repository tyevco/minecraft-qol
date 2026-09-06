/**
 * The chest beside the table: what pays for a building and takes it back.
 * Any block with an inventory on one of the table's four sides counts, so a
 * barrel does as well as a chest. Items move one at a time, in the same step
 * as the block they pay for (CLAUDE.md rule 4).
 */
import { ItemStack, type Container, type Dimension, type Vector3 } from "@minecraft/server";
import { countItems } from "../core/job";

const SIDES: Vector3[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

export function chestBeside(dim: Dimension, table: Vector3): Container | undefined {
  for (const s of SIDES) {
    try {
      const b = dim.getBlock({ x: table.x + s.x, y: table.y + s.y, z: table.z + s.z });
      const c = b?.getComponent("minecraft:inventory")?.container;
      if (c && c.isValid) return c;
    } catch {
      /* unloaded */
    }
  }
  return undefined;
}

export function counts(c: Container): Record<string, number> {
  const stacks: { typeId: string; amount: number }[] = [];
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it) stacks.push({ typeId: it.typeId, amount: it.amount });
  }
  return countItems(stacks);
}

/** Take one item of `typeId` out; false if there is none. */
export function takeOne(c: Container, typeId: string): boolean {
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (!it || it.typeId !== typeId) continue;
    if (it.amount > 1) {
      it.amount -= 1;
      c.setItem(i, it);
    } else c.setItem(i, undefined);
    return true;
  }
  return false;
}

/** Put one item of `typeId` in; false if it did not fit (nothing is dropped). */
export function giveOne(c: Container, typeId: string): boolean {
  try {
    const left = c.addItem(new ItemStack(typeId, 1));
    return left === undefined || left.amount === 0;
  } catch {
    return false;
  }
}
