# UI Visual System

> **v0.2 status:** Current UI art-direction and readability contract for Last
> Singularity. This complements `DESIGN-SYSTEM.md`, the Three visual hierarchy,
> and the entity visual-language docs.

## North Star

The UI is an operational layer over a hostile cosmic instrument. It should feel
precise, tense, and readable: more command console than decorative dashboard.
The player is trying to read motion, danger, signal, cargo, and escape under
pressure. Every UI treatment earns its place by making that read clearer or by
making the run loop feel more consequential.

The scene can stay mostly black. The information cannot.

## Layer Relationship

Most post-processing belongs below the UI:

- world bloom, source glows, entity separation, lens flecks, color grading, and
  vignette resolve before UI;
- DOM/canvas UI draws cleanly over the world composite;
- final CRT/scanline/display-shell treatment may sit above everything only if
  it keeps text readable.

This keeps gameplay text and menu decisions crisp while preserving the fiction
that the whole view is a degraded instrument display.

## Motion And VFX Rules

UI motion and Three VFX should reinforce each other, but they are not the same
system. UI motion owns screen state, focus, hierarchy, and readability. VFX
owns spatial accent, impact, and dread. A menu selection, command, warning, or
result must still be understandable when VFX is disabled.

- Normal focus moves, tab changes, body text, prompts, timers, fuel, cargo, and
  controller hints do not emit particles or corruption by default.
- Title identity, launch, extraction, collapse, pickup confirmation, portal
  state changes, and Inhibitor-owned faults can emit renderer-neutral VFX
  events because those beats benefit from motion and atmosphere.
- Text-heavy motion stays in DOM/canvas unless a presentation beat truly needs
  depth. The first title/VFX bridge should use measured glyph positions from
  the canvas overlay and let Three draw behind the clean text.
- VFX should usually render below readable UI and above or beside the world
  layer it clarifies. CRT/display-shell treatment is the exception, and only if
  it keeps text readable.
- Reduced-motion mode replaces movement with static contrast and state changes.
  The couch-critical read cannot depend on flicker, scan tears, or particles.
- Motion review needs clips, not only still screenshots. Still captures prove
  readability; clips prove timing, rhythm, and restraint.

Current implementation starts in `src/ui/motion.js`. It provides panel reveal
clipping, type-on text, staggered rows, CTA pulses, directional wipes, and
reduced-motion resolution. `CONFIG.ui.motion` owns the tunable values, and the
dev panel exposes them for review. The first shipped application covers title,
profile select, home, map select, run results, meta report, pause, and scene
transition accents; in-match HUD values stay still unless a future playtest
proves a specific motion cue helps.

## Role Palette

| Role | Color Target | Use |
|------|--------------|-----|
| Void / panel core | `#000021`, `rgba(0, 4, 18, 0.72)` | page background, translucent panel backing |
| Primary text | `#EAF7FF` | key numbers, selected labels, headings under title scale |
| Muted text | `#9AB4CE` | secondary data, disabled-but-readable labels |
| Flow / player / tech | `#00E2FF` | player, route tech, active selection, stable gauges |
| Salvage / value | `#FFB938` | loot, earnings, stars, reward states |
| Direct danger | `#FF3336` | collapse, death cause, enemy threat, destructive warnings |
| Inhibitor / anomaly | `#FF3EB5`, `#B84CFF` | corruption, exotic threat, anomalous state |
| Ecology / sentry | `#38F58A` | living systems, neutral/ambient life, non-red active systems |
| Bone white / peak energy | `#FFF4DA` | strongest fabric/UI highlight, rare emphasis |

The palette rule is not "use every color." It is "when color appears, it has a
role the player can learn."

## Contrast Rules

- Critical text and values should target **7:1 contrast** against their local
  backing.
- Normal operational text should target **4.5:1 contrast**.
- Muted labels may drop toward **3:1** only when they are non-decision texture.
- Any text over moving ASCII fabric needs a local backing, matte, or shadow.
- Red, magenta, and amber must not be the only cue. Pair them with position,
  icon shape, border treatment, or wording.
- Do not solve readability by veiling the whole scene. Use local contrast
  pockets around the information that needs help.

## Size Rules

These are minimums at the current 1280-wide gameplay canvas scale:

| UI Type | Minimum | Notes |
|---------|---------|-------|
| Couch-critical action/result text | 24px | launch, continue, collapsed/extracted, blocking warning |
| Critical in-match numbers | 18px | timer, fuel percent, hull, selected objective count |
| Operational menu body | 14px | selectable rows, loadout names, cargo values |
| In-match secondary data | 12px | nearby readouts, labels that supplement icons/bars |
| Micro labels/calibration | 9-10px | texture only; never the only decision text |

Letter spacing stays `0`. LBH gets its sci-fi voice from Monaspace/Oxanium,
geometry, and color hierarchy, not from stretching small text until it becomes
harder to read.

Do not scale type continuously with viewport width. Use stable sizes plus
layout breakpoints and safe-zone rules for Deck, desktop, and capture outputs.

## The Couch Test

Every major UI surface needs a couch read:

1. Run at a 1280x720 or 1280x800 game scale.
2. View it from across the room, or downsample a screenshot until it feels like
   a TV/Steam Deck-at-arm's-length read.
