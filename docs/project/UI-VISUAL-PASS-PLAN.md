# UI Visual Pass Plan

> **v0.2 status:** Implementation plan for bringing menus, HUD, and run
> overlays up to the current Three/entity visual direction.

## Goal

Rebuild LBH's UI language around the new dark-first, high-contrast Three scene
without losing the terminal/ASCII identity. The pass should make every major
screen easier to read at desk, Steam Deck, social-capture, and couch distances.

## Current Starting Point

- Font roles are in place: Oxanium for title-scale display, Monaspace for UI
  and glyph surfaces, Noto as fallback coverage.
- DOM HUD tokens exist in `src/ui/design-tokens.js`, but several CSS/canvas
  surfaces still carry older muted colors and ad hoc sizes.
- Menus and results are mostly canvas-drawn terminal screens in `src/main.js`
  and `src/run-results.js`.
- The Three scene now has a stronger role palette and object-readability
  contract than the older UI docs did.
- The direction package is started: moodboard, target concepts, couch-test
  rules, and first shared token brightening are already in the repo.
- The remaining work is mostly screen composition, shared canvas primitives,
  focus language, and repeatable visual validation.

## Implementation Shape

The UI rebuild should not start by changing frameworks. Keep the current split:
DOM for the live HUD and dev/config surfaces, canvas for the title, profile,
menus, map select, pause, and results. That preserves the existing input/state
flow while still letting the visual language move forward.

Add one shared canvas kit:

- `src/ui/canvas-primitives.js`
- imports from `src/ui/design-tokens.js` and `src/ui/typography.js`;
- stateless drawing helpers only;
- no gameplay state, no input state, no direct `CONFIG`, no renderer globals.

Initial helper set:

- `roleColor(role, alpha = 1)` - maps `flow`, `danger`, `salvage`,
  `anomaly`, `ecology`, `text`, and `muted` to the shared palette.
- `withAlpha(color, alpha)` - one central path for RGBA/hex alpha handling.
- `drawUiPanel(ctx, rect, options)` - translucent blue-black backing, thin
  role border, optional title rail.
- `drawCornerFrame(ctx, rect, options)` - NERV/Marathon-style bracket frame for
  readable focus without filling the whole playfield.
- `drawSelectedRow(ctx, rect, options)` - shared row focus with rail, outline,
  and optional icon slot.
- `drawCommandButton(ctx, rect, label, options)` - large command actions only:
  launch, continue, delete, confirm.
- `drawSegmentedGauge(ctx, rect, options)` - fuel, hull, signal, cargo capacity,
  or readiness cells.
- `drawWarningStrip(ctx, rect, options)` - compact danger/anomaly/signal panels
  with local backing.
- `fitUiText(ctx, text, maxWidth, options)` - consistent truncation for long
  cargo names, profile names, and map labels.

The first implementation pass should move duplicated helpers out of
`src/main.js` and `src/run-results.js`, then migrate screens one at a time. The
goal is not a giant UI rewrite. The goal is one vocabulary.

## Screen Inventory

| Surface | Current Owner | Target Reference | Couch-Critical Reads | Current Gap |
|---------|---------------|------------------|----------------------|-------------|
| Title | `src/main.js` | `docs/reference/target-visuals/2026-06-28-ui/title-screen.png` | game identity, first action, live well/fabric | old red title weight, prompt hierarchy, warm-up/capture timing |
| Profile Select | `src/main.js` | follows title language | selected profile, load/create/delete, destructive state | small modal texture and inconsistent danger treatment |
| Home / Main Menu | `src/main.js` | `main-menu-home.png` | selected tab, pilot/ship status, EM/cargo summary, launch | centered terminal frame, dense copy, launch not loud enough |
| Pre-Match / Map Select | `src/main.js` | `pre-match-drop-briefing.png` | selected sector, risk, objective, hull, launch action | preview is secondary to list data, route colors not strong enough |
| In-Match HUD | `index-a.html`, `src/hud.js` | `in-match-hud.png` | fuel, hull, signal, cargo, exits, warning, active ability | edge reads need stronger icon/bar hierarchy and better backing |
| Pause | `src/main.js` | shared command overlay | paused state, resume, settings, abandon | should inherit command panel language after core screens |
| Results / Run Report | `src/run-results.js` | `post-match-results.png` | outcome, cause/reward, cargo accounting, earnings, continue | too narrow and terminal-flat for the most consequential screen |
| Meta Salvage Report | `src/main.js` | results-adjacent | profile delta, unlock/reward, next action | should share results primitives instead of a separate visual dialect |

