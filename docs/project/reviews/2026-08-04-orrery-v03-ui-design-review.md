# Orrery Review: v0.3 UI Design, Layout, and Information Hierarchy

> Reviewer: Orrery. Date: 2026-08-04. Reviewed HEAD: `3157ffc1` on
> `codex/v0.3-ballpark-roadmap`. Read-only; no source changed.
> Method: fresh captures of all 13 UI surfaces at current HEAD
> (`assets/2026-08-04-ui-review/`) + the morning packet's in-play frames,
> cross-read against two deep code inventories (design system/layout
> architecture; per-screen element census). Every judgment below was made
> against pixels first, code second.

## Verdict

The screens built on the layout contract — title, profile select, map
select, the results overlay — are genuinely good. The terminal language
works, the corner-bracket panels and role colors read as one machine, and
map select is the best screen in the game. The problems are systemic, not
cosmetic, and they cluster into four:

1. **There is no single source of visual truth.** Four palettes coexist
   (design tokens, the Three-side `PRESENTATION_PALETTE`, `items.js` tier
   colors, and hand-copied CSS variables), and they have drifted — the
   same item renders a different tier color in its icon than in its row
   label. The in-play HUD's layout contract (`hudSurfaceLayout`) is
   tested and consumed by *nothing*; the shipped HUD is hand-written CSS
   with different numbers. The tests assert a fiction.
2. **The left HUD column is over budget and has no severity model.** Up
   to 22 informational nodes stack in a 320px column; a 40-message toast
   system evicts oldest-first, so a Vessel contact warning can be pushed
   off-screen by four loot pickups; the inventory panel opens *on top of*
   the ecology threat readout.
3. **Internal vocabulary leaks to the player at every seam.** "local
   authority ready" (at 9px — the smallest text in the game), "LOCAL
   SANDBOX // no product authority claim", "AUTHORITY RECOVERY // return
   to the home surface", "host reset", `used: {effectId}`. The fiction
   holds beautifully until the netcode speaks.
4. **A meaningful fraction of drawn elements convey nothing.** Binary
   gauges, constant strings, noise-generated glyphs that read as minimaps,
   duplicated ledgers across three consecutive screens, and a readout
   whose meaning lives on a different screen than its label.

The two vocabulary collisions the feature review flagged are confirmed
on-screen: `HEAT 31%` under the ship while the ability card says
`fuel 30/30` in the same frame; SHIP tab `LAMINAR 0/5` while the RIG tab
says `Laminar 0/1` one keypress away.

---

## Part 1 — Confusion (player forms the wrong model)

1. **Heat vs fuel, live on one frame** (`current-well-approach.png`): the
   ship-local instrument says `HEAT 31%`; the bottom-right ability card
   says `BURN — fuel 30/30 — hold fuel for a line break`. Two names, one
   resource, same moment. (`src/hud.js` ability resource label vs
   `src/main.js:3737` heat instrument.)
2. **Rig levels have two denominators.** SHIP tab strip: `LAMINAR 0/5 //
   EDGERUNNER 0/5 // GLEANINGS 0/5` (`main.js:6039`); RIG tab: `Laminar
   0/1`, `Edgerunner 0/3` (shipped caps). Same data, adjacent tabs,
   different maximums — visible in captures `03-home-0` vs `03-home-2`.
3. **The collapse timer reads as a death clock.** `UNIVERSAL COLLAPSE`
   with amber→red urgency ramp, hitting 0:00 at the moment the guaranteed
   exit *opens*. Compounded by `next: aperture m:ss` counting down to
   windows that open with zero portals (feature review 2.3) and
   `next: well growth 0:11`, an event with no advertised player
   consequence.
4. **The signature is split across two screens.** Its *name* sits
   permanently top-center of the HUD at 50% alpha (`#hud-signature`); its
   *meaning* (`signature.mechanical`) renders only on the pause menu
   (`main.js:6811`). A player cannot connect them — and per the feature
   review the mechanical claims aren't real yet anyway.
