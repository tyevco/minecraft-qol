/**
 * QOL Times - Phase 0 diagnostic probe. Logs only; mutates nothing unless the
 * removal test is explicitly armed. Throwaway - this pack never ships.
 *
 * Answers:
 *   U1 does entitySpawn fire for minecraft:item?
 *   U2 can entity.remove() be called synchronously inside that handler?
 *      (succeeds / throws / SILENTLY NO-OPS <- the dangerous one)
 *   U3 has the dispenser decremented its slot by the time entitySpawn fires?
 *   U4 is getVelocity() populated at spawn time?
 *   U5 triggered_bit waveform across a dispenser pulse
 *   U6 is minecraft:fluid_container present on a vanilla cauldron, and is
 *      fillLevel scaled 0-6 or 0-1?
 *
 *   L1 is getLightLevel() total brightness, and is block light recoverable
 *      as (total - sky)? Hostile spawning keys off BLOCK light.
 *   L2 which flags separate a mob-standable block from a slab/torch/glass?
 *      Block has no isSolid, so we need an empirical proxy.
 *
 * In-game:
 *   /scriptevent qolprobe:scan     register rigs near you + dump cauldron readout
 *   /scriptevent qolprobe:arm      arm ONE removal test on the next item spawn
 *   /scriptevent qolprobe:status   show what is registered
 *   /scriptevent qolprobe:light    light readout at your feet (run day AND night)
 *   /scriptevent qolprobe:solid    flag dump for the block you are looking at
 *   /scriptevent qolprobe:lightmatrix
 *                                  builds its own rig 12 blocks up, sweeps
 *                                  shelter x torch x time, restores everything
 *   /scriptevent qolprobe:spawn      report your spawn point (H1)
 *   /scriptevent qolprobe:setspawn   set it to where you stand (reversible)
 *   /scriptevent qolprobe:clearspawn clear it again
 *   /scriptevent qolprobe:death      arm; die; logs inventory state at entityDie
 *                                    and the drop/entityDie ordering (Graves)
 *   /scriptevent qolprobe:keepflag   set keepOnDeath on everything you carry
 *   /scriptevent qolprobe:hurt       watch your own hurt events for 60s: before-event
 *                                    damage vs after-event damage vs health lost
 *   /scriptevent qolprobe:sky        getTopmostBlock for your column (Fluidworks rain)
 */
import { world, system, BlockPermutation } from "@minecraft/server";

const P = "[QOLPROBE]";
const log = (...a) => console.warn(P, ...a);

/** facing_direction -> unit vector. Logged raw as well, so the mapping is verified, not trusted. */
const FACING = [
  { x: 0, y: -1, z: 0 }, // 0 down
  { x: 0, y: 1, z: 0 },  // 1 up
  { x: 0, y: 0, z: -1 }, // 2 north
  { x: 0, y: 0, z: 1 },  // 3 south
  { x: -1, y: 0, z: 0 }, // 4 west
  { x: 1, y: 0, z: 0 },  // 5 east
];

const WATCH = new Set([
  "minecraft:water_bucket", "minecraft:lava_bucket", "minecraft:bucket",
  "minecraft:powder_snow_bucket", "minecraft:glass_bottle", "minecraft:potion",
]);

const rigs = new Map();
let armRemoval = false;
let spawnLogBudget = 40;

const key = (dimId, b) => dimId + "|" + b.x + "," + b.y + "," + b.z;
const v3 = (l) => l.x.toFixed(2) + "," + l.y.toFixed(2) + "," + l.z.toFixed(2);

function safeBlock(dim, loc) {
  try { return dim.getBlock(loc); } catch (e) { return undefined; }
}

function snapshot(block) {
  try {
    const inv = block.getComponent("minecraft:inventory");
    const c = inv && inv.container;
    if (!c) return undefined;
    const out = [];
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      out.push(it ? it.typeId + "x" + it.amount : null);
    }
    return out;
  } catch (e) { return undefined; }
}

function diff(a, b) {
  if (!a || !b) return "n/a";
  const d = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d.push("slot" + i + ": " + a[i] + " -> " + b[i]);
  return d.length ? d.join("; ") : "NO CHANGE";
}

