# v0.3 Anomaly Catalog Schema And Shipping Trio

> Phase 2 shared substrate plus W2-A3 activation. This document defines the
> catalog boundary, seeded selection policy, bounded fabric vectors, per-entity
> growth events, and provisional collapse epochs.

## Source Of Truth

The canonical data lives in `src/content/anomalies.data.json`. Browser code
uses `src/anomaly-catalog.js`; the authoritative runtime uses
`scripts/anomaly-catalog.cjs`. Both wrappers validate and consume the same
manifest.

## Entry Shape

Every catalog entry contains:

| Field | Meaning |
|---|---|
| `id` | Stable catalog identity. |
| `status` | `shipping` or `planned`. |
| `activation` | Version/phase gate for the entry. |
| `runtimeBehaviorId` | Existing behavior implementation used by the adapter. |
| `fabricSignature` | Bounded parameter-vector description over the existing field/wave family. |
| `interactionVerb` | The skilled interaction the anomaly invites. |
| `tell` | State and growth telegraph, readable without HUD dependence. |
| `growthBehavior` | Per-entity growth and sea-response contract. |
| `tunables` | Link to the shared tunable contract plus future overrides. |

The shared tunable contract requires a unit, range, step, start bias, and
runtime source for every numeric knob. v0.3 uses the provisional
`1 sim unit = 1000 m` peg. The base entry records the current well values by
source; it does not copy or retune those values.

The shared `eventContracts.wellGrowth` entry declares the stable `well.grew`
event type, `well-growth` tell identity, and `growth` wave family used by all
current-well runtime behaviors.

## Runtime Entries And Fabric Vectors

`base-well` remains the only runtime behavior implementation. The shipping
trio deliberately resolves to that existing adapter: the catalog changes
identity, parameter vectors, and tells, not the authority model or formula
family. `migrateCurrentWell()` adds catalog identity plus a copied signature
object to a well. Existing mass, orbital direction, kill radius, and renderer
values remain owned by their existing systems.

W2-A3 activates exactly three catalog-backed entries after base-well parity:
`micro-black-hole`, `supermassive-black-hole`, and `pulsar`. All four shipping
entries use `kind: bounded-parameter-vector`, `fieldFamily: well`, and the
central `tunableContract.fabricSignatureParameters` contract. The authority
applies only these existing terms:

- gravity strength and reach in `buildCoarseFlowField()`;
- orbital-current strength and reach in `buildCoarseFlowField()`;
- source-weighted seeded-sea ambient in `sampleSeededSea()`;
- source-weighted live wave push for growth rings;
- existing additive growth rate and growth-ring amplitude.

Every vector value has a unit, range, step, start bias, and source in the
manifest. The vector is provisional where feel tuning remains. Base-well is
the identity vector, so an unmigrated/identity well produces the same field
and wave output as before.

| Entry | Fabric vector `(gravity strength, gravity reach, current strength, current reach, seeded ambient, live wave, growth rate, growth wave)` | Verb | Growth behavior |
|---|---|---|---|
| `base-well` | `(1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00)` | `slingshot` | `round-robin-mass-growth` |
| `micro-black-hole` | `(1.15, 0.75, 1.20, 0.80, 0.90, 0.95, 1.15, 0.90)` | `precision-slingshot` | `rapid-local-growth` |
| `supermassive-black-hole` | `(0.95, 1.25, 0.80, 1.25, 0.95, 1.10, 0.85, 1.15)` | `long-orbit` | `slow-anchor-growth` |
| `pulsar` | `(0.90, 0.90, 1.05, 1.00, 1.00, 1.20, 1.00, 1.20)` | `ride-the-beat` | `beat-growth` |

The verbs are movement/read contracts over existing mechanics. Pulsar does not
add a private timer or bespoke beam; its rhythm is the existing seeded sea and
event-wave read. Supermassive does not add time dilation, a per-player clock,
or a singular endgame owner. The trio's tell and growth metadata remains
HUD-independent and identifies the changed well through its catalog identity
and existing source growth ring.

