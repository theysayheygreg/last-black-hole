# v0.4 Multiplayer Roadmap

> This roadmap turns the architecture into falsifiable slices. No vendor or
> public-feature promise is final until the relevant gates pass.

## Release Thesis

**One match, one logical authority; concurrent matches, concurrent authorities;
four to eight players, honest movement.**

Match authorities scale horizontally and may be densely packed on regional
compute. “One per match” is an ownership/isolation rule, not one paid VM per
match.

v0.4 succeeds when four and eight real clients can complete truthful LBH runs
over an internet-shaped network, with private recipient state, bounded bytes,
reconnect, atomic progression, and movement that Greg accepts.

## Phase 0 — Trust Closure And Measured Baseline

Goal: make the current v0.3 authority safe enough to test and measurable at
1/4/8 clients without redesigning its transport or persistence.

**Implementation checkpoint — 2026-07-11:** the deterministic 1/4/8 fixture,
server-created membership/connection epochs, reconnect credential rotation,
old-connection fencing, owner/public live projection, public-only history with
separate current owner state, 100x idempotent settlement, and configured
sim-to-control-plane service authentication are implemented. The two new
`multiplayer-structure` and `multiplayer-authority` lanes pass. Non-host
admission claims, durable process-loss resume, per-authority service identity,
and WAN/queue evidence remain open.

- Add a deterministic multi-client fixture for 1/4/8 humans.
- Record current snapshot fields, bytes, encode time, tick cost, heap, and
  result replay behavior.
- Split owner-private player state from the complete public world schema.
- Introduce server-created membership plus connection epoch.
- Reconnect rotates command authority and rehydrates only server state; it
  cannot submit profile, hull, rig, equipment, or consumable mutations.
- Make outcome/result delivery idempotent and authenticate service mutation.
- Keep current HTTP transport as the diagnostic reference.

Gate:

- four and eight clients share one run in a test fixture;
- no rival receives owner-private state;
- changing a caller id does not change authorization;
- result delivery repeated 100 times mutates durable state once;
- v0.3 authority/golden suites remain green.

## Phase 1 — Smallest Playable JSON WebSocket Slice

Goal: prove multiplayer truth before optimizing the wire.

**Scaffold checkpoint — 2026-07-11:** strict transport-neutral JSON frames and
the bounded/coalesced per-connection send queue are implemented and pass the
`multiplayer-network` lane. The same-process adapter plan chooses a pinned
`ws` 8.x dependency attached to the existing sim HTTP server with no second
process, authority, port, or timer. At that checkpoint, ticket integration,
field revision, command parity, and package staging were the remaining seams;
the runtime checkpoint below supersedes that status.

**Runtime checkpoint — 2026-07-11:** the optional same-process `/stream`
runtime, authenticated admission/resume, bounded queues, 1/4/8 cadence,
projection-cost accounting, reconnect-safe idempotent actions, and
run-qualified membership-private event replay/rebase are implemented and pass
the multiplayer-network and authority lanes. The remaining Phase 1 critical
path is SimClient/browser cutover and a natural four/eight-client journey.

**Client checkpoint — 2026-07-11:** `SimClient` now keeps HTTP as the default
oracle and exposes an explicit `simTransport=stream` browser path. The stream
path merges exact public/owner lineage, separates continuous input ACKs from
reliable semantic actions, preserves action identity across reconnect, splits
delivery from playback ACK, fences stale connection generations, bounds
cancellation/leave, and performs no hot-path HTTP. Phase 1 still requires the
natural four/eight-browser journey before any playable claim.

**Playable-browser checkpoint — 2026-07-11:** the registered
`multiplayer-playable` lane passes four browsers twice and eight once through
normal host/join menus, held movement, salvage, pulse, consumable, slingshot,
death, extraction, exact-once reconnect, physical pause-menu leave, and
same-run rejoin. Owner privacy, zero hot-path HTTP, 1280x800 evidence, measured
application bytes, and process cleanup are explicit gates. This closes the
local Phase 1 playable slice; WAN and hosted truth move to Phase 2 and later.

- [x] Add a persistent JSON WSS adapter with hello/version, membership binding,
  heartbeat, and bounded queues.
