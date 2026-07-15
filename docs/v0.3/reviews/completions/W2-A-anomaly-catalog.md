# W2-A Anomaly Catalog

## Outcome

**phase-1/partial**

## What Changed

- Added the canonical anomaly catalog manifest at
  `src/content/anomalies.data.json`, with mirrored ESM/CJS content wrappers.
- Added the catalog validator, current-well migration adapter, and seeded cast
  selector in `src/anomaly-catalog.js` and `scripts/anomaly-catalog.cjs`.
- Migrated the existing well object through `base-well` without changing its
  gameplay fields. The authority exposes the selected catalog result on the
  session and each well carries catalog/runtime behavior identity.
- Wired the browser map loader and authoritative map clone path to the same
  seeded selection policy.
- Added the canonical schema/policy document at
  `docs/v0.3/ANOMALY-CATALOG.md` and the focused `AnomalyCatalog` test lane.

## Evidence

- `node tests/anomaly-catalog.cjs`: **5 passed, 0 failed**.
  - schema version: `1`
  - base-well parity before/after: `0c0a2bc0cbbb17ae` / `0c0a2bc0cbbb17ae`
  - Expanse seed `424242` cast hash: `41cdf10043078491`
  - Expanse seed `424242` eligible-map hash: `1885a6e6e0b517ed`
- `node tests/run-all.cjs --lane=fast --suite=AnomalyCatalog --renderer=three`:
  **PASS**.
- Authority smoke probe on an Expanse run with seed `424242` confirmed that
  session cast identity matches snapshot world identity and that all selected
  planned entries resolve to `behaviorId: base-well`.

## Deviations

- Collapse epochs, per-entity retune, and anomaly-specific growth tells are
  intentionally not implemented in this phase.
- Supermassive black hole, micro black hole, and pulsar are declarative planned
  entries only. Their seeded identities may appear in Expanse/Deep Field
  eligibility/cast metadata, but they ship no distinct physics and all resolve
  through the current-well adapter.
- No browser capture or broad CI was run, per the focused proof request.

## Open Questions

- Greg/design pass still owns the final future cast composition and when each
  planned entry becomes a shipping runtime behavior.
- The S9 endgame/collapse ownership decision remains outside this foundation
  slice.

## Anchor Updates

- New schema anchor: `docs/v0.3/ANOMALY-CATALOG.md`.
- New data anchor: `src/content/anomalies.data.json`.
- Runtime adapter anchors: `src/anomaly-catalog.js`,
  `scripts/anomaly-catalog.cjs`.
- No W1 movement/fabric constants, v0.4, `main`, renderer authority, or
  process documents were changed.
