# Bulwark turret — where a shot leaves the head, measured

**What was measured.** A turret placed by a simulated player in the GameTest
arena, fed ten arrows through a hopper, with a husk spawned four blocks in
front of it. The suite's `turret_shot_origin` test subscribes to
`entitySpawn`, and on the first `minecraft:arrow` records the arrow's
location and velocity next to the head entity's `location` and
`getHeadLocation()`. BDS 1.26.45.1, headless, `npm run bds:test --
turret_shot_origin`. Two runs per configuration; the numbers agreed to a
hundredth of a block.

| Collision box height | Eye (`getHeadLocation` − origin) | Arrow spawn − origin (x, y, z) | Arrow − eye, vertical |
| --- | --- | --- | --- |
| 0.9 (as first built) | +0.765 | (−0.51, **+0.710**, −0.86) | −0.055 |
| 0.47 (now) | +0.400 | (−0.50, **+0.323**, −0.87) | −0.077 |

The barrel is drawn with its axis 5.5/16 = 0.344 above the entity's origin
(`tools/models/generate.ts`, the head's second cube spans y 4–7).

**What it means.**

- **The arrow leaves from the shooter's eye, and the eye is 0.85 × the
  collision box height.** 0.765 / 0.9 = 0.85 and 0.400 / 0.47 = 0.85. There
  is no stable component that sets an entity's eye height directly; the
  collision box is the only knob. Vanilla's `minecraft:arrow` says
  `"anchor": 1, "offset": [0, -0.1, 0]` in its `minecraft:projectile`, and
  anchor 1 is the eye. The measured vertical drop below the eye is a little
  less than 0.1 and varies with aim pitch, so the offset is applied in the
  shooter's aimed frame rather than straight down.
- **Horizontally the arrow already starts about one block forward along the
  aim**, which is where the muzzle is (17.5/16 forward on the head bone). So
  the fix was only vertical: with the eye at 0.85 × 0.9 = 0.765 the arrow
  appeared 0.37 blocks (about six pixels) above the barrel, "as if the turret
  had arms". With 0.47 it leaves 0.02 below the barrel axis.
- **The eye moves with the box, so line of sight and aiming move too.**
  `must_see` and `look_at_target` now measure from barrel height, which is
  the right place for a turret; the head origin is at the base's socket
  (`y + 14/16`), so the eye sits 0.275 above the base's top and clears its own
  rim.
- **A stationary `ranged_attack` shooter with no gravity and zero movement
  fires** (P2 of `bulwark-turret-probe.md`, first half): the husk was shot
  within a few seconds in every run, at a target below the head's level.
  Owner attribution was not read by this test and stays in the protocol.

**Confidence.** The eye height ratio is two data points on one entity, both
exactly 0.85; treat it as the engine's rule for a `minecraft:collision_box`
entity until a third height disagrees. The arrow-below-eye figure is a
per-shot reading at one aim angle each, which is why the test's tolerance is
two pixels rather than one.

**What it changes.** `packages/bulwark/behavior_pack/entities/turret_head.json`
carries `"height": 0.47`; `turret_shot_origin` fails with the measured offset
in its message if the barrel and the shot ever part again. The test raises the
world to `easy` for the shot and puts `peaceful` back in a `finally`, because
the test server runs on peaceful and refuses to spawn a hostile there.

**Aside, on the harness.** Running these tests repeatedly against one
persisted world, across server restarts, eventually left the hopper tests
failing alone with "turret did not pull", with the original collision box as
much as the new one. `npm run bds:setup --fresh` cleared it and all five
turret tests passed. CI always starts from a fresh world, so it never sees
this; a local loop that reuses the world should reach for `--fresh` before
believing a turret failure. Not root-caused.