- [x] Send owner-private state plus the complete public world; no AOI yet.
- [x] Keep existing Shallows/Expanse/Deep Field sim clocks.
- [x] Split latest-wins input from reliable idempotent actions.
- [x] Drive four, then eight clients through natural movement, salvage, signal,
  death, and extraction.

Gate:

- no request-per-input or snapshot polling hot path;
- all clients agree on run, tick, lifecycle, and event watermarks;
- no unbounded connection/send/event history;
- four/eight complete truthful natural outcomes;
- packet captures report actual upstream/downstream/serialization distributions.

## Phase 2 — Network Failure, Reconnect, And Backpressure

Goal: make the smallest slice honest under imperfect connectivity.

**Impairment architecture decision — 2026-07-11:** use distinct evidence
layers. A seeded directional application-frame scheduler owns deterministic
ACK/replay/rebase/epoch adversaries but must never call them packet loss. CDP
owns fixed real-browser latency/rate/offline smoke. Per-client TCP proxies own
fixed directional buffering/rate/reset cases, with authority-side
`bufferedAmount` required for a slow-reader claim. Receiver-ingress Linux
`netem` owns later seeded IP loss/reorder/duplication and TCP retransmit/HOL
truth. None of these alone is WAN/TLS proof. See
`docs/project/reviews/2026-07-11-phase2-network-impairment-harness.md`.

Implementation order starts with the pure seeded scheduler kernel and decision
tapes, then adapter/client injection, then a 4p F0/F1/F3/F6 browser lane. Proxy,
CDP, netem, and the full 4p/8p matrix follow as separately reviewable slices.

**Scheduler-kernel checkpoint — 2026-07-12:** the first slice is implemented
under `tests/network/` and registered in static, full, and multiplayer-network
lanes. Its focused proof covers portable seed vectors, independent derived
streams, virtual time, immutable/fail-closed tapes, exact wire identity,
bounded atomic reorder, blackout semantics, explicit epoch fencing, redacted
evidence, hard memory caps, and reusable cleanup. No production source changed.
The next exclusive-owner slice is adapter-side scheduler injection with the
default immediate path preserved bit-for-bit.

**Browser/transport checkpoint — 2026-07-12:** the application-frame path now
has accepted F0/F1/F3/F6 four-browser evidence, including simultaneous
four-client epoch rotation and recovery. T0 also has clean committed-head
Chrome 150 evidence for fixed aggregate shaping plus a five-second offline
stall. Chrome queued the open WebSocket and resumed that same socket, so T0 is
not reconnect, packet-loss, TCP-pressure, WAN, or TLS proof. Its accepted
artifact is
`multiplayer-impairment-2026-07-12T093206432Z-t0-cdp-smoke-4p-0410CD90-f460af`.
The next implementation slice is a managed T1 TCP-stream proxy cohort with one
shared match authority and four independent per-browser listeners. F5
blackout/reset follows only after T1 acceptance; T2 slow-reader proof still
requires authority-side `bufferedAmount` pressure, and Linux receiver-ingress
netem remains the packet-truth lane.

**T1 checkpoint — 2026-07-12:** the managed four-browser proxy PR smoke is now
accepted from clean commit `b15ea6a`. Four independently shaped listeners fed
one stable authority, all client latency/consequence gates passed, and every
tool/path/client/process cleanup fact closed. This remains 45-second local
TCP-stream evidence, not canonical 90-second or packet/WAN/TLS proof. The next
bounded slice was F5 one-client blackout plus forced transport rotation and
authoritative reconnect proof.

**F5 checkpoint — 2026-07-12:** clean commit `8f5133a` and artifact
`multiplayer-impairment-2026-07-12T122241558Z-f5-one-client-blackout-4p-0405B1AC-11747e`
are accepted. Four listeners still fed one stable match authority. Only pilot
3 saw the 25-second timeout-zero drop and one-listener fence; it recovered on a
distinct socket at epoch 2 in 158 ms while all healthy clients stayed at epoch
1. The next bounded evidence lane is T2 slow-reader authority-pressure proof;
Linux receiver-ingress netem and hosted WSS remain separate.

- Add RTT, jitter, loss, burst loss, reorder, duplication, blackout, bandwidth
  cap, slow-reader, and simultaneous reconnect cases.
- Coalesce replaceable public state while preserving reliable consequences.
- Chunk/restart full baselines and disconnect before retention becomes unsafe.
- Use one initial 90-second reconnect reservation: neutral input, hazards live,
  old epoch fenced.

