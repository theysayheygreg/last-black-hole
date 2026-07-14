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
1. The next bounded evidence lane is now split by the approved T2 packet:
`T2a` drains one exact raw-client authority connection before policy timeout,
then `T2b` holds a fresh connection through bounded fence/reconnect/replay.
Both retain one dedicated authority for the match and privacy-safe
per-connection attribution. Linux/browser `T2c`, packet netem, and hosted WSS
remain separate.

**T2 adapter checkpoint — 2026-07-12:** `381f435` plus fix-forward `c09882d`
lands exact timeout action/reason accounting, default-absent per-connection
telemetry, immutable pressure transitions, causal sweep timing, cleanup-only
reset counts, and final cleanup events. Adapter core is 28/28 and the full
multiplayer-network lane is 11/11.

**T2a checkpoint — 2026-07-12:** T2a is independently accepted at `3cfc9a8`.
The clean canonical artifact is
`multiplayer-transport-2026-07-12T144443527Z-t2a-432a63`; a fresh focused rerun
also passed. One exact read-gated connection among four raw clients crossed
high water, coalesced replaceable state, retained eight dynamic reliable
identities, then drained before heartbeat or pressure timeout. Exact-one
queue/send/receive/ACK cardinality, normalized public/owner state coverage,
healthy-peer isolation, stable one-per-match authority PID, bounded evidence,
HTTP classification, privacy, and cleanup are closed. This remains local PR-
smoke pressure evidence. The next bounded slice is T2b hard pressure with an
isolated fence, reconnect/rebase, and exactly-once replay; T2c, packet truth,
browser ingress, WAN, WSS, and capacity remain separate.

**T2b checkpoint — 2026-07-12:** T2b is independently accepted at `98498b9`
plus ledger fix-forward `0955171`. Clean artifact
`multiplayer-transport-2026-07-12T153314140Z-t2b-94c169` proves the exact old
ordinal stayed continuously pressured through timeout and one closing sweep,
then resumed as a distinct socket at epoch 2 while the match authority PID and
healthy epoch-1 peers stayed stable. Eight journal consequences first appeared
on the replacement epoch, FIFO and exactly once, with exact baseline, delivery,
event-ACK, retirement, cleanup-reset, state, and reliable ledgers. Combined
T2a/T2b and all 11 multiplayer-network suites pass. This remains local raw-
WebSocket PR smoke; T2c, Linux packet truth, browser ingress, WAN/WSS, hosted,
soak, and capacity remain open separate gates.

**Eight-player T2 checkpoint — 2026-07-12:** the product-maximum local pressure
extension is independently accepted through `b6a2513`. Clean artifacts
`multiplayer-transport-2026-07-12T162402942Z-t2a-8p-9aee16` and
`multiplayer-transport-2026-07-12T162436593Z-t2b-8p-aa8731` each use one
logical authority for their test match and eight distinct raw clients. T2a
drains the exact impaired ordinal from 263,017 bytes to below low water in 706
ms without policy or rebase; T2b fences only ordinal 8, resumes ordinal 9 at
exactly epoch 2 under the same authority PID, and replays eight consequences
FIFO/exactly once. Seven peers remain pressure-free, epoch-stable, and owner-
private clean. Exact state/reliable/ACK/cap, performance, HTTP, privacy, and
cleanup gates pass, as does a fresh independent rerun. The local raw-WebSocket
4–8 pressure envelope is closed; Linux packet/browser T2c, WAN/WSS, hosted,
soak, and 24/48/96 capacity remain separate open gates.

**Eight-player soak-smoke checkpoint — 2026-07-12:** the deterministic local
machinery lane is independently accepted through `df6ea4b`. Clean artifacts
`multiplayer-soak-2026-07-12T202149588Z-pr-smoke-08A04E01-62e806c96537` and
`multiplayer-soak-2026-07-12T202805064Z-pr-smoke-08A04E01-62e806c96537` share
schedule hash `62e806c96537e432eaafa7aa6af31f49cb4547e9e8e2d2aaeb3e6522745f5d41`.
Each runs eight raw clients against one logical match authority and proves the
short reconnect/leave/replacement schedule, exact consequence and ACK ledgers,
private isolation, diagnostics integrity, bounds, classified HTTP, abort
handling, and complete cleanup. One traffic minute reached about 98.4% of the
2.5 MiB/s aggregate full-JSON regression ceiling, so network payload remains
near-limit product debt. This is six-minute PR smoke, not soak or leak evidence;
the 45-minute normal and 90-minute churn profiles remain unrun.

**First 45-minute normal result — canonical FAIL, 2026-07-12:** artifact
`multiplayer-soak-2026-07-12T210956086Z-normal-45m-08A04E45-e35556818d18`
at clean commit `2b5e497` is preserved with aggregate file-list SHA-256
`dfe023185bc8cf069912ffbdf789c991900ff4a43aa7728c1b842cb2e33bc359`.
It may not be retried or stitched. The natural universe collapsed at sim time
600.0667, so tick 9001/projection 6000 stopped while the 45-minute process and
clients remained alive. This exposes a real mismatch between authored match
lifecycle and an infrastructure-long single-run soak. Minute nine also measured
2,526,338 B/s aggregate full-JSON traffic, 1.05% above the decimal 2.5 MB/s
canonical regression ceiling and far above the 64 KiB/s/player product target.
Other substantive evidence passed: 140 scheduled actions, 14 forced-GC points,
exact dual ACKs, 123,500 privacy-inspected frames with zero violations, 99.81%
diagnostics coverage with zero faults, 7,164 B/min post-GC heap slope, bounded
RSS/GC/CPU/ELU/retention/topology/reliability, wall time, and clean PID/port/
diagnostics teardown. Resolve lifecycle and traffic policy before a from-zero
rerun; do not begin the 90-minute churn profile.

