import type { Player } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { AMMO_CAP } from "../core/ammo";
import type { TurretRecord } from "../core/record";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "../core/targeting";
import { describeTiers } from "../core/tiers";

/**
 * The per-turret form: sneak and right-click the block with an empty hand.
 *
 * Two choices live here, the targeting priority and a hold-fire switch,
 * because they are per turret and the settings panel is per world (CLAUDE.md
 * rule 3). The rest of the form is a read-out. `ModalFormData` is stable in server-ui 2.1.0;
 * `CustomForm.image`, which the design wanted for an upgrade grid, is not.
 *
 * The dropdown and the toggle are the first two elements, and the read still
 * looks for the first number and the first boolean in case labels take
 * slots in a later runtime.
 */
export function openTurretForm(
  player: Player,
  record: TurretRecord,
  onSubmit: (choice: { priority: Priority; held: boolean }) => void,
): void {
  const form = new ModalFormData()
    .title("Bulwark Turret")
    .dropdown(
      "Target",
      PRIORITIES.map((p) => PRIORITY_LABEL[p]),
      {
        defaultValueIndex: PRIORITIES.indexOf(record.priority),
        tooltip:
          "Nearest shoots the closest monster. Weakest first prefers wounded monsters " +
          "(three hearts or less) while any are in range; strongest first prefers healthy ones.",
      },
    )
    .toggle("Hold fire", {
      defaultValue: record.held,
      tooltip: "Disarms this turret until switched back. Nothing is taken from it.",
    })
    .divider()
    .label(`Ammo ${record.ammo}/${AMMO_CAP}, kills ${record.kills}`)
    .label(`Tiers: ${describeTiers(record.tiers)}`)
    .submitButton("Save");

  form
    .show(player)
    .then((r) => {
      if (r.canceled || !r.formValues) return;
      const idx = r.formValues.find((v) => typeof v === "number");
      const held = r.formValues.find((v) => typeof v === "boolean");
      const priority = typeof idx === "number" ? PRIORITIES[idx] : undefined;
      if (priority) onSubmit({ priority, held: held === true });
    })
    .catch((e) => {
      console.warn(`[Bulwark] turret form failed: ${e}`);
    });
}
