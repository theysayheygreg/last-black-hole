# v0.3 Decisions

> Document revision: v0.3. Updated 2026-07-15. This file records accepted
> implementation decisions for the current source line. Remaining Greg-owned
> decisions stay in `OPEN-DECISIONS.md`.

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

## Locked Physical Units Centralization

Decision: lock the physical presentation scale for v0.3.1. The sole shared
code-data authority is `src/content/units.data.json`, whose `inputs` are:

| Input | Locked value |
|---|---:|
| meters per sim/world unit | `1000 m` |
| Drifter hull length | `12 m` |
| ruler presentation default | `100 m` |

The manifest's `ratification` records owner `Greg`, date `2026-07-17`, status
`locked`, and the decision source. Browser and CommonJS wrappers expose the
same raw manifest and derive `drifterHullLengthSimUnits` as `12 / 1000`.
Ruler, measurement, dev-panel, force-ledger, fixture, and runtime consumers
must import or derive from those wrappers. The wrappers also retain the
existing flat `UNIT_SCALE` compatibility view for callers already on this
version line; derived values are never stored in the manifest.

This locks labels and conversion math only. It does not retune physics, maps,
cameras, sprites, collision, or radii.

## Pause And Resume Reconciliation

**Status:** accepted on `341268b17f76a58303531c57743b461b4d7c9e83`.

Pause is a local presentation overlay. The remote authority world continues:
authority, network health, snapshot intake, and covered event intake remain
live, and pause never auto-unpauses. Entry neutralizes held and edge inputs
exactly once, clears pending action flags, and leaves server truth untouched.

Covered presentation coalesces to the latest authority snapshot. A short resume
under `1500ms` follows the current phase normally. A long resume at or above
`1500ms` applies the newest authority truth atomically, settles camera, fluid,
and presentation, and clears stale UI motion. Terminal, phase, and run changes
route directly from current authority truth; cached terminal events are scoped
to the exact authority run.

The local debug/sandbox freeze is separate and may freeze client simulation for
debugging only. Deck/controller prompts use the accepted graphical glyph family
without raw keyboard fallback copy. Reduced motion keeps required pause,
recovery, terminal, and resume copy settled and readable.

This decision changes no protocol or server authority behavior. Visual feel and
headed proof remain deferred; this source acceptance does not require visual
proof.

## W1-D Slingshot Input-Path RC Ratification

Decision: accept the v0.3.1 slingshot input path as the packaged local-authority
contract. Physical F and Deck/controller Y are rising-edge actions owned by
InputManager and main, queued as `slingshotEdges`, acknowledged by SimClient,
and consumed only by the authority affordance/engage seam. The client presents
the authoritative aim ring and device-correct engage/release prompt; a press
without an eligible anchor reports that no anchor is in range and does not
invent a local outcome.

The five gameplay values remain centralized in
`scripts/sim/slingshot-contract.cjs` and ratified as:

| Value | Baseline |
| --- | ---: |
| capture radius | `450 m` |
| magnetism | `30 deg` |
| coyote time | `50 ms` |
| payoff curve | `1.4x` per quarter-turn |
| chain window | `0.5 s` |

Lock telegraph (`0.25 s`) and release ghost (`1.0 s`) are internal
presentation durations. This ratification preserves server authority and the
accepted movement, sea, Conductor, timeSlow, and unit contracts.
