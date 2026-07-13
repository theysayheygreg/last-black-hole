# S12 Codec-Aware State-Pair Evidence

This immutable pre-gate capture was produced from `223631e` with:

```sh
LBH_S12_OUTPUT_DIR=docs/v0.4/evidence/state-pair-s12/pre-gate \
  node tests/multiplayer-state-pair-product-gate.cjs \
  --s12-codec-aware --review --normal-only
```

The artifact validates successfully. Its aggregate SHA-256 is
`00c6377fcf68b76dfac429054a35a0a9c55c7d93d8e043df7166a4eab5429845`.

The representative 1/4/8 runs preserved atomic correctness and exact traffic
accounting. Worst-recipient observed mean / one-second p95 / p99 were:

- 1 player: 56,430.85 / 58,643 / 59,560 bytes/s.
- 4 players: 34,653.25 / 36,873 / 40,968 bytes/s.
- 8 players: 23,194.10 / 24,894 / 25,205 bytes/s.

This is deliberately **not** product-admission evidence. The aggregate verdict
is FAIL: 4- and 8-player target-cadence normalization and clock/overload gates
did not pass, although convergence and correctness did. Every representative
pair selected `public-delta+owner-keyframe`; the workload did not exercise an
owner-delta wire winner. Focused negotiated-codec tests separately prove the
four-candidate optimizer can choose an owner delta when its exact positional
wire is smaller, while recovery/no-base publication remains keyframe-first.

An independent read-only red-team found no remaining P1/P2 issue after the
trusted fixed-context encoder, exact-wire queue retention accounting, and
verified retransmit reuse corrections.
