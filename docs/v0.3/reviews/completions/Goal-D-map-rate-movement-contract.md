# Goal D Completion: Map-Rate Movement Contract

Date: 2026-07-25

## Source Contract

The canonical map registry keeps the active trio at `5x5`, `15x15`, and
`25x25`, with session profile rates of `15`, `12`, and `10 Hz`. The 60 Hz
integration remains a zero-flow diagnostic baseline. Product route evidence
uses canonical drag/fluid coupling, zero current, full thrust, and one finite
`100` delta-v tank carried across each authored route.

| Tier | Product leg seconds | Delta-v remaining | Total |
|---|---|---|---:|
| Shallows | `1.53` | `81.60` | `1.53s` |
| Expanse | `1.67 / 20.17 / 6.00` | `80.00 / 0.38 / 0.63` | `27.84s` |
| Deep Field | `2.20 / 59.30` | `73.60 / 1.15` | `61.50s` |

The direct 60 Hz observations remain in the map contract as diagnostics:
`1.48`; `1.55 / 8.52 / 1.22`; and `1.98 / 14.22` seconds. No movement
constant was retuned. The Deep Field fuel margin is an explicit playtest and
route-content risk, not a hidden balance decision.

## Slingshot And Placement

The gameplay coyote remains `50ms`. The internal prompt-to-command allowance is
fixed wall time at four Shallows authority ticks (`266.667ms`) and is invariant
at `15/12/10 Hz`.

`map-center-fractional-bands-v1` is the single portal/exfil placement policy.
The registry stores fractions; ESM and CJS adapters resolve them to world-unit
bands for each map. Optional and final-exfil server placement consume the
resolved policy and preserve toroidal placement validation.

## Boundaries

Ballpark remains a spatial/materialized-payload layer and does not own movement
integration. The local/offline seeded-sea presentation split remains backlog
work. No map dimensions, movement constants, camera window, or gameplay
authority ownership changed in this slice.

## Focused Proof

- `map-rate-movement-contract`: product route, fixed wall-time coyote, and
  portal policy checks passed.
- `w2a4-map-scale`: `8 passed, 0 failed`.
- `slingshot-contract`: `10/10`; `slingshot-dt-static`: `4/4`.
- `slingshot-edge-queue`: `2 passed, 0 failed`; `portal-clock`: `3 passed, 0
  failed`.
- `sim-scale`: `6 passed, 0 failed`; `sim-bounded-growth`: `1 passed, 0
  failed`.
- `git diff --check` and changed-file syntax checks passed.

Broader browser, package, visual, Deck, and full-suite proof remains outside
this Goal D slice.
