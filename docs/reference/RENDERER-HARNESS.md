# Renderer Harness

Use this when the question is visual, temporal, or compositional rather than gameplay or boot health.

Run:

`npm run test:renderer`

Outputs land under:

`/Users/theysayheygreg/clawd/projects/last-black-hole/tests/screenshots/renderer-<timestamp>/`

Each run captures three deterministic fixtures:

- `title`
- `singleWell`
- `interference`

For each fixture, the harness captures:

- pre-ASCII scene at `0.5s`, `2.0s`, and `5.0s`
- final ASCII at `0.5s`, `2.0s`, and `5.0s`
- one debug capture with well radii overlay

The manifest is written to:

`manifest.json`

This harness is for renderer judgment, not shader proof.

Use it to answer:

- does the hole stay centered and readable over time
- does the core stay dark
- does the ring stay visible
- do multiple wells interfere in a controlled way
- is the pre-ASCII image strong before glyph quantization

Do not use the normal smoke or flow screenshots as renderer truth. Those are still health checks, not visual evaluation.
