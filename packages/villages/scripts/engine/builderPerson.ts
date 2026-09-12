/**
 * The builder for a blueprint table (issue #80): the person of the nearest
 * builder's post (job 3) within BUILDER_RANGE of the table, present and not
 * off following someone. A village's builder or one the kids' post got by
 * a visitor settling or an invite; nobody is spawned for a table, so a
 * settlement with no builder cannot raise a building, and the form says so.
 */
import { type Dimension, type Entity, type Vector3 } from "@minecraft/server";
import { JOBS } from "../core/record";
import * as follow from "./follow";
import { personOf } from "./post";
import * as storage from "./storage";

export const BUILDER_RANGE = 64;
const BUILDER_JOB = JOBS.indexOf("builder");

/** The nearest free builder to a table, or undefined. */
export function builderNear(dim: Dimension, table: Vector3): Entity | undefined {
  const posts = storage
    .all()
    .filter((p) => p.dimId === dim.id && p.job === BUILDER_JOB && (p.x - table.x) ** 2 + (p.z - table.z) ** 2 <= BUILDER_RANGE * BUILDER_RANGE)
    .sort((a, b) => (a.x - table.x) ** 2 + (a.z - table.z) ** 2 - ((b.x - table.x) ** 2 + (b.z - table.z) ** 2));
  for (const post of posts) {
    const person = personOf(dim, post);
    if (person && !follow.isFollowing(person.id)) return person;
  }
  return undefined;
}