## Phase 2 Growth Event Contract

The authority routes both normal scheduled growth and star consumption through
one helper. Each `well.grew` payload carries only the well that changed:

| Field | Meaning |
|---|---|
| `wellId`, `catalogId`, `behaviorId` | Exact well and catalog/runtime identity. |
| `source`, `reason` | `schedule`/`normal-schedule` or `star-consumption`/`star-consumed`. |
| `sourceEntityId`, `sourceEntityType` | Consumed star identity, or `null` for scheduled growth. |
| `before`, `after` | Mass and kill radius before and after the mutation. |
| `scheduledTime`, `eventTime` | Scheduled boundary when applicable, and authority event time. |
| `waveId`, `tellId` | Existing growth wave identity and catalog tell identity. |

The legacy `mass` and `killRadius` fields remain as after-value aliases for
existing consumers. Star consumption also publishes `star.consumed` with the
`wellGrowthEventSeq` that orders it after the well mutation.

## Phase 2 Collapse Epoch Contract

`collapseEpochContract` is deliberately provisional for Greg tuning. Epoch
boundaries are match-progress fractions, not player clocks:

| Identity | Progress | Default 600s schedule | Seeded ambient | Live wave push |
|---|---:|---:|---:|---:|
| `collapse-epoch-0` | `0.00` | `0s` | `1.00x` | `1.00x` |
| `collapse-epoch-1` | `0.25` | `150s` | `1.08x` | `1.05x` |
| `collapse-epoch-2` | `0.50` | `300s` | `1.16x` | `1.10x` |
| `collapse-epoch-3` | `0.65` | `390s` | `1.24x` | `1.15x` |

The two vector components are bounded, named multipliers over existing
authoritative field machinery only:
`seededSeaAmbientMultiplier` is bounded to `[1.00, 1.25]`, and
`liveWavePushMultiplier` is bounded to `[1.00, 1.20]`. Well gravity, orbital
current, movement constants, slingshot, fabric ownership, and player clocks do
not read the epoch vector. Epoch state is retained in the Conductor schedule,
and `collapse.epochTransition` is appended to the normal authority event
journal once per stable epoch identity, including previous/current ids,
scheduled time, event time, and vector.

Snapshots expose `world.collapseEpoch` and `world.collapseEpochSchedule` next
to the existing wells and wave rings. Presentation normalization preserves
the current epoch, schedule identities, catalog-backed well mass/radius, and
safe growth/epoch event fields without exposing arbitrary event payloads.

## Map Selection

- **Shallows:** `fixed-curated`; every well receives `base-well` regardless of
  seed. This is the teaching overture and keeps the current cast stable.
- **Expanse:** `seeded-draw`; each well gets a deterministic candidate order
  from `base-well`, `micro-black-hole`, and `pulsar` using the named
  `anomalyCatalog` derivation. Selected entries are shipping and resolve to
  the shared base-well adapter with their catalog vector.
- **Deep Field:** `seeded-draw`; each well draws from the Expanse pool plus
  `supermassive-black-hole`. Selected entries are shipping and resolve to the
  shared base-well adapter with their catalog vector.

The selection result carries both `eligibleMap` and `cast`. `eligibleMap` is
the stable, reviewable candidate order per slot; `cast` is the selected
catalog identity plus the runtime behavior it resolves to. Named RNG
derivation keeps this draw independent of existing well variance, loot, and
sea streams.

## Deferred Boundary

The collapse endgame/session-termination owner remains deferred to W2-B design
work. No exactly-one-supermassive or endgame-owner rule is encoded here. Any
future entry must first replace its deferred metadata with a bounded vector and
a runtime behavior that passes the same parity and authority gates. The adapter
must not infer bespoke physics from catalog text.