**Post-failure direction:** the steady 45-minute infrastructure profile will
use a strict test-only authored-collapse suppression seam, retaining the finite
7,200-second match lifetime fence and labeling all post-collapse gameplay as
synthetic longevity. The 90-minute churn profile will use nine sequential
natural matches under one stable process/control plane, with one non-overlapping
logical authority per active match. Neither profile may rerun yet: active
minute-nine traffic was 308.4 KiB/s/player, 4.82x the 64 KiB/s product target.
Future evidence replaces aggregate smoke ceilings with per-class bytes/frame,
cadence, and per-player 64/80 KiB gates. Static-manifest extraction and public
baseline/delta replication are the next critical architecture mechanism;
binary, AOI, compression, hosted WSS, and high-count work remain later measured
steps.

**Delta implementation packet — accepted:** `5694407` plus hardening
`c54ac4f` defines the 4–8-player replication staircase. S0 measures direction,
wire class, recipient, encoded bytes/frame, and actual cadence. S1 extracts a
canonical served-byte-hashed static manifest and pauses admission until its
authenticated ACK. S2 begins with canonical full projection plus per-recipient
structural diff against the atomic materialized ACK base every beat; dirty
journals are hints until exhaustive coverage is proven. S3 gates 1/4/8 recovery
and privacy at <=64 KiB/s/player steady and <=80 KiB/s sensitivity, with
authority and client performance gates. Binary, AOI, compression, hosted, and
high-count work remain measured follow-ups. S0 is now the active code slice.

**Synthetic steady-lifecycle seam — accepted:** `82bae10` plus `ca7fd8f`
implements the strict test/diagnostics-only authored-collapse suppression used
only by normal-45m infrastructure evidence. Generic collapse and final-portal
terminal paths have real runtime proofs; default collapse, ordinary terminal
paths, and the finite max-time fence remain intact. Focused lifecycle, sim-
lifecycle, diagnostics, and multiplayer-network suites pass. Post-collapse
time is explicitly synthetic and cannot support product-duration/gameplay
claims. Two subsequent clean PR-smoke attempts failed deterministically on an
inventory-action HTTP 409 at the reconnect barrier while still cleaning every
resource; diagnose that regression before any canonical rerun.

The 409 was an invalid harness precondition: ambient pickups filled cargo, so
hard-coded `unequip` could not move its item. `4ddb81f` now selects a valid
owner-observed consequence without changing gameplay or HTTP strictness. Its
one clean rerun then exposed a second harness-only drain mismatch: a physical
replay attempt is correctly one higher than unique event ACKs after the
deliberate old-epoch hold, even though pending/reliable queues and exact
identity retirement are closed. Preserve that failure and fix the drain oracle
before another smoke or normal run.

`107ea36` closes that drain oracle with exact cross-incarnation conservation.
Its one authorized clean rerun passed drain, topology, replay, ACK, privacy,
HTTP, bounds, and cleanup, then failed only traffic: minute five measured
2,570,550 B/s aggregate full JSON. Preserve the failure and do not rerun smoke
until replication architecture changes the measured debt.

**S0 directional accounting — accepted:** `69b835f` plus independent fix-
forward `5d1e36f` provides bounded, default-off, identity-safe accounting for
direction, wire class, projection kind, stable recipient, encoded accepted
bytes, frame percentiles, cadence, terminal outcomes, retransmits, and ACK
retirement. Reconnect pending ordinals canonicalize to stable recipients;
retention and overflow fail closed; callbacks are fenced by run, connection,
and outbound epoch. Focused accounting is 17/17, adapter core 28/28, and all 15
multiplayer-network suites pass. The first two capture attempts remain non-
credit failures from the pre-fix ledger. Fresh 1/4/8 full-JSON capture is the
active evidence lane; it cannot claim delta or 64 KiB acceptance.

The first post-fix capture artifact,
`multiplayer-replication-s0-2026-07-13T011131689Z-5d1e36f`, is rejected for
complete S0 shape evidence but retains a valid measured subset. Exact 300-second
downlink was 273,998/260,997/246,312 B/s/player at 1/4/8 (4.18x/3.98x/3.76x
target); uplink was 1,722/1,765/1,822 B/s/player; public state was 92.5–92.6%
of downlink; complete-pair cadence was 9.717–9.727 Hz; projection p95 context
was 4.67/7.65/12.24 ms; and reliable acceptance/retirement, privacy, bounds,
hashes, PID/port, and cleanup all closed. Entity/component/despawn counts are
invalid because the frame-shape helper read nonexistent `state.bodies` rather
than v1 `state.players` and `state.world.*`. Fix that schema with nonzero golden
fixtures, then run exactly one new clean capture. Do not present the partial
artifact as complete S0 or delta acceptance.

**S0 1/4/8 baseline — accepted:** `22c5a6b` and artifact
`multiplayer-replication-s0-2026-07-13T014733765Z-22c5a6b` (aggregate SHA-256
`ddcefae8841bf5e8da946f7555d38eba4ba2c821ede84859d249bbae677e85c0`)
close exact 300-second full-JSON directional and shape evidence. Downlink per
player is 274,607/255,652/241,892 B/s at 1/4/8, or 4.19x/3.90x/3.69x the 64
KiB target; uplink is 1.68–1.78 KiB/s. Pair p50/p95 falls from
28,501/30,578 bytes at one player to 25,237/26,889 at eight. Eight-player
public entity p50/p95 is 62/65 and component p50/p95 704/735; owner remains one
entity/18 components. Tick p95 is 5.20 ms and projection p95 12.39 ms at eight;
reliable acceptance/retirement is 3,481/3,481. Hash, cadence, conservation,
privacy, bounds, and cleanup pass. This accepts only the local-loopback v1
baseline. S1 static manifest admission is next; no delta, product-budget, WAN,
hosted, or capacity claim is closed.