## Screen Contracts

### Title

The title screen sells the product in the first second. It should show a warmed
live well/fabric composition behind the wordmark and menu, not a black first
frame with text floating over it. The first action must sit at couch-critical
size, with lower-priority system readouts allowed as texture. The selected item
gets cyan/flow focus, while destructive or unavailable states stay out of the
default title read.

### Profile Select

Profile selection is a utility surface, but it still needs the same visual
authority. Slots should read as rows with one strong focus rail, and delete
confirmation should switch to danger language with a short consequence line.
No long paragraphs. No tiny-only delete affordance. Profile names must pass the
same sanitization and text-fitting rules as the rest of the UI.

### Home / Main Menu

Home is the game's instrument console. It should not become a literal hangar
painting or a store dashboard. The five major tabs are ship, vault, rig,
chronicle, and launch. The center should present pilot/ship readiness and a
small entity-style ship read; the right side holds secondary panels for cargo,
EM, hull, or run prep; the bottom strip holds input prompts. Launch is the
loudest command because it is the risk gate.

### Pre-Match / Map Select

Map select is a briefing, not a spreadsheet. The map preview is the hero
surface and should communicate route shape before the text explains it. Route
colors reuse world roles: cyan for flow/player path, amber for value, red for
danger, magenta/violet for anomaly, green for ecology/neutral life. The selected
sector, expected pressure, current hull, and launch readiness are the only
must-read items at distance. Legends and details can be smaller.

### In-Match HUD

The HUD exists to protect movement. Keep the center and lower-middle playfield
clear except for transient warnings. Fuel, hull, signal, cargo, exits, and
ability state should read as shape/bar/icon first and text second. Any text
over moving fabric needs local backing. Inhibitor corruption can appear only on
Inhibitor-owned labels and warnings, and must remain bounded by the existing
corruption config.

### Pause

Pause should be a quiet command overlay, not a new visual system. Resume is the
primary action. Settings/config are secondary. Abandon run is danger-coded and
requires a confirmation treatment. The live scene can remain visible beneath a
local matte so the player keeps spatial context.

### Results / Run Report

Results are the most theatrical UI surface. First read: outcome. Second read:
why it happened or what was earned. Third read: cargo, EM, profile/vault delta,
and the next action. Death and collapse can use direct danger red. Extraction
should feel like haunted relief, not a victory fireworks screen. Salvage and EM
stay amber; anomalous causes can use magenta/violet sparingly.

## Harness Contract

Add a focused UI visual lane after the primitive kit exists. It should be a
companion to renderer validation, not a replacement for gameplay tests.

Proposed command:

```sh
node tests/ui-visual.cjs
```

The lane should:

- launch a fresh browser and fresh local stack, or hard-reset the test API
  before every capture;
- use `?renderer=three&capture=1` and deterministic fixture state where
  possible;
- capture title, profile select, home, map select, in-match HUD, death results,
  and extraction results;
- store frames under `tests/screenshots/ui-visual-<timestamp>/` with a manifest;
- emit reduced "couch proxy" images, probably 50 percent and 25 percent scale;
- sample a few named regions for contrast: selected action, danger warning,
  fuel/hull/signal bars, map selected sector, result outcome, continue action;
- fail only on objective breakage: missing surface, unreadable sampled element,
  no visible focus, or canvas/image capture failure.

This lane should not assert pixel-perfect art. It should answer "can the player
read the decision?" and leave taste to playtest/review.

## Pass 0 - Direction Package

Status: started.

Tasks:

- create the UI moodboard and translation rules;
- create target concepts for title, home/main menu, pre-match, in-match HUD,
  and post-match results;
