# Map Select Survey Source Completion

Status: P1/P2 source vertical complete on `codex/v0.3-map-select-survey-redesign`.

The player-facing Map Select now consumes a sanitized `surveyPreview` descriptor
with aggregate ranges, signature identity, seed-shaped coarse regions, density,
uncertainty/confidence, risk band, and broad contact families. Valid selections
show a three-panel survey terminal with coarse topology; locked selections show
withheld/redacted data and no launch action. Internal authority map generation
and `map.route` consumers are unchanged.

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

The later style-guide consistency pass should reconcile the canonical scale
registry, survey labels, mockups, and related UI copy after W2-A4. Style-guide
documents are intentionally unchanged in this source commit.
