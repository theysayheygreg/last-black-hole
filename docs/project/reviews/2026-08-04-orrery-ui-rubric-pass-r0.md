# Orrery UI Rubric Pass — Round 0 (baseline)

> **Dependency order:** this is the third artifact in the UI review chain,
> after `2026-08-04-orrery-v03-ui-design-review.md` and the resulting canonical
> `docs/v0.3/UI-STYLE-GUIDE-v1.md`. It applies those two sources to the baseline
> captures; it does not introduce an independent or competing design direction.
>
> Reviewer: Orrery. Date: 2026-08-04. Rubric: `docs/v0.3/UI-STYLE-GUIDE-v1.md`
> §10 + visual reference `docs/v0.3/ui-style-guide/UI-STYLE-GUIDE-v1.html`.
> Reviewed against captures at HEAD `3157ffc1`
> (`assets/2026-08-04-ui-review/`) — the same baseline Codex round 1
> started from. Items marked **[CDX]** overlap the in-flight Codex UI
> program; do not double-dispatch — round 1's re-review will diff them.
> FAILs only; per-screen verdict per rubric language.

---

## TITLE — `01-title.png`

| ID | Evidence | Concrete change |
|---|---|---|
| A1 | `SELECT PILOT` advertised twice: command slab + footer chip row | Slab only; footer keeps `esc exit` alone |
| V1⛔ | Tagline `surf the currents. escape the void.` is approved-rewrite *before* copy | Apply `read the current. find an aperture.` (voice guide worked-rewrites) **[CDX Wave C]** |
| V2 | `v0.3 // visual systems online` — dev-status as version chip | `v0.3` alone, or diegetic serial (`survey terminal v0.3.7b` per concept chrome) |

**Verdict: REWORK (V1)** — two string edits + one footer trim; smallest rework in the set.

## PROFILE SELECT — `02-profile-select.png`

| ID | Evidence | Concrete change |
|---|---|---|
| L2 | Footer chip text collides (`ARROWS` chip overlaps `MOVE` caption) | Chip width from measured text + 8px; same fix resolves LAUNCH/recovery orphan chips (G1 there) |
| — | Slots with equal EM indistinguishable | Add per-slot metadata line: hull + last-played cycle (10px muted) |

**Verdict: SHIP WITH WAIVER (L2)** — cleanest screen; keep as the reference implementation.

## HOME / SHIP — `03-home-0-ship.png`

| ID | Evidence | Concrete change |
|---|---|---|
| H2⛔ | ~20 tier-1–3 elements in center panel (budget 12) | Cut the rig strip (RIG tab owns it); fold `BASE/FITTED` 9px strips into 4 key/value rows; drop `0/2 artifacts // 0/2 hotbar` line (loadout rows below already show it) |
| T1⛔ | Stat strips at 9px are decision data | Re-render as key/value rows at 10px label / 13px value |
| G1 | `LAMINAR 0/5` — wrong denominator (shipped cap is 1) | Shipped caps everywhere **[CDX feature item 6]** |
| H3 | Artifact/hotbar counts duplicate the loadout rows | Covered by H2 cut |

**Verdict: REWORK (H2, T1).**

## HOME / VAULT — `03-home-1-vault.png`

| ID | Evidence | Concrete change |
|---|---|---|
| H3 | Vault occupancy ×3 on screen (tab subtitle + header + rail gauge) | Header keeps `vault 14/25`; tab subtitle → `salvage hold`; rail gauge stays per decision 1 (it gets the legend) |
| S1 | `- vault empty -` is authored but teaches nothing | Add one support line: `salvage returns here after extraction` |
| — | Sell is one keypress, irreversible; delete-profile has 2-step confirm | Sell gets the same confirm pattern (destructive action rule) |

**Verdict: SHIP WITH WAIVER (H3).**

## HOME / RIG — `03-home-2-rig.png`

| ID | Evidence | Concrete change |
|---|---|---|
| C1⛔ | Cost text in danger red on affordable rows | Cost muted slate; flips red only when EM < cost (specimen sheet §01 shows the pair) |
| G1 | ASCII `###---` bars | Segmented gauge component, label + `n/cap` beside it |
| V1⛔ | `signal decay +5%` etc. — retired Signal vocabulary in effect strings | Purge with rig-effect reconciliation **[CDX feature item 6]** |
| H3 | EM total here + right rail simultaneously | Rail is canonical (decision 1 gives it the affordability cue); RIG header drops it |

