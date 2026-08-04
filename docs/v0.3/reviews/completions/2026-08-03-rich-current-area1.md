# Rich Ordinary Currents — Area 1 Completion

Date: 2026-08-03

## Scope and Result

The first Area 1 fabric pass deliberately enriches **ordinary** authority
gameplay while preserving the original movement and simulation truth. Exact
comparison sources are:

- base: `82c6381ddc2b5654391e29cc683f30cb183e964d`
- presentation change: `5f9c0e4b25f57c34b8db14001078390032ffe6cd`

Only `src/render/shaders/fluid.glsl.js` changes product behavior. The display
shader now uses a five-tap spatial filter over the existing coarse authority
field to orient world-anchored lanes, then applies at most `0.32` world units
of presentation-only local backtrace for curvature. It does not create a new
simulation field, input, resource, loop, or manager.

Lane measurement happens in an aspect-correct display metric. With `1.50`
world-unit spacing and a `0.125` camera-relative half width, each 1280x800
ordinary corridor is 200px across: 4.55 default-hull widths and 4.17 Breacher
hull widths at normal gameplay zoom. The repeated broad body occupies exactly
`0.75 / 1.50 = 50.00%` of the lane period in the focused 12,000-sample mask
check, leaving `50.00%` calm material before local well/wave shaping and the
unrelated HUD/entities in a full screenshot.

The visual hierarchy is one continuous material: broad low-frequency body,
medium multi-scale filaments, then short downstream ASCII weave. Decorative
history is clipped to a meaningful current body or source wave so calm areas
remain nearly black. Existing well deformation and source-wave response remain
the only local material reactions; there is no screen-wide ring or hash
carpet.

## Focused Proof

- `node tests/fabric-lanes.cjs`: 4 passed, 0 failed. This covers 0/45/90
  degree display widths, the exact 50.00% broad-material / calm-period split,
  authority-direction agreement, and resistance to one noisy center sample.
- `node tests/fabric-display-contract.cjs`: 5 passed, 0 failed.
- `node tests/fabric-readability-cleanup.cjs`: 2 passed, 0 failed.
- `node --check src/render/shaders/fluid.glsl.js` and `git diff --check`
  passed.
- `git diff --name-only 82c6381d 5f9c0e4b` contains only the display shader
  and its two focused contracts; no sim, authority, movement, camera, UI, or
  entity source is in the product delta.

## Fresh Matched Ordinary-Authority Capture

Both captures use normal Protocol V2 Shallows play at 1280x800 with preview
seed `73043`, normal remote input, and no Bench/debug world mutation. Their
manifests report no browser errors.

| Source | Still | Motion | Authority ticks |
| --- | --- | --- | --- |
| `82c6381d` before | `/private/tmp/lbh-v03-fabric-rich-current-area1/tests/screenshots/fabric-rich-current-area1-before-2026-08-04T035143286Z/01-ordinary-authority-still.png` (`260eb9dce891483114608dec9e4266f710f2c2b0e9a4559f2a860ef212ffee28`) | `/private/tmp/lbh-v03-fabric-rich-current-area1/tests/screenshots/fabric-rich-current-area1-before-2026-08-04T035143286Z/02-ordinary-authority-motion.png` (`2a9ae35e516771be050a01b7327b45b21de48dc439dc9b252d8f58a40ec80738`) | 0 → 29 |
| `5f9c0e4b` after | `/private/tmp/lbh-v03-fabric-rich-current-area1/tests/screenshots/fabric-rich-current-area1-after-2026-08-04T035155335Z/01-ordinary-authority-still.png` (`0047759fa204afb99d8b08e0483e9526a8e96a1004005c0bc64627d4860f78b6`) | `/private/tmp/lbh-v03-fabric-rich-current-area1/tests/screenshots/fabric-rich-current-area1-after-2026-08-04T035155335Z/02-ordinary-authority-motion.png` (`9db17155523b18c7b25620c270ba5db66eaa855dc0395bf48d217f9f5a1ad7f2`) | 0 → 28 |

The comparison shows the intended change: wider coherent cyan current material
with visible filaments and weave, surrounded by substantial black rest. It is
not a claim that every screenshot pixel is 50% calm—the exact 50.00% figure is
the intentional repeated corridor-body geometry, while authored field shape,
wells, waves, and UI correctly perturb a frame's final pixels.

## Remaining Human Gate

This is machine evidence for the presentation seam only. Greg still owns the
in-game feel/readability judgement and physical Steam Deck acceptance; no
hardware or final art-direction acceptance is claimed here.
