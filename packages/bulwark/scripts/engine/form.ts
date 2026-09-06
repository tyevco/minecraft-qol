import type { Player } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { AMMO_CAP } from "../core/ammo";
import type { TurretRecord } from "../core/record";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "../core/targeting";
import { describeTiers } from "../core/tiers";

/**
 * The per-turret form: sneak and right-click the block with an empty hand.
 *
 * One choice lives here, the targeting priority, because it is per turret
 * and the settings panel is per world (CLAUDE.md rule 3). The rest of the
 * form is a read-out. `ModalFormData` is stable in server-ui 2.1.0;
 * `CustomForm.image`, which the design wanted for an upgrade grid, is not.
 *
 * The dropdown is the first element so its value is `formValues[0]`, and
 * the read still looks for the first number in case labels take slots in
 * a later runtime.
 */
export function openTurretForm(
  player: Player,
  record: TurretRecord,
  onPriority: (priority: Priority) => void,
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
    .divider()
    .label(`Ammo ${record.ammo}/${AMMO_CAP}, kills ${record.kills}`)
    .label(`Tiers: ${describeTiers(record.tiers)}`)
    .submitButton("Save");

  form
    .show(player)
    .then((r) => {
      if (r.canceled || !r.formValues) return;
      const idx = r.formValues.find((v) => typeof v === "number");
      const priority = typeof idx === "number" ? PRIORITIES[idx] : undefined;
      if (priority) onPriority(priority);
    })
    .catch((e) => {
      console.warn(`[Bulwark] turret form failed: ${e}`);
    });
}