**S1 static manifest — accepted:** implementation `264e496` plus hardening
`9a80149`, `2162863`, and `41b9834` closes content-addressed admission. V2
capabilities are registry-bound to negotiated version, manifest hash, current
membership, and connection epoch. The socket remains `MANIFEST_REQUIRED` and
emits no rebase, baseline, event, or private projection until authenticated
same-origin fetch and proof finish within one coherent bounded deadline. Proofs
and client/server caches expire and cap; canonical JSON rejects sparse arrays;
heartbeat, late completion, reset, reconnect, mixed v1/v2, and explicit v1
rollback are tested. Cold successful manifest bytes are counted separately in
S0. All 17 multiplayer-network suites pass. The fresh sample used a 2,471-byte
manifest and reduced public frames from 14,939 to 13,986 bytes (953 bytes,
~6.4%, tick-dependent). This is S1 only; S2 structural JSON deltas are now the
active slice, and no product-budget/hosted/high-count claim closes here.

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
- gameplay downlink <=64 KiB/s/client average; short-window percentiles are
  reported separately;
- encode/decode/rebase and toroidal lifecycle stay deterministic;
- every optimization reports before/after CPU, bytes, and complexity.

**S7 post-S6 product gate — rejected, next slice selected:** clean canonical
artifact `docs/v0.4/evidence/state-pair-s7/canonical` binds composite SHA-256
`e4f16209f70791c8b15dc6b913b99c6fc170c2a4f4491c9da654ab814ef4d068`.
Prepared projections remain enabled. Actual 1/4/8 means are 141,755 / 132,648 /
80,499 B/s at 9.79 / 7.24 / 4.22 Hz; target-cadence means are 144,785 /
183,030 / 189,924 B/s. The exact mean-pair envelope after non-state traffic is
about 6.50 KB at 10 Hz, requiring 54.9% / 64.4% / 65.7% reduction from observed
pair means. Four and eight recipients leave `NORMAL`; eight also misses the
clock budget. Canonical one-player correctness fails one unclassified ACK
reject; preserve exact-zero admission and add bounded publisher/adapter reject-
reason ordering diagnostics before assigning root cause.

The next bounded implementation packet is schema cleanup plus explicit field
cadence for the dominant high-frequency `runtimePublic` payload. It must prove
authority/client equivalence, stale-field and recovery semantics, then rerun S7
unchanged. Compact binary encoding remains second because the measured lexical
bytes are a ceiling rather than a savings forecast. AOI is not first because
dominant Shallows categories recur on nearly every sampled pair and no
distance/visibility workload proves safe exclusion. Do not lower the 10 Hz
contract, enable compression, or begin hosted/fleet work to bypass this gate.
Independent 1/8 review upholds the decision, and all 25 multiplayer-network
suites pass.

**S11 converged positional admission gate — rejected:** canonical artifact
`docs/v0.4/evidence/state-pair-s11/canonical` binds clean `4eee268` and
composite SHA-256
`983eae7457b61e77c7477669c7f9e1116172261dc286cf08b840b183cd48a4ca`.
It runs the prepared sparse positional codec plus bounded 8 MiB/client ledger,
with the S5 profiler off, for normal 1/4/8 (60 s warmup + 300 s measurement)
and churn 1/8 (20 + 90 s). External method/checksum validation exits 0 and
product admission exits 2. S7/S8/S9/S10 comparison inputs are checksum-bound.

Normal one passes at 9.787 Hz receiver cadence, 61,344 B/s mean, 65,135 B/s
one-second p95, and 62,669/66,541 B/s normalized 10 Hz mean/p95 while remaining
`NORMAL`. Normal four preserves exact hashes, privacy, ACK bases, zero recovery
and base misses, bounded ledger, and cleanup, but runs only 6.577 Hz, becomes
`DEGRADED`, and normalizes to 72,211 B/s mean. Normal eight is not saved by its
62,990 B/s fixed-window mean: one client receives 0 Hz, one-second p95 is
118,541 B/s, normalized mean/p95 is 228,443/279,634 B/s, projection/publish
p95 is 103.33 ms, overload is `DILATED`, and terminal-gap/closed-world ACK
correctness fails. Churn one passes; churn eight is `DILATED` and fails fault
convergence plus replacement lifecycle observation. Every ledger high-water
remains below 8 MiB and every teardown drains to zero.

The decision stays population-separated. One-client traffic needs no further
pair reduction. At four clients the measured worst pair is 7,171 B versus an
exact 6,504 B budget, a 667 B/pair or 6,675 B/s remaining gap, while cadence
and overload are separate failures. At eight, the worst sampled pair is
22,844 B and the lane is primarily a CPU/cadence/correctness failure, not a
license to count collapse as bandwidth savings. Rank the next bounded slices:
(1) additional positional schema cleanup, (2) binary codec, (3) compression,
(4) an explicit field-age/cadence policy only as a product decision. AOI stays
deferred until distance/visibility evidence justifies its lifecycle risk.
An independent clean 1/8 normal+churn review at frozen `d03b1e7` produced
composite SHA-256
`ad9b31ee42b5791985cfa85d7620e2a3fd7f6a220405120de8c1d13f4c9bc0ee`;
external validation exits 0 and admission exits 2 with no P1/P2 discrepancy.
The full 28-suite `multiplayer-network` lane also passes once with retries
disabled.

