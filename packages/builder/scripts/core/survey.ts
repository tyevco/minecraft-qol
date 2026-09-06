/**
 * Survey (settlements.md §5.4): the box between two stakes the kids placed,
 * saved as a new blueprint. Pure: the box arithmetic and the cap, so a survey
 * is a building and not a base.
 */
import type { Size } from "./blueprint";

export const SURVEY_MAX = 16;

export interface SurveyBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  size: Size;
}

/** The box that spans two corner blocks, both included. */
export function surveyBox(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): SurveyBox {
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) };
  return { min, max, size: { x: max.x - min.x + 1, y: max.y - min.y + 1, z: max.z - min.z + 1 } };
}

/** Why a box cannot be surveyed, or undefined when it can. */
export function surveyRefusal(box: SurveyBox): string | undefined {
  const { x, y, z } = box.size;
  if (x > SURVEY_MAX || y > SURVEY_MAX || z > SURVEY_MAX) return `the box is ${x} by ${y} by ${z}; a survey is at most ${SURVEY_MAX} each way`;
  if (x * y * z <= 1) return "the two stakes stand in the same block";
  return undefined;
}
