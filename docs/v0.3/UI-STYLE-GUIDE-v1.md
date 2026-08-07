# LAST SINGULARITY — UI Style Guide v1

> Status: **canonical**. Author: Orrery, 2026-08-04, ratified against the
> 2026-08-04 UI design review and its decisions. This document SUPERSEDES
> `docs/design/UI-VISUAL-SYSTEM.md` and
> `docs/design/VISUAL-STYLE-GUIDE-v0.3.md` (which disagree with each other);
> where any doc, token file, or shipped screen conflicts with this guide,
> this guide wins and the code moves. Written to be followed by a human
> implementer, a code agent, or an image generator with equal precision.

---

## 0. The one-paragraph identity

Last Singularity's UI is a **salvage-era survey terminal**: a data-dense
military-scientific instrument rendered on a CRT that has outlived its
civilization. Near-black void, thin cyan structural strokes, bone-white
text, one warm accent for value. Everything is drawn, nothing is skinned:
no gradients-as-decoration, no rounded chrome, no glassmorphism, no lens
flares. The screen is quiet by default so that the two or three things
that matter are unmissable. It should feel like the instrument is
*telling you the truth reluctantly, in its own vocabulary* — precise,
laconic, slightly haunted.

### 0.1 Style capsule (paste verbatim into image-gen prompts)

```
Retro-futuristic CRT survey terminal UI, near-black deep-space blue
background (#000421 field on #000021 void), thin 1px cyan strokes
(#00E2FF at 30% opacity) with corner-bracket panel frames (no rounded
corners, no filled chrome), bone-white monospace text (#EAF7FF),
muted slate-blue secondary text (#9AB4CE), single amber accent for
values (#FFB938), rare magenta anomaly accents (#FF3EB5), faint
horizontal scanlines, subtle chromatic-aberration glow on headings only,
dense but strictly hierarchical data layout, generous void spacing
between panels, dot-matrix and ASCII contour textures, flat design,
no gradients, no lens flare, no rounded buttons, no glassmorphism,
16:9, sharp 1px lines
```

---

## 1. Canvas, grid, spacing

| Property | Value |
|---|---|
| Reference canvas | **1280 × 720** internal render (letterboxed inside 1280 × 800 on Deck) |
| Menu-screen outer margins | **64px** horizontal, **42px** vertical (`UI_DECK_GEOMETRY.viewport`) |
| In-play HUD edge margin | **24px** from every screen edge |
| Panel gap (between panels) | **20px** |
| Panel interior padding | **22px** horizontal, **18px** vertical |
| Spacing scale | **4 / 8 / 12 / 16 / 24 / 32 / 48** — every gap is one of these; nothing at 5, 7, 10 except grandfathered 10px terminal row gaps, which migrate to 8 or 12 on next touch |
| Minimum interactive row height | **58px** |
| Minimum button/slab | **240 × 56px** |
| Minimum icon cell | **44 × 44px** |
| Minimum tap/focus separation | **10px** |

**The three-panel terminal** (home, map select): left rail 190–220px,
right rail 284–336px, center takes the remainder (never below 320px).
Panels are separate physical instruments — they never share a border;
the void between them is part of the design. **Whitespace is authored**:
if a panel has little content, it stays sparse; content is never
stretched or inflated to fill a panel.

**Single-window screens** (profile select, pause, results): one centered
terminal window, max width 880px, max ~75% viewport height, the world/
scene dimmed to ≤20% behind a `rgba(0,2,12,0.80)` matte.

---

## 2. Color

### 2.1 The palette (complete — nothing outside this table ships)

| Role | Value | Usage — and ONLY this usage |
|---|---|---|
| Void | `#000021` | the universe; screen clear color |
| Field | `#000421` | panel-adjacent near-black fills, matte blocks |
| Panel fill | `rgba(0,2,10,0.78)` | panel interiors |
| Panel backing | `rgba(0,0,8,0.56)` | footers, sub-panels, icon cells `0.68` |
| Structure stroke | `rgba(0,226,255,0.32)` | panel borders, brackets, dividers |
| Text primary (bone-blue) | `rgba(234,247,255,0.94)` | all reading text |
| Text muted (slate) | `rgba(154,180,206,0.72)` | labels, captions, secondary |
| Bone (warm white) | `#FFF4DA` | wordmark, artifact category, rare warm highlight |
| **Route cyan** | `#00E2FF` (`0.9` active / `0.58` dim) | route, extraction, portals, selection, structure. NOTHING else is cyan |
| **Value amber** | `#FFB938` (`0.92`) | EM, salvage, cargo value, timers in warning. NOTHING else is amber; **amber never marks selection** |
| **Danger red** | `#FF3336` (`0.95`) | lethal threat, critical timer, destructive confirm. The ONLY red in the product |
| **Inhibitor magenta** | `#FF3EB5` (`0.95`) | inhibitor ecology contacts + warnings. NOTHING else is magenta |
| Anomaly violet | `#B84CFF` (`0.94`) | anomaly/data-core identity only |
| Ecology green | `#38F58A` (`0.9`) | uncommon tier + ability-ready states |
| Selection | border `rgba(0,226,255,0.95)`, fill `rgba(0,226,255,0.14)` | the focused row/slab |