**S12 codec-aware candidate gate — rejected:** clean pre-gate artifact
`docs/v0.4/evidence/state-pair-s12/pre-gate` binds `223631e` and composite
SHA-256 `00c6377fcf68b76dfac429054a35a0a9c55c7d93d8e043df7166a4eab5429845`.
The publisher evaluates all four safe public/owner keyframe/delta combinations
by exact positional wire size and reuses the chosen encoded frame. Every
representative accepted pair still chooses `public-delta+owner-keyframe`, so
the additional serializations recover no bytes and add authority work. Exact
correctness and convergence pass; four and eight players
still fail clock, cadence, and overload admission.

**S13 receiver-process attribution — authority boundary remains limiting:**
`docs/v0.4/evidence/state-pair-s13/` contains two fixed-seed, 20-second,
order-counterbalanced machine-local review pairs. Both topologies keep one
separate authority process for one match. The control runs all receivers in
the coordinator process; the treatment gives each receiver its own process.
At 1/4/8 players the control authority minima are 9.75–9.80 / 4.90–5.05 /
2.90–2.95 Hz, while receiver-isolated authority minima are 9.80 / 5.00–5.05 /
2.90–2.95 Hz. Paired isolation deltas are +0.10/0.00 Hz at four and
+0.05/-0.05 Hz at eight. Four and eight remain `DILATED`; projection/publish
p95 is 116.64–144.70 ms and 258.78–268.99 ms respectively, already beyond the
100 ms configured-10-Hz budget. Receiver/coordinator event-loop co-location is
therefore not the primary cause of this experiment's authority-accepted
cadence collapse.

All four artifacts bind clean `3f95da8`, seed `1403105358`, exact 200-input /
one-action schedules, complete one-second buckets with zero partial tail, and
zero cumulative high-water or queue-policy transitions. Composite SHA-256s
are `2e98ad29f8258b0ef92142192b564c3347196b34ba0be3b5b1c1d30a8e1f243a`
(A control), `6aad9eb2cedcd37c4d42dbba980241c7bbbc80bbccef0c9888ba7a74abe85dee`
(A isolated), `395df97d78fb9cbd8a6e07b13b56ba438b4d0be92d3a82514fe6a4be39870fd1`
(B isolated), and `0d48ba4a14171584f4311ac531bdbd1fd5acfb0d8c6f9f3ceba6584a7615def8`
(B control). Validator hardening at `c6a59d6` adds exact S12 run/file/scenario
contracts plus stored cadence/admission semantic recomputation. Independent
review finds no remaining P1/P2 after the topology wording correction.

Observed isolated authority CPU is 29.72–29.79%, 61.72–61.97%, and
80.05–80.45% of one core at the observed 1/4/8 cadence, measured over each
recorded 20.755–20.979 second health-sample envelope. It is not a configured-
10-Hz or fleet-packing cost. The next bounded lane is an exact composed-size
selector that preserves the S12 winner but serializes it once. S13 does not
admit hosted, concurrent-match, fleet, WAN, or 24/48/96 forecasts.

**S14 exact composed-size selector — useful, still product-rejected:** S14
preserves the same four safe semantic candidates and S12 tie order, exact
candidate byte sizes, selected wire, digest, ACK/recovery behavior, and limits.
It serializes one shared positional header plus four unique lane components and
composes only the selected full wire. Across 320 adversarial UTF-8/escaping/
boundary vectors and 1,000 representative selector iterations, all 1,320
comparisons match the brute-force oracle. The selector microbenchmark cuts
complete compositions 4:1, allocation proxy 27.10%, and mean time 50.24%.

The one-authority-per-match process candidate binds `bce7e5d` and composite
`c5259ec1cbeb3de2d0683031af7c2e7ae2f54c26d34f647906d880158d38ecdd`.
Against S13 round-B isolated, 1/4/8 minimum receiver cadence changes from
9.80/5.00/2.90 to 9.85/5.25/3.05 Hz and authority CPU from 29.72/61.72/80.45%
to 27.50/60.03/78.35% of one core. Projection median improves at every
population, but p95 remains 111.00 ms at four and reaches 241.71 ms at eight;
both remain `DILATED`. Normalized 10 Hz worst mean/p95 is 57,369/59,213,
68,456/76,175, and 78,218/95,138 B/s. Only one player passes. All correctness,
convergence, exact schedules, cleanup, queue, and backpressure checks pass;
cadence collapse receives no traffic credit.

S14's next bounded lane is to reuse exact canonical lane byte counts already
computed by delta/keyframe construction while enforcing the unchanged expanded-
pair limit. Do not begin hosted costs or 24/48/96 extrapolation. The full
30-suite `multiplayer-network` lane passes once with retries disabled.

**S15 canonical lane reuse — implemented, product admission still rejected:**
the canonical lane text and exact UTF-8 count produced during delta/keyframe
comparison now carry into the same synchronous expanded-pair size check under a
private proof symbol and exact payload identity. No proof survives the
selection or crosses a recipient/tick. The order-counterbalanced selector
benchmark preserves 1,320 representative/adversarial comparisons with
identical wire and selection transcripts; the 320 direct S15 adversarial rows
also bind expanded/positional sizes, boundaries, semantic decode, and invalid
canonical rejection. Exact commit/tree/source hashes and declared execution
order bind every selector row. Expanded lane serializations fall
from 4,400 to zero across 1,100 selections, allocation proxy falls from
38,916,699 to 13,836,499 bytes, mean publish improves 9.15%, and selector p50
improves 15.99%.

