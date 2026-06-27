# Renderer Harness

Use this when the question is visual, temporal, or compositional rather than gameplay or boot health.

Run:

`npm run test:renderer`

Outputs land under:

`/Users/theysayheygreg/clawd/projects/last-black-hole/tests/screenshots/renderer-<timestamp>/`

Default runs capture a short deterministic set:

- `title`
- `interference10x10`
- `entityShowcase`
- `visualReference`

Set `LBH_RENDERER_DEEP=1` to capture the full fixture suite, including
`singleWell`, `interference`, and `singleWell5x5`.
`visualReference` is the dev-only asset-array scene for checking object
families together; it is intentionally separate from representative promo
captures and normal map-match screenshots, but it is now part of the default
visual harness because it catches contrast/readability regressions across
entity families.

For each selected fixture, the harness captures:

- pre-ASCII scene and final ASCII at the default short cadence
- one debug capture with well radii overlay

Deep runs capture pre-ASCII and final ASCII at `0.5s`, `2.0s`, and `5.0s`.

The manifest is written to:

`manifest.json`

This harness is for renderer judgment, not shader proof.

Use it to answer:

- does the hole stay centered and readable over time
- does the core stay dark
- does the ring stay visible
- do multiple wells interfere in a controlled way
- do ring/core reads survive `5x5` and `10x10` world scaling
- is the pre-ASCII image strong before glyph quantization
- do stars, wrecks, portals, ships, fauna, sentries, and planetoids stay
  readable against the background and final post-processing stack

`visualReference` adds a structured readability report to the manifest. The
harness samples final post-processed luminance around each object family,
compares it with nearby background, and records counts, contrast floors, peak
luminance, and the weakest sampled object. This is a coarse accessibility and
readability canary, not a pixel-perfect screenshot comparison or a replacement
for human art direction.

Do not use the normal smoke or flow screenshots as renderer truth. Those are still health checks, not visual evaluation.

## Chrome DevTools MCP relationship

Keep this harness.

Chrome DevTools MCP does not replace it. The useful split is:

- renderer harness = deterministic captures on known fixtures
- Chrome DevTools MCP = live inspection of the actual running game, console, perf traces, and screenshots while tuning

Use the harness when you need a repeatable before/after comparison.
Use Chrome DevTools MCP when you need to inspect the live scene, chase a visual bug, or understand why a change feels wrong in motion.

## Relationship to the broader test harness

LBH now has three distinct test layers:

- `tests/smoke.js` — client-only boot/render canary
- `tests/infra-smoke.js` — control plane + sim + remote client boot canary
- `tests/renderer.js` — deterministic visual fixtures

Keep those roles separate. Renderer captures are not a substitute for infrastructure smoke, and infrastructure smoke is not a substitute for visual judgment.
