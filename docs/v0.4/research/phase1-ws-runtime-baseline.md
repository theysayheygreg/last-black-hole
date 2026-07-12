# Phase 1 Same-Process WebSocket Runtime Baseline

> Measured 2026-07-11 on `codex/v0.4-multiplayer-architecture` at `e9b2757`.
> Local loopback Shallows evidence only; not a WAN or hosted-capacity claim.

## Authority topology proved

Each match has one logical single-writer authority. Its HTTP control surface,
`/stream` WebSocket upgrade, simulation tick, public projection, and
owner-private projection run in the same process and on the same port. Fleet
scale means one such logical authority per concurrent match, with multiple
match processes packed onto hosts where measured headroom permits. It does not
mean one global authority, one VM per match, or one writer per player.

The runtime gate proves authenticated single-use admission/resume tickets,
connection-epoch fencing, continuous monotonic input, public/private isolation,
bounded queues and inbound bytes, ordered shutdown, run reset, and cross-run
projection-accounting lineage. All five admitted gameplay action kinds now use
bounded membership/run receipts and the reliable ACK lane. Journal consequences
now replay through a separate bounded delivery/playback window with explicit
gap and run-change baselines.

## Latest local measurements

| Humans | Public p95 | Owner p95 | Projection Hz | Authority Hz | Mode |
|---:|---:|---:|---:|---:|---|
| 1 | 20,399 B | 1,028 B | 9.33 | 14.42 | `NORMAL` |
| 4 | 21,892 B | 1,642 B | 9.96 | 14.49 | `NORMAL` |
| 8 | 22,735 B | 1,135 B | 9.87 | 14.35 | `NORMAL` |

The configured targets are 10 Hz projection and 15 Hz authority. A separate
run measured average completed projection work at about 5.1 ms for four
clients and 8.5 ms for eight, with 8-client worst samples around 12.9 ms.
Completed replication CPU is charged once into the following overload sample;
pending work is bounded to four authority-tick budgets.

At full-state JSON and target cadence, the p95 application payload implies:

| Humans | Aggregate payload/s | Payload per match-hour |
|---:|---:|---:|
| 1 | 0.214 MB/s | 0.77 GB |
| 4 | 0.941 MB/s | 3.39 GB |
| 8 | 1.909 MB/s | 6.87 GB |

These exclude WebSocket, TCP/IP, and TLS overhead. They are regression budgets,
not a shippable egress plan: full public state is repeated per recipient.

## Connection to 24/48/96 forecasts

This fixture does not raise the current eight-human admission cap. A naive
linear extrapolation of the measured replication work already approaches tens
of milliseconds per projection at 24--48 recipients and roughly a full 10 Hz
projection budget near 96. It is also optimistic because public state grows
with participant count, making per-recipient full-state encoding trend toward
quadratic work before heavier bodies, AI, collision candidates, or history.

Therefore the heavier profiles remain separate products and benchmarks:

- 24: isolated authority process, AOI/deltas, bounded per-player relevance;
- 48: AOI/deltas plus quotas and optional read-only projection workers;
- 96: one logical canonical writer with deterministic internal workers,
  never independently writable regional shards.

The authoritative CPU/memory/network envelopes and hosted instance-hour costs
remain in `high-player-count-performance-model.md` and
`high-player-count-hosting-cost-model.md`. This baseline supplies a real
low-count replication anchor; it does not replace their H24/H48/H96/X96 tests.

## Browser-playable result

The local browser gate now passes four clients twice and eight once over the
stream transport. It covers normal menus, movement, reliable actions, private
inventory, death, extraction, reconnect, physical leave/rejoin, screenshots,
and cleanup. Steady all-live uncompressed application traffic measured
0.810--0.812 MB/s at four and 1.927 MB/s at eight; the eight-client authority
remained `NORMAL` at 15/10 Hz with 5.49 ms projection-average p95 and 3.98 ms
sim-tick p95.

## Remaining gates before internet multiplayer

- run loss, jitter, reorder, slow-reader, simultaneous reconnect, WAN,
  TLS-edge, and hosted soak proof;
- add invite/session UX and Greg hands-on movement/art acceptance;
- validate physical-device and public deployment paths.
