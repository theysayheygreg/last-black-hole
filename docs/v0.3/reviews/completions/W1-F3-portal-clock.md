# W1-F3 Portal Clock Completion

Status: complete for the bounded W1-F3 portal-clock authority slice.

## Delivered

- Extended the existing match-scoped W1-F2 `Conductor`; no second clock or
  conductor was introduced.
- Registered every optional portal open and paired close front, plus the final
  exfil open and close, with guard validation owned by the `Conductor`.
- Replaced Vessel-relative final-portal timing with a schedule-visible final
  exfil window.
- Kept the existing residence, confirmation, optional blocking, session, and
  persistence paths intact.

## Provisional schedule

- Grace: `45s`.
- Optional cadence: `120s`, with five windows opening at `45/165/285/405/525s`.
- Base optional durations: `90/75/60/45/30s`.
- Offset guard: `10s` around Inhibitor fronts and other declared fronts.
- Late rules: phase 2 uses `0.5x` count and `0.8x` duration; phase 3 uses zero
  optional portals and `0.6x` duration when a window still has a materialized
  count.
- Effective optional close fronts for the current five-wave schedule are
  `135/240/321/432/543s`.
- Radius bands are declared per portal type from the `map-center` anchor, with
  bounded deterministic placement attempts and a declared-band fallback scan.
- Final exfil duration: `60s`.

## Event and window contract

Each schedule window has stable `windowId`, `openId`, `closeId`, `openTime`,
`closeTime`, and portal metadata. Published open, spawn, close, and expiry
events carry `conductorId`, those stable IDs, scheduled times, and the portal
metadata. Repeated seed/config construction preserves schedule order and IDs.

The final exfil open is exactly `MATCH_MAX_SIM_TIME` (normally `600s`) for every
seed. Main-timer expiry opens and materializes it while the session remains
running. The session hard-timeout occurs only at the paired close (`660s` with
the provisional duration), and the final portal is exempt from optional
Inhibitor blocking and optional thinning.

## Focused proof

- `node tests/conductor.cjs`: 13 passed, 0 failed.
- `node tests/portal-clock.cjs`: 3 passed, 0 failed.
- `git diff --check`: passed.

The portal contract covers stable multi-seed schedule data, guarded fronts,
open/close IDs and order, no pre-window portal state, deterministic late
thinning/shortening, declared final spawn bands, and the main-timer/final-close
transition. The one allowed `node tests/portal-clock.cjs` run started the real
server with `LBH_SIM_MAX_SIM_TIME=10`,
`LBH_SIM_FINAL_EXFIL_DURATION=10`, and a joined human client. It observed no
final portal in a running snapshot at `5 <= simTime < 10`; at
`10 <= simTime < 20` it observed the live `portal-final-exfil` with
`windowId=portal:final-exfil:1`, scheduled fronts `10/20`, and session status
`running`. The event journal contained the matching `portal.windowOpened` and
`portal.spawned` events with `conductorId=match-conductor`. At `simTime >= 20`
the real session was `ended` with `endReason=run-timeout`, zero active humans,
and matching `portal.windowClosed` and `portal.expired` events; the close event
carried the paired `:close` identity. No browser or broad suite was used.

## Deferred

This completion does not claim full S15. Manual activation and power-ups,
keys/locked exfils, collapse epochs, portal art/world reads, extraction redesign,
AI portal redesign, tuning expedition, HUD timer presentation, and visual or
playtest evidence remain deferred. W1-F1's completion note was not present in
this checkout; W1-F2 was the available predecessor record.