Gate:

- slow client cannot raise authority tick p95 or grow memory without bound;
- old connection/credential cannot control a reconnected body;
- reset/new-run races cannot revive an old run;
- all eight clients reconnecting after a flap recover or fail explicitly;
- no consequence duplicates across loss/retry.

## Phase 3 — Prediction And Clock Falsification

Goal: determine the smallest movement machinery that preserves feel.

- Start with existing authority clocks, immediate local control presentation,
  swept contact, and remote interpolation.
- If WAN traces show unacceptable feel, add local-player-only prediction and
  input replay against the current authority field revision.
- Only then run blind 15/20/30 Hz comparisons. If a higher rate wins, promote
  one explicit movement/contact clock with parity tests rather than adding an
  ad hoc subclock.
- Never predict irreversible pickup, death, extraction, signal, or inventory.

Gate:

- local input-to-render <=16.7 ms p95;
- supported envelope and correction thresholds are recorded from real traces;
- no predicted irreversible consequence;
- server/client force probes agree within the chosen contract;
- Greg accepts movement at 80/120/160 ms test points.

## Phase 4 — Measured Replication Compaction

Goal: add only the optimizations that measured bytes/CPU require.

- First separate static manifest/hash from repeated public dynamic state.
- Then add baselines/deltas, component masks, quantization, tombstones, and
  codec golden vectors.
- Add spatial AOI only for body families whose absence is semantically safe
  and materially reduces traffic.
- Add binary encoding only if JSON serialization or bandwidth remains material.

Gate:

- compacted expected delta <=3 KiB p50 and <=6 KiB p95;
- projected keyframe <=32 KiB p95;
- expected gameplay downlink <=80 KB/s/client;
- encode/decode/rebase and toroidal lifecycle stay deterministic;
- every optimization reports before/after CPU, bytes, and complexity.

## Phase 5 — Hosted Identity, Durable Settlement, And Placement

Goal: add the minimum public account/progression plane only after Greg confirms
that hosted progression belongs in the release boundary.

- Add relational result/settlement and ledger records behind the existing
  control-plane boundary; prove crash/retry and conflict quarantine.
- Add the chosen platform ticket/entitlement adapter, short sessions, and
  owner authorization.
- Keep local and cloud lineage/import policy behind an explicit Greg decision.
- Add invite/session/run membership, signed admission/resume tickets,
  authority-instance leases/fencing, and service-authenticated result commit.
- Add export/deletion, retention, negative authorization, replay, race, and
  resource-abuse tests proportional to the shipped surface.

Gate:

- entitled/authorized players join only their own profiles and sessions;
- crash/retry commits a result and rewards exactly once;
- one lobby leader is promoted under race without gaining gameplay authority;
- no ticket/token/secret appears in logs, snapshots, events, URLs, or replays;
- offline/local profiles remain functional.

## Phase 6 — Private WAN And One Hosted Region

Goal: replace estimates with packet captures and bills.

- Prove four remote-rendering clients against a private Mac authority over
  LAN/Tailscale.
- Deploy the same run artifact to one regional Node-compatible host.
- Benchmark packed runs per vCPU/GB and one-run-per-instance fallback.
- Measure `safeAuthoritiesPerHost` under mixed quiet/normal/overloaded matches,
  noisy-neighbor limits, worker crash fencing, drain, and regional placement.
- Run a separate one-Durable-Object authority spike on the same scenario.
- Capture application and on-wire bytes, CPU, memory, start time, egress,
  disconnect/reconnect, and per-run cost.
- Run 90-minute eight-client soak and repeated churn.

Gate:

- chosen authority clock holds representative p95 below 50% and p99 below 70%
  of its frame budget; any later 30 Hz profile has its own <=20/28 ms gate;
- no sustained tick debt >250 ms;
- expected downlink <=80 KB/s/client;
- late join <=2 seconds p95 and reconnect <=3 seconds after socket open;
- low-egress hosted-service target <=$0.015/player-hour, or the illustrative
  unit economics are revised from measured stack costs;
- host-count forecasts derive from concurrent matches and measured worker
  density, not copies sold or a one-VM-per-run assumption.

## Scale Track — 24/48/96 Players In One Match

Goal: test future single-match scale without bloating the 4–8-player critical
path or weakening one canonical writer.

