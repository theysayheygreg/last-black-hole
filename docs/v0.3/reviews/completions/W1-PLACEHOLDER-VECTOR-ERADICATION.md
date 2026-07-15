# W1 Placeholder Vector Eradication

Status: bounded correction applied on `codex/v0.3-placeholder-vector-eradication`.
This note records source and focused-test evidence only; it is not a browser,
capture, or visual-taste completion claim.

## Temporal Dropout Contract

The temporal ledger now receives the expected sprite identities and all ten
sprite families for every sequential renderer frame. Families emit either a
real sprite submission or an explicit state row for every current identity;
budget skips are no longer silent. The ledger carries prior identities forward
and synthesizes bounded `absent` rows when a later snapshot omits one. Scene
resets synthesize `reset` rows for prior identities.

Records distinguish `visible`, `offscreen-cull`, `budget-cull`, `transparent`,
`absent`, `reset`, and explicit `occluded`. The renderer does not know depth
occlusion at this boundary, so its records use `occlusion: unsupported` rather
than claiming `occluded`. Entity and family summaries include state counts and
sequential-frame proof; a missing in-view identity therefore makes
`stableCore` false.

## Ability-State Ownership

`localAbilityState` is cleared by scene reset and by every remote snapshot
before optional ability state is applied. Canvas ability marks are gated to
`gamePhase === 'playing'`. The machine-readable inventory now owns the
`hullAbilityStateMark` role and its named allowlist entry.

## Pooled Renderer Evidence

The focused lifecycle test uses real Three `Mesh`, `PlaneGeometry`, and
`MeshBasicMaterial` instances with the renderer's pooled `_addMesh` and
`_addSpriteEntity` methods. It proves two simultaneous pooled meshes receive
independent material clones, opacity changes do not leak through the shared
asset material, the next frame reuses the mesh and clone, and renderer disposal
releases the clones and backing resources. This is a pooled-method/unit proof,
not a WebGL browser render proof.

## Primitive Disposition

`docs/v0.3/visual-primitive-inventory.json` now states the product and
representative forbidden sets explicitly. Both modes assert zero entries from
`productionForbidden`; semantic/debug marks are permitted only through the
named allowlists, and debug mode requires an explicit view. Generic entity
discs, rings, triangles, squares, bullseyes, and duplicate canvas entity marks
remain forbidden as finished production art.

## Focused Proof

The bounded check set is:

- `node tests/three-entity-temporal.cjs`
- `node tests/three-entity-lifecycle.cjs`
- `node tests/vfx.cjs`
- `node tests/render-plan.cjs`
- `node tests/presentation-frame.cjs`

These checks cover sequential temporal rows and summaries, all sprite-family
coverage, pooled mesh/material reuse and cleanup, VFX lifecycle, render-plan
ownership, presentation normalization, ability-state source guards, and the
machine-readable product/representative/debug inventory policy. No browser,
dev server, capture, physics, authority, or broad CI lane is part of this
correction.
