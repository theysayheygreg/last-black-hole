# v0.3 Deck UI Geometry and Action Glyphs

## Outcome

Done for the source-level geometry and graphical input-glyph contract. Physical
Steam Deck readability and final visual taste remain Greg gates.

## What changed

- Added `UI_DECK_GEOMETRY` tokens for panels, headings, buttons, list rows,
  icon/art cells, value blocks, action glyphs, and separation.
- Added shared layout contracts for title, profile, home/map, results, and HUD
  representative surfaces. Compound sizing uses the largest content footprint.
- Raised shared canvas rows, command buttons, status blocks, item icons, HUD
  rows, inventory rows, and panel backing to the minimum geometry contract.
- Added structured action descriptors with action id, active input family,
  binding id, optional origin id, glyph kind, and fallback label. The origin
  adapter is a data boundary only; the browser does not call Steam Input.
- Added shared canvas glyph primitives and DOM glyph markup for face buttons,
  shoulder/trigger keycaps, View/Menu, D-pad, and keyboard keycaps. Deck mode
  cannot resolve a keyboard glyph.
- Routed title, profile, home, map, results, pause, inventory, HUD, footer,
  tab, and command affordances through the shared descriptor path. Duplicate
  button/subprompt verbs are suppressed.
- Updated the June 28 command-button decision, visual system, and Deck runbook
  from future-glyph wording to the active graphical contract.

## Before / after component contract

| Component | Before | After |
| --- | --- | --- |
| Heading | Text-defined height | 32 px minimum with padding and gap |
| Button | Caller-defined slab, plain hotkey line | 220 x 52 px minimum plus a 28 px glyph area |
| List row | Text-sized rows | 48 px minimum with content padding and separation |
| Icon/art cell | Could collapse toward label height | 40 px icon minimum, 112 x 96 px detailed art minimum |
| Value/status block | Tight text pill | 116 x 46 px minimum |
| Panel | Local padding and gaps | 18 x 14 px padding, 14 px internal gap |
| Action affordance | Plain `A`/`Space`/`L1` text | Drawn family-matched glyph with a future origin adapter boundary |

## Evidence

- `node tests/ui-layout.cjs`: 23 action ids resolved; device family, Deck
  keyboard exclusion, duplicate suppression, origin adapter, compound sizing,
  glyph bounds, containment, and pairwise surface separation passed.
- `node tests/ui-primitives.cjs`: 5 passed, 0 failed.
- `node tests/ui-motion.cjs`: passed.
- Focused `node --check` covered the changed UI modules and consumers.
- `git diff --check`: clean.
- No browser, screenshot capture, broad CI, Three/entity/world renderer, asset
  manifest, physics, or authority checks were run or changed.

## Deviations

The DOM D-pad uses a CSS cross primitive while canvas uses drawn rectangles;
both are driven by the same descriptor and glyph kind. Native Steam Input
origin art is intentionally not claimed or integrated in this browser pass.

## Open questions

- Greg should make the final physical Gaming Mode and couch-distance call on
  glyph weight, exact face-button styling, and whether native Steam Input art
  should replace the fallback primitives once an origin adapter exists.
- The existing route-map marks and decorative objects remain taste/art scope;
  this pass only controls their containing geometry and readable footprint.

## Anchor updates

The June 28 command-button decision, `UI-VISUAL-SYSTEM.md`, and
`STEAM-DECK-RUNBOOK.md` now describe the active graphical action contract.
