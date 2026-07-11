# Phase 0 Multiplayer Authority Baseline

> Measured 2026-07-11 on `codex/v0.4-multiplayer-architecture` with the current
> HTTP diagnostic transport. This is local loopback evidence, not a WAN,
> WebSocket, hosted-fleet, or heavy-simulation benchmark.

## What the fixture proves

`tests/multiplayer-authority.cjs` starts separate deterministic 1-, 4-, and
8-human Shallows runs. Every human receives distinct command authority, sends
accepted input, observes the same public snapshot id and world truth, and gets
only its own private overlay. The fixture repeats the terminal outcome path 100
times and requires exactly one durable death increment and one run record.

The new trust-boundary tests additionally prove:

- reconnect preserves membership but rotates connection id, epoch, and command
  credential, immediately fencing the old connection;
- caller-supplied identity cannot redirect a credential to another player;
- reconnect ignores caller-supplied profile, hull, rig, loadout, and consumable
  mutations;
- public live/history snapshots omit profile, cargo, loadout, signal, portal,
  delta-v, input, ability, and effect state;
- authenticated live snapshots add only the current owner's private overlay;
- retained history remains public-only and labels one separate current
  `ownerState` rather than copying present state into old ticks;
- `(runId, profileId)` settlement is atomically durable and exact-retry
  idempotent, while conflicting reuse fails;
- configured sim-to-control-plane result writes require a server-side service
  token that is never sent to browser clients.

## Latest local measurements

| Humans | Public snapshot p95 | Owner snapshot p95 | Private overlay p95 | Public response p95 | Owner response p95 | Observed tick | Heap used |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 32,740 B | 34,027 B | 1,287 B | 1.726 ms | 1.437 ms | 12.93 Hz | 9.53 MiB |
| 4 | 37,090 B | 39,357 B | 2,596 B | 2.020 ms | 4.046 ms | 14.55 Hz | 11.37 MiB |
| 8 | 42,474 B | 43,761 B | 1,288 B | 1.381 ms | 3.788 ms | 15.93 Hz | 12.27 MiB |

The run used six aligned public/owner sampling rounds per scenario. Response
time is loopback HTTP request latency, not encode-only CPU. Tick observations
cover a short sample and can overshoot or undershoot the configured 15 Hz
because of interval boundaries. Use them as regression evidence, not capacity
claims.

At the current Shallows snapshot rate, the 8-player owner p95 body alone would
be roughly 0.66 MB/s per recipient at 15 snapshots/s, or about 5.25 MB/s of
aggregate payload before protocol/TLS overhead if every player received a full
owner projection each tick. This reinforces the roadmap: JSON full-state is a
truth slice, then measured deltas/compaction become mandatory before production.

## Remaining Phase 0 gaps

- Non-host diagnostic joins still accept an arbitrary new client alias and
  create membership at join time. Invite/admission claims and durable
  membership allocation remain control-plane work.
- Membership/connection state is process-local. Process-loss resume needs
  durable admission/reservation and checkpoint/replay design.
- The configured service token is a local shared secret, not per-authority
  lease fencing, rotation, mTLS, or workload identity.
- This fixture does not emulate RTT, jitter, loss, reorder, bandwidth limits,
  slow readers, WebSocket queues, or simultaneous reconnect.
- The 24/48/96 heavy envelopes remain forecasts. This Phase 0 fixture does not
  replace the documented H24/H48/H96/X96 hosted benchmark matrix.