3. Without squinting, identify the current screen, selected action, danger
   state, and next likely input.

If it fails, increase hierarchy first: larger primary text, stronger icon,
brighter role color, clearer backing, or less surrounding noise. Do not add a
tooltip or more explanatory copy to compensate for a weak first read.

## Surface Rules

### Title

- Title text sits over the live world, not inside a hero card.
- The well/fabric behind the title must be visible after warm-up.
- The title wordmark keeps a clean bone/cyan base aesthetic most of the time.
  Inhibitor corruption appears as brief pink burst faults, not a persistent
  resting color. Title-scale corruption is a UI animation overlay: unstable
  glyph slots flicker pink over the clean wordmark, and intensity means more
  slots changing more often. Subtitles, profile/menu copy, and the primary CTA
  stay clean.
- Title copy needs local backing over dense fabric: gradient veils, thin
  brackets, dark inline mattes, or command-button backplates. Do not solve this
  by dimming the whole scene.
- Side-aligned title variants should keep generous top, side, and bottom
  gutters so the wordmark reads from a couch while leaving the warmed well and
  colorscape visible. Plain-left is the current shipped v0.2 default; center and
  right are reference/archive variants, and opposite-left remains the live taste
  challenger if Greg wants the wordmark on darker backing.
- Pink title corruption should flicker in only during those title faults;
  cyan/flow stays reserved for stable framing, CTA, and system readouts.
- The title environment should behave like an old attract loop: a larger
  central well, peripheral stars/wrecks/comets/portals, and a small repeating
  event such as an aperture winking out. The backdrop tells the fantasy before
  the player presses anything.
- Menu choices can live left or lower-left, but the first action must be
  obvious from a couch distance.
- System-status microtext is allowed as mood, not navigation.

### Home / Main Menu

- Five primary areas remain legible as major tabs: ship, vault, rig,
  chronicle, launch.
- The current ship or pilot identity gets a central read; secondary inventory
  details go to a right-side panel.
- Launch is the loudest action and may use red/orange warning language because
  entering the run is an intentional risk.
- Current v0.2 implementation uses a three-panel instrument console: pilot/tab
  rail, central selected-tab work surface, and a persistent launch/readiness
  rail. Future changes should preserve that scan path unless a better
  couch-readable structure replaces it wholesale.

### Pre-Match / Map Select

- The map preview is the hero. It should show wells, portals, wrecks, route
  risk, and signal pressure before text explains them.
- The selected sector, risk, expected run shape, hull, and launch confirmation
  are the couch-critical reads.
- Map legends are useful but must not be required to distinguish route anchors,
  danger, salvage, and anomaly colors.
- Current v0.2 implementation frames this as a drop briefing: destinations,
  route-preview table, and briefing panel. The route table can remain schematic;
  it should not pretend to be an exact camera screenshot unless it is backed by
  actual map/renderer truth.

### In-Match HUD

- Keep the playfield center mostly clean.
- Use edge instrumentation for timer, fuel, hull, signal, cargo, exits, and
  abilities.
- Bars and icons should remain readable if labels are hidden.
- Warning panels can punch into the field briefly, then leave.
- Zone, signature, and event callouts over moving fabric need local backing and
  should dock away from exact center unless the message is a true emergency.

### Results

- The first read is outcome: `extracted`, `collapsed`, or another future run
  result.
- The second read is cause or reward.
- The third read is cargo/accounting and next action.
- Results can be denser and more theatrical than in-match UI, but every number
  the player cares about needs a strong backing and enough size.
- Outcome danger/extraction color can dominate the panel, but the continue
  action should read as navigation. Do not make the player press a red warning
  button just to leave the report.

## Component Language

- **Panels:** translucent blue-black backing, thin cyan/role-color border,
  corner brackets, no rounded app-card softness.
- **Selections:** bright cyan outline plus left-side marker or filled rail.
- **Warnings:** hard red border, compact wording, reason plus consequence.
- **Gauges:** segmented bars with bright filled cells and dim tracks; critical
  states change color and add pattern/label.
- **Buttons:** large command slabs only for real actions. Small options stay as
  rows or tabs.
- **Icons:** simple geometric/pixel glyphs aligned with entity categories.

## Validation Hooks

The current renderer harness already validates object readability through
`visualReference`. UI needs an equivalent lane:

- `npm run test:ui` scripted state captures for title, profile select, home,
  pre-match/map select, in-match HUD, extracted results, death results, and a
  reduced-motion title state;
- `node tests/ui-motion.cjs` for pure timing, type-on, reveal, CTA pulse, wipe,
  and reduced-motion helper behavior;
- Deck-scale screenshots for each surface;
- couch-test screenshots reviewed at reduced scale;
- contrast sampling for selected actions, warnings, and critical values;
- keyboard/gamepad focus-state checks so the selected action is obvious.

This should supplement, not replace, real playtests. A UI can pass contrast and
still feel noisy during movement.

Automated thresholds should follow composition work. Once Home and Map Select
finish their static pass, selected action and primary value regions should fail
the UI lane when they fall under the contrast/readability floor; before that,
the same measurements are useful review telemetry rather than hard art approval.
