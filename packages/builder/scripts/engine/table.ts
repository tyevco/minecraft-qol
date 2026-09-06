/**
 * The blueprint table (settlements.md §5.1): a block with a custom component.
 * Tap it holding a blueprint and a form shows the building, its size, its
 * materials against the chest beside the table, and offers "place here": at
 * your feet, snapped to the block you stand on, facing the way you face, the
 * building running east and south from there. Tap it with an empty hand for
 * what this table has raised, and to take a building down into the chest.
 *
 * A before-event may not open a form, and the block's interact hook runs in
 * an after-event, so the form opens on the next tick from `system.run`.
 */
import { EquipmentSlot, Player, system, type Block, type BlockCustomComponent, type ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { roleOf } from "@qol/shared/engine/roles";
import { catalogueEntry, keyOfBlueprintItem } from "../core/blueprint";
import { sameTable, type BuildingRecord } from "../core/record";
import { doorFacing, rotationFromYaw } from "../core/rotate";
import { mayBuild } from "../core/settings";
import * as jobs from "./jobs";
import * as placing from "./placing";
import * as settings from "./settings";
import * as storage from "./storage";
import { log, tell } from "./tell";

export const COMPONENT_ID = "builder:table";
export const TABLE = "builder:blueprint_table";

function mainhand(player: Player): ItemStack | undefined {
  try {
    return player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
  } catch {
    return undefined;
  }
}

async function blueprintForm(player: Player, table: Block, key: string): Promise<void> {
  const origin = { x: Math.floor(player.location.x), y: Math.floor(player.location.y) - 1, z: Math.floor(player.location.z) };
  const rotation = rotationFromYaw(player.getRotation().y);
  const p = placing.plan(table.dimension, key, origin, rotation, table.location, settings.policy().freeBuild);
  if (!("record" in p)) {
    tell(player, `Cannot place: ${p.refused}.`);
    return;
  }
  const title = catalogueEntry(key)?.title ?? key;
  const form = new ActionFormData().title(`Blueprint: ${title}`).body(placing.describe(p).join("\n"));
  if (!p.refused) form.button("Place here");
  form.button(p.refused ? "Close" : "Not now");
  const r = await form.show(player);
  if (r.canceled || r.selection !== 0 || p.refused) return;
  // Check again: the world may have changed while the form was open.
  const again = placing.plan(table.dimension, key, origin, rotation, table.location, settings.policy().freeBuild);
  if (!("record" in again) || again.refused) {
    tell(player, `Cannot place: ${again.refused}.`);
    return;
  }
  storage.put(again.record);
  const b = again.record;
  if (jobs.start(b)) tell(player, `The builder starts on the ${title} at ${b.x},${b.y},${b.z}: ${b.sx} east by ${b.sz} south, ${b.sy} high, the door facing ${doorFacing(b.rotation)}. The sparks mark its edges; the first layer sits in the ground.`);
  else tell(player, `The builder could not start on the ${title}; see the content log.`);
}

async function tableForm(player: Player, table: Block): Promise<void> {
  const mine = storage.all().filter((r) => r.dimId === table.dimension.id && sameTable(r, table.location));
  if (!mine.length) {
    tell(player, "Hold a blueprint and tap the table to place a building. This table has raised nothing yet.");
    return;
  }
  const form = new ActionFormData().title("Blueprint Table").body("What this table has raised. Taking a building down puts every block back in the chest.");
  const actions: (() => void)[] = [];
  for (const r of mine) {
    const title = catalogueEntry(r.key)?.title ?? r.key;
    const where = `${r.x},${r.y},${r.z}`;
    if (jobs.running(r)) {
      form.button(`${title} at ${where}: ${r.phase}, ${r.done} so far`);
      actions.push(() => tell(player, `The builder is already at work on the ${title}.`));
    } else if (r.phase === "built") {
      form.button(`Take down the ${title} at ${where}`);
      actions.push(() => takeDown(player, r));
    } else {
      form.button(`Carry on with the ${title} at ${where} (${r.phase}, ${r.done} done)`);
      actions.push(() => {
        if (jobs.start(r)) tell(player, `The builder carries on with the ${title}.`);
        else tell(player, `The builder could not carry on with the ${title}; see the content log.`);
      });
    }
  }
  form.button("Close");
  const r = await form.show(player);
  if (r.canceled || r.selection === undefined) return;
  actions[r.selection]?.();
}

function takeDown(player: Player, record: BuildingRecord): void {
  const title = catalogueEntry(record.key)?.title ?? record.key;
  if (jobs.startRemoval(record)) tell(player, `The builder starts taking the ${title} down.`);
  else tell(player, `The ${title} cannot be taken down right now; see the content log.`);
}

function open(player: Player, table: Block): void {
  if (!mayBuild(roleOf(player), settings.policy())) {
    tell(player, "The blueprint table is not for you to use; an operator can change that in the pack's settings.");
    return;
  }
  const held = mainhand(player);
  const key = held ? keyOfBlueprintItem(held.typeId) : undefined;
  const shown = key ? blueprintForm(player, table, key) : tableForm(player, table);
  shown.catch((e) => log(`the table's form failed for ${player.name}: ${e}`));
}

export const tableComponent: BlockCustomComponent = {
  onPlayerInteract(ev) {
    const player = ev.player;
    if (!(player instanceof Player)) return;
    const block = ev.block;
    system.run(() => open(player, block));
  },
};
