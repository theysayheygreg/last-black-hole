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
parity-tested. Active map modules expose `AUTHORED_MAP` and a canonical `MAP`
export produced by `migrateAuthoredMap()` in `src/maps/map-migration.js`.

Migration is deterministic normalized composition: authored coordinates are
scaled from each registry entry's `legacyDimensions` into its canonical
dimensions. No authored route, seeded anomaly cast, portal/extraction rule,
toroidal rule, Conductor rule, or entity authority rule changes.

The declared authored contract is linear density per world unit:

- wells: `0.5` to `1.0`
- stars: `0.7` to `1.25`
- wrecks: `1.0` to `2.0`
- planetoids: `0.4` to `0.8`

Route legs must be at least `0.75` world units, no more than `0.7` of the
map width, and take `0.4` to `4.5` seconds under the canonical movement
ledger (`2.5` thrust acceleration, `8.0` world-units/second cap). All three
authored maps pass without a population correction or movement retune.

The 25x25 tier uses the existing coarse-field seam. The browser fluid and
coarse texture allocations stay fixed at the client profile values, the local
window remains `3` world units, and the server large profile caps coarse-field
cells and snapshot payloads. No full-map 25x25 GPU texture is introduced.

S24 catalog population is explicitly deferred. W2-A4 only proves the current
authored population is playable under the density/travel contract; it does not
begin a new encounter catalog or add a Map Select surface.
