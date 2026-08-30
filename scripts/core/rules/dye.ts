import { isDye } from "../items";
import { NONE, type DispenseResult, type Rule } from "./types";

/**
 * Dyeing cauldron water - a Bedrock-exclusive cauldron ability.
 *
 * The dye is consumed and the water level is unchanged. The actual colour blend
 * is left to BlockFluidContainerComponent.addDye rather than reimplemented here,
 * so multi-dye mixing matches vanilla exactly.
 */
export const dyeRule: Rule = ({ item, cauldron }): DispenseResult => {
  if (!cauldron) return NONE;
  if (!isDye(item.typeId)) return NONE;
  if (cauldron.fluid !== "water" || cauldron.level <= 0) return NONE;

  return {
    kind: "apply",
    cauldron, // level and fluid unchanged
    addDye: item.typeId,
    // No residue: the dye is used up.
    sound: "cauldron.dyearmor",
  };
};
