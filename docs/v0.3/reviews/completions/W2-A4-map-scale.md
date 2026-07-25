# W2-A4 Completion: Authoritative Map Scale

Date: 2026-07-25 (Goal D rate-contract refresh)

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
- Authored density passes its linear world-unit bounds. The 60 Hz no-flow
  movement run is retained as a diagnostic baseline: `1.48` seconds in
  Shallows, `1.55 / 8.52 / 1.22` in Expanse, and `1.98 / 14.22` in Deep Field.
  It is not product-rate closure and does not assume currents, slingshots, or
  route assistance.
- Goal D product-rate route proof uses the selected `15/12/10 Hz` profile, the
  canonical drag/fluid movement core, zero current, full thrust, and one finite
  `100` delta-v tank carried across the authored legs:
  - Shallows: `1.53s`, `81.60` delta-v remaining.
  - Expanse: `1.67 / 20.17 / 6.00s`, `80.00 / 0.38 / 0.63` remaining,
    `27.84s` total.
  - Deep Field: `2.20 / 59.30s`, `73.60 / 1.15` remaining, `61.50s` total.
- The canonical slingshot gameplay coyote remains `50ms`. The internal
  prompt-to-command transport allowance is fixed wall time at four Shallows
  authority ticks (`266.667ms`) and does not expand with slower map profiles.
- `map-center-fractional-bands-v1` is the shared portal/exfil placement policy.
  Its fractional bands resolve through the ESM/CJS map-scale adapters for each
  tier; the server consumes the resolved policy for authoritative placement.
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
`500000`-byte ceiling. The local/offline seeded-sea presentation split remains
backlog work rather than a map-scale or movement blocker. Ballpark remains a
spatial/materialized-payload layer; it does not own movement integration.

## Goal D Focused Proof

- `node tests/map-rate-movement-contract.cjs`: product route, fixed wall-time
  coyote, and map-relative portal policy checks passed.
- `node tests/w2a4-map-scale.cjs`: `8 passed, 0 failed`.
- `node tests/slingshot-contract.cjs`: `10/10 passed`.
- `node tests/slingshot-dt-static.cjs`: `4/4 passed`.
- `node tests/slingshot-edge-queue.cjs`: `2 passed, 0 failed`.
- `node tests/portal-clock.cjs`: `3 passed, 0 failed`.
- `node tests/sim-scale.cjs`: `6 passed, 0 failed`.
- `node tests/sim-bounded-growth.cjs`: `1 passed, 0 failed`.
- `git diff --check` and changed-file syntax checks passed.
