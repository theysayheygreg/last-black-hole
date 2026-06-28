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

### Pre-Match / Map Select

- The map preview is the hero. It should show wells, portals, wrecks, route
  risk, and signal pressure before text explains them.
- The selected sector, risk, expected run shape, hull, and launch confirmation
  are the couch-critical reads.
- Map legends are useful but must not be required to distinguish route anchors,
  danger, salvage, and anomaly colors.

### In-Match HUD

- Keep the playfield center mostly clean.
- Use edge instrumentation for timer, fuel, hull, signal, cargo, exits, and
  abilities.
- Bars and icons should remain readable if labels are hidden.
- Warning panels can punch into the field briefly, then leave.

### Results

- The first read is outcome: `extracted`, `collapsed`, or another future run
  result.
- The second read is cause or reward.
- The third read is cargo/accounting and next action.
- Results can be denser and more theatrical than in-match UI, but every number
  the player cares about needs a strong backing and enough size.

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

- a `uiReference` or scripted state capture for title, home, pre-match,
  in-match HUD, and results;
- Deck-scale screenshots for each surface;
- couch-test screenshots reviewed at reduced scale;
- contrast sampling for selected actions, warnings, and critical values;
- keyboard/gamepad focus-state checks so the selected action is obvious.

This should supplement, not replace, real playtests. A UI can pass contrast and
still feel noisy during movement.