Against S14's isolated-process baseline, 1/4/8 receiver cadence moves from
9.85/5.25/3.05 to 9.85/5.35/3.25 Hz. Projection/publish p95 moves from
26.17/111.00/241.71 to 26.26/103.43/224.80 ms; authority CPU moves from
27.50/60.03/78.35% to 27.18/59.24/78.19% of one core. One player passes.
Four and eight remain `DILATED`, fail cadence/clock, and normalize to
67,019/74,700 and 77,482/97,032 B/s mean/p95. Correctness, exact schedules,
queues, pressure, and cleanup pass; cadence collapse receives no traffic
credit.

S15 closes the bounded positional cleanup sequence. The next single lane is a
binary state-pair codec prototype against the exact positional JSON oracle,
retaining JSON fallback and every authority/ACK/recovery/privacy/admission
contract. Compression, deliberate cadence policy, hosted costs, and 24/48/96
remain closed.

**S16 lossless binary codec — prototype complete, release default rejected:**
`state-pair-binary-v1` transports the exact S15 positional semantics in a
versioned WebSocket binary message with strict manifest/tag/length/type/bounds
validation. It uses no base64, retains immutable exact bytes through send queue
and retransmit, carries binary ACK/recovery, and requires positional JSON as the
negotiated fallback and semantic oracle. The selected S15 keyframe/delta kind,
authority, privacy, recovery, limits, cadence, and admission rules do not
change. Focused proof covers 24 exact transactions, 519 deterministic value
cases, 28 crafted malformed frames, and 1,000 deterministic mutations.

Against sealed S15, S16 reduces actual worst-recipient mean traffic by
30.6/31.4/34.7% at 1/4/8 and brings normalized 10 Hz mean/p95 below the 64/80
KiB/s gates at every population. It is not an admission win. Receiver cadence
moves from 9.85/5.35/3.25 to 9.85/5.20/3.10 Hz, projection/publish p95 from
26.26/103.43/224.80 to 27.26/123.54/241.39 ms, and authority CPU from
27.18/59.24/78.19% to 28.41/60.47/79.27% of one core. Four and eight remain
`DILATED`; only one passes. A 2,400-operation-per-side codec microbenchmark is
also 3.5% larger and 3.3x slower to encode on its representative synthetic
fixture.

Keep positional JSON as the release default and retain binary only as an
opt-in prototype. The next single lane is authority-side profiling and removal
of repeated candidate construction/materialization while preserving S15
selection and positional wire truth. Evidence and the full decision are in
`docs/v0.4/evidence/state-pair-s16/` and
`docs/v0.4/MULTIPLAYER-STATE-PAIR-S16-BINARY-CODEC.md`. Hosted, compression,
cadence-policy, heavy-sim, and 24/48/96 work remain closed.

**S17 lazy candidate materialization — implemented, four/eight still
rejected:** the positional publisher now constructs one canonical header and
four unique lane payloads, records four exact-size descriptors in the unchanged
S15 tie order, and materializes only the chosen outer frame. Header/lane
semantics are validated once per trusted same-operation selection, while all
four cross-lane relations remain checked. S15 selected bytes, four-size
transcript, limits, digest, ACK/recovery, privacy, accounting, fallback, and
ledger behavior are unchanged. S16 binary remains opt-in.

The direct adversarial oracle proves all four lazy expanded and positional
sizes across 320 UTF-8/escaping comparisons and 320 accepted/rejected exact-
boundary checks, including losing candidates. The order-counterbalanced
benchmark proves 1,200 exact wire, 1,200 exact
selection-transcript, and 1,200 semantic comparisons with zero mismatch. Mean
publish improves 27.05--28.07%, selector p95 improves 43.37--45.91%, prepared
hash work falls 50%, and the labeled outer reference-slot allocation proxy
falls 75%. This is a reference-slot proxy, not measured V8 heap allocation.

Against sealed S15, profiler-off 1/4/8 receiver cadence moves from
9.85/5.35/3.25 to 9.80/5.60/3.80 Hz. Projection/publish p50 moves from
23.74/100.56/220.53 to 18.43/89.85/171.32 ms; p95 moves from
26.26/103.43/224.80 to 21.14/124.80/199.18 ms; authority CPU moves from
27.18/59.24/78.19% to 22.32/57.13/72.87% of one core. Only one passes. Four
and eight remain `DILATED`, below 9 Hz, and fail clock/admission; normalized
10-Hz worst mean/p95 is 66,802/73,114 and 77,233/83,346 B/s. Low actual traffic
at collapsed cadence receives no credit.

The incomplete eight-player stage-profile attempt is retained but rejected as
product evidence. Its completed 1/4 rows only focus the next bounded lane:
remove remaining repeated trusted lane semantic validation and pair-choice
size-proof work while preserving S15 bytes and S17 one-frame materialization.
One dedicated logical authority process remains scoped to one match/group and
multiplies horizontally across concurrent matches. Hosted, compression,
cadence-policy, heavy-sim, and 24/48/96 work remain closed. Independent
red-team closes its non-hermetic benchmark-registration and expanded-limit
proof findings with no remaining P1/P2; the registered 35-suite
`multiplayer-network` lane passes once with retries disabled.