Tier colors: common bone-blue `0.82` · uncommon ecology green `0.9` ·
rare route cyan `0.92` · unique value amber `0.95`. **Never pure gold
(`rgb(255,215,0)` is banned).** Tier color is identical everywhere an
item appears (icon, row, toast, results).

### 2.2 Color laws

1. **A screen shows void + neutrals + at most TWO active role colors.**
   The hero element decides the first; state decides the second.
2. **Role exclusivity is absolute.** Cyan = route/structure. Amber =
   value. Red = lethal. Magenta = inhibitor. A price is not danger →
   cost text is muted slate, flipping to danger red ONLY when
   unaffordable. A selection is not value → selection is cyan.
3. **One red.** All eight shipped red variants collapse to `#FF3336`
   (alpha may vary; hue may not).
4. **Never rely on hue alone** — pair color with a glyph, weight, or
   position change.
5. Backgrounds are never colored — role color lives in text, strokes,
   fills ≤ 0.14 alpha, and glyphs.

---

## 3. Typography

### 3.1 Families

| Stack | Faces | Used for |
|---|---|---|
| Display | **Oxanium** → Monaspace Neon | wordmark, screen titles, outcome banners, big numbers |
| UI mono | **Monaspace Neon** → JetBrains Mono → SF Mono → monospace | everything else |
| Glyph | UI mono + Noto Sans Symbols | input chips, icons-in-text |

Letter-spacing **0** everywhere (the mono grid provides the rhythm).
Tabular figures for all numbers. No italics except `- empty state -`
placeholders.

### 3.2 The scale (canonical — no other sizes exist)

| Token | px | Weight | Role |
|---|---|---|---|
| `micro` | **9** | 500–700 | texture only: nav fixes, watermark chrome. NEVER decision data |
| `small` | **10** | 500 | dense list metadata, captions |
| `body` | **12** | 400–500 | list rows, descriptions, footers |
| `emphasis` | **13** | 500 | key/value values, toast text |
| `couch` | **15** | 500 | HUD secondary values, subscreen body at Deck distance |
| `button` | **18** | 700 | command slabs, tab titles, **minimum for critical in-match numbers** |
| `value` | **24** | 700 | hero numbers (collapse timer, confidence %) |
| `heading` | **28** | 700 | screen/panel titles |
| `outcome` | **38–42** | 800 | results banner (EXTRACTED / CONSUMED BY…) |
| `wordmark` | **50** | 800 | title screen only |

The shipped 11px (most common size in the game) migrates to 12; shipped
8px migrates to 9; 20/21/22/25/26 one-offs snap to the nearest token.

**Floors (hard):** T1 critical in-play numbers (heat %, speed, timers) are
≥ **18px**; contact identity/range labels are ≥ **12px**. Menu body ≥
**12px**. 9–10px may never be the only rendering of a fact.
*(Split floor ratified retroactively by Greg, 2026-08-06 — originally
amended in commit `706597f8`. Reminder: guide amendments go through the
custodian and Greg, never as implementation-commit side effects.)*

### 3.3 Casing (voice rule — Greg-ratified)

- **ALLCAPS: titles and terminal moments only** — screen titles, section
  labels, outcome banners, immediate warnings, input chips.
- **lowercase: everything else** — body, descriptions, captions, button
  verbs in footers, status lines. A steady-state readout is lowercase
  (`noise 330m · falling`, not `NOISE 330M`).
- **In-play application:** instrument labels, steady status, and action
  captions stay lowercase; only terminal lock/warning moments use ALLCAPS.
- Never Title Case. Never mixed-case acronym styling except EM.

---

### 3.4 Labeling and text tone (skeleton — Troubadorb owns the flesh)

