# v0.3 Anomaly Catalog Schema

> Phase 1 foundation. This document defines the catalog boundary and seeded
> selection policy. It does not ship new anomaly physics.

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

Collapse epochs, per-entity retune, visible anomaly-specific growth tells,
and the shipping trio's distinct physics are phase-2 work. Any future entry
must first replace its deferred metadata with a real parameter vector and a
runtime behavior that passes the same parity and authority gates. The adapter
must not infer bespoke physics from catalog text.