**S18 trusted same-operation authority proof — implemented, four/eight product
admission still rejected:** authority-constructed canonical keyframe/delta
lanes now carry module-private origin facts into one opaque, one-shot proof.
The proof binds exact frozen object references, header/recipient/epoch/manifest
and snapshot/base lineage, canonical text/bytes, four positional sizes, and tie
order. Its issuer, consumer, token, ticket, and registry never leave the
publisher instance closure; its private
record is deleted before positional selection. General/untrusted APIs and S16
binary retain full fail-closed validation.

The 2 x 800 counterbalanced benchmark preserves exact wire, selection, and
decoded semantics with zero mismatch while improving mean publish 39.8--45.0%
and selector p95 87.6--91.3%. Profiler-off one-authority-per-match evidence
moves 1/4/8 receiver cadence from S17's 9.80/5.60/3.80 Hz to
9.70/9.85/5.00 Hz. Projection/publish p95 moves from
21.14/124.80/199.18 ms to 15.13/53.96/117.97 ms. Four recovers `NORMAL` clock
behavior but remains above the normalized 64 KiB/s mean gate at 75,770 B/s;
eight remains `DILATED`, clock-failing, and normalizes to 79,004 B/s mean. Only
one player is product-admitted. Correctness, convergence, exact schedules,
queues, bounded ledgers, and cleanup pass at every population.

Final verification ran the registered 37-suite `multiplayer-network` lane once
with retries disabled. Thirty-six passed, including both S18 suites. The sole
failure was historical S17 evidence checking sealed hashes against live S18
source; it now hashes the sealed `e57bf53` tree and passes focused validation.
The full lane was intentionally not rerun.

Keep S18. The next bounded lane shares immutable public projection/core/delta
work once per match tick across recipients, retaining recipient-specific owner
overlays, connection lineage, ACK/recovery, and one canonical writer. Do not
begin compression, cadence policy, hosted economics, heavy-sim work, or
24/48/96.

**S19 shared-public cohorts — tested, rejected, and reverted:** a private
authority/tick-scoped experiment shared public source/core transitions and
exact public keyframe/delta decisions only when target hashes and acknowledged
base hashes matched. A 22-comparison focused oracle and a counterbalanced
synthetic eight-recipient benchmark preserved exact positional bytes and
semantics. The synchronized synthetic ceiling reduced mean publish time from
16.94/16.83 ms to 10.74/10.90 ms.

That cohort does not exist in normal product admission. Publisher keys retain
recipient-specific connection epochs and state-pair IDs; deltas also retain the
exact ACKed-base hash, while runtime transition cohorts retain recipient
revision-tracker snapshot identity. Staggered joins, scheduling, and ACK
progression therefore produced zero public keyframe and zero public delta reuse
in profiler-off isolated-process 1/4/8 runs. The single fixed-order run observed
higher CPU/tail values and 4.95 to 4.80 Hz at eight, but is not used to estimate
a causal regression magnitude. Four still normalizes to 72,425 B/s mean; eight
normalizes to 81,187 B/s and remains clock-failing.
The implementation commit `5074e42` is reverted by `5f4d3c3`; S18 remains the
release default. Evidence is sealed under `docs/v0.4/evidence/state-pair-s19/`.

S6's accepted prepared public projection/core work remains intact; S19 was a
distinct cross-recipient runtime-transition and publisher-cohort layer. The
registered 38-suite `multiplayer-network` lane passes once after the revert
with retries disabled.

The next bounded lane is a compression pilot against S18 positional JSON. It
must clear four-player normalized bandwidth without regressing eight-player
authority CPU/p95, preserve exact semantics and fallback, and leave cadence
policy unchanged. Hosted economics, heavy-sim work, and 24/48/96 remain closed
until this low-count admission sequence is decision-ready.

**S20 negotiated state-pair compression — accepted for 1–4, rejected for 8:**
Brotli quality 1 wraps the exact S18 positional wire in a 64-byte, manifest-
bound, independently compressed envelope. Capability/ticket/welcome/client
mode are pinned per session; S18 positional JSON remains the fresh-session
fallback, and binary/compressed framing cannot mix. Exact compressed bytes are
retained once for retransmission under a 12-frame/2 MiB per-connection bound,
then retired by accepted ACK, cleanup, or rotation.

The representative codec corpus preserves 8,712 exact comparisons plus 121
envelope semantic/ACK comparisons with zero mismatch. Two counterbalanced
isolated-process product rounds admit four: 9.80/9.80 and 9.80/9.85 Hz, NORMAL,
normalized mean 31,018/30,203 B/s and p95 32,766/32,361 B/s. Paired authority
CPU ratios are 1.001/1.027. Eight remains DILATED at 5.00/4.90 Hz; its median
cadence, projection-p95, and CPU ratios are 0.995/1.041/1.011, so compression
does not materially worsen the clock but does not admit it. Evidence is sealed
under `docs/v0.4/evidence/state-pair-s20/`; design and limits are in
`docs/v0.4/MULTIPLAYER-STATE-PAIR-S20-COMPRESSION.md`.

Each concurrent match still multiplies one dedicated logical authority. The
next bounded lane was authority projection/publish clock profiling and
isolation for the existing eight-player failure.

**S21 eight-player authority clock profile — attribution complete; runtime
pilot selected:** A profiler-on/off/on diagnostic sequence reproduces the
instrumented result and proves the profiler's material overhead. The sealed
S20 rounds remain product truth: eight is still rejected at 5.00/4.90 Hz.
Attribution locates the critical path in serial per-recipient public work:
public core/projection/delta construction accounts for 77.15 visible ms per
accepted eight-recipient beat, while sim-tick p95 is 1.47 ms. Compression,
queue enqueue, socket send calls, and ACK ingestion total under 2 ms/beat.
Async send callbacks overlap and are excluded from authority CPU; nested stage
rows are not summed.

