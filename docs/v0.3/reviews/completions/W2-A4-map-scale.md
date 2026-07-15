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
`scripts/content/map-scales.cjs`. `src/maps/playable-map-loader.js` exports the
static `MAP_MODULES` table and asserts imported-module `id`/`sourceFile` parity.
Active map modules expose `AUTHORED_MAP` and
`MAP = migrateAuthoredMap(AUTHORED_MAP, mapId)`. Server normalization exposes
`id`, `mapClass`, `profileId`, `sourceFile`, `dimensions`, and `worldScale`,
with positions as `wx`/`wy`.

## Evidence

- `W2A4MapScale`: 8 passed, 0 failed.
- `Validation`: 47 passed, 0 failed.
- `Signatures`: 5 passed, 0 failed.
- `RouteBriefing`: 3 passed, 0 failed.
- `SimScale`: 6 passed, 0 failed.
- `RendererAuthority`: 5 passed, 0 failed.
- Normalized position parity and bounds cover wells, stars, and wrecks for all
  three tiers; planetoid references remain index-valid.
- Authored density passes its linear world-unit bounds. Canonical direct
  no-flow movement at 60 Hz observes `1.48` seconds in Shallows, `1.55 / 8.52 /
  1.22` in Expanse, and `1.98 / 14.22` in Deep Field. Tier bounds are `1.4-1.6`,
  `1.1-8.75`, and `1.9-14.5` seconds respectively; this baseline does not
  assume currents, slingshots, or route assistance.
- 25x25 coarse field uses the large profile's `0.45` cell size and constructs
  `3136/4096` cells. The recorded snapshot observation is `323430/500000`
  bytes. Client resources remain fixed at `192` fluid, a `3` world-unit local
  window, and a `64` coarse texture. Construction and serialization guards
  reject over-budget fields/snapshots before retaining them.
- Same-seed anomaly truth, route identity, toroidal sampling, and authority
  endpoint dimensions/profile identity are covered.

No movement constant was tuned and no authored population correction was
needed. The full S24 population catalog remains deferred. The snapshot figure
is an observation, not a byte-stable identity; the executable contract is the
`500000`-byte ceiling.
