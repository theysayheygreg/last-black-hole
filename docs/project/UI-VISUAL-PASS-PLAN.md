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
- The first shared motion layer is live in `src/ui/motion.js` and has been
  applied as a light pass across the canvas menu/result stack.

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
  launch, continue, delete, confirm. The action label stays inside the button;
  input affordances draw as smaller subprompt text below the button.
- `drawSegmentedGauge(ctx, rect, options)` - fuel, hull, signal, cargo capacity,
  or readiness cells.
- `drawWarningStrip(ctx, rect, options)` - compact danger/anomaly/signal panels
  with local backing.
- `fitUiText(ctx, text, maxWidth, options)` - consistent truncation for long
  cargo names, profile names, and map labels.

The first implementation pass should move duplicated helpers out of
`src/main.js` and `src/run-results.js`, then migrate screens one at a time. The
goal is not a giant UI rewrite. The goal is one vocabulary.

## UI Motion And VFX Bridge

The earlier UI motion ideas should be reframed as a two-layer system:

- **UI motion layer:** DOM/canvas transforms, text reveals, panel expansion,
  focus movement, command timing, and reduced-motion fallbacks. This layer owns
  screen truth and remains readable without Three VFX.
- **VFX accent layer:** renderer-neutral events consumed by the Three VFX kit.
  This layer adds particles, scan splinters, aperture pulls, glyph embers, and
  screen-space faults when a UI beat deserves spatial presence.

Concrete reframes:

- **Typing/walking text:** keep normal operational text in DOM/canvas. Title
  identity and Inhibitor-owned warnings may emit `titleGlyphFault` or
  `inhibitorUiFault` events from measured glyph slots, but subtitles, CTAs,
  timers, cargo, fuel, and controller prompts stay clean.
- **Directional wipes:** use UI masks for ordinary screen transitions. Launch,
  extraction, collapse, and portal/rift transitions can add `launchTransition`,
  `portalTransition`, or `collapseReportFault` VFX underneath the readable UI
  so the transition feels spatial instead of just graphical.
- **Windows expanding from a point/corner:** keep the panel geometry in the UI
  primitive kit. Add only small edge ticks, contact glow, or command pulses for
  high-value panels; do not attach particle storms to every modal.
- **Title attract loop:** this is the best first bridge. The clean wordmark
  remains canvas text, while corruption faults emit screen-space VFX behind it:
  magenta glyph embers, symbol motes, scan splinters, and a small rift/aperture
  response in the title world.
- **Results screens:** death/collapse/extraction VFX may continue under the
  local matte for a few seconds, but outcome, cause, cargo, earnings, and
  continue remain normal UI reads.

Acceptance:

- disabling VFX never breaks navigation or state comprehension;
- reduced-motion captures still show the selected action and outcome clearly;
- in-match UI motion does not add center-field noise while the player is
  steering;
- `npm run test:ui` proves still-frame readability, while short capture clips
  are used for title, launch, and results timing review.

First bridge status:

- `titleGlyphFault` events now emit from measured title glyph slots.
- The Three renderer has a `screen-vfx-layer` below clean UI text.
- `titleVfx` and `titleVfxHeavy` renderer fixtures are explicit review states,
  separate from representative promo/gameplay captures.
- `src/ui/motion.js` now owns UI-only panel reveals, type-on copy, row stagger,
  CTA pulses, directional wipes, and reduced-motion fallbacks.
- Title, profile select, home, map select, run results, meta report, pause, and
  transition overlays have the first shared motion pass. This is not the final
  composition pass for those screens; it is the timing vocabulary.
- The next judgment should be motion clips, not single stills.

## Screen Inventory

| Surface | Current Owner | Target Reference | Couch-Critical Reads | Current Gap |
|---------|---------------|------------------|----------------------|-------------|
| Title | `src/main.js` | `docs/reference/target-visuals/2026-06-28-ui/title-screen.png` | game identity, first action, live well/fabric | plain-left is the shipped v0.2 default; opposite-left remains a taste challenger for Greg's review |
| Profile Select | `src/main.js` | follows title language | selected profile, load/create/delete, destructive state | first motion pass shipped; danger/delete composition still needs stronger treatment |
| Home / Main Menu | `src/main.js` | `main-menu-home.png` | selected tab, pilot/ship status, EM/cargo summary, launch | first static composition slice shipped; next work is content density, profile/destructive-state polish, and Deck-specific prompt review |
| Map Select / Survey Terminal | `src/main.js` | v0.3 approved valid/locked survey references | selected sector, topology reconstruction, broad risk, possible contents, confidence, launch or locked state | source vertical and accepted Deck proof are complete; W2-A4 authority-parity dependency remains, with physical Deck and Greg taste gates still open |
| In-Match HUD | `index-a.html`, `src/hud.js` | `in-match-hud.png` | fuel, hull, signal, cargo, exits, warning, active ability | edge reads need stronger icon/bar hierarchy and better backing |
| Pause | `src/main.js` | shared command overlay | paused state, resume, settings, abandon | first motion pass shipped; needs command-panel composition cleanup |
| Results / Run Report | `src/run-results.js` | `post-match-results.png` | outcome, cause/reward, cargo accounting, earnings, continue | primitives and motion shipped; still needs final theatrical layout review |
| Meta Salvage Report | `src/main.js` | results-adjacent | profile delta, unlock/reward, next action | first motion pass shipped; should still converge with results primitives |