A public-only hermetic worker harness exactly reproduces 234 production-
publisher jobs across 1/4/8 with zero mismatch. Three Latin-square topology
orders reduce synthetic eight-recipient batch p95 from 66.24–68.57 ms inline
to 37.30–37.45 ms with two workers and 27.73–29.33 ms with four. Owner data,
mixed-pair selection, compression, ACK/ledger state, ordering, queue ownership,
and send commit remain inside the one dedicated logical authority per match.
Live issued-request tests reject stale, cross-match, duplicate, and out-of-
order results and cover mutation isolation, backpressure, timeout, crash,
graceful drain, and forced shutdown.

S21 changes no default product behavior and does not admit eight. The next
bounded lane is a feature-flagged runtime **public-only** projection-worker
pilot with exact authority fencing and an inline fallback. It must produce
counterbalanced profiler-off 1/4/8 product evidence before any admission.
Hosted economics, heavier-sim work, cadence changes, and 24/48/96 remain closed.
Evidence is under `docs/v0.4/evidence/state-pair-s21/`; design and limits are in
`docs/v0.4/MULTIPLAYER-STATE-PAIR-S21-AUTHORITY-CLOCK.md`.

**S22 runtime public-projection workers — implemented, rejected, and reverted:** The live
feature-flagged pool preserves one dedicated logical authority per match and
keeps owner data, semantic validation, ACK/ledgers, epochs, ordering,
compression, queues, send, and commit on that authority. Registered parity and
lifecycle suites cover exact 1/4/8 output, public-only input, mutation
isolation, ACK/base fencing, timeout, backpressure, disconnect, crash, and
shutdown. Red-team then found that disabled mode still changed adapter send
scheduling, worker responses were not bound to their assigned pool row, and a
crashed row was not replaced. Production integration was reverted; the exact
implementation remains in commits and the standalone S21 harness remains.

The profiler-off product screen rejects both topologies. At eight, inline is
5.00 Hz / 120.60 ms projection p95 / 0.645 authority core; two workers are
3.67 Hz / 200.84 ms / 1.240 with 102/232 timeout fallbacks; four workers are
3.67 Hz / 195.49 ms / 1.270 with 109/239 fallbacks. A normal-window two-worker
repeat confirms 3.65 Hz, 206.83 ms, 1.234 cores, and 408/851 fallbacks. The
synthetic S21 gain is consumed by clone/transfer, worker contention, scheduling,
and mandatory authority validation in the real path.

Eight remains closed. The next bounded lane is a shared immutable public body
plus recipient-local lineage envelope that eliminates repeated authority
traversal without sharing mutable authority or owner state. Hosted economics,
heavier-sim work, cadence changes, and 24/48/96 remain closed. Evidence is in
`docs/v0.4/evidence/state-pair-s22/`; the decision is in
`docs/v0.4/MULTIPLAYER-STATE-PAIR-S22-RUNTIME-PUBLIC-WORKERS.md`.

**S23 shared public body — implemented, corrected, and not admitted:** The
default-off `state-pair-public-body-v1` representation constructs and hashes
one immutable public body per authoritative source beat, reuses exact
base-to-target cohort deltas, and keeps every recipient envelope, owner lane,
ACK/base ledger, retransmit, recovery, queue, and send commit on the one
dedicated logical authority for that match. Ticket/welcome/manifest negotiation
also pins a distinct `state-pair-public-body-brotli-v1` envelope; fresh
connections without both capabilities remain on unchanged S20.

Red-team blockers were closed before measurement: fail-closed body shape,
explicit match-public handle semantics, same frozen source plus independent
content hashing, a combined 8 MiB body/encoded-body/cohort cap, aligned codec
and compression limits, and explicit S20 semantic/owner/privacy/ACK migration
proof. Focused proof is green, including 49 public-body assertions and runtime
13/13.

Two profiler-off rounds reverse treatment and population order. Four reaches
9.80/9.85 Hz in NORMAL but misses the 50 ms projection p95 gate in round A at
50.88 ms. Eight recovers 9.00/9.10 Hz in NORMAL, with real cohort reuse, but
misses both tail gates at 88.58/88.33 ms p95 and 95.05/94.63 ms p99. One stays
inside absolute gates but materially regresses S20 CPU, projection tails, and
traffic. S23 therefore remains default-off research scaffolding; S20 remains
the one-through-four product path and eight remains closed. Evidence is under
`docs/v0.4/evidence/state-pair-s23/`; the design and decision are in
`docs/v0.4/MULTIPLAYER-STATE-PAIR-S23-PUBLIC-BODY.md`.

**S23T tail attribution — complete; one bounded next lane selected:** A
test/evidence-only 512-beat profiler measures non-nested exclusive authority
stages plus separate async callback/ACK wall time, sim tick, GC, ELU/CPU, and
memory high-water. Clean A1/B/A2 captures and an S20 one-player comparator use
isolated processes, 5 s warmup, and exact 20 s windows. The profiler-off
control remains NORMAL at 9.35/9.85 Hz for eight/one and stays within 10% of
sealed S23 p50/p95. Profiler overhead, minimum beat count, 99% reconciliation,
<10% unattributed tail, and repeatability gates pass.

