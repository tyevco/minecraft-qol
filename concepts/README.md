# Concepts

Models and atlases for things that are proposed but not built, so a proposal
can be judged as a model before any pack exists. Nothing here ships: no pack
references these files, and `npm run mcaddon` never sees them.

- `entities/` — the six entity concepts in `docs/design/entities.md`: decoy
  dummy, patrol golem, runner, hatchling (three palette variants), messenger,
  pack mule.

Everything here is generated. Geometry comes from `tools/models/generate.ts`,
atlases from `tools/textures/generate.ts` with painters in
`tools/textures/tiles.ts`, and the atlas layouts are in `tools/atlases.ts`.
`npm run assets` rewrites all of it; a changed file in a diff must correspond
to a change under `tools/`, as for the shipped packs.

`npm run viewer` includes every concept, listed under a `concept · <pack>`
label with the pack it would belong to. When a concept is picked up, its
generator entries move to `packages/<pack>/resource_pack/` and its catalogue
entry drops the label.
