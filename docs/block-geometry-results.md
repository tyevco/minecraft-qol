# Block geometry axes — measured

**What was measured.** Two Fluidworks pipes placed side by side. Their
connection states were right (each pipe's arm state facing the other was
true), but the arms rendered on the far sides, so the pair looked like
`=| |=` instead of `|==|`. The pipe model shows one bone per state and has no
`minecraft:transformation`, so this is the raw mapping from geometry
coordinates to the world, with nothing else in between.

**What it means.** Bedrock renders custom block geometry with **x mirrored**:
a cube authored on +x appears on the block's **west** side and -x on its
east. y is up and -z is north, as authored. This is the entity-model
convention (a Bedrock entity facing -z has its left arm on +x, and left of
north is west), applied to blocks without any yaw.

It is also the only convention under which the Bedrock Wiki's rotation table
(`north` 0, `west` 90, `south` 180, `east` -90, "front of the model facing
north", `y_rotation_offset: 180` to face the player) and its "positive is
clockwise" note for `minecraft:transformation` agree with each other.

**Confidence.** The mirrored pair is an observation. That it is x and not z is
inferred from two things: the funnel's spout follows its `facing_direction`
state on every horizontal side, and a z mirror would reverse it; and
`tools/viewer/viewer.js` already renders every model with x negated, copying
Blockbench's Bedrock codec, which is how Blockbench shows a model the way the
game does. The generator was writing bones by raw geometry axis; Blockbench
and the game disagree with it by exactly that mirror. If a north–south run of
pipes also reaches away, z is mirrored too and the fix is a 180° swap
(`north`↔`south` bones as well); see the pipe row in
`packages/fluidworks/README.md` under "To confirm in game".

**What changed because of it.** `tools/models/generate.ts` states the
convention in its header, and names the pipe's arm bones by the **world** face
they reach: the world-east arm is authored on -x. Any future block feature that
must sit on the world's east goes on -x. Symmetric models are unaffected.
