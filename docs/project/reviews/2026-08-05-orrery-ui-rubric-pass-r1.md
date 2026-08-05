# Orrery UI Rubric Pass — Round 1

> Reviewer: Orrery (four parallel review agents, verdicts adjudicated by
> Orrery). Date: 2026-08-05. Rubric: `docs/v0.3/UI-STYLE-GUIDE-v1.md`
> §10. Baseline: round 0 (`2026-08-04-orrery-ui-rubric-pass-r0.md`).
> Reviewed captures: all 14 surfaces at round-1 checkpoint
> `c5694c679cc6fcb4053115224a6d8729c0feb6ff`
> (`codex/v03-round1-integrator-20260804`), capture set
> `/private/tmp/lbh-round1-ui-captures/`. Per the rubric's re-review
> rule, only round-0 failed IDs + H1 were re-checked.

## Roll-up (round 0 → round 1)

| Surface | r0 | r1 | Open IDs |
|---|---|---|---|
| TITLE | REWORK (V1) | **SHIP** | — |
| META | REMOVE | **DONE** | removed; `vault deposit` row landed in results |
| PROFILE SELECT | WAIVER (L2) | SHIP WITH WAIVER | L2 chip overflow |
| MAP SELECT | REWORK (V1,T1) | SHIP WITH WAIVER | L2 chip overflow |
| HOME/VAULT | WAIVER (H3) | SHIP WITH WAIVER | S1 teaching line |
| HOME/LAUNCH | REWORK (H1) | SHIP WITH WAIVER | A1 double-advertised commit |
| PAUSE | REWORK (V1,L1) | SHIP WITH WAIVER | L2, T2 |
| RECOVERY | REWORK (V1,L1) | SHIP WITH WAIVER | T2 (footer caption uppercase) |
| HOME/SHIP | REWORK (H2,T1) | **REWORK** | H1 (amber selection outweighs hero), H2 (~19 elements; rig strip survived) |
| HOME/RIG | REWORK (C1,V1) | **REWORK** | C1 (whole effect line red, not just cost) |
| HOME/CHRONICLE | REWORK (S1) | **REWORK** | H1 (empty-state hero underweighted), H3 (rail duplication) |
| RESULTS DEATH | WAIVER | **REWORK** | L2 (ledger overprint `residue (surviv54 EMedit)`), H3 |
| RESULTS EXTRACTED | WAIVER | **REWORK** | S1 (blank NOTABLE body), H3 (`3` ×3) |
| IN-PLAY HUD | REWORK (T1,V1,H2) | **REWORK** | T1 |
| LOADING | REWORK (S1) | NOT RE-TESTED | no capture; S1 gate open |

Net: 10 REWORK → 6 REWORK + 1 untested. Two surfaces fully closed.

## What landed clean (verified on frames)

- Voice rewrites verbatim everywhere: title tagline
  (`read the current. find an aperture.`), results sub-lines
  (`aperture confirmed` / `telemetry retained`), recovery copy
  (`SIGNAL LOST` / `this cycle is beyond reach` /
  `cycle record syncs on reconnect`), pause (`SIMULATION HELD`,
  `abandon run` added). Netcode vocabulary is gone from every surface.
- Map-select restoration: contact icons + segmented magnitude bars,
  real per-map topology glyphs, seed serial in diegetic chrome
  (`SURVEY_TERMINAL_v0.3 // seed … · cycle 1 // signal strong`),
  `link: stable`, confidence + waveform sparkline (uncertainty gauge
  deleted).
- HUD contract migration is real: left column 22 → 9 nodes, unified
  panel contract, two-phase collapse timer per ratified decision 4,
  three-part toast anatomy, `fuel` vocabulary eliminated.
- Pause + recovery on the shared window contract (58px rows), orphan
  chip fixed on recovery, cargo-fate line authored.
- Rig denominators honest, segmented gauges real, Signal vocab purged;
  LAUNCH hero shows real commitment state (route + seed + loadout).

## The round-2 core: three shared renderer defects

Most remaining REWORK verdicts trace to three cross-screen roots, not
fourteen screen problems:

1. **R2-KV — key/value label column truncates into values.**
   `exotic matter0 EM`, `thrust respon70%`, worst case
   `residue (surviv54 EMedit)` (death ledger — the r0 teaching remedy
   rendered illegible). Fixed-column offset in the key/value renderer;
   labels must ellipsize with a gap or the column must measure.
2. **R2-CHIP — input chip boxes don't fit their text.** `ARROWS` /
   `SPACE` glyphs overflow the 32px chip rect on profile, map select,
   pause, and home footers; recovery's call site was fixed
   individually, proving the fix went in at one call site instead of
   the chip renderer.
3. **R2-AMBER — amber used as selection/slab fill.** SELECT ROUTE /
   LAUNCH slabs, tab selection, and loadout selection are amber-filled
   against the role law (guide §2.1: amber never marks selection; slabs
   are cyan). Also the direct cause of HOME/SHIP's H1 fail.

Plus two singles: **the HUD heat readout was removed entirely** rather
than resized (T1's decision number is now absent — restore at ≥18px per
the updated floor), and the HUD toast draws behind/clipped by the HULL
panel (`IGNATURE LOCK…`). The casing law (lowercase steady-state
readouts) landed nowhere in this round and remains open as a sweep.

## Re-review notes

- M1 (motion) and the results button-gate timing are unverifiable from
  stills; carry to a motion-capture pass.
- LOADING needs a capture path (fixture or forced slow handshake)
  before its S1 gate can close.
- The `'meta'` fixture argument still exists in the test API and
  renders nothing; confirm the phase is retired in code, not just
  unrendered.
