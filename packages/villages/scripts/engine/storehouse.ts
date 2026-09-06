/**
 * The storehouse (docs/design/villages.md §5.1, issue #85): the trader
 * sells what its village's workers have put in their chests. The chests
 * are found as the workers find them (engine/trades.ts nearestChest, one
 * per worker post of the trader's own village, core.storehousePosts), the
 * kinds counted across them, and the priced kinds offered on the trader's
 * form beside the fixed wares (engine/elder.ts). A sale takes the goods
 * out of the chests after the emeralds are taken, and puts them back if
 * the chests came up short in between.
 *
 * `/scriptevent villages:stock x y z [item]` (console or operator) lists
 * the storehouse of the trader post at x y z, or with an item takes one
 * sale's worth of it out of the chests and drops it at the post: the hatch
 * the GameTest drives, since a SimulatedPlayer cannot be shown a form.
 */
import { CommandPermissionLevel, ItemStack, Player, system, world, type Dimension } from "@minecraft/server";
import { spawnSpot } from "../core/peopling";
import { itemName, type PostRecord } from "../core/record";
import * as core from "../core/standing";
import { takeCarried } from "./standing";
import * as storage from "./storage";
import { nearestChest, type Chest } from "./trades";

let log: (...parts: unknown[]) => void = () => undefined;

/** The chests of the trader's village, one per worker post, each once. */
export function chestsOf(dim: Dimension, elder: PostRecord): Chest[] {
  const seen = new Set<string>();
  const out: Chest[] = [];
  for (const post of core.storehousePosts(storage.all(), elder)) {
    let chest: Chest | undefined;
    try {
      chest = nearestChest(dim, post);
    } catch {
      chest = undefined; // an unloaded corner of the village
    }
    if (!chest) continue;
    const key = `${chest.block.x},${chest.block.y},${chest.block.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chest);
  }
  return out;
}

/** How many of each kind the chests hold. */
export function countsOf(chests: readonly Chest[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { container } of chests) {
    if (!container.isValid) continue;
    for (let i = 0; i < container.size; i++) {
      const s = container.getItem(i);
      if (s) counts[s.typeId] = (counts[s.typeId] ?? 0) + s.amount;
    }
  }
  return counts;
}

/** What the trader at `elder` can sell from the storehouse to a player of `tier`, beside its people's fixed wares. */
export function stockOf(dim: Dimension, elder: PostRecord, tier: number): core.StockLine[] {
  return core.stock(countsOf(chestsOf(dim, elder)), elder.people, tier);
}

/** Take `n` of `typeId` out of the chests, across chests and slots (each chest as a player's inventory, engine/standing.ts). Returns how many were taken. */
export function take(chests: readonly Chest[], typeId: string, n: number): number {
  let left = n;
  for (const { container } of chests) {
    if (left <= 0) break;
    if (container.isValid) left -= takeCarried(container, typeId, left);
  }
  return n - left;
}

/** Put `n` of `typeId` back into the chests; what no chest takes is dropped at the first chest, never lost. */
export function putBack(dim: Dimension, chests: readonly Chest[], typeId: string, n: number): void {
  if (n <= 0) return;
  let leftover: ItemStack | undefined = new ItemStack(typeId, n);
  for (const { container } of chests) {
    if (!leftover) break;
    try {
      if (container.isValid) leftover = container.addItem(leftover);
    } catch {
      /* the next chest */
    }
  }
  const first = chests[0];
  if (leftover && first) {
    try {
      dim.spawnItem(leftover, { x: first.block.x + 0.5, y: first.block.y + 1, z: first.block.z + 0.5 });
    } catch (e) {
      log(`could not put ${leftover.typeId} x${leftover.amount} back: ${e}`);
    }
  }
}

const describe = (typeId: string, n: number): string => `${n} ${itemName(typeId)}`;

export function install(logger: (...parts: unknown[]) => void): void {
  log = logger;
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "villages:stock") return;
    const src = ev.sourceEntity;
    if (src instanceof Player && src.commandPermissionLevel < CommandPermissionLevel.GameDirectors) return;
    const [xs, ys, zs, item] = ev.message.trim().split(/\s+/);
    const [x, y, z] = [xs, ys, zs].map(Number) as [number, number, number];
    if (![x, y, z].every(Number.isFinite)) {
      log("villages:stock wants x y z [item]");
      return;
    }
    const dim = world.getDimension("minecraft:overworld");
    const elder = storage.get({ dimId: dim.id, x, y, z });
    if (!elder) {
      log(`no post at ${x},${y},${z}`);
      return;
    }
    const chests = chestsOf(dim, elder);
    const lines = core.stock(countsOf(chests), elder.people, core.GUEST);
    if (!item) {
      log(`the storehouse of the post at ${x},${y},${z}: ${chests.length} chest(s); ${lines.map((l) => `${describe(l.item, l.amount)} for ${l.price} (${l.available} there)`).join(", ") || "nothing priced"}`);
      return;
    }
    const line = lines.find((l) => l.item === item);
    if (!line) {
      log(`the storehouse has no sale's worth of ${item}`);
      return;
    }
    const taken = take(chests, line.item, line.amount);
    try {
      dim.spawnItem(new ItemStack(line.item, taken), spawnSpot(elder));
    } catch (e) {
      putBack(dim, chests, line.item, taken);
      log(`could not drop ${describe(line.item, taken)}: ${e}`);
      return;
    }
    log(`${describe(line.item, taken)} taken from the storehouse and dropped at the post at ${x},${y},${z}`);
  });
}
