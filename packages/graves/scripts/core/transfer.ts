/**
 * Planning the move of a dead player's items into a gravestone, and back.
 * Pure - no @minecraft imports. The engine executes the plan slot by slot.
 *
 * Kept separate so the ordering rules are testable: armour goes first, because
 * if the stone turns out to hold fewer slots than the player carried, the
 * armour is what nobody wants to lose. Anything that does not fit is simply
 * left in the player's inventory - the keep-on-death flag means it survives
 * there, so a short stone loses nothing.
 */
export type Source =
  { kind: "slot"; index: number } | { kind: "equipment"; slot: string };

export interface Move {
  from: Source;
  to: number;
}

export interface TransferPlan {
  moves: Move[];
  /** Grave slot -> equipment slot name, so retrieval can re-equip. */
  equipmentAt: Record<number, string>;
  /** Sources that did not fit and stay with the player. */
  leftover: Source[];
}

export function planTransfer(
  occupied: readonly Source[],
  capacity: number,
): TransferPlan {
  const ordered = [
    ...occupied.filter((s) => s.kind === "equipment"),
    ...occupied
      .filter((s): s is { kind: "slot"; index: number } => s.kind === "slot")
      .sort((a, b) => a.index - b.index),
  ];

  const moves: Move[] = [];
  const equipmentAt: Record<number, string> = {};
  const leftover: Source[] = [];

  for (const src of ordered) {
    if (moves.length >= capacity) {
      leftover.push(src);
      continue;
    }
    const to = moves.length;
    moves.push({ from: src, to });
    if (src.kind === "equipment") equipmentAt[to] = src.slot;
  }

  return { moves, equipmentAt, leftover };
}

export function parseEquipmentAt(raw: unknown): Record<number, string> {
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(k);
      if (Number.isInteger(n) && typeof v === "string") out[n] = v;
    }
    return out;
  } catch {
    return {};
  }
}
