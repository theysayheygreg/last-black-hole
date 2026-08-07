# Palette packet 2 — self-run receipt

**Date:** 2026-08-07
**Base:** `e8ee4cfe35293b5f8c6481d37130118ec10712d8`
**Branch:** `palette/packet2-directional-atlas-20260807`

## Delivered

- `docs/v0.3/PALETTE-WORLD-ART-GUIDE-DRAFT.md`
- `docs/v0.3/PALETTE-WORLD-ART-GUIDE-DRAFT.html`

The rendered companion embeds the exact escaped Markdown payload. A direct extraction/unescape comparison returned payload identity (`21,164` characters). The old invented `#FF5353` is absent from both files.

## Review-blocker closure

- **§6:** Replaced invented semantic glyph-job table with the real live **6 rows × 16 columns** atlas: rows 0–3 are isotropic/horizontal/vertical/diagonal directional ramps; rows 4–5 are explicit Inhibitor overrides. The guide states actual selector law, texture guardrails, and fallback law.
- **HTML mirror:** Replaced abridgement with an exact Markdown payload mirror under a styled rendered reference surface.
- **Palette:** Removed the invented danger hex. Danger remains implementation-selected warm red; no canonical danger hex is asserted.
- **Entity scale:** Imported the live Deck presentation min/base/max pixel-half-radius table and authority-boundary notes.
- **Rubric:** Added gates, explicit failure conditions, remedies, verdicts, and a SHIP criterion.
- **Image generation:** Added a bounded world-only capsule with provenance/ratification constraints.

## Rubric self-run

| Check | Result | Basis |
|---|---|---|
| `PAL-WOR-01` route read | BLOCKED | Guide-only patch; no current-frame capture was produced. |
| `PAL-WOR-02` well grammar | BLOCKED | Guide-only patch; no approach capture was produced. |
| `PAL-WOR-03` family separation | BLOCKED | No Deck-scale/grayscale capture set in this packet. |
| `PAL-WOR-04` core/matte density | BLOCKED | No quiet/dense pair in this packet. |
| `PAL-WOR-05` palette semantics | PASS | Guide and HTML payload checked; no `#FF5353`; role table leaves danger hex deliberately unfixed. |
| `PAL-WOR-06` state accents | BLOCKED | No temporal capture was produced. |
| `PAL-WOR-07` pixel stability | BLOCKED | No target-scale motion capture was produced. |
| `PAL-WOR-08` portal aperture | BLOCKED | No portal state matrix was produced. |
| `PAL-WOR-09` reduced motion | BLOCKED | No paired normal/reduced-motion evidence was produced. |
| `PAL-WOR-10` custody/authority | PASS | Existing landing/manifest binding contract retained; guide explicitly keeps authority out of renderer presentation. |

**Roll-up:** **REWORK for product visual acceptance** because the guide patch does not manufacture runtime visual evidence. **PASS for the packet’s documentation-contract scope**: all named review blockers are addressed and the MD/HTML source payload is value-identical. Greg’s ratification remains required for substantive guide amendments; runtime `SHIP` remains unavailable until applicable capture-backed gates pass.

## Verification

- Markdown/HTML payload extraction + HTML unescape: PASS (`21,164` characters identical).
- Banned literal `#FF5353` search across both deliverables: PASS (absent).
- Required additions (`six rows × sixteen columns`, Deck radii, rubric ship criterion, image-generation capsule): PASS.
- `git diff --check`: PASS.