- write the contrast, sizing, and couch-test contract;
- sync the design-system docs with the current Three layer reality.

Acceptance:

- new docs point to concrete target images and source references;
- concept images are clearly labeled as mood/composition targets, not exact
  implementation specs;
- the couch test is named and available for future reviews.

## Pass 1 - Token And CSS Cleanup

Status: partial.

Tasks:

- brighten shared UI role colors to match entity/fabric targets;
- keep letter spacing at zero for operational UI;
- move remaining hard-coded DOM HUD colors toward token variables;
- add missing token roles for danger, amber, anomaly, ecology, and primary text;
- audit `src/main.js`, `src/run-results.js`, and `src/hud.js` for old local
  color strings that now contradict `src/ui/design-tokens.js`.

Acceptance:

- HUD colors match the role palette in `UI-VISUAL-SYSTEM.md`;
- selected/warning/salvage/inhibitor states do not share ambiguous colors;
- CSS and JS tokens agree on base palette values;
- no new screen code introduces one-off role colors without adding a token or
  explaining why it must be local.

## Pass 2 - Canvas UI Primitive Kit

Status: ready next.

Tasks:

- add shared canvas helpers for panel, bracket, selected row, command button,
  segmented gauge, warning strip, and role-color lookup;
- replace duplicated menu/result drawing snippets with the helper kit;
- keep primitives small and boring so screens can still move fast;
- move local frame helpers out of `src/main.js` and `src/run-results.js` only
  when a migrated screen uses the shared version.

Acceptance:

- title, profile/home, map select, pause, and results screens stop hand-rolling
  one-off frame/panel colors;
- every selectable row and command button has the same focus language;
- no UI helper owns gameplay state;
- the helper kit can be smoke-tested without starting a match.

## Pass 3 - Title And Profile Flow

Status: follows primitives and baseline captures.

Tasks:

- warm the title scene before captures so the well/fabric is visible;
- keep the title over the live sim rather than a card;
- make the first action readable from couch distance;
- simplify profile creation/delete overlays with stronger focus and danger
  treatment.

Acceptance:

- a title screenshot reads as LBH within one second;
- title and profile flows work with keyboard and controller;
- deletion is clearly destructive without becoming a full-screen panic state;
- first action text is 24px or larger at the current 1280-wide game scale.

## Pass 4 - Home / Main Menu

Status: main composition pass.

Tasks:

- reshape home around five large tabs: ship, vault, rig, chronicle, launch;
- make the ship/readiness center treatment match the entity visual language;
- move secondary data into right-side instrument panels;
- make launch the loudest action with risk-forward language.

Acceptance:

- selected tab and next action are readable at couch distance;
- ship/vault/rig/chronicle/launch are visually distinct without relying on
  paragraph copy;
- inventory rows still handle long item names without overflowing;
- launch remains the strongest action even when the selected tab is not
  `launch`.

## Pass 5 - Pre-Match / Map Select

Status: needs composition redesign.

Tasks:

- make the map preview the hero surface;
- use route colors from the world role palette;
- show risk, signal pressure, expected run shape, hull, cargo objective, and
  launch readiness in a consistent hierarchy;
- keep legends supplementary.

Acceptance:

- the player can identify selected sector, risk, launch action, and major
  route anchors at distance;
- map preview colors match in-run semantics;
- controller focus does not disappear in dense map information;
- route anchors remain distinguishable in a reduced couch-proxy screenshot.

## Pass 6 - In-Match HUD

Status: DOM token cleanup started, hierarchy pass still open.

Tasks:

- shrink UI footprint in the center and strengthen edge reads;
- make fuel, hull, signal, cargo, exits, and abilities work as icon/bar reads
  before text;
- convert warnings to compact role-colored panels with local backing;
- keep Inhibitor text corruption bounded and optional per its existing config.

Acceptance:

- player control/motion remains unobscured;
- labels can be visually ignored and the critical bars/icons still read;
- warnings are readable and transient;
- HUD state does not grow unbounded over long title/death/result idle periods.

## Pass 7 - Results / Run Report

Status: best first screen migration after primitives.

Tasks:

- rebuild result hierarchy around outcome, cause/reward, cargo accounting, and
  next action;