/** Full cauldron readout: component path AND raw-state path, side by side. */
function dumpCauldron(block) {
  const parts = [];
  try { parts.push("states=" + JSON.stringify(block.permutation.getAllStates())); }
  catch (e) { parts.push("states=ERR " + e); }
  try {
    const fc = block.getComponent("minecraft:fluid_container");
    if (!fc) parts.push("fluid_container=ABSENT <-- use raw states instead");
    else parts.push("fluid_container=PRESENT fillLevel=" + fc.fillLevel +
      " fluidType=" + fc.getFluidType() + " color=" + JSON.stringify(fc.fluidColor));
  } catch (e) { parts.push("fluid_container=ERR " + e); }
  return parts.join(" | ");
}

/** Geometric inversion: which dispenser could have ejected into this cell? */
function findDispensers(dim, cell) {
  const found = [];
  for (let d = 0; d < 6; d++) {
    const v = FACING[d];
    const cand = safeBlock(dim, { x: cell.x - v.x, y: cell.y - v.y, z: cell.z - v.z });
    if (!cand || !cand.isValid) continue;
    try {
      if (!cand.matches("minecraft:dispenser")) continue;
      const facing = cand.permutation.getState("facing_direction");
      found.push({ block: cand, assumedFacing: d, actualFacing: facing, agrees: facing === d });
    } catch (e) { /* unloaded */ }
  }
  return found;
}

function registerRig(dim, disp) {
  const k = key(dim.id, disp);
  if (rigs.has(k)) return rigs.get(k);
  let facing;
  try { facing = disp.permutation.getState("facing_direction"); } catch (e) { return undefined; }
  const rig = {
    dim: dim, x: disp.x, y: disp.y, z: disp.z, facing: facing,
    lastTriggered: undefined, snapPrev: undefined,
    snapCur: snapshot(disp), snapTick: system.currentTick,
  };
  rigs.set(k, rig);
  return rig;
}

/**
 * L3 - automated light matrix.
 *
 * Builds a 5x5x5 rig well above the player, sweeps every combination of
 * (sheltered?, torch?, noon/midnight), samples total and sky light at the centre,
 * then restores every block and the original time of day in a finally block.
 *
 * The point is to answer, without hand-sampling: is `total` equal to block light
 * when sky light is 0, and does the sky term vary with time of day? Those two
 * facts decide the whole spawn predicate.
 */
async function runLightMatrix(player) {
  const dim = player.dimension;
  const p = player.location;
  // 12 up: clear of terrain in the common case, still inside the loaded chunk.
  const ox = Math.floor(p.x), oy = Math.floor(p.y) + 12, oz = Math.floor(p.z);
  const test = { x: ox, y: oy + 1, z: oz };

  const RADIUS = 2;      // -> 5x5 footprint, 3x3 interior
  const HEIGHT = 4;      // floor + 2 interior + roof
  const saved = [];
  const originalTime = world.getTimeOfDay();

  const air = BlockPermutation.resolve("minecraft:air");
  const stone = BlockPermutation.resolve("minecraft:stone");
  const torch = BlockPermutation.resolve("minecraft:torch");

  const put = (x, y, z, perm) => {
    try { dim.setBlockPermutation({ x, y, z }, perm); } catch (e) { /* unloaded */ }
  };
  const sample = (label) => {
    let total = "ERR", sky = "ERR";
    try { total = dim.getLightLevel(test); } catch (e) { /* ignore */ }
    try { sky = dim.getSkyLightLevel(test); } catch (e) { /* ignore */ }
    log("  " + label.padEnd(26) + " total=" + String(total).padStart(2) +
        " sky=" + String(sky).padStart(2) +
        "   blockLight==total? " + (sky === 0 ? "YES (sky is 0)" : "no, sky masks it"));
  };

  log("L3 LIGHT MATRIX building rig at " + ox + "," + oy + "," + oz + " (restores itself)");

  try {
    // Save everything we are about to touch.
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      for (let dy = 0; dy <= HEIGHT; dy++) {
        for (let dz = -RADIUS; dz <= RADIUS; dz++) {
          const loc = { x: ox + dx, y: oy + dy, z: oz + dz };
          const b = safeBlock(dim, loc);
          if (!b || !b.isValid) continue;
          saved.push([loc, b.permutation]);
        }
      }
    }
    if (saved.length === 0) { log("  aborted: region not loaded"); return; }

    // Clear the volume, then lay a floor so the test position has ground.
    for (const [loc] of saved) put(loc.x, loc.y, loc.z, air);
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      for (let dz = -RADIUS; dz <= RADIUS; dz++) put(ox + dx, oy, oz + dz, stone);
    }
    await system.waitTicks(10);

    const buildShell = (present) => {
      const perm = present ? stone : air;
      for (let dy = 1; dy <= HEIGHT; dy++) {
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          for (let dz = -RADIUS; dz <= RADIUS; dz++) {
            const isEdge = Math.abs(dx) === RADIUS || Math.abs(dz) === RADIUS;
            const isRoof = dy === HEIGHT;
            if (isEdge || isRoof) put(ox + dx, oy + dy, oz + dz, perm);
          }
        }
      }
    };

    for (const sheltered of [false, true]) {
      buildShell(sheltered);
      for (const lit of [false, true]) {
        // Torch one block from the test position, inside the interior.
        put(ox + 1, oy + 1, oz, lit ? torch : air);
        await system.waitTicks(10);
        for (const [timeName, timeValue] of [["noon", 6000], ["midnight", 18000]]) {
          world.setTimeOfDay(timeValue);
          await system.waitTicks(10);
          sample((sheltered ? "sealed" : "open  ") + (lit ? " +torch" : "       ") + " @" + timeName);
        }
      }
    }

    log("L3 done. Read it as: total = max(blockLight, effectiveSky).");
    log("   If sealed rows show sky=0, then total IS block light there.");
    log("   Compare open@noon vs open@midnight to see the sky term darken.");
  } catch (e) {
    log("L3 FAILED: " + e);
  } finally {
    for (const [loc, perm] of saved) {
      try { dim.setBlockPermutation(loc, perm); } catch (e) { /* ignore */ }
    }
    world.setTimeOfDay(originalTime);
    log("L3 restored " + saved.length + " block(s) and time=" + originalTime);
  }
}

