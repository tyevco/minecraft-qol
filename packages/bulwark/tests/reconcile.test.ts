import { describe, expect, it } from "vitest";
import type { Position } from "../scripts/core/record";
import {
  HEAD_SEAT,
  SPAWN_GRACE_TICKS,
  headSpawnLocation,
  isAtBlock,
  reconcileBlock,
  reconcileEntity,
  spawnAllowed,
  type Head,
} from "../scripts/core/reconcile";

const block: Position = { dimId: "minecraft:overworld", x: 10, y: 70, z: -5 };
const elsewhere: Position = { ...block, x: 11 };

const head = (id: string, link: Position | null = block, atBlock = true): Head => ({
  id,
  link: link ?? undefined,
  atBlock,
});

describe("reconcileBlock", () => {
  it("keeps a linked head that is standing on its block", () => {
    expect(reconcileBlock(block, head("a"), [head("a")])).toEqual({
      action: { kind: "keep", id: "a" },
      remove: [],
    });
  });

  it("teleports a linked head that has drifted", () => {
    expect(reconcileBlock(block, head("a", block, false), [])).toEqual({
      action: { kind: "teleport", id: "a" },
      remove: [],
    });
  });

  it("spawns when there is no head at all", () => {
    expect(reconcileBlock(block, undefined, [])).toEqual({ action: { kind: "spawn" }, remove: [] });
  });

  it("adopts a head that claims this block when the record has lost it", () => {
    expect(reconcileBlock(block, undefined, [head("b")])).toEqual({
      action: { kind: "adopt", id: "b" },
      remove: [],
    });
  });

  it("adopts deterministically by id and removes the other claimants", () => {
    const verdict = reconcileBlock(block, undefined, [head("z"), head("m"), head("a")]);
    expect(verdict.action).toEqual({ kind: "adopt", id: "a" });
    expect(verdict.remove).toEqual(["m", "z"]);
  });

  it("removes duplicates claiming this block when the linked head is present", () => {
    const verdict = reconcileBlock(block, head("a"), [head("a"), head("dup1"), head("dup2")]);
    expect(verdict.action).toEqual({ kind: "keep", id: "a" });
    expect(verdict.remove).toEqual(["dup1", "dup2"]);
  });

  it("never touches heads that belong to another block or are unlinked", () => {
    const stray = head("stray", elsewhere);
    const inert = head("inert", null);
    expect(reconcileBlock(block, undefined, [stray, inert])).toEqual({
      action: { kind: "spawn" },
      remove: [],
    });
    expect(reconcileBlock(block, head("a"), [stray, inert]).remove).toEqual([]);
  });

  it("never spawns while a linked head exists, even if it is displaced", () => {
    // The one outcome that must be impossible: two heads for one block.
    for (const atBlock of [true, false]) {
      for (const nearby of [[], [head("a")], [head("a"), head("b")]]) {
        const v = reconcileBlock(block, head("a", block, atBlock), nearby);
        expect(v.action.kind).not.toBe("spawn");
        expect(v.action.kind).not.toBe("adopt");
        expect(v.remove).not.toContain("a");
      }
    }
  });
});

describe("reconcileEntity", () => {
  it("leaves an unlinked head alone whatever the world looks like", () => {
    for (const isTurret of [true, false, undefined]) {
      expect(reconcileEntity(head("p", null), isTurret, undefined)).toBe("inert");
      expect(reconcileEntity(head("p", null), isTurret, "other")).toBe("inert");
    }
  });

  it("keeps a head whose block is in an unloaded chunk - absence of evidence", () => {
    expect(reconcileEntity(head("a"), undefined, undefined)).toBe("keep");
    expect(reconcileEntity(head("a"), undefined, "someone-else")).toBe("keep");
  });

  it("removes a head whose block is gone", () => {
    expect(reconcileEntity(head("a"), false, undefined)).toBe("remove");
    expect(reconcileEntity(head("a"), false, "a")).toBe("remove");
  });

  it("keeps the head the record names, removes any other", () => {
    expect(reconcileEntity(head("a"), true, "a")).toBe("keep");
    expect(reconcileEntity(head("b"), true, "a")).toBe("remove");
  });

  it("keeps a head at a real block with no record yet, for the block to adopt", () => {
    expect(reconcileEntity(head("a"), true, undefined)).toBe("keep");
  });
});

describe("geometry", () => {
  it("seats the head centred on the block, in the socket", () => {
    expect(headSpawnLocation(block)).toEqual({ x: 10.5, y: 70 + HEAD_SEAT, z: -4.5 });
  });

  it("accepts the seat and a little drift, rejects the next cell over or a fall", () => {
    expect(isAtBlock(block, headSpawnLocation(block))).toBe(true);
    expect(isAtBlock(block, { x: 10.99, y: 70.0, z: -4.01 })).toBe(true);
    expect(isAtBlock(block, { x: 10.5, y: 70 + HEAD_SEAT + 0.49, z: -4.5 })).toBe(true);
    expect(isAtBlock(block, { x: 10.5, y: 70 + HEAD_SEAT + 0.5, z: -4.5 })).toBe(false);
    expect(isAtBlock(block, { x: 10.5, y: 69.99, z: -4.5 })).toBe(false);
    expect(isAtBlock(block, { x: 11, y: 70.5, z: -4.5 })).toBe(false);
    expect(isAtBlock(block, { x: 10.5, y: 70.5, z: -5.01 })).toBe(false);
  });
});

describe("spawnAllowed", () => {
  it("spawns at once for a block that never had a head", () => {
    expect(spawnAllowed(false, 0)).toBe(true);
  });

  it("waits out the grace period for a remembered head, then spawns", () => {
    for (let misses = 0; misses < SPAWN_GRACE_TICKS; misses++) {
      expect(spawnAllowed(true, misses)).toBe(false);
    }
    expect(spawnAllowed(true, SPAWN_GRACE_TICKS)).toBe(true);
    expect(spawnAllowed(true, SPAWN_GRACE_TICKS + 10)).toBe(true);
  });
});