- use red/magenta only when the run outcome or threat source warrants it;
- keep salvaged value amber and profile/vault deltas readable.

Acceptance:

- death/extraction outcome is unambiguous at couch distance;
- cargo recovered/lost and earnings are readable without scanning the whole
  screen;
- next action is obvious for keyboard and controller;
- death, extraction, and abandoned-run variants share layout but not color
  meaning.

## Pass 8 - UI Visual Harness

Status: plan before implementation, then tighten after first screen migration.

Tasks:

- add deterministic captures for title, home, pre-match, in-match HUD, and
  results;
- review at Deck scale and reduced/couch scale;
- sample contrast for primary action, warning text, timer, and selected row;
- keep the harness focused on UI readability, not broad gameplay proof.

Acceptance:

- `npm run test:renderer` or a companion visual lane can show UI states without
  manual playthrough setup;
- failures report the surface and weak sampled element;
- the harness complements `visualReference` instead of duplicating it;
- the harness always uses a fresh browser/sim or an explicit reset, matching
  current playtest process rules.

## Suggested Implementation Order

1. Build `src/ui/canvas-primitives.js` and a tiny smoke/static test for token
   access, alpha handling, text fitting, and no gameplay imports.
2. Add the first UI visual harness as a baseline capture lane with loose
   assertions. Capture current screens before redesigning them.
3. Migrate results first. `src/run-results.js` is isolated, consequence-heavy,
   and a good proof that the primitives work.
4. Migrate title and profile select. Prove warm-up timing, title hierarchy, and
   destructive profile focus.
5. Migrate home/main menu. This is the largest composition pass and should use
   evidence from the earlier screens.
6. Migrate pre-match/map select. Promote the map preview and align route colors
   to in-run semantics.
7. Migrate the in-match HUD. Keep this last because gameplay clarity needs
   live playtest after the menu language settles.
8. Tighten harness thresholds after at least three screens have landed. Avoid
   failing future art exploration on premature pixel assumptions.

## Not In This Pass

- No React, full framework migration, or wholesale DOM rewrite.
- No new gameplay states just to support menu composition.
- No sim-truth changes hidden inside UI work.
- No promo-capture pipeline changes except where UI screenshots need a new
  deterministic state.
- No final wordmark production. Oxanium is the v0.2 stand-in until the wordmark
  gets its own art pass.

## Open Decisions For Greg

- Keep menus canvas-first for v0.2, or eventually move text-heavy menus to DOM?
  Recommendation: keep canvas for this pass, because it is already wired into
  input, capture, and state flow.
- Title first action language: `start run`, `select pilot`, or something more
  in-world. Recommendation: plain `start run` until the full opening flow is
  clearer.
- Home metaphor: hangar/station, instrument console, or ship OS. Recommendation:
  instrument console. It fits the dark operational UI without requiring literal
  hangar art.
- Extraction result tone: clean victory or haunted relief. Recommendation:
  haunted relief, with amber value reads and restrained cyan recovery language.
- Couch-test proxy: manual across-room review only, or an automated reduced
  screenshot artifact every harness run. Recommendation: both, with the
  automated proxy treated as a reviewer aid rather than a final judge.

## Risks

- **Over-instrumenting the playfield.** Dense reference UI is tempting, but
  gameplay still needs center clarity.
- **Color-role drift.** If canvas menus, DOM HUD, and Three entities each
  choose their own reds/cyans/golds, players lose the learned language.
- **Microtext cosplay.** The moodboard supports small calibration texture, but
  decision text must pass Deck and couch reads.
- **Full-screen neon.** Brightness is for decisions and affordances, not for
  filling the void.

## Performance Notes

The UI pass should be cheap. DOM HUD color changes and canvas primitive
refactors are not expected to move GPU cost meaningfully. The main performance
watchpoints are:

- excessive canvas text measurement per frame;
- new per-frame gradients/shadows in dense menus;
- unbounded warning/event DOM nodes;
- any future post-processing that tries to affect the UI after composition.

Cache repeated measurements, keep transient nodes bounded, and leave heavy
world post below the UI.
