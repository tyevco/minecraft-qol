# Concepts

Models and atlases for things that are proposed but not built, so a proposal
can be judged as a model before any pack exists. Nothing here ships: no pack
references these files, and `npm run mcaddon` never sees them.

- `entities/` — the entity concepts in `docs/design/entities.md`: decoy
  dummy, patrol golem, runner, messenger, pack mule. Each has `models/`,
  `textures/`, an animation set under `animations/` and its state machine
  under `animation_controllers/`. The hatchling and its egg started here and
  moved to `packages/hatchling` when they were built.

Everything here is generated. Geometry comes from `tools/models/generate.ts`,
atlases from `tools/textures/generate.ts` with painters in
`tools/textures/tiles.ts`, the atlas layouts are in `tools/atlases.ts`, and
animations and controllers come from `tools/animations/generate.ts`, which
reads the generated geometry back so every animated bone is one that exists.
`npm run assets` rewrites all of it; a changed file in a diff must correspond
to a change under `tools/`, as for the shipped packs.

`npm run viewer` includes every concept, listed under a `concept · <pack>`
label with the pack it would belong to, and plays its animations: "controller
(auto)" runs the state machine against the "moving" and "in the air"
switches; a single animation loops on its own, one-shots replaying with a
short rest. When a concept is picked up, its generator entries move to
`packages/<pack>/resource_pack/` and its catalogue entry drops the label.

To wire a set into a client entity: map each animation's short key to its
identifier under `animations` (`"idle": "animation.concept_mule.idle"`),
add the controller under the same map (`"general":
"controller.animation.concept_mule.general"`), and list `general` in
`scripts.animate`. The one-shots gated on `query.property('concept:*')`
need that bool property declared on the server entity.
