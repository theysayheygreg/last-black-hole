# W2-A3 Shipping-Trio Cast Activation

## Outcome

**phase-2/shipping-trio-authority**

The ratified `supermassive-black-hole`, `micro-black-hole`, and `pulsar`
entries are now shipping catalog identities. They all use the existing
`base-well` authoritative behavior adapter, with distinct provisional vectors
over the existing coarse gravity/current, seeded-sea, live-wave, and growth
machinery. Base-well remains the identity vector and passes field/wave parity.

## Exact Vectors

Parameter order: `gravityStrengthMultiplier`, `gravityReachMultiplier`,
`currentStrengthMultiplier`, `currentReachMultiplier`,
`seededSeaAmbientMultiplier`, `liveWavePushMultiplier`,
`growthRateMultiplier`, `growthWaveAmplitudeMultiplier`.

| Entry | Vector |
|---|---|
| `base-well` | `1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00` |
| `micro-black-hole` | `1.15, 0.75, 1.20, 0.80, 0.90, 0.95, 1.15, 0.90` |
| `supermassive-black-hole` | `0.95, 1.25, 0.80, 1.25, 0.95, 1.10, 0.85, 1.15` |
| `pulsar` | `0.90, 0.90, 1.05, 1.00, 1.00, 1.20, 1.00, 1.20` |

All values are central-manifest parameters with units, bounds, steps, start
biases, and runtime sources. They remain provisional for feel tuning.

## Cast Proof

- Shallows is `fixed-curated` and remains `base-well` in every slot.
- Expanse and Deep Field use named seeded draws. Seed `424242` is byte-stable
  for repeated map/config construction; seed `424243` diverges.
- Expanse seed `424242`: cast hash `fe4bc9ec53db9688`, eligible-map hash
  `1885a6e6e0b517ed`.
- Expanse seed `424243`: cast hash `595240bb79e36b2b`, eligible-map hash
  `124a41fd9f5f9ff3`.
- Deep Field seed `424242`: cast hash `91b169d5ba1e40b3`, eligible-map hash
  `1db5f193c2e0a6bc`.
- Deep Field seed `424243`: cast hash `9a40f6fe2c142481`, eligible-map hash
  `2f5d9f9329c731a8`.
- Live authority seed `424242` seeded-sea hashes: Expanse
  `3083d37f593cf2a52bcc7e5a5a2c2383c50484a55e37037454dcbeea54256305`; Deep
  Field `dece99470da9189312e0f8b82dce3d6abd42dd759a34fe81b22123ddded4fb69`.

## Runtime And Snapshot Truth

- `migrateCurrentWell()` carries `fabricSignatureId` and the copied vector.
- The selected cast carries catalog identity, runtime behavior, signature,
  interaction verb, tell identity, and growth behavior identity.
- The authoritative snapshot exposes the same cast under session and world
  truth, and every well's identity/signature matches its selected cast slot.
- Growth rings carry their source well identity, so live wave scaling remains
  catalog-backed and inspectable.

## Evidence

- `node tests/w2a3-shipping-trio.cjs`: **7 passed, 0 failed**.
- `node tests/anomaly-catalog.cjs`: **5 passed, 0 failed**.
- `node tests/authoritative-field.cjs`: **5 passed, 0 failed**.
- `node tests/sim-growth-epochs.cjs`: **9 passed, 0 failed**.
- `node --check` passed for the changed CJS runtime/catalog/field/seeded-sea
  modules; `git diff --check` passed.

## Boundaries And Deviations

- No bespoke anomaly physics, new RNG, renderer authority, per-player time
  dilation, portal/Inhibitor behavior, W1 movement/slingshot retune, or
  exactly-one-supermassive/endgame-owner rule was added.
- The existing `base-well` formulas remain the adapter for all entries; the
  trio changes only the declared bounded source terms at the activated cast
  boundary.
- No browser capture or broad CI was run. W2-B endgame ownership remains
  design-only.