## Screen Contracts

### Title

The title screen sells the product in the first second. It should show a warmed
live well/fabric composition behind the wordmark and menu, not a black first
frame with text floating over it. The first action must sit at couch-critical
size, with lower-priority system readouts allowed as texture. The selected item
gets cyan/flow focus, while destructive or unavailable states stay out of the
default title read.

Plain-left is the current shipped v0.2 title layout. Center and right variants
are archive/reference fixtures; opposite-left stays as a taste challenger
because it gives the wordmark darker backing and stages the void/rift depth
differently. All variants use the same local backing and safe gutters. The
wordmark's base state stays clean; Inhibitor-pink corruption appears only in
short deterministic glyph-overlay bursts so the comparison is about composition
rather than styling. Treat title corruption as an animation layer: the source
label remains clean, while intensity controls how many glyph slots flicker and
how rapidly they swap.

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

### Map Select / Survey Terminal

Map Select is a survey terminal, not a route briefing or exact map. The center
reconstruction is the hero surface: a vague, seed-shaped topology read built
from broad basins, density, interference, open void, and uncertainty. It must
not reveal player spawn, exact wells, portals, wrecks, object layout, a route
line, or a path sequence.

The left rail lists Shallows `5x5`, Expanse `15x15`, and Deep Field `25x25`, then
generic locked sectors. The right rail explains what the selected survey may
contain using broad families or ranges under `POSSIBLE CONTENTS`, plus a broad
risk band and deliberately incomplete `SURVEY CONFIDENCE`. Possible contents
are not guaranteed objects, and signal pressure is not a Map Select promise.

Valid selections expose the launch command. Locked selections keep their row
readable, corrupt the center into withheld/redacted data, redact the right rail,
and expose no launch action or fake input prompt. Reduced motion uses a static
corrupted frame rather than flashing.

The canonical map registry owns dimensions plus each map's survey risk,
topology tuning, and visible descriptions. Map Select derives `5x5`, `15x15`,
and `25x25` from those dimensions and consumes that survey descriptor directly.

### In-Match HUD

The HUD exists to protect movement. Keep the center and lower-middle playfield
clear except for transient warnings. Fuel, hull, signal, cargo, exits, and
ability state should read as shape/bar/icon first and text second. Any text
over moving fabric needs local backing. Inhibitor corruption can appear only on
Inhibitor-owned labels and warnings, and must remain bounded by the existing
corruption config.

Zone/signature/event callouts over the playfield must punch in, read, and leave.
They need a local matte/backing, should avoid exact center unless they are true
emergency warnings, and should not linger over the well or the player's route.

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
- the bounded v0.3.1 Deck review capture also includes title exit, Ship/loadout,
  all three canonical survey scales, a locked survey, and an in-match wreck
  label frame at 1280x800;
- fail only on objective breakage: missing surface, unreadable sampled element,
  no visible focus, or canvas/image capture failure.

This lane should not assert pixel-perfect art. It should answer "can the player
read the decision?" and leave taste to playtest/review.

As Home and Map Select receive their composition pass, promote selected-action
and primary-value region samples from soft telemetry to hard checks. Do not
tighten broad art thresholds before the static screen composition has actually
landed.

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

Status: first slice shipped.

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

Shipped slice:

- `src/ui/canvas-primitives.js` now owns role colors, alpha handling, scanlines,
  panels, corner frames, selected rows, command buttons, segmented gauges,
  warning strips, status pills, section labels, key/value rows, and text
  fitting.
- `tests/ui-primitives.cjs` keeps the kit token-backed and gameplay-state-free.

## Pass 3 - Title And Profile Flow

Status: title first slice shipped; profile flow follows.

Tasks:

- warm the title scene before captures so the well/fabric is visible;
- keep the title over the live sim rather than a card;
- make the first action readable from couch distance;
- keep wordmark corruption as a bounded title-scale glyph overlay only;
- use local backing for title copy and command surfaces instead of dimming the
  full scene;
- use the title map as a small attract loop with a larger well, peripheral
  readable objects, and a repeatable rift event;
- simplify profile creation/delete overlays with stronger focus and danger
  treatment.

Acceptance:

- a title screenshot reads as LBH within one second;
- the `title-attract` harness frame shows the loop still readable after the
  first warmed title frame;
- title and profile flows work with keyboard and controller;
- deletion is clearly destructive without becoming a full-screen panic state;
- first action text is 24px or larger at the current 1280-wide game scale.

Shipped title slice:

- `src/main.js` now draws the title through a dedicated overlay helper with a
  cyan/bone wordmark, title-only bounded glyph-flicker corruption, local
  gradient backing, a clean subtitle/tagline, a status strip, and a shared
  command button CTA.
- Title glyph faults now emit renderer-neutral VFX events that the Three
  `screen-vfx-layer` turns into bounded magenta/bone embers and scan splinters
  behind the clean wordmark.
