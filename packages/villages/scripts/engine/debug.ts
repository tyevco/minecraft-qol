/**
 * `/scriptevent villages:forget x y z [radius]` - drop what the pack
 * remembers about the post(s) there: the record and its person, with the
 * block left standing. The GameTests' sweep, and the same escape hatch
 * `builder:forget` and `bulwark:forget` are (CLAUDE.md rule 3).
 *
 * A test needs it because a record can outlive the session that made it. A
 * post the kids placed is marked in its record, and `tick`'s "same post"
 * check keeps such a record when a post of the same people and job is set
 * over it - which is right for a plaque being turned, and wrong for a test
 * that finds one of its own cells still remembered as the kids'. A kids'
 * post spawns nobody, so the test waits for a person that will never come.
 *
 * `/scriptevent villages:debug [delayTicks]` - every post the pack knows,
 * with whether its person is present, to the caller (or the content log from
 * the console). A person is looked up by id and then by its post tag, as the
 * post itself does; a person in an unloaded chunk reads as "unloaded", which
 * is why a delay is offered for a run straight after boot.
 */
import { Player, system, world } from "@minecraft/server";
import { spawnSpot } from "../core/peopling";
import { JOBS, PEOPLES, PLACED_BY_PLAYER, TRADES, WORKER } from "../core/record";
import { PERSON, postTag, retire } from "./post";
import * as storage from "./storage";
import * as trades from "./trades";
import * as follow from "./follow";
import * as visitors from "./visitors";
import * as sweep from "./sweep";

export function install(): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    // Takes its position on the line, so it needs no sender: a command from a
    // SimulatedPlayer or the console arrives with no sourceEntity at all.
    if (ev.id === "villages:forget") {
      forget(ev.message, ev.sourceEntity instanceof Player ? ev.sourceEntity : undefined);
      return;
    }
    if (ev.id !== "villages:debug") return;
    const delay = Math.max(0, Number(ev.message) || 0);
    const src = ev.sourceEntity;
    system.runTimeout(() => {
      const lines: string[] = [];
      let alive = 0;
      for (const r of storage.all()) {
        let state = r.entityId ? "unloaded" : "unspawned";
        try {
          const dim = world.getDimension(r.dimId);
          let e = r.entityId ? world.getEntity(r.entityId) : undefined;
          if (!(e && e.isValid && e.typeId === PERSON)) e = dim.getEntities({ type: PERSON, tags: [postTag(r)], location: spawnSpot(r), maxDistance: 48 })[0];
          if (e) {
            state = "present";
            alive++;
          }
        } catch {
          state = "unloaded";
        }
        const trade = r.job === WORKER ? ` ${TRADES[r.trade]} ${trades.status(r)}`.trimEnd() : "";
        const kin = r.placedBy === PLACED_BY_PLAYER ? " (the kids' post)" : "";
        lines.push(`${PEOPLES[r.people]} ${JOBS[r.job]}${trade} @${r.x},${r.y},${r.z} ${state}${kin}`);
      }
      const text = `[Villages] ${storage.count()} post(s), ${alive} person(s) present; ${visitors.status()}; ${follow.count()} follower(s); ${sweep.retiredCount()} stale record(s) swept\n${lines.join("\n")}`;
      if (src instanceof Player) src.sendMessage(text);
      console.warn(text);
    }, delay);
  });
}

/**
 * `villages:forget x y z [radius]` - retire the post record at that block, or
 * every record within `radius` on x/z (the shape a GameTest wants: records in
 * one column share an x/z and differ by y). The person goes with the record,
 * as it does when the block is broken; the block itself is left alone.
 */
function forget(message: string, player: Player | undefined): void {
  const say = (text: string): void => {
    player?.sendMessage(`§7${text}`);
    console.warn(`[Villages] ${text}`);
  };
  const parts = message.trim().split(/\s+/).filter((p) => p.length > 0);
  const [x, y, z, radius] = parts.slice(0, 4).map(Number);
  if ([x, y, z].some((n) => n === undefined || !Number.isInteger(n))) {
    say("villages:forget wants x y z [radius]");
    return;
  }
  const at = { x: x!, y: y!, z: z! };
  const within = radius !== undefined && Number.isFinite(radius) ? radius : undefined;
  const dimId = player?.dimension.id ?? "minecraft:overworld";
  const hits = storage
    .all()
    .filter((r) => r.dimId === dimId)
    .filter((r) => (within !== undefined ? Math.hypot(r.x - at.x, r.z - at.z) <= within : r.x === at.x && r.y === at.y && r.z === at.z));
  let forgotten = 0;
  for (const r of hits) {
    try {
      retire(world.getDimension(r.dimId), r);
      forgotten++;
    } catch (e) {
      console.warn(`[Villages] could not forget the post record at ${r.x},${r.y},${r.z}: ${e}`);
    }
  }
  say(
    forgotten > 0
      ? `villages:forget ok: ${forgotten} post(s) forgotten near ${at.x},${at.y},${at.z} in ${dimId}; ${storage.count()} record(s) left`
      : `villages:forget: no post record at ${at.x},${at.y},${at.z}${within !== undefined ? ` within ${within}` : ""}`,
  );
}
