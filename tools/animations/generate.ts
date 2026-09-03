/**
 * Generate every animation file in the repo.
 *
 *   npm run animations
 *
 * Runs after `npm run models`: each set reads the generated geometry back so
 * its bone names are checked, not assumed.
 *
 * Conventions:
 *   - Walk cycles follow vanilla: rotation driven by
 *     `query.modified_distance_moved` so stride length matches ground covered,
 *     scaled by `query.modified_move_speed` so it fades to nothing at rest.
 *   - Idle motion runs on `query.life_time` so it never restarts on a state
 *     change; one-shots are keyframed over an explicit length and end on
 *     `query.all_animations_finished`.
 *   - Angles are degrees, Bedrock's bone convention: +x pitches the front
 *     down, +y yaws to the model's left, +z rolls.
 *   - Script cannot set Molang variables, so one-shots the pack would fire
 *     from script are gated on `query.property('concept:<name>')`, a bool
 *     entity property the client entity would declare.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildAnimations,
  buildControllers,
  geometryBones,
  type AnimationSetSpec,
} from "./animation";

const ROOT = resolve(__dirname, "../..");

function bonesOf(geometryPath: string): string[] {
  return geometryBones(JSON.parse(readFileSync(resolve(ROOT, geometryPath), "utf8")));
}

function write(relPath: string, json: object | undefined): void {
  if (!json) return;
  const path = resolve(ROOT, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(relPath);
}

function emit(dir: string, file: string, set: AnimationSetSpec): void {
  write(`${dir}/animations/${file}.animation.json`, buildAnimations(set));
  write(`${dir}/animation_controllers/${file}.animation_controllers.json`, buildControllers(set));
}

// Vanilla's stride: one full cycle every ~9.4 blocks at this multiplier.
const STRIDE = "query.modified_distance_moved * 38.17";
const SPEED = "query.modified_move_speed";
const walk = (amplitude: number, sign = 1) =>
  `${sign < 0 ? "-" : ""}math.cos(${STRIDE}) * ${SPEED} * ${amplitude}`;
const MOVING = "query.modified_move_speed > 0.05";
const STOPPED = "query.modified_move_speed <= 0.05";
const FINISHED = "query.all_animations_finished";

// ===========================================================================
// Concept entities (docs/design/entities.md), under concepts/entities/.
// ===========================================================================

const CONCEPTS = "concepts/entities";

// ---------------------------------------------------------------------------
// Decoy dummy: sways on its stake; a hit rocks the body back and the head
// further, then both settle.
// ---------------------------------------------------------------------------

emit(CONCEPTS, "decoy", {
  name: "concept_decoy",
  bones: bonesOf(`${CONCEPTS}/models/decoy.geo.json`),
  animations: [
    {
      key: "idle",
      loop: true,
      bones: {
        body: { rotation: [0, 0, "math.sin(query.life_time * 80) * 1.5"] },
        head: {
          rotation: [
            "math.sin(query.life_time * 80 + 40) * 2",
            0,
            "math.sin(query.life_time * 80 + 40) * 3",
          ],
        },
      },
    },
    {
      key: "hit",
      length: 0.5,
      bones: {
        body: {
          rotation: [
            [0, [0, 0, 0]],
            [0.1, [-18, 0, 0]],
            [0.3, [8, 0, 0]],
            [0.5, [0, 0, 0]],
          ],
        },
        head: {
          rotation: [
            [0, [0, 0, 0]],
            [0.1, [-28, 0, 0]],
            [0.3, [14, 0, 0]],
            [0.5, [0, 0, 0]],
          ],
        },
      },
    },
  ],
  controllers: [
    {
      key: "general",
      initial: "idle",
      states: {
        idle: { animations: ["idle"], transitions: [["hit", "query.hurt_time > 0"]] },
        hit: { animations: ["idle", "hit"], transitions: [["idle", FINISHED]] },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Patrol golem: a heavy biped. Legs and arms swing in opposition, the body
// rises on each step; at rest the head scans; the attack is an overhead
// slam with the right arm.
// ---------------------------------------------------------------------------

emit(CONCEPTS, "patrol_golem", {
  name: "concept_patrol_golem",
  bones: bonesOf(`${CONCEPTS}/models/patrol_golem.geo.json`),
  animations: [
    {
      key: "idle",
      loop: true,
      bones: {
        head: { rotation: [0, "math.sin(query.life_time * 30) * 10", 0] },
        body: { position: [0, "math.sin(query.life_time * 60) * 0.25", 0] },
      },
    },
    {
      key: "walk",
      loop: true,
      bones: {
        left_leg: { rotation: [walk(55), 0, 0] },
        right_leg: { rotation: [walk(55, -1), 0, 0] },
        left_arm: { rotation: [walk(30, -1), 0, 0] },
        right_arm: { rotation: [walk(30), 0, 0] },
        body: {
          position: [0, `math.abs(math.cos(${STRIDE})) * ${SPEED} * 0.6`, 0],
        },
      },
    },
    {
      key: "attack",
      length: 0.6,
      bones: {
        right_arm: {
          rotation: [
            [0, [0, 0, 0]],
            [0.15, [-120, 0, 0]],
            [0.3, [25, 0, 0]],
            [0.6, [0, 0, 0]],
          ],
        },
        body: {
          rotation: [
            [0, [0, 0, 0]],
            [0.3, [8, 0, 0]],
            [0.6, [0, 0, 0]],
          ],
        },
      },
    },
  ],
  controllers: [
    {
      key: "general",
      initial: "idle",
      states: {
        idle: {
          animations: ["idle"],
          transitions: [
            ["attack", "variable.attack_time > 0"],
            ["walk", MOVING],
          ],
        },
        walk: {
          animations: ["walk"],
          transitions: [
            ["attack", "variable.attack_time > 0"],
            ["idle", STOPPED],
          ],
          blendTransition: 0.2,
        },
        attack: { animations: ["walk", "attack"], transitions: [["idle", FINISHED]] },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Runner: hovers with a slow bob and a fast wing beat; leans into travel;
// nods when it hands an item over.
// ---------------------------------------------------------------------------

emit(CONCEPTS, "runner", {
  name: "concept_runner",
  bones: bonesOf(`${CONCEPTS}/models/runner.geo.json`),
  animations: [
    {
      key: "hover",
      loop: true,
      bones: {
        body: { position: [0, "math.sin(query.life_time * 200) * 0.6", 0] },
        head: { rotation: [0, 0, "math.sin(query.life_time * 120) * 3"] },
        left_wing: { rotation: [0, 0, "math.sin(query.life_time * 1600) * 25"] },
        right_wing: { rotation: [0, 0, "-math.sin(query.life_time * 1600) * 25"] },
      },
    },
    {
      key: "dart",
      loop: true,
      bones: {
        body: { rotation: [`${SPEED} * 25`, 0, 0] },
        left_wing: { rotation: [0, 0, "math.sin(query.life_time * 2400) * 30"] },
        right_wing: { rotation: [0, 0, "-math.sin(query.life_time * 2400) * 30"] },
      },
    },
    {
      key: "deliver",
      length: 0.8,
      bones: {
        head: {
          rotation: [
            [0, [0, 0, 0]],
            [0.2, [20, 0, 0]],
            [0.4, [-5, 0, 0]],
            [0.8, [0, 0, 0]],
          ],
        },
        body: {
          position: [
            [0, [0, 0, 0]],
            [0.2, [0, -1, 0]],
            [0.4, [0, 1, 0]],
            [0.8, [0, 0, 0]],
          ],
        },
      },
    },
  ],
  controllers: [
    {
      key: "general",
      initial: "hover",
      states: {
        hover: {
          animations: ["hover"],
          transitions: [
            ["deliver", "query.property('concept:delivering')"],
            ["dart", MOVING],
          ],
        },
        dart: {
          animations: ["hover", "dart"],
          transitions: [["hover", STOPPED]],
          blendTransition: 0.15,
        },
        deliver: { animations: ["hover", "deliver"], transitions: [["hover", FINISHED]] },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Hatchling: breathes, wags, glances about; a quadruped trot; and a happy
// hop with two wing flaps when it is fed.
// ---------------------------------------------------------------------------

// Shipped: packages/hatchling. Property names are the pack's.
const HATCHLING_RP = "packages/hatchling/resource_pack";

emit(HATCHLING_RP, "hatchling", {
  name: "hatchling",
  bones: bonesOf(`${HATCHLING_RP}/models/entity/hatchling.geo.json`),
  animations: [
    {
      key: "idle",
      loop: true,
      bones: {
        body: { scale: [1, "1 + math.sin(query.life_time * 90) * 0.02", 1] },
        head: {
          rotation: [
            "math.sin(query.life_time * 40) * 4",
            "math.sin(query.life_time * 25) * 6",
            0,
          ],
        },
        tail: { rotation: [0, "math.sin(query.life_time * 140) * 12", 0] },
        tail_tip: { rotation: [0, "math.sin(query.life_time * 140 - 60) * 18", 0] },
        left_wing: { rotation: [0, 0, "math.sin(query.life_time * 300) * 5"] },
        right_wing: { rotation: [0, 0, "-math.sin(query.life_time * 300) * 5"] },
      },
    },
    {
      key: "walk",
      loop: true,
      bones: {
        front_left_leg: { rotation: [walk(60), 0, 0] },
        back_right_leg: { rotation: [walk(60), 0, 0] },
        front_right_leg: { rotation: [walk(60, -1), 0, 0] },
        back_left_leg: { rotation: [walk(60, -1), 0, 0] },
        head: { rotation: [`math.abs(math.cos(${STRIDE})) * ${SPEED} * 6`, 0, 0] },
        tail: { rotation: [0, `math.sin(query.life_time * 400) * ${SPEED} * 15`, 0] },
      },
    },
    {
      key: "flap",
      length: 0.6,
      bones: {
        body: {
          position: [
            [0, [0, 0, 0]],
            [0.15, [0, 2.5, 0]],
            [0.35, [0, 0, 0]],
            [0.5, [0, 1, 0]],
            [0.6, [0, 0, 0]],
          ],
        },
        left_wing: {
          rotation: [
            [0, [0, 0, 0]],
            [0.15, [0, 0, -45]],
            [0.3, [0, 0, 0]],
            [0.45, [0, 0, -45]],
            [0.6, [0, 0, 0]],
          ],
        },
        right_wing: {
          rotation: [
            [0, [0, 0, 0]],
            [0.15, [0, 0, 45]],
            [0.3, [0, 0, 0]],
            [0.45, [0, 0, 45]],
            [0.6, [0, 0, 0]],
          ],
        },
        head: {
          rotation: [
            [0, [0, 0, 0]],
            [0.15, [-15, 0, 0]],
            [0.6, [0, 0, 0]],
          ],
        },
      },
    },
  ],
  controllers: [
    {
      key: "general",
      initial: "idle",
      states: {
        idle: {
          animations: ["idle"],
          transitions: [
            ["flap", "query.property('hatchling:happy')"],
            ["walk", MOVING],
          ],
        },
        walk: {
          animations: ["idle", "walk"],
          transitions: [["idle", STOPPED]],
          blendTransition: 0.2,
        },
        flap: { animations: ["idle", "flap"], transitions: [["idle", FINISHED]] },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Messenger: a perched pigeon jerks its head about; walking bobs it; in the
// air the wings beat, the legs tuck and the tail fans down.
// ---------------------------------------------------------------------------

emit(CONCEPTS, "messenger", {
  name: "concept_messenger",
  bones: bonesOf(`${CONCEPTS}/models/messenger.geo.json`),
  animations: [
    {
      key: "idle",
      loop: true,
      length: 3.2,
      bones: {
        head: {
          rotation: [
            [0, [0, 0, 0]],
            [0.8, [0, 0, 0]],
            [0.9, [0, 35, 0]],
            [2.0, [0, 35, 0]],
            [2.1, [0, -20, 0]],
            [3.0, [0, -20, 0]],
            [3.1, [0, 0, 0]],
          ],
        },
        tail: { rotation: ["math.sin(query.life_time * 70) * 4", 0, 0] },
      },
    },
    {
      key: "walk",
      loop: true,
      bones: {
        left_leg: { rotation: [walk(50), 0, 0] },
        right_leg: { rotation: [walk(50, -1), 0, 0] },
        head: { rotation: [`math.cos(${STRIDE}) * ${SPEED} * 15`, 0, 0] },
      },
    },
    {
      key: "fly",
      loop: true,
      length: 0.4,
      bones: {
        left_wing: {
          rotation: [
            [0, [0, 0, 70]],
            [0.2, [0, 0, -15]],
            [0.4, [0, 0, 70]],
          ],
        },
        right_wing: {
          rotation: [
            [0, [0, 0, -70]],
            [0.2, [0, 0, 15]],
            [0.4, [0, 0, -70]],
          ],
        },
        left_leg: { rotation: [60, 0, 0] },
        right_leg: { rotation: [60, 0, 0] },
        tail: { rotation: [12, 0, 0] },
        body: { rotation: [-8, 0, 0] },
      },
    },
  ],
  controllers: [
    {
      key: "general",
      initial: "idle",
      states: {
        idle: {
          animations: ["idle"],
          transitions: [
            ["fly", "!query.is_on_ground"],
            ["walk", MOVING],
          ],
        },
        walk: {
          animations: ["walk"],
          transitions: [
            ["fly", "!query.is_on_ground"],
            ["idle", STOPPED],
          ],
        },
        fly: {
          animations: ["fly"],
          transitions: [["idle", "query.is_on_ground"]],
          blendTransition: 0.1,
        },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Pack mule: tail swishes and the head dips at rest; a four-beat walk with
// the panniers swinging against the stride; a graze that lowers the neck.
// ---------------------------------------------------------------------------

emit(CONCEPTS, "mule", {
  name: "concept_mule",
  bones: bonesOf(`${CONCEPTS}/models/mule.geo.json`),
  animations: [
    {
      key: "idle",
      loop: true,
      bones: {
        tail: {
          rotation: [
            0,
            "math.sin(query.life_time * 120) * 15",
            "math.sin(query.life_time * 60) * 5",
          ],
        },
        head: { rotation: ["math.sin(query.life_time * 25) * 4", 0, 0] },
      },
    },
    {
      key: "walk",
      loop: true,
      bones: {
        front_left_leg: { rotation: [walk(45), 0, 0] },
        back_right_leg: { rotation: [walk(45), 0, 0] },
        front_right_leg: { rotation: [walk(45, -1), 0, 0] },
        back_left_leg: { rotation: [walk(45, -1), 0, 0] },
        neck: { rotation: [`math.sin(${STRIDE}) * ${SPEED} * 3`, 0, 0] },
        left_pack: { rotation: [0, 0, `math.sin(${STRIDE}) * ${SPEED} * 3`] },
        right_pack: { rotation: [0, 0, `-math.sin(${STRIDE}) * ${SPEED} * 3`] },
        body: { position: [0, `math.abs(math.cos(${STRIDE})) * ${SPEED} * 0.4`, 0] },
      },
    },
    {
      key: "graze",
      length: 2.4,
      bones: {
        neck: {
          rotation: [
            [0, [0, 0, 0]],
            [0.5, [38, 0, 0]],
            [1.9, [38, 0, 0]],
            [2.4, [0, 0, 0]],
          ],
        },
        head: {
          rotation: [
            [0, [0, 0, 0]],
            [0.5, [20, 0, 0]],
            [1.0, [24, 0, 0]],
            [1.4, [18, 0, 0]],
            [1.9, [22, 0, 0]],
            [2.4, [0, 0, 0]],
          ],
        },
      },
    },
  ],
  controllers: [
    {
      key: "general",
      initial: "idle",
      states: {
        idle: {
          animations: ["idle"],
          transitions: [
            ["graze", "query.property('concept:grazing')"],
            ["walk", MOVING],
          ],
        },
        walk: {
          animations: ["idle", "walk"],
          transitions: [["idle", STOPPED]],
          blendTransition: 0.2,
        },
        graze: { animations: ["idle", "graze"], transitions: [["idle", FINISHED]] },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Hatchling egg: still until it starts to crack, then rocks in bursts; the
// hatch is a squash, a shudder and a stretch as the shell gives.
// ---------------------------------------------------------------------------

emit(HATCHLING_RP, "egg", {
  name: "hatchling_egg",
  bones: bonesOf(`${HATCHLING_RP}/models/entity/egg.geo.json`),
  animations: [
    {
      key: "idle",
      loop: true,
      bones: {
        egg: { scale: [1, "1 + math.sin(query.life_time * 60) * 0.01", 1] },
      },
    },
    {
      key: "wobble",
      loop: true,
      length: 2.4,
      bones: {
        egg: {
          rotation: [
            [0, [0, 0, 0]],
            [0.1, [0, 0, 9]],
            [0.2, [0, 0, -9]],
            [0.3, [0, 0, 6]],
            [0.4, [0, 0, -4]],
            [0.5, [0, 0, 2]],
            [0.6, [0, 0, 0]],
            [1.4, [0, 0, 0]],
            [1.5, [-7, 0, 0]],
            [1.6, [6, 0, 0]],
            [1.7, [-3, 0, 0]],
            [1.8, [0, 0, 0]],
            [2.4, [0, 0, 0]],
          ],
        },
      },
    },
    {
      key: "hatch",
      length: 1.2,
      bones: {
        egg: {
          scale: [
            [0, [1, 1, 1]],
            [0.3, [1.15, 0.8, 1.15]],
            [0.5, [0.9, 1.25, 0.9]],
            [0.7, [1.1, 0.9, 1.1]],
            [0.9, [1, 1, 1]],
            [1.2, [1, 1, 1]],
          ],
          rotation: [
            [0, [0, 0, 0]],
            [0.55, [0, 0, 12]],
            [0.65, [0, 0, -12]],
            [0.75, [0, 0, 8]],
            [0.85, [0, 0, -5]],
            [0.95, [0, 0, 0]],
          ],
        },
      },
    },
  ],
  controllers: [
    {
      key: "general",
      initial: "idle",
      states: {
        idle: {
          animations: ["idle"],
          transitions: [
            ["hatch", "query.property('hatchling:hatching')"],
            ["wobble", "query.property('hatchling:cracks') > 0"],
          ],
        },
        wobble: {
          animations: ["wobble"],
          transitions: [
            ["hatch", "query.property('hatchling:hatching')"],
            ["idle", "query.property('hatchling:cracks') == 0"],
          ],
        },
        hatch: { animations: ["hatch"], transitions: [["idle", FINISHED]] },
      },
    },
  ],
});