/** Dump the player's spawn point, distinguishing "unset" from a real location. */
function reportSpawn(player, label) {
  let sp = "ERR";
  try {
    const p = player.getSpawnPoint();
    sp = p === undefined
      ? "UNDEFINED (never set)"
      : p.x + "," + p.y + "," + p.z + " in " + p.dimension.id;
  } catch (e) { sp = "THREW " + e; }

  let dflt = "ERR";
  try {
    const d = world.getDefaultSpawnLocation();
    // Y 32767 is the documented "height not fixed" sentinel, not a real height.
    dflt = d.x + "," + (d.y === 32767 ? "32767=auto" : d.y) + "," + d.z;
  } catch (e) { dflt = "THREW " + e; }

  // Height range matters: setSpawnPoint throws LocationOutOfWorldBoundariesError
  // outside it, and the Nether ceiling (y=128) is out of bounds even though you
  // can stand on it. Without this, a roof test looks like "Nether unsupported".
  let range = "?";
  let inRange = "?";
  try {
    const r = player.dimension.heightRange;
    range = r.min + ".." + r.max;
    const y = Math.floor(player.location.y);
    inRange = y >= r.min && y <= r.max ? "yes" : "NO - y=" + y + " is out of bounds";
  } catch (e) { range = "ERR " + e; }

  log("H1 [" + label + "] getSpawnPoint()=" + sp +
      " | standing in " + player.dimension.id +
      " y=" + Math.floor(player.location.y) +
      " (legal " + range + ", in range: " + inRange + ")" +
      " | worldDefaultSpawn=" + dflt);
}

