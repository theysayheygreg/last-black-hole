# Movement Completion Audit: Tranche 2

Date: 2026-07-25

This pass followed the real authority-backed movement path from player input
through presentation. It stayed separate from the later unified-Hz and harness
refactor program.

## Current Ledger

| Rank | Finding | Classification | Disposition |
|---|---|---|---|
| 1 | A valid slingshot button press looked broken when an aim anchor existed but tangential speed was below the authority threshold. | Fixed now | F/Y now distinguishes no anchor from an in-range anchor that still needs tangential speed. Edge transport and authority thresholds are unchanged. |
| 2 | Local prediction omitted the authority ledger's fluid-coupling vector, so strong currents could appear as repeated corrections. | Fixed now | Reconciliation now consumes the short-lived authoritative coupling vector without sampling or duplicating the server field. |
| 3 | Ordinary snapshot rebases retained locally predicted fuel instead of refreshing the authority's fuel state. | Fixed now | Every rebase refreshes delta-v capacity, burn, regeneration, and timer truth while preserving predicted position and velocity. |
| 4 | Prediction selects the newest unacknowledged command instead of replaying a rapid input sequence in order. | Backlog | This is a latency presentation limitation, not authority corruption. It belongs to the separate movement/refactor program rather than this bounded tranche. |
| 5 | Deep Field's current authored route finishes the product-rate probe with `1.15` delta-v remaining. | Playtest/taste | Functional movement is truthful. Route generosity or fuel balance needs Greg's playtest and was not retuned here. |

## Focused Evidence

- Slingshot input feedback: `3/3`; HUD: `2/2`; slingshot contract: `10/10`;
  edge queue: `2/2`; dt static: `4/4`.
- Local reconciliation: `10/10`; force ledger: `3/3`; trajectory parity:
  `1/1`; movement golden: `5/5`.
- The natural client probe booted the local authority without page errors but
  failed before gameplay after Home navigation did not expose Launch. No
  movement state was mutated and this remains asynchronous client CI, not a
  product defect attributed to movement.

## Boundary

The accepted `15/12/10 Hz` profiles, `5/15/25` maps, canonical movement
constants, slingshot thresholds, authority protocol, and server field remain
unchanged. Physical Deck feel remains Greg's acceptance gate.
