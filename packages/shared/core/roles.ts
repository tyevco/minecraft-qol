/**
 * Player permission roles. Pure - no @minecraft imports.
 *
 * Behaviour-pack settings are per world and cannot name individual players.
 * The handle they do have is the permission role - visitor, member, operator -
 * which on a Realm is already assigned per player from the member list. So
 * "per player" in every panel in this repo means "per role": kids as Members,
 * parents as Operators, with nothing for a child to toggle back.
 */
export type Role = "visitor" | "member" | "operator";

export const ROLES: readonly Role[] = ["visitor", "member", "operator"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
