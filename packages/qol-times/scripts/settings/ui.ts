import type { Player } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { FEATURE_DEFAULTS, isEnabled, setEnabled } from "./store";

/** Human-readable labels. Keys must match the feature ids used as storage keys. */
const LABELS: Readonly<Record<string, string>> = {
  cauldron_buckets: "Buckets fill and drain cauldrons",
  cauldron_bottles: "Bottles add and take 2 levels",
  cauldron_dye: "Dye colours cauldron water",
  cauldron_wash: "Wash dye off leather and wolf armour",
};

const FEATURE_IDS = Object.keys(FEATURE_DEFAULTS);

/**
 * One modal with a toggle per feature.
 *
 * formValues is index-aligned with the order rows were added. Decorative rows
 * (header/label/divider) may or may not consume an index depending on version,
 * so this form adds none - every row is a toggle, and the mapping stays trivial.
 */
export async function showSettings(player: Player): Promise<void> {
  const form = new ModalFormData().title("QOL Times");

  for (const id of FEATURE_IDS) {
    form.toggle(LABELS[id] ?? id, { defaultValue: isEnabled(id) });
  }

  const response = await form.show(player);
  if (response.canceled || !response.formValues) return;

  let changed = 0;
  for (let i = 0; i < FEATURE_IDS.length; i++) {
    const id = FEATURE_IDS[i];
    const value = response.formValues[i];
    if (!id || typeof value !== "boolean") continue;
    if (isEnabled(id) !== value) {
      setEnabled(id, value);
      changed++;
    }
  }

  player.sendMessage(
    changed === 0 ? "§7QOL Times: no changes." : `§aQOL Times: updated ${changed} setting(s).`,
  );
}

/** Read-only view for non-operators, so guests can see state without changing it. */
export function showReadOnly(player: Player): void {
  const lines = FEATURE_IDS.map(
    (id) => `${isEnabled(id) ? "§a[ON] " : "§c[OFF]"}§r ${LABELS[id] ?? id}`,
  );
  player.sendMessage(`§eQOL Times settings§r\n${lines.join("\n")}\n§7Operators can change these.`);
}