5. **Cost text is red.** RIG rows render `next: current coupling +0.1
   cost: 300 EM` in the danger color whether affordable or not
   (`03-home-2-rig.png`) — red means "can't have it" in every other
   screen language; here it's just a price.
6. **Survey confidence is uncertainty, twice.** `SURVEY CONFIDENCE 70%`
   (26px, the loudest number on map select) is a deterministic function
   of the same seeded value shown as the `uncertainty` gauge on the plot
   (`map-select-survey.js:246-265`). Two renderings, two units, opposite
   polarity, one fact.
7. **Reroll moves the facts, not just the picture.** Contact-family
   ranges are jittered per seed, so rerolling changes the stated contents
   of the same destination. Defensible fiction ("new survey pass"), but
   nothing says so.
8. **`ROUTE: LISTEN` gates distance with no direction.** Until the tone
   is crossed there is no compass or off-screen indicator for the
   aperture; the only exit info is a right-corner text block.
9. **Voice-guide rewrites were approved and never applied.** The results
   subtitles (`you made it through the aperture` / `this is what the
   universe kept`) and the title tagline (`surf the currents. escape the
   void.`) are all listed as *before* copy in the text-voice guide's
   worked-rewrites table with approved replacements
   (`run-results.js:252`, `main.js:3626`).

## Part 2 — Unclear information (data present, meaning absent)

10. **The hull bar is one bit dressed as a gauge.** An 18px continuous
    bar whose ratio is hardcoded to 1 or 0 at the call site
    (`main.js:5570-5576`). It can only be full or empty; contacts show as
    text states (`impact 1.4s`, `critical`), not fill.
11. **The home right rail's "readiness" gauges have no legend.** Two
    segmented strips (`LOADOUT` value = equipped+consumables of max 4;
    `VAULT` occupancy) with unlabeled cells and a role flip at ≥2 that
    nothing explains (`main.js:6394-6410`). Vault occupancy meanwhile
    renders **three times on one screen** (left tab subtitle, VAULT
    header, right gauge).
