/**
 * `/scriptevent villages:debug [delayTicks]` - every post the pack knows,
 * with whether its person is present, to the caller (or the content log from
 * the console). A person is looked up by id and then by its post tag, as the
 * post itself does; a person in an unloaded chunk reads as "unloaded", which
 * is why a delay is offered for a run straight after boot.
 */
import { Player, system, world } from "@minecraft/server";
import { spawnSpot } from "../core/peopling";
import { JOBS, PEOPLES, TRADES, WORKER } from "../core/record";
import { PERSON, postTag } from "./post";
import * as storage from "./storage";
import * as trades from "./trades";

export function install(): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
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
        lines.push(`${PEOPLES[r.people]} ${JOBS[r.job]}${trade} @${r.x},${r.y},${r.z} ${state}`);
      }
      const text = `[Villages] ${storage.count()} post(s), ${alive} person(s) present\n${lines.join("\n")}`;
      if (src instanceof Player) src.sendMessage(text);
      console.warn(text);
    }, delay);
  });
}
