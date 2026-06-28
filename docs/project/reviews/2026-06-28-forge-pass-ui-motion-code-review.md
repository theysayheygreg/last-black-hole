# 2026-06-28 - Forge Pass: UI Motion Code Review

> Status: v0.2 code-shape review after the first shared UI motion layer landed.
> This is not a replacement for a live title/menu playtest.

## Scope

This pass reviewed the `L4: add shared UI motion layer` slice and its immediate
ripple surface:

- `src/ui/motion.js`
- `src/main.js`
- `src/run-results.js`
- `src/config.js`
- `src/dev-panel.js`
- `src/test-api.js`
- `tests/ui-motion.cjs`
- `tests/ui-visual.cjs`
- `docs/design/TEST-HARNESS.md`
- current v0.2 design, roadmap, UI, VFX, and process docs

The question was: did the new motion layer stay centralized, readable,
representative in tests, and aligned with the UI/VFX boundary?

## Findings Fixed

### 1. Disabled UI motion still drew the transition accent

`resolveMotionSettings({ enabled: false })` correctly marked motion as disabled,
but the transition overlay still forced a nonzero wipe alpha through
`Math.max(0.35, motion.intensity || 0)`. That meant "disabled" behaved like
"static reduced wipe" for scene transitions.

Fix:

- `src/main.js` now skips the directional wipe entirely when
  `motion.enabled === false`.
- `CONFIG.ui.motion.intensity = 0` also suppresses the moving wipe accent.
- Reduced motion still keeps the static non-moving overlay, which preserves
  readable state without animation.

### 2. Focus-pulse state was tracked but not rendered

`uiFocusPulseTimer` reset on phase and focus changes, then only appeared in the
test API. That is orphaned behavior: useful-looking state with no player-facing
effect.

Fix:

- `uiFocusPulseAmount()` now turns that timer into a short, fading focus boost.
- Profile, home, map select, and pause selected states use the boost on existing
  row fills, strokes, and active-tab underline.
- In-match HUD values remain stable; no motion was added to live gameplay stats.

### 3. `drawMotionPanel()` only existed for its own test

The helper was exported and covered by `tests/ui-motion.cjs`, but no production
surface called it. That made the motion kit look more centralized than it was.

Fix:

- `src/run-results.js` now uses `drawMotionPanel()` for the results panel reveal.
- `drawMotionPanel()` now forwards the real `drawUiPanel()` option name
  `cornerLength`, rather than stale `corner`, `lineWidth`, and `scanlines`
  options that `drawUiPanel()` never consumed.

### 4. Harness docs underspecified the new motion lane

`npm run test:ui-motion` existed, but `docs/design/TEST-HARNESS.md` did not name
it in the command table. The UI visual section also did not call out the new
reduced-motion title capture explicitly.

Fix:

- `docs/design/TEST-HARNESS.md` now names `npm run test:ui-motion`.
- The UI visual capture section now records the reduced-motion title capture as
  part of the review bundle.

## Architecture Verdict

The shared UI motion direction is sound. It keeps canvas UI motion small,
testable, and separate from Three VFX. The key boundary still holds:

- UI motion owns screen state, reveal timing, focus, prompts, and accessibility.
- Three VFX should accent events and atmosphere, not own menu truth.
- The in-match HUD stays calmer than the title/menu/results surfaces.

The main implementation smell was not a deep architectural problem. It was the
normal first-pass drift where state, helper APIs, tests, and docs did not all
line up yet. This pass tightened those edges.

## Residual Risk

- Motion timing and intensity still require live visual judgment. Screenshot
  canaries cannot prove the title/menu rhythm feels right.
- Home/profile/map/pause are still drawn by older immediate-mode canvas blocks.
  They now have motion, but they are not yet fully migrated to shared UI
  primitives.
- The VFX plan is still mostly on paper. When implementation begins, the first
  code slice should be manager/pool/stats/leak tests before bespoke effects.

## Orrery Follow-Up Prompt

Orrery: please run a parallel big review of the v0.2 UI motion and VFX direction.
Read this review, `docs/design/UI-VISUAL-SYSTEM.md`,
`docs/project/UI-VISUAL-PASS-PLAN.md`, `docs/project/THREE-VFX-PASS-PLAN.md`,
`docs/v0.2/ROADMAP.md`, and the latest `docs/journal/CHANGELOG.md`.

Focus on design/architecture fit rather than line-level code:

- Does the motion language reinforce LBH's visual hierarchy and "couch test"
  readability?
- Are title/menu/results/in-match surfaces differentiated enough?
- Does the UI/VFX boundary still make sense before we implement the Three VFX
  manager?
- Which motion/VFX slice should be next for reviewable impact?
- What should be cut, deferred, or kept static to protect movement readability?

## Verification

- `npm run test:ui-motion` passed.
- `git diff --check` passed.
- `npm run test:ui` passed 13/13. Fresh artifacts were written to
  `tests/screenshots/ui-visual-2026-06-28T233408293Z/manifest.json`.
- `npm run test:fast` passed after the code, docs, and review updates.
