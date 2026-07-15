# W1 Placeholder Vector Eradication

Status: source implementation complete on `codex/v0.3-placeholder-vector-eradication`.

## Temporal Dropout Contract

The dropout owner was the Three pooled sprite submission path. Entity opacity
was being written through shared cached asset materials while pooled meshes were
reassigned across visual families. A later entity could therefore leave the
shared material in a different alpha state; the renderer had no bounded
identity history to distinguish that from intentional culling or a fading
portal.

The fix keeps the shared texture and asset-material cache intact, but gives each
pooled sprite mesh a cached per-asset material clone. Presentation opacity is
now local to that bounded mesh/material pair. The existing renderer loop owns a
bounded temporal contract with explicit `visible`, `offscreen-cull`, and
`zero-opacity` outcomes. It resets at phase/run boundaries and reports sampled
frame ids, stable-core summaries, and dropout reasons through renderer stats.

The focused temporal proof samples one named title core over 4 sequential frames
and one named match core over 4 sequential frames: both remain submitted,
in-view, and above the opacity floor for every sample. A second proof records
one visible frame, one offscreen cull, and one zero-opacity frame and reports
exactly 2 dropout frames with both reasons preserved.

## Primitive Disposition

Machine-readable role inventory: `docs/v0.3/visual-primitive-inventory.json`.

- Entity cores and landmarks are generated nearest-filtered pixel sprite cards.
- Generic discs, rings, triangles, squares, bullseyes, and duplicate canvas
  entity marks are forbidden as finished production art.
- Wells remain fabric-first. Neither product Three nor the legacy canvas world
  path submits generic `waveRings`; the remaining well rings/core helpers are
  explicit raw-scene diagnostics only, while wave physics and fabric splats
  remain intact.
- Slingshot range/tether/release direction marks remain because they carry
  ratified state, direction, or radius semantics that sprites cannot carry.
- Portal blocked/final accents, title faults, loading transition motion, map
  nodes, background depth cues, and debug marks remain only under their named
  owner and activation/reset/dispose contract.

## Focused Proof

`node tests/three-entity-temporal.cjs` covers:

- 2 stable named-core summaries across 8 sequential title/match samples;
- 2 explicit dropout reasons across 3 diagnostic samples;
- renderer ownership, phase/run reset, isolated opacity material, and product
  wave-ring absence assertions;
- all 7 inventory roles, forbidden-set coverage, and semantic allowlist.

`node tests/render-plan.cjs` and `node tests/presentation-frame.cjs` remain
passing. Three/VFX execution tests were not run in the final source-only pass
because this worktree has no tracked dependency tree; no browser or capture
lane was used.

Residual risk: the serialized browser visual proof still needs the separately
assigned read-only source review and one external browser-capacity slot. This
commit does not claim that visual gate.
