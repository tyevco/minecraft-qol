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
import { sameTable, type BuildingRecord } from "../core/building";
import { PALETTES, sourcePaletteOf } from "../core/palette";
import { doorFacing, rotationFromYaw } from "../core/rotate";
import { mayBuild } from "../core/settings";
import * as jobs from "./jobs";
import * as placing from "./placing";
import * as settings from "./settings";
import * as storage from "./buildings";
import * as survey from "./survey";
import { log, tell } from "./tell";

export const COMPONENT_ID = "villages:table";
export const TABLE = "villages:blueprint_table";

function mainhand(player: Player): ItemStack | undefined {
  try {
    return player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
  } catch {
    return undefined;
  }
}

/**
 * The blueprint's form: the building, "Place here", and "As another people
 * build it", which asks whose way (settlements.md §4) and opens the same
 * form again with that palette's materials against the chest.
 */
async function blueprintForm(player: Player, table: Block, key: string, palette = ""): Promise<void> {
  const origin = { x: Math.floor(player.location.x), y: Math.floor(player.location.y) - 1, z: Math.floor(player.location.z) };
  const rotation = rotationFromYaw(player.getRotation().y);
  const p = placing.plan(table.dimension, key, origin, rotation, table.location, settings.policy().freeBuild, palette, player.id);
  if (!("record" in p)) {
    tell(player, `Cannot place: ${p.refused}.`);
    return;
  }
  const title = catalogueEntry(key)?.title ?? key;
  const form = new ActionFormData().title(`Blueprint: ${title}`).body(placing.describe(p).join("\n"));
  const actions: (() => Promise<void> | void)[] = [];
  if (!p.refused) {
    form.button("Place here");
    actions.push(() => start(player, table, key, origin, rotation, palette, title));
  }
  if (sourcePaletteOf(key)) {
    form.button("As another people build it");
    actions.push(() => whoseWay(player, table, key, palette));
  }
  if (palette) {
    form.button("As authored");
    actions.push(() => blueprintForm(player, table, key, ""));
  }
  form.button(p.refused && !actions.length ? "Close" : "Not now");
  const r = await form.show(player);
  if (r.canceled || r.selection === undefined) return;
  await actions[r.selection]?.();
}

/** The peoples' palettes but the building's own, the shared row and the one showing; back to the blueprint's form with the choice. */
async function whoseWay(player: Player, table: Block, key: string, palette: string): Promise<void> {
  const own = sourcePaletteOf(key)?.key;
  const form = new ActionFormData().title("Whose way?").body("The same building in another people's blocks: their footing, walls, corners, roof and awning for its own. The chest pays in theirs.");
  const choices = PALETTES.filter((pal) => pal.key !== own && pal.key !== "shared" && pal.key !== palette);
  for (const pal of choices) form.button(`As the ${pal.title} build it`);
  form.button("Back");
  const r = await form.show(player);
  if (r.canceled || r.selection === undefined) return;
  const pick = choices[r.selection];
  await blueprintForm(player, table, key, pick ? pick.key : palette);
}

async function start(player: Player, table: Block, key: string, origin: { x: number; y: number; z: number }, rotation: ReturnType<typeof rotationFromYaw>, palette: string, title: string): Promise<void> {
  // Check again: the world may have changed while the form was open.
  const again = placing.plan(table.dimension, key, origin, rotation, table.location, settings.policy().freeBuild, palette, player.id);
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
  const stakes = survey.stakesNear(table.dimension, table.location);
  if (!mine.length && !stakes.length) {
    tell(player, "Hold a blueprint and tap the table to place a building, or put two survey stakes round something to make a blueprint of it. This table has raised nothing yet.");
    return;
  }
  const form = new ActionFormData().title("Blueprint Table").body("What this table has raised. Taking a building down puts every block back in the chest; repairing fills its gaps from the chest. A survey saves what stands between two stakes as a new blueprint.");
  const actions: (() => void)[] = [];
  if (stakes.length === 2) {
    const [a, b] = stakes as [typeof stakes[0], typeof stakes[0]];
    form.button(`Survey the box between the stakes at ${a.x},${a.y},${a.z} and ${b.x},${b.y},${b.z}`);
    actions.push(() => {
      const s = survey.survey(table.dimension, a, b);
      if ("refused" in s) tell(player, `Cannot survey: ${s.refused}.`);
      else survey.give(player, s);
    });
  } else if (stakes.length > 2) {
    form.button(`${stakes.length} stakes stand near the table; a survey wants exactly two`);
    actions.push(() => tell(player, "Take up the extra stakes so exactly two mark the box."));
  }
  for (const r of mine) {
    const title = catalogueEntry(r.key)?.title ?? r.key;
    const where = `${r.x},${r.y},${r.z}`;
    if (jobs.running(r)) {
      form.button(`${title} at ${where}: ${r.phase}, ${r.done} so far`);
      actions.push(() => tell(player, `The builder is already at work on the ${title}.`));
    } else if (r.phase === "built") {
      form.button(`Take down the ${title} at ${where}`);
      actions.push(() => takeDown(player, r));
      form.button(`Repair the ${title} at ${where}`);
      actions.push(() => {
        if (jobs.startRepair(r)) tell(player, `The builder looks the ${title} over and fills what is missing.`);
        else tell(player, `The ${title} cannot be repaired right now; see the content log.`);
      });
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
  const key = held ? (keyOfBlueprintItem(held.typeId) ?? survey.surveyKeyOf(held)) : undefined;
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
