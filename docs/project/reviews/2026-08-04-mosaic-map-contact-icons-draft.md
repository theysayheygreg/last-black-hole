# Mosaic — map-select contact-family icons (REVISED DRAFT)

**Receipt:** six hand-authored 16px, 1px mono-grid contact glyphs plus a 1280×720 specimen; revised against Orrery’s 2026-08-05 review. This package is **not runtime-integrated**.

- **Binding owner:** Forge — dispatch after Greg ratifies this package.
- **Binding status:** `awaiting Greg review/tuning`.
- **Provenance:** hand-authored original SVG by Mosaic; no generated or external source material. `provenance-manifest.json` records actual 2026-08-07 verification timestamps.
- **Path to reality:** this revision changes `src/content/map-scales.data.json` from four survey `contents` rows to six, adding `scavengerContacts` and `anomalyContacts`. Forge’s binding slice must make the map-select renderer resolve those range keys and load these six SVGs into the existing 44×44 contact cells.
- **Arrival test:** on a map-select capture, each of well, derelict, stellar, scavenger, anomaly, and exit appears once as its named glyph paired with text in a 44×44 cell; the new rows resolve non-placeholder ranges; a true-16px sheet remains distinguishable.

## Exact paths

- `docs/project/reviews/assets/2026-08-04-mosaic-map-contact-icons/{well-spiral,derelict-diamond,stellar-star,scavenger-skull,anomaly-burst,aperture-ring}.svg`
- `docs/project/reviews/assets/2026-08-04-mosaic-map-contact-icons/map-contact-family-specimen.{svg,png}`
- `docs/project/reviews/assets/2026-08-04-mosaic-map-contact-icons/provenance-manifest.json`
- `scripts/generate-map-contact-icons.cjs`

## Revisions

- Well is two turns (three nested arcs), not four.
- Skull is silhouette, two eyes, and one jaw line: three elements; no teeth.
- All glyph coordinates are integer-snapped; `shape-rendering="crispEdges"` is removed from curved and diagonal glyphs.
- Stellar is an eight-ray asterisk; anomaly is a cardinal/diagonal burst with a circular core — not the same construction.
- Specimen uses panel fill `rgba(0,2,10,.78)`, panel backing `rgba(0,0,8,.56)`, derelict/stellar amber, scavenger danger red, anomaly violet, and route cyan only for well/exit/structure.

## Revision self-review

| ID | Evidence | Result |
|---|---|---|
| C1 | Active colors are semantic: cyan (well/exit/structure), amber (derelict/stellar value), red (scavenger threat), violet (anomaly). The specimen is a multi-family reference board, so its four role colors are intentional and each on-meaning. | PASS WITH REFERENCE-BOARD WAIVER |
| C2 | All fills/strokes are from UI guide §2.1: `#000021`, `rgba(0,2,10,.78)`, `rgba(0,0,8,.56)`, cyan, amber, red, violet, bone/text neutrals. | PASS |
| L1 | Every intended contact cell is 44×44; every glyph has a 16×16 viewBox and is centered at a 14px inset. | PASS |

**Verdict: SHIP WITH WAIVER (C1: the review specimen intentionally displays four semantic role colors; the runtime row presents one role color at a time).**

**Human taste gate:** Greg ratifies the true-16px silhouette distinction before Forge binds the asset package.
