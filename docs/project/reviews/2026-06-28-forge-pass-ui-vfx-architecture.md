# 2026-06-28 — Forge Pass: UI, Title, Typography, And VFX Bridge

> Status: v0.2 architecture review packet for Greg. This is staged for the
> next review session, not a replacement for a fresh playtest.

## Scope

This pass reviewed the recent UI visual-system, title-attract, typography,
Inhibitor text-corruption, visual-harness, and Three VFX planning work.

Sources read:

- `AGENTS.md`
- `docs/v0.2/README.md`
- `docs/design/PILLARS.md`
- `docs/design/DESIGN.md`
- `docs/design/MOVEMENT.md`
- `docs/design/TEST-HARNESS.md`
- `docs/project/JAM-CONTRACT.md`
- `docs/project/ROADMAP.md`
- `docs/v0.2/ROADMAP.md`
- `docs/design/UI-VISUAL-SYSTEM.md`
- `docs/project/UI-VISUAL-PASS-PLAN.md`
- `docs/project/THREE-VFX-PASS-PLAN.md`
- recent commits from `e563588` through `62926c2`

## Findings Fixed In This Pass

### 1. Title renderer fixture duplicated the playable title scene

The playable title map and `FIXTURE_TITLE` carried the same well, star, wreck,
planetoid, portal, and config data in two files. That makes visual review
fragile: the title screen could be adjusted for the player while renderer
captures silently drift.

Fix:

- `src/maps/renderer-fixtures.js` now imports `MAP` from
  `src/maps/title-screen.js` and spreads it into `FIXTURE_TITLE`.
- `tests/validation.cjs` now guards that the renderer title fixture reuses the
  playable title scene source.

### 2. UI title fixtures inherited attract-loop time from prior captures

`showUiFixture('title')` set the title layout and ready timer, but only reset
the title attract-loop clock when `loopTime` was explicitly provided. The UI
visual harness captures several title layouts in sequence, so the comparison
frames could drift through different rift/story states.

Fix:

- `src/test-api.js` now resets title fixture loop time to `0` unless a test
  passes an explicit `loopTime`.
- Explicit `title-attract` and `title-glitch` captures still request their own
  loop time.

### 3. Agent onboarding still began in jam-era truth

The repo front door still emphasized March jam constraints, "no code before
Monday", and multiplayer-as-stretch language. That is misleading in the v0.2
Three/authority/platform era.

Fix:

- `AGENTS.md` now opens with a v0.2 current-truth note, points first at
  `docs/v0.2/README.md`, `DESIGN-CODE-DELTA.md`, current design/roadmap docs,
  and names current constraints: ASCII identity, movement feel, sim authority,
  coordinate centralization, and 60fps.

### 4. v0.2 roadmap did not yet name VFX as a first-class pass

The UI and entity visual work had source-of-truth docs, but the v0.2 roadmap
still framed UI as "run the primitive pass" and did not show the new VFX kit as
its own implementation slice.

Fix:

- `docs/v0.2/README.md` now includes `UI-VISUAL-PASS-PLAN.md` and
  `THREE-VFX-PASS-PLAN.md` in the read order/source-of-truth list.
- `docs/v0.2/ROADMAP.md` now has a VFX row plus a `v0.2.3c` event-driven VFX
  pass.
- `docs/project/ROADMAP.md` now has a 2026-06-28 current-status header and
  calls out UI motion/VFX integration.

## Architecture Verdict

The recent work is directionally sound.

The strongest current architecture choice is the split between readable UI
truth and renderer-neutral VFX events. It lets the title, launch, extraction,
collapse, and Inhibitor moments get much more alive without making particles
own navigation, menu state, or gameplay facts.

The weakest near-term risk is not a code bug. It is sequencing. The next VFX
slice needs manager/pool/stats/leak tests before visual ambition. If the first
implementation jumps straight into many bespoke effects, we will recreate the
old problem of cool visuals with unclear lifecycle and harness ownership.

## Tomorrow Review Agenda

1. Review the title screen in motion, especially the glyph-fault intensity.
   Still frames undersell this effect.
2. Choose the first VFX implementation slice:
   - recommended: `VfxManager` + bounded pool + `screenVfxGroup` +
     `titleGlyphFault` glyph embers/splinters;
   - defer ship thrust/portal/pickup until lifetime/stats are proven.
3. Decide whether `title-opposite-left` should become the default title layout
   after a fresh visual pass.
4. Review UI capture outputs from `npm run test:ui`, but treat them as
   canaries. Use live browser motion for taste.
5. Keep a manual note on reduced motion: every UI/VFX beat should still be
   readable with VFX disabled.

## Follow-Up Queue

High confidence:

- Implement the minimal VFX manager/pool/stats path.
- Emit `titleGlyphFault` events from measured title overlay glyph positions.
- Add VFX leak/expiry tests and one short clip capture for title motion.
- Continue UI migration with profile/home/map select before tightening visual
  thresholds.

Needs Greg taste:

- Exact title corruption intensity in motion.
- Whether VFX should ever move title text into Three, or stay behind canvas
  text for v0.2.
- Default title composition.

Defer:

- Fullscreen shader impulses until particle/event infrastructure is proven.
- Ship/portal/pickup/Inhibitor effect families until the title path proves the
  lifecycle and review workflow.

## Verification

- `npm run test:fast` passed after the fixture, validation, and docs updates.
- `npm run test:ui` passed 12/12 captures after the title-loop reset change.
  Fresh artifacts were written to
  `tests/screenshots/ui-visual-2026-06-28T064644784Z/manifest.json`.
- The screenshot artifacts are ignored by git and should be treated as local
  review evidence for tomorrow, not committed source.