world.afterEvents.worldLoad.subscribe(() => {
  log("loaded, tick=" + system.currentTick + " -- run /scriptevent qolprobe:scan near a dispenser+cauldron rig");

  // ---- U1 / U2 / U3 / U4 ----------------------------------------------------
  world.afterEvents.entitySpawn.subscribe((ev) => {
    let e;
    try { e = ev.entity; } catch (err) { return; }
    if (!e || e.typeId !== "minecraft:item") return;

    let stack;
    try {
      const ic = e.getComponent("minecraft:item");
      stack = ic && ic.itemStack;
    } catch (err) { /* ignore */ }

    const watched = !!stack && WATCH.has(stack.typeId);
    if (!watched && spawnLogBudget <= 0) return;
    if (!watched) spawnLogBudget--;

    let vel = "ERR";
    try { vel = v3(e.getVelocity()); } catch (err) { /* ignore */ }

    log("U1 ITEM SPAWN tick=" + system.currentTick + " cause=" + ev.cause +
        " item=" + (stack ? stack.typeId + "x" + stack.amount : "?") +
        " loc=" + v3(e.location) + " vel=" + vel);

    const dim = e.dimension;
    const cell = { x: Math.floor(e.location.x), y: Math.floor(e.location.y), z: Math.floor(e.location.z) };
    const cands = findDispensers(dim, cell);

    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      let trig = "?";
      try { trig = String(c.block.permutation.getState("triggered_bit")); } catch (err) { /* ignore */ }
      log("  U5 dispenser @" + c.block.x + "," + c.block.y + "," + c.block.z +
          " assumedFacing=" + c.assumedFacing + " actualFacing=" + c.actualFacing +
          " mappingAgrees=" + c.agrees + " triggered_bit=" + trig);

      const rig = registerRig(dim, c.block);
      const now = snapshot(c.block);
      if (rig) {
        log("  U3 vs PREV-TICK snapshot: " + diff(rig.snapPrev, now));
        log("  U3 vs SAME-TICK snapshot: " + diff(rig.snapCur, now));
      }

      const f = FACING[c.actualFacing];
      const target = f && safeBlock(dim, { x: c.block.x + f.x, y: c.block.y + f.y, z: c.block.z + f.z });
      if (target && target.isValid) {
        const isC = target.matches("minecraft:cauldron");
        log("  target=" + target.typeId + (isC ? " (CAULDRON) " + dumpCauldron(target) : ""));
      }
    }

    // ---- U2: one-shot, opt-in removal test -----------------------------------
    if (armRemoval) {
      armRemoval = false;
      let threw = false, errMsg = "";
      try { e.remove(); } catch (err) { threw = true; errMsg = String(err); }
      let stillValid = "?";
      try { stillValid = String(e.isValid); } catch (err) { stillValid = "threw:" + err; }
      const verdict = threw ? "THREW" : (stillValid === "false" ? "SUCCEEDED" : "SILENT NO-OP <-- DUPE RISK");
      log("  U2 remove() verdict=" + verdict + " threw=" + threw +
          (errMsg ? " err=" + errMsg : "") + " isValidAfter=" + stillValid);
    }
  });

  // free negative filter, if it fires at all
  world.afterEvents.entityItemDrop.subscribe((ev) => {
    log("U7 entityItemDrop FIRED by " + (ev.entity && ev.entity.typeId) +
        " items=" + (ev.items && ev.items.length));
  });

  // ---- U5: triggered_bit waveform + rolling container snapshots --------------
  system.runInterval(() => {
    const tick = system.currentTick;
    for (const entry of rigs) {
      const k = entry[0], rig = entry[1];
      const b = safeBlock(rig.dim, { x: rig.x, y: rig.y, z: rig.z });
      if (!b || !b.isValid) continue;
      let trig;
      try {
        if (!b.matches("minecraft:dispenser")) { rigs.delete(k); continue; }
        trig = b.permutation.getState("triggered_bit");
      } catch (e) { continue; }

      if (rig.lastTriggered !== undefined && trig !== rig.lastTriggered) {
        log("U5 triggered_bit " + rig.lastTriggered + " -> " + trig +
            " tick=" + tick + " @" + rig.x + "," + rig.y + "," + rig.z);
      }
      rig.lastTriggered = trig;
      rig.snapPrev = rig.snapCur;
      rig.snapCur = snapshot(b);
      rig.snapTick = tick;
    }
  }, 1);

  // ---- commands -------------------------------------------------------------
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id.indexOf("qolprobe:") !== 0) return;
    const cmd = ev.id.slice("qolprobe:".length);
    const src = ev.sourceEntity;

    if (cmd === "arm") {
      armRemoval = true;
      log("U2 removal test ARMED for the next item spawn");
      return;
    }

    // ---- L1: light semantics --------------------------------------------------
    // getLightLevel() is documented only as "total brightness"; getSkyLightLevel()
    // as the sky component. Hostile spawning keys off BLOCK light, and sky light
    // does not prevent night spawns. We need to know whether block light is
    // recoverable as (total - sky), or whether total is already the effective
    // max(block, sky*darken). Run this in four places, at noon AND midnight:
    //   enclosed dark | enclosed torch-lit | open sky | open sky under an overhang
    if (cmd === "light") {
      if (!src) { log("light: run this as a player"); return; }
      const dim = src.dimension;
      const feet = { x: Math.floor(src.location.x), y: Math.floor(src.location.y), z: Math.floor(src.location.z) };
      const timeOfDay = world.getTimeOfDay();
      // Sky exposure decides whether effective sky light can mask block light.
      // Enclosed (raw sky 0) => total IS block light. Open sky => it is not.
      let topY = "?";
      try {
        const top = dim.getTopmostBlock({ x: feet.x, z: feet.z });
        topY = top ? String(top.y) : "none";
      } catch (e) { topY = "ERR " + e; }
      const exposed = (typeof topY === "string" && topY !== "?" && topY !== "none")
        ? (Number(topY) <= feet.y ? "OPEN SKY" : "sheltered (top=" + topY + ")")
        : "unknown";
      log("L1 LIGHT timeOfDay=" + timeOfDay + " (0=dawn 6000=noon 13000-23000=night)" +
          " tick=" + system.currentTick + " topmostY=" + topY + " -> " + exposed);

      for (let dy = -1; dy <= 1; dy++) {
        const p = { x: feet.x, y: feet.y + dy, z: feet.z };
        let total = "ERR", sky = "ERR";
        try { total = dim.getLightLevel(p); } catch (e) { total = "ERR " + e; }
        try { sky = dim.getSkyLightLevel(p); } catch (e) { sky = "ERR " + e; }
        const derived = (typeof total === "number" && typeof sky === "number") ? total - sky : "?";
        const label = dy === -1 ? "below" : dy === 0 ? "FEET " : "head ";
        log("  " + label + " @" + p.x + "," + p.y + "," + p.z +
            " total=" + total + " sky=" + sky + " (total-sky)=" + derived);
      }
      return;
    }

    // ---- L3: automated light matrix -------------------------------------------
    // Builds its own test rig, sweeps (shelter x torch x time), samples, then
    // restores every block and the original time. Uses only stable APIs, so it
    // needs no GameTest, no experiments and no .mcstructure authoring.
    if (cmd === "lightmatrix") {
      if (!src) { log("lightmatrix: run this as a player"); return; }
      system.run(() => { void runLightMatrix(src); });
      return;
    }

    // ---- H1: respawn anchor unknowns ------------------------------------------
    // The whole Hearthstone design rests on pre-emptively assigning a spawn
    // point rather than intercepting death. Three things decide whether that
    // works, and none are answerable from the type definitions:
    //   does getSpawnPoint() return undefined for someone who never slept?
    //   does setSpawnPoint() accept a Nether/End location and survive a respawn?
    //   does breaking a bed clear the spawn point back to undefined?
    if (cmd === "spawn") {
      if (!src) { log("spawn: run this as a player"); return; }
      reportSpawn(src, "current");
      return;
    }

    // Sets your spawn to where you stand. Reversible with qolprobe:clearspawn.
    if (cmd === "setspawn") {
      if (!src) { log("setspawn: run this as a player"); return; }
      system.run(() => {
        try {
          const y = Math.floor(src.location.y);
          const r = src.dimension.heightRange;
          if (y < r.min || y > r.max) {
            // Refuse rather than throw: standing on the Nether roof at y=128 is
            // out of bounds, and the resulting error reads as "Nether
            // unsupported" when it only means "that altitude is illegal".
            log("H1 REFUSED: y=" + y + " is outside " + src.dimension.id +
                " bounds " + r.min + ".." + r.max + ". Move to a legal height and retry.");
            return;
          }
          const loc = {
            x: Math.floor(src.location.x),
            y,
            z: Math.floor(src.location.z),
            dimension: src.dimension,
          };
          src.setSpawnPoint(loc);
          log("H1 setSpawnPoint(" + loc.x + "," + loc.y + "," + loc.z +
              " in " + src.dimension.id + ") did not throw");
          reportSpawn(src, "after set");
        } catch (e) {
          log("H1 setSpawnPoint THREW: " + e);
        }
      });
      return;
    }

    if (cmd === "clearspawn") {
      if (!src) { log("clearspawn: run this as a player"); return; }
      system.run(() => {
        try {
          src.setSpawnPoint(undefined);
          log("H1 cleared spawn point");
          reportSpawn(src, "after clear");
        } catch (e) {
          log("H1 clear THREW: " + e);
        }
      });
      return;
    }

    // ---- L2: solidity flags ---------------------------------------------------
    // Block has no isSolid. A mob needs a full opaque top face beneath it, so we
    // need an empirical proxy. Look at a block and run this; compare stone vs
    // slab vs torch vs glass vs leaves vs water to see which flags separate them.
    if (cmd === "solid") {
      if (!src) { log("solid: run this as a player"); return; }
      const hit = src.getBlockFromViewDirection ? src.getBlockFromViewDirection({ maxDistance: 12 }) : undefined;
      const b = hit && hit.block;
      if (!b) { log("L2 solid: look at a block within 12 blocks first"); return; }
      let liquidBlocking = "?";
      try { liquidBlocking = String(b.isLiquidBlocking("Water")); } catch (e) { liquidBlocking = "ERR " + e; }
      let tags = "?";
      try { tags = JSON.stringify(b.getTags()); } catch (e) { tags = "ERR"; }
      let states = "?";
      try { states = JSON.stringify(b.permutation.getAllStates()); } catch (e) { states = "ERR"; }
      log("L2 SOLID " + b.typeId + " @" + b.x + "," + b.y + "," + b.z +
          " isAir=" + b.isAir + " isLiquid=" + b.isLiquid +
          " isWaterlogged=" + b.isWaterlogged +
          " isLiquidBlocking(Water)=" + liquidBlocking);
      log("  tags=" + tags + " states=" + states);
      return;
    }

    if (cmd === "status") {
      log("status: " + rigs.size + " rig(s) registered, removalArmed=" + armRemoval);
      for (const entry of rigs) {
        const r = entry[1];
        log("  " + entry[0] + " facing=" + r.facing + " triggered=" + r.lastTriggered +
            " slots=" + JSON.stringify(r.snapCur));
      }
      return;
    }

    if (cmd === "scan") {
      if (!src) { log("scan: run this as a player"); return; }
      const dim = src.dimension;
      const o = { x: Math.floor(src.location.x), y: Math.floor(src.location.y), z: Math.floor(src.location.z) };
      const R = 8;
      let dispensers = 0, cauldrons = 0, pairs = 0;
      for (let dx = -R; dx <= R; dx++)
      for (let dy = -4; dy <= 4; dy++)
      for (let dz = -R; dz <= R; dz++) {
        const b = safeBlock(dim, { x: o.x + dx, y: o.y + dy, z: o.z + dz });
        if (!b || !b.isValid) continue;
        let isDisp = false, isCauldron = false;
        try {
          isDisp = b.matches("minecraft:dispenser");
          isCauldron = b.matches("minecraft:cauldron");
        } catch (e) { continue; }

        if (isCauldron) {
          cauldrons++;
          log("  CAULDRON @" + b.x + "," + b.y + "," + b.z + " " + dumpCauldron(b));
        }
        if (!isDisp) continue;
        dispensers++;
        let f;
        try { f = b.permutation.getState("facing_direction"); } catch (e) { continue; }
        const v = FACING[f];
        const t = v && safeBlock(dim, { x: b.x + v.x, y: b.y + v.y, z: b.z + v.z });
        const facesCauldron = !!t && t.isValid && t.matches("minecraft:cauldron");
        log("  DISPENSER @" + b.x + "," + b.y + "," + b.z + " facing=" + f +
            " faces=" + (t ? t.typeId : "?") + (facesCauldron ? "  <-- RIG" : "") +
            " slots=" + JSON.stringify(snapshot(b)));
        if (facesCauldron) { registerRig(dim, b); pairs++; }
      }
      log("scan done: " + dispensers + " dispenser(s), " + cauldrons + " cauldron(s), " + pairs + " rig(s) registered");
    }
  });
});

