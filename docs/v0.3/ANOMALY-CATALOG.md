# v0.3 Anomaly Catalog Schema

> Phase 2 shared substrate. This document defines the catalog boundary, seeded
> selection policy, per-entity growth events, and provisional collapse epochs.
> It still does not ship distinct micro/supermassive/pulsar physics.

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
| `fabricSignature` | Parameter-vector description over the existing field family. |
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

## Phase 1 Runtime Entry

`base-well` is the only shipping runtime behavior. It describes the existing
well's radial gravity, orbital current, slingshot interaction, named
accretion/kill-edge tell, additive per-entity growth, and growth wave ring.
`migrateCurrentWell()` adds only `catalogId`, `behaviorId`, and
`catalogActivation` to a well object. Existing mass, orbital direction,
growth rate, kill radius, gravity reach, current reach, and renderer values
remain owned by their existing systems.

The `micro-black-hole`, `supermassive-black-hole`, and `pulsar` entries are
planned metadata only. They are eligible for future map identity draws, but
their `runtimeBehaviorId` resolves to `base-well` and their `shipping` flag is
false. No time dilation, per-player clock, periodic pulsar behavior, or new
anomaly physics is present in this phase.

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
  `anomalyCatalog` derivation.
- **Deep Field:** `seeded-draw`; each well draws from the Expanse pool plus
  `supermassive-black-hole`.

The selection result carries both `eligibleMap` and `cast`. `eligibleMap` is
the stable, reviewable candidate order per slot; `cast` is the selected
catalog identity plus the runtime behavior it resolves to. Named RNG
derivation keeps this draw independent of existing well variance, loot, and
sea streams.

## Deferred Boundary

Distinct anomaly-specific physics, the shipping trio's final behavior, and
the collapse endgame/session-termination owner remain deferred. Any future entry
must first replace its deferred metadata with a real parameter vector and a
runtime behavior that passes the same parity and authority gates. The adapter
must not infer bespoke physics from catalog text.