- `src/maps/title-screen.js` and the renderer title fixture now use a larger
  central well plus stars, wreck clusters, orbiting bodies, and a rift aperture
  that fades out and returns on the attract loop.
- `tests/ui-visual.cjs` captures both `title` and `title-attract`.

## Pass 4 - Home / Main Menu

Status: first static composition slice shipped on 2026-06-28.

Tasks:

- reshape home around five large tabs: ship, vault, rig, chronicle, launch;
- make the ship/readiness center treatment match the entity visual language;
- move secondary data into right-side instrument panels;
- make launch the loudest action with risk-forward language.

Acceptance:

- selected tab and next action are readable at couch distance;
- central ship/readiness uses the same silhouette/contact-matte language as the
  world entity pass;
- ship/vault/rig/chronicle/launch are visually distinct without relying on
  paragraph copy;
- inventory rows still handle long item names without overflowing;
- launch remains the strongest action even when the selected tab is not
  `launch`.

Shipped slice:

- `src/main.js` now draws Home as three major surfaces: pilot console/tab rail,
  central selected-tab content, and a persistent launch rail.
- Ship/Home uses a small shared ship-silhouette/contact-matte treatment, role
  colors, segmented readiness gauges, and larger command CTA language.
- Footer prompts are split into short lines so they remain legible instead of
  truncating inside the narrow right rail.

## Pass 5 - Map Select / Survey Terminal

Status: v0.3 survey-terminal source and accepted visual proof complete on
2026-07-15; style-guide consistency is recorded here. Canonical map/survey
metadata parity is source-complete; physical Deck plus Greg taste review remain
open.

Tasks:

- keep the survey reconstruction as the hero surface;
- use aggregate topology, density, broad risk, possible contents, and incomplete
  confidence without exposing exact layout facts;
- keep `5x5`, `15x15`, and `25x25` as the active player-facing scale labels;
- keep legends supplementary and preserve the shared graphical action-glyph
  contract;
- make valid and locked states distinct, with no action for locked rows and a
  static corruption treatment in reduced motion.

Acceptance:

- the player can identify the selected sector, topology read, broad risk,
  possible contents, confidence, and launch-or-locked state at distance;
- no route line, path sequence, spawn marker, exact well, portal, wreck, or
  object layout appears in the player-facing survey;
- controller focus does not disappear in dense map information;
- locked state remains readable without motion or a fake action prompt.

Shipped survey-terminal slice:

- Map Select now uses a three-panel survey-terminal hierarchy: map-class
  register, coarse `SURVEY RECONSTRUCTION`, and interpretation/readiness rail.
- The center uses seed-shaped broad regions, density, and uncertainty; it does
  not plot exact entities or a player-facing route.
- The right rail uses possible-contents families/ranges, broad risk,
  incomplete confidence, and the shared `BEGIN DROP` graphical glyph contract
  for valid selections.
- Possible-content ranges are text reads from canonical aggregate populations;
  labels and descriptions come from the same canonical map survey descriptor,
  and the right rail does not use decorative segmented chunk bars.
- Locked rows show redacted/withheld center and right-rail data and expose no
  launch action. Reduced motion holds the corruption as a static frame.

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

Status: first screen migration shipped.

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

Shipped slice:

- `src/run-results.js` now draws through the shared canvas primitives.
- Death/collapse and extraction share structure while using different role
  colors for outcome, cargo, cause, value, and continue action.
- Death continues to use danger language for outcome/cargo/cause, but the
  continue CTA is flow-colored `RETURN HOME` so navigation does not read as
  another damage warning.

## Pass 8 - UI Visual Harness

Status: baseline harness plus reduced-motion/motion-helper canaries shipped,
thresholds intentionally loose.

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

Shipped slice:

- `npm run test:ui` captures title, profile select, home, map select, in-match
  HUD, extracted results, death results, and reduced-motion title.
- Each capture writes full-size screenshots plus 50 percent and 25 percent
  couch-proxy images under `tests/screenshots/ui-visual-<timestamp>/`.
- The default `visual` lane now includes the UI visual harness alongside the
  renderer fixture harness.
- `tests/ui-motion.cjs` verifies the pure motion helpers through the
  fast/core/static/full lanes.

## Suggested Implementation Order

1. Done: build `src/ui/canvas-primitives.js` and a tiny smoke/static test for
   token access, alpha handling, text fitting, and no gameplay imports.
2. Done: add the first UI visual harness as a baseline capture lane with loose
   assertions. Capture current screens before redesigning them.
3. Done: migrate results first. `src/run-results.js` is isolated,
   consequence-heavy, and a good proof that the primitives work.
4. Partly done: migrate title and profile select. Title hierarchy and first
   motion language shipped; destructive profile focus still needs composition
   work.
5. Done: migrate the first home/main menu static composition and token
   brightening slice. Continue with profile/destructive-state cleanup later.
6. Done: migrate the first pre-match/map select drop-briefing composition.
   Continue with richer objective/route semantics later.
7. Next: migrate the in-match HUD. Keep this after Home/Map because gameplay clarity needs
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