12. **`BASE / FITTED` stat strip**: 9px, no units, no comparison anchor,
    truncates under the portrait (`drift drag 85% /` — the clipping fix
    landed but the strip remains sub-floor type conveying five stats a
    new player can't parse).
13. **Destination-list glyphs are noise cosplaying as minimaps.** The
    30px dot-matrix per map row is `(gx*7 + gy*11 + i*5) % 4` — pure
    hash, no relation to the map (`main.js:6489-6497`).
14. **"RISK GATE", "authority", "residue", "phase", "tracked"** — bare
    glossary terms surfaced as labels with no teaching surface anywhere:
    LAUNCH tab subtitle, map-select authority block (9px), results
    ledger row, results ecology/noise rows.
15. **Toast fallbacks leak raw ids**: `used: {effectId}`
    (`main.js:4030`), `{cause} WAVE{source}` (`main.js:2676`), and the
    results NOTABLE section renders malformed AI outcomes as literal
    `rival (unknown) unknown` (visible in `05-results-death.png`) instead
    of dropping the row.

## Part 3 — Crowded screens

16. **In-play left column: up to 22 nodes** (collapse 3 + vitals 6 +
    ecology 2 + salvage 3 + warnings ≤8), with three hard collisions:
    - `#hud-warnings` (bottom 102) meets `#hud-salvage` (bottom 24) with
      ~2px to spare at a full 8-entry stack;
    - the Tab inventory panel (left 24, vertically centered, ≤420 wide)
      **covers `#hud-ecology`** — the threat readout — while open;
    - vitals top 120 / ecology top 356 are magic CSS offsets with no
      collision guard at short viewports (`index-a.html:210,283,536`).
    Busy-moment census across the whole HUD: **~46 simultaneous nodes**.
17. **The toast column has no severity model.** 40 distinct messages,
    one 320px FIFO capped at 8, oldest evicted first regardless of
    weight: a `THRUST CONTACT · VESSEL` (4s) can be evicted in under 2s
    by pickup toasts; the 8s authority-failure warning likewise. Six
    messages have duplicate emitters (local + remote paths) and can
    double-fire (`hud.js:506-545`; census in the element-inventory
    report).
18. **Home/SHIP tab: ~20 discrete elements in one panel**, four of them
    ≤10px text at near-identical weight (stat strips, rig strip,
    artifact/hotbar counts). It is the first screen a new player must
    parse and the densest in the product.
19. **Map select right rail: 9 stacked info blocks in ≤336px** — class,
    two pills, signature, description, contents (3-4 rows), authority,
    confidence, command slab. On viewports under 620px of rail height the
    contact descriptions silently vanish — the same screen teaches less
    with no indication (`layout-contract.js:191-206`).
20. **Results overlay shows three EM-ish numbers** (`+N EM` pill,
    `credited/residue` ledger, `salvage value`), two of which are the
    same value — followed by the meta Salvage Report restating all of
    them, followed by the home rail restating half. Three consecutive
    surfaces, one ledger. (Merge already ratified in the feature-review
    program, item 4.)

## Part 4 — Elements without a clear purpose

21. **`#hud-scavengers`**: `display:none` in CSS, yet `hud.js:377-386`
    computes and writes the live count every frame. Dead organ, live
    metabolism.
22. **The LAUNCH tab body conveys zero state** — sprite + two constant
    strings (`DROP WINDOW READY`, the tagline). The real affordance is
    the right rail's SELECT ROUTE slab — two command surfaces for one
    action on different panels, while the tab's own subtitle promises a
    "RISK GATE" that doesn't exist.
23. **Title-screen telemetry theater**: nav-fix labels on
    non-interactive attract objects, a 4-string status loop (`route
    memory degraded`), and `v0.3 // visual systems online` — dev-status
    language as a version chip (`main.js:3674`). Charming once; worth
    knowing it's all constant.
24. **Locked sectors occupy half the destination list** — three frozen
    rows (`UNRESOLVED / REDACTED / SIGNAL LOST`) that can never be
    selected, with a full ACCESS DENIED briefing panel behind them.
    Good fiction; expensive real estate on a 6-row list with 3 choices.
25. **Dead UI API surface**: `movementHint`/`mapSelectHint`/`ctaLabel`
    (zero callers — there is no movement hint anywhere in play),
    `terminalRowStyle`/`terminalPillMarkup` (the only token-driven DOM
    component layer, unused), `drawWarningStrip` (the style guide's
    warning component, zero production callers — live warnings are
    borderless text), `hudSurfaceLayout` (test-only), 8/9 of
    `UI_SPACING`, 5/8 of `UI_SHADOWS`.
26. **Empty-chip rendering artifact**: orphaned/blank input chips visible
    on the LAUNCH rail (floating `SPACE`) and recovery footer (`ESC` +
    empty box) in captures `03-home-4` and `09-recovery` — the action
    descriptor renders a chip with no caption beside it.

## Part 5 — Systemic root causes

- **Palette fragmentation** (the single highest-leverage fix): tokens ↔
  `PRESENTATION_PALETTE` ↔ `TIER_COLORS`/`CATEGORY_COLORS` ↔ CSS `:root`
  have all diverged. Concrete casualties: item tier color differs icon
  vs label (`items.js:229-245` vs `UI_TIERS`); pure gold `rgba(255,215,0)`
  ships for unique items against an explicit "never gold" rule; danger
  red exists as 8 unrelated values; `#000421` (×13 in main.js) is not
  the void color; CSS `--lbh-couch-micro: 13px` vs token 12. `hud.js`
  imports the tokens and uses none of them — all 22 live HUD state
  colors are literals.
- **Typography floors are breached exactly where they matter**: heat
  readout 9px, edge-arrow contact identity 9px (the only text for
  off-screen threats), speed tier 11px — the style guide's own floor for
  critical in-match numbers is 18px. 19 distinct canvas sizes exist
  against a 7-value scale; 11px (not in the scale) is the most common
  size in the game.
- **Contract coverage stops at the panel border.** Screens adopt the
  layout contract for panels, then hand-roll every interior offset
  (~40 literals in the SHIP tab alone). Pause/meta/recovery ignore the
  contract entirely (fixed 400-420px rects, 34px rows vs the 58px
  minimum, footers at literal coordinates).
- **Motion spec vs implementation**: no press/confirm/warning/outcome
  tokens exist; CTAs blink with a ~1 Hz square wave at two different
  depths; `#hud-ecology` pulses continuously against the guide's own
  anti-pattern list (with a code comment claiming the HUD stays still);
  two competing `drawScanlines` implementations give profile/pause/meta
  a darker CRT than every other screen; the world scanline pass never
  consults reduced-motion.
- **HUD phase-lifetime gap**: `paused`/`meta`/`recovery` neither show
  nor hide the DOM HUD (`main.js:5594-5596`) — recovery displays a
  full-opacity stale gameplay HUD updating against a dead session behind
  its panel.
- **Boot placeholders ship**: `10:00`, `NOISE 0m · STEADY`,
  `SOURCE IDLE · HEARD BY 0`, `phase 0` are visible for the first frames
  of every run (`index-a.html:715-749`). The results continue button
  draws lit ~0.5s before it accepts input. The loading screen has no
  failure state — a stalled handshake is indistinguishable from a load.

---

## Recommended repair shape (not yet a goal prompt)

**Wave A — one truth for pixels.** Single palette: fold
`PRESENTATION_PALETTE`, `TIER_COLORS`, and the CSS vars into
design-tokens (generate the CSS custom properties from the token file at
build); add `bone`; delete dead token bundles or use them. Route
`hud.js` and `showWarning` tones through roles. Reconcile
`hudSurfaceLayout` with the shipped CSS — whichever is right, one of
them must die.

**Wave B — the HUD diet.** Severity tiers for the toast system (threat >
system > loot; loot never evicts threat; dedupe duplicate emitters);
move the inventory panel off the ecology readout; kill the dead
scavenger node; heat readout and edge-arrow labels up to the documented
floors; decide the fuel/heat vocabulary once and apply it to the ability
card.

**Wave C — say what things mean, once.** Rig denominators unified
(shipped cap everywhere); signature name+meaning co-located (or removed
from HUD until mods are real); cost text off the danger color;
confidence OR uncertainty, not both; collapse timer reframed as the
exit clock it actually is (`FINAL APERTURE 0:00` reading, not
"collapse"); the approved voice-guide rewrites applied; internal
vocabulary purged from pause/recovery/map-select/toasts.

**Wave D — off-contract screens.** Pause/meta/recovery onto the layout
contract (meta merge is already ratified — that removes one); interior
spacing tokens for the SHIP tab; empty-chip artifact fixed; HUD
show/hide contract extended to all phases.

### Greg decisions — RATIFIED 2026-08-04

1. **Home right rail: make it real.** Keep the rail; every element earns
   its place — legend on the gauges, a "rig level affordable" cue on the
   EM row, drop the duplicated vault gauge. The rail becomes a live
   instrument cluster, not wallpaper.
2. **Locked sectors: keep all three.** Concept-canonical (see addendum);
   the locked flow is the build's most faithful surface.
3. **`#hud-signature`: keep + teach immediately.** The name stays on the
   HUD and gains a teaching surface (effect line in the map-select
   briefing and at run start). Corollary: this raises the priority of
   feature-program item 5 (signature mods) — the teaching UI must land
   **with or after** the mods so the taught claims are true, never
   before.
4. **Collapse timer: two-phase framing.** `UNIVERSAL COLLAPSE` dread
   early; in the final stretch the block re-purposes to `FINAL APERTURE`
   with the countdown, flipping to `APERTURE OPEN — 60s` at 0:00.
   (Composes with feature-program item 3's honest-HUD work — one
   combined timer-state model, built once.)
5. **Confidence absorbs uncertainty** (from addendum): one summary stat,
   restore the concept's waveform visualization; the plot's separate
   uncertainty gauge goes.
6. **HUD substrate: migrate to the canvas layout contract.** The DOM HUD
   is rebuilt on the same contract as the menu screens; `hudSurfaceLayout`
   becomes the real geometry owner; collision guards and phase lifetime
   come with the contract. Sequencing consequence: this is the largest
   UI work item — the HUD diet (Wave B), toast severity model, timer
   two-phase framing, and vocabulary fixes should be **designed into the
   migration and built once on the new substrate**, not patched into the
   CSS first and rebuilt after. Reduced-motion and the accessibility
   hooks in the current DOM path must carry over explicitly.

## Addendum — earlier UI concepts vs the build (added same day)

Greg supplied two map-select concept frames (live Expanse survey; locked
Sector 04). Verdict: **the build preserved the concept's information
architecture almost exactly — three-panel survey terminal, destination
list, reconstruction plot, briefing rail, confidence stat, locked-sector
fiction — and lost most of its information *content*.** The deltas, in
priority order:

1. **The plot lost its density.** The concept plot is the star of the
   screen: layered contours, dot-matrix fields, colored region families,
   redaction blocks, unstable-zone hatching. The build renders 3–4 sparse
   wobble blobs on an empty grid. Same failure mode as the fabric
   program: correct grammar, volume knob at whisper.
2. **The legend was dropped.** The concept defines every mark in-plot
   (`DENSE MASS / SCATTERED / UNCERTAIN / ANOMALY / VOID`) plus a bottom
   density gradient (`LOW → HIGH`) and an `UNSTABLE ZONES` hatch key.
   The build's region blobs and gauges are unlabeled — the confusion I
   flagged in finding 6/19 exists because the teaching layer was cut.
3. **Contact rows lost their iconography and bars.** Concept: one icon
   per family (well spiral, derelict diamond, stellar star, scavenger
   skull, anomaly burst) + segmented magnitude bars, instantly scannable.
   Build: text label + numeric range. The concept also lists two families
   the build doesn't surface (`SCAVENGER PRESSURE`, `ANOMALY TRACE`).
4. **The diegetic chrome — including the visible seed — was dropped.**
   Concept top bar: `SURVEY TERMINAL v0.3.7b / SEED: 8F7A-91C2-K3LQ /
   CYCLE: 17 / SIGNAL: WEAK / LINK: STABLE`; bottom: `DATA FREIGHTER //
   CS-84 "UMBRA" / COORDINATES: UNKNOWN / DRIFT: NOMINAL`. In the build
   the seed has **no visible identity at all** — reroll mutates invisible
   state (compounding finding 7). The concept solved this by making the
   seed a serial code.
5. **Destination thumbnails were real in the concept.** Each map's glyph
   is a coherent mini-topology, distinct per destination, greyed static
   when locked. The build's hash-noise glyphs (finding 13) are a
   degenerated descendant — the concept confirms they were *meant* to be
   signatures, so the fix is restore, not delete.
6. **Confidence had a visualization** (boxed block + waveform sparkline);
   the build kept only the bare percentage. Notably the concept shows
   confidence as the *only* summary stat — no separate uncertainty
   gauge — which supports collapsing the duplicate (finding 6) toward
   confidence alone.
7. **The description had room to breathe** (~6 evocative lines vs the
   build's 2-line 10px clamp), and the concept's spacing is generally
   airier — letter-spaced headers, larger margins.
8. **What matched well:** the locked-sector flow (`DATA WITHHELD`, ???
   rows, red static, `CHECKSUM INVALID`, `SECTOR LOCKED`) is the most
   faithful surface in the build — which also answers one queued
   decision: the locked sectors are concept-canonical. **Keep them.**

Implication for the repair waves: Wave C gains a "map-select restoration"
work item (legend + contact icons/bars + visible seed serial + confidence
viz + plot density), and it should reuse the concept frames as the
acceptance anchor the same way the fabric program used its concept
composites.

## Honest limits

Stills and code, not play: pacing of toasts under real load, glow
readability on a physical Deck panel, and motion feel are unjudged. The
in-play frames are the morning packet's (pre-`59c76213` fabric tuning);
menu/results frames are fresh at `3157ffc1`. Contrast ratios were not
instrument-measured — the 7:1/4.5:1 claims in the style guide remain
unverified either way.
