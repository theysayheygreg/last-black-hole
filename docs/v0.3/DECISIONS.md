# v0.3 Decisions

## W2-A4 Authoritative Map Scale

Decision: keep exactly three active maps. The canonical registry in
`src/content/map-scales.data.json` owns map id, map class, square dimensions,
profile identity, canonical module filename, and authored legacy dimensions:

| Map id | Class | Dimensions | Profile |
|---|---|---:|---|
| `shallows` | `shallows` | 5x5 | `small` |
| `expanse` | `expanse` | 15x15 | `medium` |
| `deep-field` | `deep-field` | 25x25 | `large` |

The browser wrapper is `src/content/map-scales.js`; the authoritative Node
wrapper is `scripts/content/map-scales.cjs`. Their field names and values are
parity-tested. `src/maps/playable-map-loader.js` owns the browser's static
module table and proves each imported map's `id` and `sourceFile` against the
registry. Active map modules expose `AUTHORED_MAP` and a canonical `MAP` export
produced by `migrateAuthoredMap()` in `src/maps/map-migration.js`.

Migration is deterministic normalized composition: authored coordinates are
scaled from each registry entry's `legacyDimensions` into its canonical
dimensions. No authored route, seeded anomaly cast, portal/extraction rule,
toroidal rule, Conductor rule, or entity authority rule changes.

The declared authored contract is linear density per world unit:

- wells: `0.5` to `1.0`
- stars: `0.7` to `1.25`
- wrecks: `1.0` to `2.0`
- planetoids: `0.4` to `0.8`

Route legs must be at least `0.75` world units and no more than `0.7` of the
map width. Travel proof is a direct no-flow baseline integrated through the
canonical movement core at 60 Hz with baseline thrust, drag, and fluid
coupling, zero current, and sufficient delta-v. It is not an assisted-route or
total-run promise. The observed authored legs and tier contracts are:

- Shallows: `1.48` seconds, within `1.4` to `1.6`.
- Expanse: `1.55`, `8.52`, and `1.22` seconds, within `1.1` to `8.75`.
- Deep Field: `1.98` and `14.22` seconds, within `1.9` to `14.5`.

All three authored maps pass without a population correction or movement
retune. Currents, slingshots, and other route assistance remain gameplay
effects rather than assumptions in this floor/ceiling contract.

The 25x25 tier uses the existing coarse-field seam. Browser allocations remain
`192` fluid, a `3` world-unit local window, and a `64` coarse texture; no
full-map 25x25 GPU texture is introduced. Deep Field constructs `3136` of its
`4096` coarse-cell ceiling. The observed snapshot is `323430` bytes against a
`500000`-byte ceiling. Coarse-field construction and packet serialization,
and snapshot-ring serialization, fail closed before retaining over-budget
state. Expanse's executable coarse-cell ceiling is `2304` for `2209` cells.

S24 catalog population is explicitly deferred. W2-A4 only proves the current
authored population is playable under the density/travel contract; it does not
begin a new encounter catalog or add a Map Select surface.