**Verdict: REWORK (C1, V1).**

## HOME / CHRONICLE — `03-home-3-chronicle.png`

| ID | Evidence | Concrete change |
|---|---|---|
| S1⛔ | Tab accepts no input — list unscrollable | Input branch for tab 3 **[CDX feature item 4]** |
| H3 | Stat block duplicates 3 of the rail's 4 instruments on-screen | Keep chronicle-exclusive stats only (extract/death ratio, cycles, EM earned lifetime); drop best-survival/EM-now/vault rows |
| S1 | Echoes empty every session (not persisted) | Persist `recentEchoes` **[CDX feature item 4]** |

**Verdict: REWORK (S1) — mostly in flight.**

## HOME / LAUNCH — `03-home-4-launch.png`

| ID | Evidence | Concrete change |
|---|---|---|
| H1⛔ | Hero is a constant (`DROP WINDOW READY` + tagline convey zero state) | Replace body with real commitment state: selected route + seed serial + hull/loadout summary + readiness verdict; the tagline drops to tier-4 texture |
| G1 | Orphan `SPACE` chip floating under SELECT ROUTE slab | Chip-caption pairing fix (same root as profile L2) |
| A1 | Two command surfaces (center implies confirm; right rail owns SELECT ROUTE) | One slab (right rail per decision 1); center is display only |
| V2 | `RISK GATE` tab subtitle promises nothing that exists | Subtitle → `route commit` |

**Verdict: REWORK (H1).**

## MAP SELECT — `04-map-select.png` + concept frames

| ID | Evidence | Concrete change |
|---|---|---|
| V1⛔ | `local authority ready` / `checking live authority...` at 9px | Fiction: `link: stable` / `link: searching...`; block renamed `link` — 10px floor |
| H3 | Confidence % + uncertainty gauge = same seeded value twice | Decision 5: confidence only, restore concept's waveform sparkline; uncertainty gauge dies |
| T1⛔ | Briefing body at 10px incl. decision data (contents ranges) | Contents rows 12px; description 12px, 4 lines (concept has ~6) |
| G1 | Contact rows are text-only ranges | Concept restoration: family icon + segmented magnitude bar + range **[CDX Wave C map-select item]** |
| V2 | Destination glyphs are hash noise reading as minimaps | Restore real per-map topology signatures (concept) **[CDX Wave C]** |
| — | Seed invisible; reroll mutates hidden state | Seed serial in top chrome (`seed 8F7A-91C2-K3LQ · cycle 17` style) **[CDX Wave C]** |
| — | Plot density far below concept bar | Plot restoration + in-plot legend + density gradient **[CDX Wave C]** |
| L2 | <620px rail silently drops contact descriptions | Reflow: descriptions collapse to tooltip-on-focus instead of vanishing |

**Verdict: REWORK (V1, T1)** — the restoration package is one coherent work item; concepts are the acceptance anchor.

## LOADING

| ID | Evidence | Concrete change |
|---|---|---|
| S1⛔ | Stalled handshake indistinguishable from loading; no failure state | 8s timeout → `no carrier — the drop did not open` + `retry / back to deck`; keep the pulse animating only while packets move |

**Verdict: REWORK (S1).**

## IN-PLAY HUD — packet frames (`current-shallows-start/well-approach.png`)

All items below are **HUD-migration requirements** (decision 6) — spec them into the rebuild, do not patch the CSS first.

| ID | Evidence | Concrete change |
|---|---|---|
| T1⛔ | `HEAT 31%` at 9px; edge-arrow contact labels 9px; speed 11px | Heat + speed ≥18px per floor; edge labels ≥12px |
| V1⛔ | Ability card says `fuel 30/30` while ship shows HEAT | Heat vocabulary everywhere; `BURN — heat headroom 70%` shape |
| H2⛔ | Left column up to 22 nodes (budget ≤10/corner) | Diet: hull bar → state chip (G1: one-bit gauge); merge noise readout + detail into one line; collapse block + `next:` line merge into the two-phase timer block (decision 4) |
| L2 | Inventory panel covers ecology readout; 8-toast stack touches cargo panel | Migration layout: inventory opens center-left clear of instruments; toast column max-height reflows |
| M1 | Ecology chip pulses continuously | Pulse only on contact-state change |
| — | Toasts: no severity, oldest-first eviction, dup emitters | Three-tier toast spec (guide §5) |
| V1 | `used: {effectId}`, `{cause} WAVE{source}` raw strings | Human strings per event map; fallback drops the toast |
| S1 | Boot placeholders (`10:00`, `SOURCE IDLE…`) visible first frames | Nodes render empty until first real value |
| — | `#hud-scavengers` computed every frame, display:none | Delete node + writer |
| — | `next: aperture` counts to zero-count windows | Skip empty windows **[CDX feature item 3]** |

