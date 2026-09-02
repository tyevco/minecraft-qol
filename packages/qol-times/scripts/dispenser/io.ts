/**
 * The cauldron adapter now lives in the shared library, because Fluidworks
 * reads and writes cauldrons the same way. Re-exported here so the dispenser
 * code keeps one import site for "how a cauldron is represented".
 */
export {
  applyCauldron,
  buildOutput,
  planCauldronPermutation,
  readCauldron,
  readItemColor,
  readPotionEffectId,
} from "@qol/shared/engine/cauldron";
