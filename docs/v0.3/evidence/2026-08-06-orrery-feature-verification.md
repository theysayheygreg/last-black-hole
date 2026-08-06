# Orrery Feature Verification — round-1/2 claims, instrumented

> Orrery, 2026-08-06, at `07a9bfcf` (+UI fixes `4fae7e79`). Method:
> live sim probes + pixel captures, scripts and raw results at
> `/private/tmp/lbh-feature-probes/` and `/private/tmp/lbh-evidence-debt/`.
> Probes outrank prose; every verdict below is measured, not read.

## Verdicts

| Claim | Verdict | Measurement |
|---|---|---|
| Grapple tap-spam dead (re-hook cooldown) | **PASS** | 150 taps in 10s → 8 captures (exactly the 1.25s cooldown rate); spam max speed 1.157 < one honest hold-release 1.694; clean sawtooth, no bank |
| No zero-count portal windows on any map | **PASS** | 6 live windows per map, ranges `[2,3][1,2][1,1][1,1][1,1]`+final |
| Shallows exit drought fixed | **PASS** | 354s → 140s (29.2% of run); pre-fix tree reproduces the old 354s exactly; expanse 360→170s, deep-field 447→200s |
| HUD skips zero-count windows | **PASS** | filter at `hud-presentation.js:29-35`; 4/4 direct cases + live cross-check vs authority |
| Inert artifacts culled from loot | **PASS** | 13 retired ids; 2500 seeded wreck rolls / 7264 items / full 52-id droppable surface hit / 0 retired drops; sanitization verified live through the control-plane store |
| Manifest completeness guard enforcing | **PASS** | 182 files = 164 wired + 18 excluded (reasons) + 0 orphans; planted dummy → named failure, exit 1, in lanes fast/core/static/full; all previously-orphaned proof suites now WIRED |
| Rig levels apply on the authority | **PASS** | 10/10 shipped levels produce measured stat deltas; over-cap `[99,99,99]` clamps exactly; zero dead stat names |
| Heat readout restored at T1 floor | **PASS** | renders `heat 56%` at 18px/700 + 92×6 bar under the ship during real held thrust; vocabulary is heat-only |
| No persistent-HUD pulsing (M1, partial) | **PASS at rest** | 12-frame diff: all persistent slabs ≤56 max delta = translucency bleed of the animating fabric; only data digits change. Ecology chip unobservable (phase 0) — carry to an ecology-active clip |

## Open findings (new, from the probes)

1. **LOADING S1 is NOT fixed — and the failure never reaches the
   loading screen.** The screen has no timeout/retry (pulse + 11px
   `dropping in` only). Worse: launch failure happens *before* phase
   `loading` (`startRemoteGame` awaits health at `main.js:2782` before
   setting the phase at `:2813`), so a dead sim leaves you on map
   select with only an 11px red toast in the top-left corner
   (`the cycle would not open — retry or return home`) that names two
   actions and offers neither. S1 gate stays open; remedy should live
   on map select's failure path, not the loading screen.
2. **Anti-bank is a load-bearing coincidence.** Boost decays to ambient
   in <1s while the cooldown is 1.25s — that relationship is why even
   cooldown-rate captures can't accumulate, and nothing asserts it.
   Add an invariant test (drag-bleed time < rehook cooldown, or an
   accumulation probe) so a retune can't silently resurrect banking.
3. **Two implementations of "is this window live."**
   `portal-window-state.cjs` short-circuits `finalExfil` to live; the
   HUD's copied filter doesn't. Latent (final is hard-coded `[1,1]`)
   but the HUD should share or mirror the predicate.
4. **Shallows sits 4s from its own gap bound** (140s vs 144s limit),
   structurally pinned by the phase-band floor — widen the bound with
   a comment or place window 3 band-relative, so the next tuning nudge
   doesn't produce a misleading failure.
5. **`portal-clock.cjs` asserts only seed 424242** — the
   `portalLifespanMult 0.6` signature branch produces a second schedule
   shape that is never asserted (gaps unchanged; still worth a case).
6. **Manifest guard walks only top-level `tests/*.cjs`** — a suite in a
   new subdirectory would slip past. Cheap to close.
7. **Rig "all-implemented" was achieved by subtraction** (design flag,
   not a bug): pre-fix had 15 real mutations across the two public
   hulls; shipped is 10. Dropped along with the vapor: drifter laminar
   L3 (+0.1 coupling), gleanings L3 (+0.1 pickup), breacher ironclad
   L2 (control-debuff resist) and L4 (+1 free well survive), smashgrab
   L5 (0.7× noise radius). Track depth 5→3 max. Greg should know the
   progression got shallower, not deeper. Also: `wellGraceDuration` and
   `sensorRange` remain owned by legacy profile upgrades, not rigs.
8. **Stale HUD ghosting on map-select failure frames** — HUD DOM
   elements visible over map select after a failed launch (fixture
   path confirmed; real return path unverified). Related to the known
   HUD phase-lifetime gap.