// ---------------------------------------------------------------------------
// D1-D3: death behaviour, for the Graves pack.
//
//   /scriptevent qolprobe:death    arm; then die. Logs, for the next player
//                                  death: whether the inventory container is
//                                  still readable inside entityDie and how
//                                  many slots are filled, the same for armour,
//                                  which stacks carry keepOnDeath, and every
//                                  item entity that spawns within 6 blocks in
//                                  the surrounding ticks - with tick numbers,
//                                  so the ordering of drops vs entityDie is
//                                  measured rather than assumed.
//   /scriptevent qolprobe:keepflag flag every stack you carry keepOnDeath=true
//                                  (the Graves substrate). Die again with the
//                                  probe armed and compare.
// ---------------------------------------------------------------------------
world.afterEvents.worldLoad.subscribe(() => {
  let armed = false;
  let watching = null; // { dimId, loc, tick, name }
  const recentSpawns = []; // { tick, typeId, amount, loc }

  world.afterEvents.entitySpawn.subscribe((ev) => {
    let e;
    try { e = ev.entity; } catch (err) { return; }
    if (!e || e.typeId !== "minecraft:item") return;
    if (!armed && !watching) return;
    let stack;
    try { stack = e.getComponent("minecraft:item")?.itemStack; } catch (err) { stack = undefined; }
    recentSpawns.push({
      tick: system.currentTick,
      typeId: stack ? stack.typeId : "?",
      amount: stack ? stack.amount : 0,
      loc: e.location,
      dimId: e.dimension.id,
    });
    while (recentSpawns.length > 200) recentSpawns.shift();
  });

  world.afterEvents.entityDie.subscribe((ev) => {
    if (!armed) return;
    const p = ev.deadEntity;
    if (!p || p.typeId !== "minecraft:player") return;
    armed = false;
    const tick = system.currentTick;
    log("D1 DEATH " + p.name + " tick=" + tick + " cause=" + ev.damageSource.cause +
        " @" + v3(p.location) + " onGround=" + p.isOnGround + " keepInventory=" + world.gameRules.keepInventory);

    let filled = 0, kept = 0, size = "?";
    try {
      const c = p.getComponent("minecraft:inventory")?.container;
      size = c ? c.size : "NO CONTAINER";
      if (c) for (let i = 0; i < c.size; i++) {
        const it = c.getItem(i);
        if (!it) continue;
        filled++;
        if (it.keepOnDeath) kept++;
      }
      log("D2 inventory readable: size=" + size + " filled=" + filled + " keepOnDeath=" + kept);
    } catch (err) { log("D2 inventory READ THREW: " + err); }
    try {
      const eq = p.getComponent("minecraft:equippable");
      const slots = ["Head", "Chest", "Legs", "Feet", "Offhand"];
      const worn = slots.filter((s) => { try { return !!eq.getEquipment(s); } catch (e2) { return false; } });
      log("D2 equipment readable: worn=" + JSON.stringify(worn));
    } catch (err) { log("D2 equipment READ THREW: " + err); }

    watching = { dimId: p.dimension.id, loc: p.location, tick, name: p.name };
    // Report drops seen before this event, then keep listening for two more ticks.
    const report = () => {
      const near = recentSpawns.filter((s) => s.dimId === watching.dimId &&
        Math.abs(s.loc.x - watching.loc.x) < 6 && Math.abs(s.loc.y - watching.loc.y) < 6 && Math.abs(s.loc.z - watching.loc.z) < 6);
      log("D3 item spawns within 6 blocks, ticks " + (tick - 2) + ".." + (tick + 2) + ": " + near.length);
      for (const s of near) log("  tick=" + s.tick + (s.tick < tick ? " (BEFORE entityDie)" : s.tick === tick ? " (SAME tick)" : " (AFTER)") +
                                " " + s.typeId + "x" + s.amount + " @" + v3(s.loc));
      watching = null;
      recentSpawns.length = 0;
    };
    system.runTimeout(report, 3);
  });

  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id === "qolprobe:death") {
      armed = true;
      recentSpawns.length = 0;
      log("D1 death probe ARMED - now die (fall, lava, /kill @s)");
      return;
    }
    if (ev.id === "qolprobe:keepflag") {
      const p = ev.sourceEntity;
      if (!p || p.typeId !== "minecraft:player") { log("keepflag: run this as a player"); return; }
      let n = 0;
      try {
        const c = p.getComponent("minecraft:inventory").container;
        for (let i = 0; i < c.size; i++) {
          const it = c.getItem(i);
          if (!it) continue;
          it.keepOnDeath = true;
          c.setItem(i, it);
          n++;
        }
        log("keepflag: flagged " + n + " stack(s) keepOnDeath=true. Arm qolprobe:death and die to compare.");
      } catch (err) { log("keepflag THREW: " + err); }
    }
  });
});

