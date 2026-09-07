/**
 * From a blueprint, a spot and a table to a job: the one path the table's
 * form and the `builder:place` hatch both take (settlements.md §5.1, §5.2).
 * The decisions are core's; this gathers what they need from the world.
 */
import type { Dimension, Vector3 } from "@minecraft/server";
import { catalogueEntry, materials, plainName, type Cell } from "../core/blueprint";
import { boxOf, fits, grounded, overlapping, paidFor, type Lookup, type Shortfall } from "../core/checks";
import { worldCells } from "../core/order";
import { paletteByKey, paletteTable } from "../core/palette";
import { boxOfRecord, type BuildingRecord } from "../core/record";
import { doorFacing, rotatedSize, type Rotation } from "../core/rotate";
import * as chest from "./chest";
import * as storage from "./storage";
import * as structures from "./structures";

export interface Plan {
  record: BuildingRecord;
  cells: Cell[];
  needed: Record<string, number>;
  have: Record<string, number>;
  short: Shortfall[];
  /** Why it cannot go ahead, or undefined when it can. */
  refused?: string;
}

export function lookupIn(dim: Dimension): Lookup {
  return (x, y, z) => {
    try {
      const b = dim.getBlock({ x, y, z });
      return b ? { typeId: b.typeId, isAir: b.isAir, isLiquid: b.isLiquid } : undefined;
    } catch {
      return undefined;
    }
  };
}

/**
 * Everything the table's form shows, and whether "place here" is offered.
 * Refusals come in the order of §5.2, first one wins, and each names the spot
 * or the material.
 */
export function plan(dim: Dimension, key: string, origin: Vector3, rotation: Rotation, table: Vector3, free = false, palette = ""): Plan | { refused: string } {
  const entry = catalogueEntry(key);
  const b = structures.building(key);
  if (!entry || !b) return { refused: `there is no blueprint called ${key}` };
  if (palette && !paletteByKey(palette)) return { refused: `there is no palette called ${palette}` };
  const size = rotatedSize(b.size, rotation);
  const cells = worldCells(b.cells, b.size, rotation, origin, paletteTable(key, palette));
  const needed = materials(cells);
  const record: BuildingRecord = { dimId: dim.id, x: origin.x, y: origin.y, z: origin.z, key, rotation, sx: size.x, sy: size.y, sz: size.z, phase: "building", done: 0, table: { x: table.x, y: table.y, z: table.z }, free, palette };
  const c = chest.chestBeside(dim, table);
  const have = c ? chest.counts(c) : {};
  const paid = free ? { ok: true as const } : paidFor(needed, have);
  const out: Plan = { record, cells, needed, have, short: paid.ok ? [] : paid.short };

  const box = boxOf(origin, size);
  const other = overlapping(box, storage.all().filter((r) => r.dimId === dim.id).map((r) => ({ ...boxOfRecord(r), record: r })));
  if (other) out.refused = `it would cut into the ${catalogueEntry(other.record.key)?.title ?? other.record.key} at ${other.record.x},${other.record.y},${other.record.z}`;
  const lookup = lookupIn(dim);
  const fit = out.refused ? { ok: true as const } : fits(origin, size, lookup);
  if (!fit.ok) out.refused = fit.reason;
  const ground = out.refused ? { ok: true as const } : grounded(origin.y, cells, lookup, entry.stilts === true);
  if (!ground.ok) out.refused = ground.reason;
  if (!out.refused && !c && !free) out.refused = "there is no chest beside the table";
  if (!out.refused && !paid.ok) out.refused = `the chest is ${paid.reason}`;
  return out;
}

/** The form's body, and the hatch's log line. */
export function describe(p: Plan): string[] {
  const entry = catalogueEntry(p.record.key);
  const r = p.record;
  const lines = [
    `${entry?.title ?? r.key}${r.palette ? ` as the ${paletteByKey(r.palette)?.title ?? r.palette} build it` : ""}: ${entry?.description ?? ""}`.trim(),
    `${r.sx} wide, ${r.sy} high, ${r.sz} deep, the door facing ${doorFacing(r.rotation)}; from ${r.x},${r.y},${r.z} toward the east and south.`,
    r.free ? "Materials (buildings are free: nothing is taken, and nothing comes back when it is taken down):" : "Materials, and what the chest holds:",
    ...Object.entries(p.needed).map(([item, n]) => `  ${plainName(item)}: ${n}${!r.free && (p.have[item] ?? 0) < n ? ` (chest has ${p.have[item] ?? 0})` : ""}`),
  ];
  lines.push(p.refused ? `Cannot place: ${p.refused}.` : "Ready to place.");
  return lines;
}