**Verdict: REWORK (T1, V1, H2) — all deferred into the migration by design.**

## PAUSE — `08-paused.png`

| ID | Evidence | Concrete change |
|---|---|---|
| V1⛔ | `LOCAL SANDBOX // SIM FROZEN`, `client debug freeze // no product authority claim` | Remote: `the world continues` (keep). Local: `simulation held` + nothing else; debug prose behind dev flag only |
| L1⛔ | Hand-rolled 420×300 panel, 34px rows (contract min 58), footer at literal coords | Single-window contract; rows to 58px; measured footer |
| — | Live HUD at full opacity behind panel | Single-window rule: dim matte ≥0.8 over world+HUD |
| — | No abandon-run; exit-to-title silently discards run | Add `abandon run` with confirm; exit-to-title gets same confirm |

**Verdict: REWORK (V1, L1).**

## RESULTS (dead + escaped) — `05/06-results-*.png`

| ID | Evidence | Concrete change |
|---|---|---|
| H3 | Three EM-ish numbers (`+54 EM` pill, `residue 54 EM` ledger, `salvage value`) | Pills → map + cargo count only; EM lives in the ledger; salvage value stays (different fact) |
| V1⛔ | Sub-lines are approved-rewrite *before* copy | `aperture confirmed` / `telemetry retained` |
| G1 | `rival (unknown) unknown` — malformed aiOutcome rendered literally | Malformed rows dropped, not defaulted |
| S1 | Continue button lit ~0.5s before it accepts input | `promptAlpha` delay = gate time (2.2s), one constant |
| — | `residue` untaught | Ledger row label: `residue (survival credit)` first time, or tooltip line |
| — | Left column bottom half empty | Move NOTABLE under LEDGER; right column keeps cargo only |

**Verdict: SHIP WITH WAIVER (V1 strings pending) — strongest in-game screen already.**

## META / SALVAGE REPORT — `07-meta-salvage-report.png`

**Verdict: REMOVE** — merge into results ratified **[CDX feature item 4]**. No rubric pass; any surviving content (vault deposit outcome, overflow auto-sell note) lands in the results cargo column.

## RECOVERY — `09-recovery.png`

| ID | Evidence | Concrete change |
|---|---|---|
| V1⛔ | `AUTHORITY RECOVERY` / `RETURN TO THE HOME SURFACE TO RECONNECT` | `SIGNAL LOST` / `this cycle is beyond reach` / `return to the deck` |
| G1 | `ESC` chip + empty orphan chip box | Chip-caption pairing fix (shared root) |
| L1⛔ | Hand-rolled 420×232 panel | Single-window contract |
| S1 | Stale live HUD updating behind panel against dead session | HUD hide contract extended to recovery/meta/pause **[CDX migration]** |
| — | Cargo fate unstated at the worst moment | One line: cargo/run outcome, or `cycle record syncs on reconnect` |

**Verdict: REWORK (V1, L1).**

---

## Cross-screen (fix once, applies everywhere)

1. **Chip-caption pairing bug** — orphan/colliding chips on profile,
   LAUNCH, recovery: one fix in the action-glyph renderer. Highest
   ratio of screens-fixed-per-line-changed in the set.
2. **Blink → sine**: both CTAs (meta gone, results remains) to the ≥2s
   sine ready-pulse.
3. **Scanline recipe**: retire the dark-subtractive variant
   (profile/pause/meta darker than everything else).
4. **Palette unification [CDX Wave A]** — resolves C2 everywhere at once.
5. **Casing law**: uppercase steady-state readouts (`NOISE 0m · STEADY`,
   `PHASE 2`) → lowercase.

## Sequencing note

Screens Codex round 1 is expected to touch are tagged [CDX]; everything
untagged is unclaimed and safe to dispatch now. Round 1 completion
triggers **rubric pass round 1**: re-run only failed IDs + H1 per the
rubric's re-review rule, against fresh captures at the new HEAD.