Public source/body preparation is the only family above the 70% selection
threshold in all four counterfactual checks. Removing it per beat recovers
39.31/42.45 ms at eight and 16.23/15.54 ms at one, while the nearest competitor
fails both eight-player checks. GC p95 remains <=0.52 ms and is not the primary
cause. Select only S23P prepared public-source proof:
one immutable normalized/canonical public proof before the recipient loop,
with owner validation and every recipient authority boundary left local.
S23 remains default-off; eight remains closed; `S24` stays reserved for the
future 24-player scale track. Evidence is under
`docs/v0.4/evidence/state-pair-s23t/` and the method/decision is in
`docs/v0.4/MULTIPLAYER-STATE-PAIR-S23T-TAIL-ATTRIBUTION.md`.

**S23P prepared public-source proof — complete and not admitted:** The
default-off `state-pair-public-body-prepared-v1` capability validates,
canonicalizes, and hashes one exact recursively frozen public source per issued
authority beat, then binds an opaque single-use proof to the exact ticketed
recipients and scheduler ordinals. The first valid consumer builds one public
core/body; later recipients reuse it. Owner validation, lineage, ACK/base,
retransmit, recovery, compression, queue, send, and commit remain local to the
one dedicated logical authority for that match.

Red-team closed accessor execution, equal-clone/duplicate issuance, lookalike
bindings, stale cohorts, mixed S23/S23P duplicate work, unused proof history,
and validation-before-commit ordering. Focused runtime proof is 17/17 and the
final review has no P1/P2/P3.

Two profiler-off rounds reverse three treatments and population order. One and
four pass absolute tails at 28.50/28.20 ms and 45.11/45.48 ms p95. Eight
improves S23 p95 by a median 18.1% and CPU by 10.3%, reaching 9.75/9.70 Hz in
NORMAL, but still records 71.05/69.76 ms p95 and 75.04/72.69 ms p99. It fails
both 50/70 ms gates. One materially regresses S20 tails, CPU, and traffic;
four improves CPU/tails but retains about 52% more traffic. The sealed 10% S20
non-regression envelope fails.

Do not promote S23P. S20 remains the one-through-four product path, eight
remains closed, and S23/S23P remain default-off research scaffolding. No next
implementation lane is selected; `S24` remains reserved for future 24-player
scale work. Evidence is under `docs/v0.4/evidence/state-pair-s23p/`; design and
decision are in
`docs/v0.4/MULTIPLAYER-STATE-PAIR-S23P-PREPARED-PUBLIC-SOURCE.md`.

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
- expected downlink <=64 KiB/s/client average;
- late join <=2 seconds p95 and reconnect <=3 seconds after socket open;
- low-egress hosted-service target <=$0.015/player-hour, or the illustrative
  unit economics are revised from measured stack costs;
- host-count forecasts derive from concurrent matches and measured worker
  density, not copies sold or a one-VM-per-run assumption.

## Scale Track — 24/48/96 Players In One Match

Goal: test future single-match scale without bloating the 4–8-player critical
path or weakening one canonical writer.

This is conditional research, not v0.4 scope expansion: the released product
remains a 4–8-player experiment. Twenty-four is plausible, 48 engineered, and
96 R&D until the measured gates below pass. Every active match still owns one
logical authority; a fleet runs and packs as many independent authorities as
there are concurrent matches.

### S24 — isolated conventional authority

- Benchmark `H24`: 24 humans, 400 dynamic bodies, 48 expensive AI.
- Remove accidental all-player scans and move eligible candidates through
  Ballpark.
- Require deltas/static manifest and AOI-ready replication lanes.
- Keep one process and one writer thread.

Gate: normal mode, <=64 KiB/s/client average, and chosen writer p95/p99 inside
product budget without TiDi. Record mean billable CPU separately for packing.

### S48 — dedicated service and replication workers

- Benchmark `H48`: 48 humans, 900 bodies, 96 expensive AI.
- Require AOI, dirty state, priorities, far lanes, and explicit CPU quota.
- Offload projection/encoding first; field/broad-phase/AI jobs only after traces
  justify deterministic worker contracts.

Gate: normal mode without TiDi, <=64 KiB/s/client average, no serial writer
regression, and no worker result applied after its tick barrier. Reserve one
writer lane until noisy-neighbor p99 proves safe packing.

### S96 — one logical authority, internal parallelism

- Benchmark `H96` and `X96`: 96 humans, 1,800/3,000 bodies, 192/384 expensive
  AI, tiled/disturbance-heavy fields.
- Use one canonical writer plus a fixed worker pool inside one isolated match
  service. Dedicate 4 vCPU first, then measure 6/8/12 vCPU while treating
  writer p95/p99 as a separate feasibility gate.
- Require near/mid/far replication lanes, binary quantization, shared public
  fragments, owner overlays, worker fencing, and deterministic reductions.

Gate: serial writer <=8 ms p95, chosen clock <=20 ms p95/28 ms p99,
<=64 KiB/s/client average (about 6 MiB/s/match average), measured mean
billable CPU/RAM/egress/PPS within its placement vector, and no normal-load
TiDi. If it misses after algorithmic cleanup/internal parallelism, reduce
clock/content or cap the mode; do not hide failure behind permanent dilation.

Every scale fixture reports players, bodies updated, broad-phase candidates,
narrow-phase contacts, events, AI due, field tiles due, world jobs due, GC,
writer p50/p95/p99, mean lane CPU, queue/transport memory, bytes, PPS, and
packing isolation. Do not invent replacement milliseconds before factorial
fixtures fit the factorized model. The legacy 83.07 ms Heavy96 player-only
curve remains a superseded sensitivity, not a current forecast.

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
