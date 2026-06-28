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

## Pass 0 - Direction Package

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

Tasks:

- brighten shared UI role colors to match entity/fabric targets;
- keep letter spacing at zero for operational UI;
- move remaining hard-coded DOM HUD colors toward token variables;
- add missing token roles for danger, amber, anomaly, ecology, and primary text.

Acceptance:

- HUD colors match the role palette in `UI-VISUAL-SYSTEM.md`;
- selected/warning/salvage/inhibitor states do not share ambiguous colors;
- CSS and JS tokens agree on base palette values.

## Pass 2 - Canvas UI Primitive Kit

Tasks:

- add shared canvas helpers for panel, bracket, selected row, command button,
  segmented gauge, warning strip, and role-color lookup;
- replace duplicated menu/result drawing snippets with the helper kit;
- keep primitives small and boring so screens can still move fast.

Acceptance:

- title, profile/home, map select, pause, and results screens stop hand-rolling
  one-off frame/panel colors;
- every selectable row and command button has the same focus language;
- no UI helper owns gameplay state.

## Pass 3 - Title And Profile Flow

Tasks:

- warm the title scene before captures so the well/fabric is visible;
- keep the title over the live sim rather than a card;
- make the first action readable from couch distance;
- simplify profile creation/delete overlays with stronger focus and danger
  treatment.

Acceptance:

- a title screenshot reads as LBH within one second;
- title and profile flows work with keyboard and controller;
- deletion is clearly destructive without becoming a full-screen panic state.

## Pass 4 - Home / Main Menu

Tasks:

- reshape home around five large tabs: ship, vault, rig, chronicle, launch;
- make the ship/readiness center treatment match the entity visual language;
- move secondary data into right-side instrument panels;
- make launch the loudest action with risk-forward language.

Acceptance:

- selected tab and next action are readable at couch distance;
- ship/vault/rig/chronicle/launch are visually distinct without relying on
  paragraph copy;
- inventory rows still handle long item names without overflowing.

## Pass 5 - Pre-Match / Map Select

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
- controller focus does not disappear in dense map information.

## Pass 6 - In-Match HUD

Tasks:

- shrink UI footprint in the center and strengthen edge reads;
- make fuel, hull, signal, cargo, exits, and abilities work as icon/bar reads
  before text;
- convert warnings to compact role-colored panels with local backing;
- keep Inhibitor text corruption bounded and optional per its existing config.

Acceptance:

- player control/motion remains unobscured;
- labels can be visually ignored and the critical bars/icons still read;
- warnings are readable and transient.

## Pass 7 - Results / Run Report

Tasks:

- rebuild result hierarchy around outcome, cause/reward, cargo accounting, and
  next action;
- use red/magenta only when the run outcome or threat source warrants it;
- keep salvaged value amber and profile/vault deltas readable.

Acceptance:

- death/extraction outcome is unambiguous at couch distance;
- cargo recovered/lost and earnings are readable without scanning the whole
  screen;
- next action is obvious for keyboard and controller.

## Pass 8 - UI Visual Harness

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
- the harness complements `visualReference` instead of duplicating it.

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