// ---------------------------------------------------------------------------
// G1-G3: hurt-event behaviour, for the Guardian pack.
//
//   /scriptevent qolprobe:hurt    watch the caller's own hurt events for 60s.
//                                 For each: the before-event's cause and
//                                 `damage`, the after-event's `damage`, and the
//                                 health actually lost - so three questions are
//                                 measured rather than assumed:
//     G1 is before.damage pre- or post-armour? Wear full iron, take a zombie
//        hit, compare before.damage to the health lost. Equal -> post-armour,
//        and the panel's "50%" means half of what would have landed.
//     G2 does entityHurt fire for the void at all, and with what cause? There
//        is no `void` in EntityDamageCause 2.9.0. Jump into the void watching
//        (creative flight back out, or accept the death).
//     G3 does a fractional `damage` land as a fraction, or round?
//   Log-only; nothing is modified. Guardian should be DISABLED while probing,
//   or its own writes show up in the after-event numbers.
// ---------------------------------------------------------------------------
world.afterEvents.worldLoad.subscribe(() => {
  const watching = new Map(); // playerId -> { until, name, pending: {tick, cause, before, health} }

  const health = (p) => {
    try { return p.getComponent("minecraft:health").currentValue; } catch (e) { return NaN; }
  };

  world.beforeEvents.entityHurt.subscribe((ev) => {
    const p = ev.hurtEntity;
    if (!p || p.typeId !== "minecraft:player") return;
    const w = watching.get(p.id);
    if (!w) return;
    const rec = { tick: system.currentTick, cause: ev.damageSource.cause, before: ev.damage,
                  health: health(p), attacker: ev.damageSource.damagingEntity ? ev.damageSource.damagingEntity.typeId : "-" };
    w.pending = rec;
    log("G1 BEFORE tick=" + rec.tick + " cause=" + rec.cause + " damage=" + rec.before +
        " health=" + rec.health + " by=" + rec.attacker + " y=" + p.location.y.toFixed(1));
  });

  world.afterEvents.entityHurt.subscribe((ev) => {
    const p = ev.hurtEntity;
    if (!p || p.typeId !== "minecraft:player") return;
    const w = watching.get(p.id);
    if (!w) return;
    const after = ev.damage;
    const h = health(p);
    const b = w.pending && w.pending.tick >= system.currentTick - 1 ? w.pending : null;
    const lost = b ? (b.health - h) : NaN;
    log("G1 AFTER  tick=" + system.currentTick + " cause=" + ev.damageSource.cause + " damage=" + after +
        " health=" + h + (b ? " | before.damage=" + b.before + " lost=" + lost.toFixed(2) +
        (Math.abs(b.before - lost) < 0.01 ? " => before.damage is what LANDS (post-armour)" :
         Math.abs(after - lost) < 0.01 ? " => after.damage is what lands; before.damage differs (pre-armour?)" :
         " => neither matches health lost; armour/absorption/regen in play") : " | NO before-event seen for this hit"));
    w.pending = null;
  });

  world.afterEvents.entityDie.subscribe((ev) => {
    const p = ev.deadEntity;
    if (!p || p.typeId !== "minecraft:player" || !watching.has(p.id)) return;
    log("G2 DIED cause=" + ev.damageSource.cause + " y=" + p.location.y.toFixed(1) +
        (watching.get(p.id).pending ? " (a before-event preceded it)" : " (NO before-event for the killing blow)"));
  });

  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "qolprobe:hurt") return;
    const p = ev.sourceEntity;
    if (!p || p.typeId !== "minecraft:player") { log("hurt: run this as a player"); return; }
    const until = system.currentTick + 1200;
    watching.set(p.id, { until, name: p.name, pending: null });
    log("G1 hurt probe WATCHING " + p.name + " for 60s (health now " + health(p) + "). Disable Guardian first.");
    system.runTimeout(() => { if (watching.get(p.id) && watching.get(p.id).until === until) { watching.delete(p.id); log("hurt probe: done watching " + p.name); } }, 1200);
  });
});

// ---------------------------------------------------------------------------
// F1: what getTopmostBlock reports for the column you stand in, for the
// Fluidworks Rain Collector. Stand on the funnel's future spot and run it.
//   /scriptevent qolprobe:sky
// ---------------------------------------------------------------------------
world.afterEvents.worldLoad.subscribe(() => {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "qolprobe:sky") return;
    const p = ev.sourceEntity;
    if (!p || p.typeId !== "minecraft:player") { log("sky: run this as a player"); return; }
    const feet = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
    let top;
    try { top = p.dimension.getTopmostBlock({ x: feet.x, z: feet.z }); } catch (e) { log("F1 getTopmostBlock THREW: " + e); return; }
    log("F1 SKY feet=" + feet.x + "," + feet.y + "," + feet.z +
        " topmost=" + (top ? top.typeId + " @y=" + top.y : "undefined") +
        " -> " + (!top || top.y <= feet.y - 1 ? "OPEN above the block you stand on" : "covered"));
  });
});
