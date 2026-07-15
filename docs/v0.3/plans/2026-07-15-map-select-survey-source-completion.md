# Map Select Survey Source Completion

Status: P1/P2 source vertical and P3 visual proof accepted on
`codex/v0.3-map-select-survey-redesign`.

The player-facing Map Select now consumes a sanitized `surveyPreview` descriptor
with aggregate ranges, signature identity, seed-shaped coarse regions, density,
uncertainty/confidence, risk band, and broad contact families. Valid selections
show a three-panel survey terminal with coarse topology; locked selections show
withheld/redacted data and no launch action. Internal authority map generation
and `map.route` consumers are unchanged. The player-facing hierarchy is a
survey terminal: map-class register, coarse reconstruction, then interpretation
and readiness. It does not expose route anchors, path sequence, exact wells,
portals, wrecks, spawn, object layout, or signal pressure.

## Interim Scale Contract

The survey presentation currently displays `5x5`, `15x15`, and `25x25` for
Shallows, Expanse, and Deep Field through the centralized
`SURVEY_SCALE_PRESENTATION_INPUT` seam. It also carries the current authority
cell counts (`3`, `5`, and `10`) so the boundary remains explicit. This is an
interim sanitized presentation input, not production authority scale parity.

Required integration dependency: W2-A4 branch
`codex/v0.3-map-scale-5-15-25`. Do not claim production scale parity until
that branch lands and the canonical authority registry is wired through
`resolveSurveyScalePresentation()`.

The style-guide consistency pass records the labels and hierarchy, but does not
turn this source branch into authority parity. W2-A4 remains a production
dependency: `codex/v0.3-map-scale-5-15-25` at `a5dc28d8` is separately
implemented/reviewing and is not integrated here. Do not claim branch-local
runtime authority parity until that dependency lands and the canonical
authority registry is wired through `resolveSurveyScalePresentation()`.

## Player-Facing State Contract

- Valid rows show `SURVEY RECONSTRUCTION`, broad possible contents/ranges, an
  incomplete `SURVEY CONFIDENCE`, and the shared launch command.
- Locked rows remain readable, but the center becomes withheld/redacted data and
  the right rail becomes `DATA WITHHELD` / `???`.
- Locked rows have no launch action and no fake input prompt.
- Reduced motion holds the locked corruption as a static missing-tile,
  checksum-noise, broken-contour, or redaction treatment.
- Deck/controller mode resolves graphical active-device glyphs only. It has no
  raw keyboard fallback, and supporting copy does not repeat the command label.

## Accepted Visual Proof

The accepted Deck-sized proof is preserved at these exact paths:

| State | Artifact | SHA-256 |
|---|---|---|
| Valid Expanse | `/private/tmp/lbh-map-select-survey-proof-20260715T064922Z/map-select-valid-expanse-deck.png` | `2a5d7ee301f2aafbc4b6a341f270559078c2420299b0c1b8495a0a5a8d1a3290` |
| Locked Sector 05 | `/private/tmp/lbh-map-select-survey-proof-20260715T064922Z/map-select-locked-sector-05-deck.png` | `6525190afc7d3a65220ddd5bf65909e503d1961cd155973d8eacd504ae504ea1` |
| Manifest | `/private/tmp/lbh-map-select-survey-proof-20260715T064922Z/manifest.json` | `1eb4fbfb5ac7f8bf9e1fa240281490103ce9735c2533a6e2d31e2e248950bb04` |

The accepted manifest records green Deck/controller glyphs, no raw keyboard
fallback, containment/non-overlap, and no browser page errors. This is visual
and source acceptance evidence only; it does not close the W2-A4 authority
parity dependency or Greg's physical Deck/taste gate.