Human-readability rules the layout system cannot catch on its own.
These are the load-bearing bones; **Troubadorb's text/voice guide
expands them into the full wording ruleset**, and the two documents may
never conflict.

1. **One name, rendered once.** A surface's identity appears exactly
   once in view. If the tab rail already says CHRONICLE, the panel does
   not say it again — and never twice more (observed: tab + section
   label + heading, three CHRONICLEs in one glance). When a panel needs
   a heading, the heading adds information the tab didn't have
   (`RIG: DRIFTER` is legal; `RIG` under a RIG tab is not).
2. **No system identifiers in the player's world.** Element names,
   fixture defaults, internal ids, and dev vocabulary never surface as
   text ("UI PILOT" is a test-fixture name wearing a pilot's jacket).
   Every player-visible string is either diegetic vocabulary or a real
   value. Test fixtures must seed *diegetic* placeholder data (use the
   pilot-name generator, not "UI Pilot") precisely so leaks of this
   class are visible as defects, not camouflage.
3. **Labels state facts, headings claim identity, captions instruct.**
   One job per string; a string doing two jobs gets split or cut.
4. **The empty state teaches in-fiction** (`- vault empty -` +
   `salvage returns here after extraction`), never in dev voice
   (`no data`).
5. **Tone**: laconic, lowercase per §3.3, terminal-flavored, reluctant
   — the instrument states, it does not chat. Approved vocabulary lives
   in the theme glossary; new terms get taught once at first use.

## 4. Strokes, panels, surfaces, light

- **Strokes are 1px, always.** 2px exists only as the selected-state
  border. Nothing thicker except gauge fills.
- **Panel anatomy:** 1px structure stroke on the full rect (radius ≤
  2px — effectively square), plus **corner brackets**: 4 L-shaped ticks,
  arm length 12–18px, same stroke color at 0.6–0.9 alpha, drawn 2px
  outside the border. Brackets mark *instruments*; plain 1px rects mark
  *sub-regions inside* an instrument. No drop shadows on panels — depth
  comes from fill alpha layering (void → field → panel → backing).
- **Scanlines: one recipe.** Bone-white additive lines, alpha
  **0.018–0.035**, spacing **4px**, full-panel. (The dark-subtractive
  variant is retired.) World CRT scanline pass: 0.09 gameplay / 0.22
  title, must honor reduced-motion by dropping to 0.
- **Glow is earned.** Text glow (shadow blur 4, offset 2/3,
  `rgba(0,0,8,0.92)`) for readability on world backgrounds. Colored
  glow (6–8px) ONLY on: the wordmark, outcome banners, an engaged
  critical state (timer ≤60s, inhibitor contact). Persistent panels
  never glow at rest.
- **Redaction blocks** (solid `#000` rects breaking up a plot),
  dot-matrix fields, and ASCII contour lines are the sanctioned texture
  vocabulary (see the map-select concepts — `docs/project/reviews/
  assets/2026-08-04-ui-review/concept-map-select-*.png` are the
  fidelity bar for plot density).

---

## 5. Component anatomy

**Section label** — 10px, uppercase, muted slate, flanked by `--`
dashes: `-- possible contents --`. 16px space above, 8 below.

**Key/value row** — label 10px muted lowercase left; value 13px primary
right or at a fixed 136px label column. 24px pitch.

**List row** — min 58 × full width, 16/9 padding, 44px icon cell left,
title 14–16px, metadata 10px muted below title. Selected: cyan 2px
border + 0.14 cyan fill + row lifts content 1px. Never zebra striping.

**Status pill** — 118 × 26 min, 1px border + 0.14 fill in role color,
11–12px uppercase text. Pills state facts (`5X5`, `LOW`); they are
never buttons.

**Segmented gauge** — the ONLY gauge form. 8 segments default (4 for
small counts), 12–16px tall, filled cells in role color ≥0.9, empty
cells 0.14 track, 2px cell gap. **Continuous bars are banned** for
bounded quantities; a continuous strip may only render a truly
continuous live value (heat), and then at ≥6px height with a tick at
the threshold. Every gauge sits beside its label and its numeric value —
a gauge is never the only rendering.

**Command slab** — min 240 × 56, uppercase 18px 700, cyan border 0.95 +
fill 0.14 (role-tinted for outcome screens), left accent bar 3px.
Ready-state animation: a slow 0.3→1.0 sine pulse ≥2s period — never a
square-wave blink. The slab text is the action (`begin drop`), never
instructions. One primary slab per screen, maximum.

**Input chip + caption** — 32 × 32 min keycap/glyph chip (1px border,
backing fill, 10px glyph) + lowercase 12px caption at 8px gap. Chips
render ONLY with a caption (no orphan chips). Footer: chips in one row,
backed strip, 12px gaps, at panel bottom. Never advertise an action
twice on one screen (slab OR footer, not both).

**Toast / warning** — three tiers, one column, bottom-left, width 320:
- `threat` — 1px danger/magenta **hard left border 3px**, 13px, 4s,
  never evicted by lower tiers, max 3;
- `system` — muted border, 13px, 2.5s;
- `loot` — no border, tier-colored 12px text, 1.5s, max 3, collapses to
  `+3 items` when spammed.
Severity evicts upward only. Identical messages dedupe within 2s.

**Survey plot** — dense by contract: contour lines 1px at 0.25–0.5
alpha, dot-matrix density fields, region fills ≤0.12 alpha, redaction
blocks, hatched unstable zones, scanning line. **Legend required**: mark
key top-right in-plot (10px), density gradient strip bottom
(`low → high`). Confidence renders once, 24px + waveform sparkline.

**Iconography** — 1px-stroke geometric glyphs on the mono grid, one per
contact family: well = spiral, derelict = diamond, stellar = 4-point
star, scavenger = skull, anomaly = burst, exit = aperture ring. Icons
always pair with text; 16px on 44px cells.

---

### 5.1 World-annotation grammar (in-play — Mosaic's lane)

How the game marks things in the world. Adopted from proven practice
(Endless Sky's annotation system, re-derived for our canvas contract —
ratified by Greg 2026-08-07); Mosaic implements as canvas primitives in
the component library, and reviews measure against these rules.

- **Bracket shape encodes class.** Target/contact brackets are N
  tapered pointers evenly spaced on a ring: **4 = ship, 5 = aperture/
  portal, 3 = salvage.** A player learns the count once and reads
  class at any distance without color or text. Pointers aim inward;
  ship brackets rotate with the target's facing.
- **Off-screen contacts clamp, never vanish.** On the audible-contact
  ring and any radar-like instrument, an out-of-range or off-screen
  contact clamps to the rim (`position × radius/length`) — the player
  always knows *where*, even when not *how far*.
- **Rings, arcs, and dashes are one primitive** with radius, width,
  fraction, start angle, and dash count — used for timers, noise
  radius, residence progress, and brackets alike. Dash count scales
  with zoom so dashes stay constant-size in pixels.
- **World labels draw UNDER entities.** The world may occlude a label;
  a label may never occlude a threat. (The IN-RANGE prompt occluding
  the well at closest approach is the canonical violation.)
- **Static-body labels are placed once per run**, at run start:
  candidate anchor angles tested against every other label and body so
  static labels (wells, portals, wrecks) never collide; moving
  entities keep the per-frame offset ladder.
- **Labels never jitter**: world-anchored text renders at non-rounded
  positions.

*(rubric: check W1 below.)*

## 6. Information hierarchy

Four tiers, mapped to concrete treatment — every element on every
screen belongs to exactly one:

| Tier | What | Treatment |
|---|---|---|
| **1 · Hero** | the one thing this screen exists to say | value/heading/outcome size, role color, most void around it |
| **2 · Decision data** | what the player weighs to act | 13–18px primary text, gauges, pills; grouped under section labels |
| **3 · Support** | context that explains tier 2 | 10–12px muted; hidden before tier 2 shrinks |
| **4 · Texture** | fiction, chrome, telemetry theater | 9–10px, ≤0.5 alpha, never role-colored, never animated |

**One hero per screen** (ratified): title → wordmark · profile → slot
list · home/SHIP → the hull · VAULT → item list · RIG → track list ·
CHRONICLE → recent cycles · LAUNCH → route commitment · map select →
the survey plot · in-play → **the world itself** (HUD is tier 2 at the
edges; the center 60% of the screen belongs to the game) · results →
the outcome word · pause → resume.

**Budgets:** a menu panel carries ≤ 12 tier-1–3 elements; the in-play
HUD carries ≤ 10 persistent nodes per corner-column and ~25 total
(current build: 46 — the migration diets to budget). Duplication rule:
**a fact renders once per screen** (plus at most one world-space
encoding in play, e.g. noise number + noise ring).

---

## 7. Dos and don'ts

**DO**
- Let the void breathe — sparse panels are correct panels.
- Group with section labels; separate with space, not boxes-in-boxes.
- Pair every color with a second channel (glyph, weight, position).
- Write lowercase; save uppercase for the moments that deserve it.
- Use the fiction's own vocabulary — aperture, drop, cycle, residue —
  and teach each term once where it first matters.
- Draw locked/withheld content with full theatrical commitment (the
  ACCESS DENIED flow is the fidelity bar).
- Make texture obviously texture: 9px, half-alpha, off to the side.

**DON'T**
- No netcode vocabulary on player surfaces: *authority, sandbox, host
  reset, client, snapshot, effectId, home surface* are banned strings.
- No rounded corners, no filled button chrome, no gradients, no
  glassmorphism, no bloom-everything.
- No continuous pulse/bob/blink on persistent elements; motion is a
  state *transition*, not a state.
- No red that isn't lethal, no amber that isn't value, no cyan that
  isn't route/structure, no magenta that isn't inhibitor, no gold ever.
- No gauge without a label and number; no bar that encodes one bit.
- No constant strings dressed as live readouts; if it can't change,
  it's tier-4 texture and styled as such.
- No orphan input chips; no action advertised twice; no 9px decisions.
- No overlapping panels — if two things collide, one moves or dies.

---

## 8. Image-generation kit

Base: start every prompt with the §0.1 capsule, then add a surface
scaffold:

- **Survey/map screen:** "three-panel terminal layout: left destination
  list with small topology thumbnails, center large survey
  reconstruction plot dense with cyan/amber/magenta dot-matrix contour
  topology, black redaction rectangles, in-plot legend, right briefing
  rail with icon+segmented-bar contact rows, large amber confidence
  percentage with waveform sparkline, bottom cyan command slab 'BEGIN
  DROP'"
- **Deck/home screen:** "three-panel hangar terminal: left pilot tab
  rail, center ship subscreen with pixel-art ship portrait and
  key/value stat rows, right live instrument rail with segmented
  readiness gauges and amber EM ledger"
- **In-play HUD:** "gameplay frame: ASCII starfield world dominant in
  center, minimal corner instruments — top-left mission timer block,
  left vitals column, top-right route objective, bottom-right ability
  cards with segmented meters, bottom-left cargo readout, thin dashed
  cyan noise-radius ellipse around player ship"
- **Results screen:** "single centered terminal window, huge red
  outcome banner 'CONSUMED BY CHARYBDIS' with chromatic glow, three
  status pills, two-column telemetry (run summary / cargo manifest with
  strikethrough lost items), cyan return slab"

Negative prompt, always: `rounded corners, glossy buttons, gradients,
lens flare, glassmorphism, bright background, sans-serif body text,
cluttered center, watermark`

---

## 9. Constructing a new screen from scratch

Follow in order; do not skip. Each step's output feeds the next.

1. **Write the screen's sentence.** One line: *"This screen exists so
   the player can ____."* If the blank holds two verbs, split the
   screen or demote one verb to a section. This sentence is the commit
   message and the review anchor.
2. **Name the hero.** The single tier-1 element that answers the
   sentence. It gets the biggest type, the first role color, and the
   most surrounding void.
3. **List every fact, then tier it.** Write all candidate elements in a
   table with columns: fact · tier (1–4) · source (live value or
   constant). Constants are automatically tier 4 or cut. Apply the
   budgets (§6): ≤12 tier-1–3 per panel. Anything over budget is cut or
   moved behind a focus action — not shrunk.
4. **Choose the frame.** Three-panel terminal (browse + inspect +
   commit), single window (one decision), or overlay (interrupt).
   Get the rects from the layout contract — never hand-placed.
5. **Assign the two role colors** from the hero and the screen's
   dominant state. Write them at the top of the draw function as the
   screen's palette; everything else is neutrals.
6. **Lay out top-down per panel:** heading → hero → decision groups
   under section labels → support → footer. Spacing only from the scale
   (§1). Every element from the component library (§5); if a needed
   component doesn't exist, add it to §5 *first*, then use it.
7. **Write the copy in the voice** (§3.3, banned strings §7): lowercase,
   laconic, fiction vocabulary, each new term taught at first use.
8. **Wire the three states:** empty (authored, styled as `- empty -`,
   never a blank panel), loading (animated, distinguishable from
   stalled), and failure (says what happened + one recovery action, in
   fiction voice).
9. **Advertise the controls once:** slab for the primary commitment OR
   footer chips for navigation — the full input set, each action once,
   both input families (keys + pad).
10. **Motion last:** one arrival reveal (terminal-window or panel
    stagger), state-transition beats only, reduced-motion path
    verified. Nothing loops at rest.
11. **Capture and self-review** against §10 before requesting review:
    1280×720 screenshot at realistic data + empty-state + Deck (800)
    variant.

## 10. Review rubric — pass/fail language

A UI review runs this table against screenshots (not code). Verdicts
per check: **PASS / FAIL / N/A**. A screen ships when every gate check
passes; non-gate FAILs ship only with a written waiver naming the
follow-up. "What to do" is the prescribed remedy — reviewers cite the
check ID, implementers apply the remedy, no relitigating.

| ID | Gate? | Check (answer by looking) | FAIL when | What to do |
|---|---|---|---|---|
| H1 | ✅ | Cover the screen; recall its sentence. Does the hero answer it within 1s? | Two elements compete, or hero is not the largest/most-colored thing | Promote one, demote the other one full tier (size AND color) |
| H2 | ✅ | Count tier-1–3 elements per panel | > 12 | Cut or fold behind a focus action; never shrink to fit |
| H3 | | Does any fact render twice on the screen? | Same value visible in two places (beyond the sanctioned world-space pair) | Delete the lower-tier copy |
| C1 | ✅ | Count active role colors (non-neutral hues) | > 2, or a role used off-meaning (red price, amber selection…) | Recolor to the role table; collapse extras to neutrals |
| C2 | | Sample any 3 colors; are they in §2.1? | Any hex/rgba not in the table | Snap to nearest palette entry; if none fits, the element is over-designed — neutralize it |
| T1 | ✅ | Measure the smallest text a player must act on | Decision data < 12px in menus, < 18px for in-play numbers | Move up the scale; if it no longer fits, the layout is over budget → H2 |
| T2 | | Any size not in §3.2? Any uppercase steady-state readout? | Off-scale size or casing breach | Snap to token; lowercase it |
| L1 | ✅ | Overlay the layout-contract rects | Hand-placed panel, sub-58px row, off-scale gap | Re-derive from the contract; add a contract slot if genuinely new |
| L2 | | Can any two elements collide at 1280×720 or ×800? (test worst-case: 8 toasts, full inventory, max contacts) | Any overlap | One moves or dies; add the collision case to the capture set |
| V1 | ✅ | Read every string aloud | Banned vocabulary (§7), raw ids, Title Case, untaught jargon | Rewrite in voice; add teaching line at first use |
| V2 | | Is any readout a constant? | Constant styled as live data | Restyle as tier-4 texture or delete |
| V3 | | Scan names and labels (§3.4) | A surface's name rendered more than once in view; system/fixture identifiers surfacing as player text | Delete the duplicate rendering (heading must add information or go); replace the string with diegetic vocabulary and fix the fixture to seed diegetic data |
| W1 | | World annotations (§5.1) | A label/prompt occludes a threat; a tracked contact vanishes instead of rim-clamping; bracket count doesn't match class; world text jitters | Reorder below entities; clamp to rim; fix the count; un-round the text position |
| G1 | | Every gauge: label + number + segmented? Every chip: captioned? | Naked gauge, one-bit bar, orphan chip | Add label/number; one-bit → state chip; orphan → caption or cut |
| S1 | ✅ | Empty, loading, and failure states captured? | Any state blank, missing, or indistinguishable from working | Author the state per §9.8 |
| M1 | | Watch 10s at rest | Anything blinking/pulsing/bobbing without a state change; square-wave blink | Still it, or convert to a ≥2s sine on an actual ready-state |
| M2 | | Toggle reduced-motion | Any motion survives (incl. scanlines/world pass) | Gate it |
| A1 | | Controls advertised once, both input families? | Action shown twice, missing, or keyboard-only | Single advertisement per §9.9 |

**Review output format** (goes in `docs/project/reviews/`): screen name,
capture set, table of FAILs only (`ID — one-line evidence — remedy`),
verdict line: `SHIP` / `SHIP WITH WAIVER (ids…)` / `REWORK (gate ids…)`.
A REWORK re-review checks only the failed IDs plus H1.

## 11. Provenance and enforcement

Reconciled from: `src/ui/design-tokens.js` (values), the map-select
concept frames (fidelity bar), the 2026-08-04 UI design review + its
six ratified decisions, `text-voice-guide.md` (casing/voice), and the
surviving intent of the two superseded docs. Enforcement lands with the
UI repair program: tokens become the single generated source (CSS +
canvas + Three), and a style-conformance test walks fonts/colors
against this guide's tables. Until then: **new UI work follows this
guide; existing violations are tracked in the review, not grandfathered
as precedent.**