### S24 — isolated conventional authority

- Benchmark `H24`: 24 humans, 400 dynamic bodies, 48 expensive AI.
- Remove accidental all-player scans and move eligible candidates through
  Ballpark.
- Require deltas/static manifest and AOI-ready replication lanes.
- Keep one process and one writer thread.

Gate: normal mode, <=80 KB/s/client, <=2 MB/s/match, and chosen tick p95/p99
inside product budget without TiDi.

### S48 — dedicated service and replication workers

- Benchmark `H48`: 48 humans, 900 bodies, 96 expensive AI.
- Require AOI, dirty state, priorities, far lanes, and explicit CPU quota.
- Offload projection/encoding first; field/broad-phase/AI jobs only after traces
  justify deterministic worker contracts.

Gate: normal mode without TiDi, <=4 MB/s/match, no serial writer regression,
and no worker result applied after its tick barrier.

### S96 — one logical authority, internal parallelism

- Benchmark `H96` and `X96`: 96 humans, 1,800/3,000 bodies, 192/384 expensive
  AI, tiled/disturbance-heavy fields.
- Use one canonical writer plus a fixed worker pool inside one isolated match
  service. Dedicate 4 vCPU first, then measure 6/8 vCPU.
- Require near/mid/far replication lanes, binary quantization, shared public
  fragments, owner overlays, worker fencing, and deterministic reductions.

Gate: serial writer <=8 ms p95, total CPU <=40 ms/tick p95, chosen clock <=20
ms p95/28 ms p99, <=6.5 MB/s normal egress, and no normal-load TiDi. If it
misses after algorithmic cleanup/internal parallelism, reduce clock/content or
cap the mode; do not hide failure behind permanent dilation.

Reopen multi-writer spatial sharding only after an optimized `H96` failure and
a prototype proves stable spatial independence, correct handoff, and at least
2x benefit.

## Phase 7 — Private Fallback And Recovery

Goal: preserve private/long-tail play without weakening verified authority.

- Abstract relay transport and add Steam Datagram Relay or equivalent.
- Rank host candidates by RTT, loss, upstream, CPU, power/suspend risk, and
  relay reachability.
- Replicate signed migration checkpoint and watermarks to candidates.
- Fence prior authority with epoch rotation.
- Mark private-host progression local/unverified.
- Prototype dedicated-authority checkpoint restore separately.

Gate:

- trusted private four/eight-player session survives a non-adversarial host
  loss within the chosen pause budget or ends cleanly;
- a 4–4 partition never produces two verified durable settlements;
- stale host return cannot control or settle the new epoch;
- dedicated/public authority remains the only verified progression source.

## Phase 8 — Invite Alpha

Goal: real four-to-eight-player use with operational guardrails.

- Invite/join-code party UI, region choice, connection health, reconnect UX,
  interrupted-run/result-pending states, report/block controls.
- Cost caps, allocation quotas, rate limits, DDoS/denial-of-wallet defenses,
  alerts, logs, dashboards, backup/restore, support tools, retention jobs.
- Four-human and eight-human playable proof plus Greg movement/taste review.

Gate:

- no severity-one authority, privacy, duplicate-settlement, or unbounded-cost
  failure in the alpha window;
- observed CCU/player-hours update the cost model;
- public copy says exactly what is hosted, private, verified, and experimental;
- Greg explicitly chooses whether this becomes a released v0.4 feature.

## Non-Goals Until Evidence Demands Them

- persistent MMO universe;
- sharding one live run across machines;
- full ECS/network-framework adoption;
- authority-free public P2P;
- whole-world rollback;
- public anonymous guests or custom password accounts;
- global anonymous matchmaking;
- live transparent sim failover before checkpoints/replay are proven;
- voice chat in the gameplay transport.

## Required Harness Lanes

- `multiplayer-structure`: schema, codec, privacy, identity, settlement.
- `multiplayer-network`: emulated RTT/jitter/loss/reorder/backpressure.
- `multiplayer-authority`: 1/4/8 truth and consequence parity.
- `multiplayer-soak`: 45–90 minute churn, memory, queues, histories, bytes.
- `multiplayer-playable`: natural four/eight-player journeys and captures.
- `multiplayer-hosting`: process/container/DO CPU, bytes, startup, cost.
