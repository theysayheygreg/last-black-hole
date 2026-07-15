# W2-A4 Completion: Authoritative Map Scale

Date: 2026-07-14

## Decision

The active map set is exactly `shallows` 5x5 / `small`, `expanse` 15x15 /
`medium`, and `deep-field` 25x25 / `large`. The canonical field seam is:

```text
src/content/map-scales.data.json
  MAP_SCALE_REGISTRY[mapId]
    mapId, mapClass, dimensions.width, dimensions.height,
    profileId, sourceFile, legacyDimensions
```

ESM consumers use `src/content/map-scales.js`; CJS consumers use
`scripts/content/map-scales.cjs`. Active map modules expose `AUTHORED_MAP` and
`MAP = migrateAuthoredMap(AUTHORED_MAP, mapId)`. Server normalization exposes
`id`, `mapClass`, `profileId`, `dimensions`, and `worldScale`, with positions
as `wx`/`wy`.

## Evidence

- `W2A4MapScale`: 8 passed, 0 failed.
- `Validation`: 47 passed, 0 failed.
- `Signatures`: 5 passed, 0 failed.
- `RouteBriefing`: 3 passed, 0 failed.
- `SimScale`: 6 passed, 0 failed.
- Normalized position parity and bounds cover wells, stars, and wrecks for all
  three tiers; planetoid references remain index-valid.
- Authored density and route travel pass the declared floor/ceiling contract.
- 25x25 coarse field uses the large profile's `0.45` cell size and stays under
  its cell and snapshot budgets. Client fluid, coarse texture, and local
  window resources remain fixed and windowed.
- Same-seed anomaly truth, route identity, toroidal sampling, and authority
  endpoint dimensions/profile identity are covered.

No movement constant was tuned and no authored population correction was
needed. The full S24 population catalog remains deferred.
