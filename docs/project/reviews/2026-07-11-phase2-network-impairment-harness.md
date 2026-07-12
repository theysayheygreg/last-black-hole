# Phase 2 Network Impairment Harness Review

> Design review for `codex/v0.4-multiplayer-architecture`, 2026-07-11.
> This proposes test work only. It does not raise the eight-player product cap,
> change the one-authority-per-match topology, or claim WAN/TLS readiness.

## Decision

Build two deliberately different impairment layers:

1. A **seeded application-frame scheduler** at the existing client and
   same-process WebSocket adapter seams. It deterministically delays, omits,
   duplicates, and schedules complete LBH envelopes; pauses delivery; and
   closes selected connections. It proves sequence, ACK, replay, privacy,
   rebase, epoch-fencing, and cleanup contracts. It must call omitted frames
   `frame omission`, not packet loss.
2. A **real TCP path lane** using one directional TCP proxy per browser, with a
   Linux `netem` job for packet behavior. It proves socket buffering, TCP
   retransmission/head-of-line delay, bandwidth limits, slow readers, resets,
   and simultaneous reconnect against the actual WebSocket implementation.
   This is still local transport evidence, not WAN/TLS evidence.

The distinction is mandatory. TCP provides a reliable, in-order byte stream
and corrects segment loss with retransmission
([RFC 9293 section 2.2](https://www.rfc-editor.org/rfc/rfc9293.html#section-2.2));
WebSocket fragments for one message are delivered in order
([RFC 6455 section 5.4](https://www.rfc-editor.org/rfc/rfc6455.html#section-5.4)).
Dropping or reordering complete JSON envelopes after WebSocket has decoded them
is excellent protocol falsification, but it is not a faithful model of packet
loss on WSS/TCP. Packet loss there normally appears to the game as delayed
ordered bytes, rising RTT, head-of-line blocking, or eventual connection
failure.

Keep HTTP as the diagnostic oracle. All impaired gameplay remains on the
stream path. Never loosen queue, replay, membership, credential, or privacy
limits to make a case pass.

## Two-layer architecture

### Layer A: seeded frame scheduler

Add a test-only scheduler with no production default and no wall-clock calls in
its decision logic. A scenario supplies a 64-bit root seed; derive independent
streams from `root / cohort / player / direction / frame-class` so adding one
client or one logging call cannot perturb every other fault decision. Use an
explicit portable PRNG and record every decision.

The scheduler operates on complete serialized application messages, with a
parsed metadata sidecar for classification, at two seams:

- client to authority, after encode and immediately before a test socket
  submits an LBH message;
- authority to client, after encode and immediately before the adapter's
  socket send. The peer-side delivery hook runs before JSON parse.

Every scheduled item carries direction, player/membership and connection
epoch, frame type, semantic sequence/identity, original ordinal, enqueue time,
chosen release time, byte length, and decision. It may:

- add fixed or bounded-distribution delay independently by direction and frame
  class;
- omit a whole frame, duplicate it without changing any field, or release a
  later application frame first within a bounded window;
- hold all frames during a blackout and then either release them or discard
  them exactly as the scenario declares;
- close one or all physical sockets at a declared timestamp;
- stop consuming one client's outbound frames to create a controlled
  application-level slow consumer in focused adapter tests.

It must not split bytes, invent ACKs, alter IDs, edit payloads, acknowledge a
frame at enqueue time, or advance a semantic cursor because a frame was
scheduled. Server delivery retention ends only on the real validated delivery
ACK; client event playback advances only through the existing consume/event
ACK path. An omitted action ACK therefore causes retry of the same action
identity and must return the cached semantic result. A duplicate event must be
deduplicated by its real run/event/delivery identity. A reordered state pair
must still satisfy exact public/owner lineage before merge.

Use a virtual monotonic clock for scheduler unit and adapter tests. Browser
journeys use a real monotonic clock but consume a precomputed decision tape.
This makes the browser run reproducible without pretending Chrome timers are
deterministic.

Layer A is the right home for exact protocol cases: stale input, delayed action
ACK, duplicate consequence, public/owner half-pair, event gap, old-epoch frame,
run reset during recovery, and deterministic socket-close schedules. It is not
the right home for byte fragmentation, TCP receive-window pressure, kernel
retransmission, congestion control, or TLS.

### Layer B: real browser/socket transport lane

Start with a zero-dependency Chrome smoke using the existing CDP sessions:
apply fixed latency and upload/download throughput only after admission, then
exercise one offline/reconnect window. Chrome documents that DevTools throttles
WebSocket connections, but its packet-loss and reorder controls are WebRTC
controls, not WebSocket controls
([Chrome WebSocket throttling](https://developer.chrome.com/docs/devtools/network/reference/#throttle-websocket-connections),
[CDP Network API](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditions)).
CDP has no seeded jitter or duplication. It is a real-Chrome smoke, not the
source of deterministic frame or packet evidence. Because its profile can
also affect admission HTTP, enable it after the initial baseline and always
reset it in `finally`.

For deeper local TCP behavior, launch one proxy listener per browser so
upstream (client to authority) and downstream (authority to client) are
independently configured and one slow client cannot accidentally throttle the
cohort.

Toxiproxy is a reasonable small first tool: its official project documents
directional latency/jitter,
bandwidth, timeout, reset, slicing, data limits, an HTTP control API, ephemeral
listen ports, and metrics
([Toxiproxy README](https://github.com/Shopify/toxiproxy)). Pin an exact release
and SHA-256 in CI; manage it as a child process rather than adding a runtime
package dependency.

Toxiproxy covers directional latency, byte-rate caps, blackholes, reset-peer,
and stream slicing. Its jitter uses process randomness rather than an
LBH-supplied replay seed, so strict gates use fixed values and record observed
timings. Do not use its `packet_loss` toxic as WAN loss: its implementation
drops chunks from the proxy's already-terminated TCP stream, which can corrupt
WebSocket framing instead of exercising TCP retransmission
([packet-loss source](https://raw.githubusercontent.com/Shopify/toxiproxy/main/toxics/packet_loss.go)).
It does not establish seeded IP-packet loss/reorder truth.
For that, run the proxy/client endpoints in disposable Linux network namespaces
and apply `tc netem` on receiver ingress in each direction. `netem` supports
delay distributions, random/state/Gilbert-Elliott loss, duplication, reorder,
rate, slots, and an explicit random seed. Its manual also warns that realistic
TCP testing should place netem at receiver ingress because TCP Small Queues can
distort sender-egress results
([tc-netem(8)](https://man7.org/linux/man-pages/man8/tc-netem.8.html)). Record
the complete `tc -s qdisc` state before and after every run.

Use the TCP proxy on macOS and ordinary CI. Run the namespace/netem subset on a
Linux scheduled job with `CAP_NET_ADMIN`; do not grant that capability to the
game process. A packet capture belongs only to Layer B. Capture on both proxy
interfaces with a run-specific filter and bounded rotation; never claim a
Layer A frame trace is a pcap.

A configured downstream cap is not automatically a slow-reader proof. If a
proxy eagerly reads from the authority and buffers internally, the authority
does not see receiver pressure. The slow-reader case is valid only when the
authority's actual `ws.bufferedAmount` crosses its 256 KiB high-water mark and
the queue policy fires. Use a raw admitted WebSocket probe that pauses its
underlying TCP socket after baseline for the focused local test, and use a
transparent receiver-ingress netem/rate path for the real-browser corroboration.
Merely delaying the browser `message` callback is also invalid because the
browser/OS may already have drained TCP.

### Fault ownership

| Fact | Layer A | TCP proxy | Linux netem |
|---|---:|---:|---:|
| Exact frame delay and deterministic jitter tape | Primary | Corroboration | No |
| Whole LBH frame omission/duplication/release order | Primary protocol defense | No | No |
| Delayed/omitted semantic ACK and exact-once replay | Primary | Reset corroboration | No |
| Byte bandwidth cap, stream slicing, slow receiver | No | Primary | Corroboration |
| TCP reset, blackhole, simultaneous socket flap | Exact schedule | Primary socket behavior | Corroboration |
| IP packet random/burst loss, duplicate, reorder | No | No | Primary |
| TCP retransmission and head-of-line behavior | No | Primary/OS | Primary |
| WAN routing, TLS termination, public edge | No | No | No; later pilot |

## Seeded scenario matrix

Each cohort gets 15 seconds of clean admission/warm-up, the declared active
window, then 15 seconds of recovery/measurement unless stated otherwise.
`U(a,b)` is bounded uniform jitter in `[-b,+b]` around `a` milliseconds.
Percentages are independent decisions from the named per-direction/per-class
seed unless a burst model is specified. `GE(p,r,h,k)` uses netem's
Gilbert-Elliott parameters. Every row runs once at 4p and once at 8p with the
listed seeds; a seed replay must make the same decisions.

| ID | Layer / duration | Exact impairment | 4p seed | 8p seed |
|---|---|---|---:|---:|
| `F0-clean` | A / 60 s | No impairment; instrumentation enabled | `0x0400C1EA` | `0x0800C1EA` |
| `F1-regional` | A / 90 s | all clients: upstream `U(35,10)`, downstream `U(55,20)`; no omission | `0x0401A511` | `0x0801A511` |
| `F2-mixed` | A / 90 s | clients by `index % 4`: `(10±5)/(20±5)`, `(25±10)/(45±15)`, `(50±20)/(80±30)`, `(75±30)/(125±50)` ms up/down; bounded uniform | `0x0402B17E` | `0x0802B17E` |
| `F3-frame-defense` | A / 90 s | last client only: omit 5% input, 20% action/delivery ACK, duplicate 10% event/action ACK, release window 3 for state/ACK; never mutate IDs | `0x0403AC11` | `0x0803AC11` |
| `F4-frame-burst` | A / 90 s | last client, each direction: two seeded 750 ms omission bursts beginning in `[20,30]` and `[50,60]` s; latest input/state omitted, reliable retention untouched | `0x0404B057` | `0x0804B057` |
| `F5-one-blackout` | A + proxy / 75 s | last client blackholed at t=20 s for 25 s, proxy then reset; held frames discarded; recovery begins at t=45 s | `0x0405B1AC` | `0x0805B1AC` |
| `F6-all-flap` | A + proxy / 75 s | all physical connections reset in the same 100 ms barrier at t=25 s; proxy remains available for resume | `0x0406F1A9` | `0x0806F1A9` |
| `T0-cdp-smoke` | CDP / 60 s | after baseline: each browser 35 ms fixed latency, 64 KiB/s upload, 320 KiB/s download; last browser offline t=25--30 s | `0x0410CD90` | `0x0810CD90` |
| `T1-cap-headroom` | proxy / 90 s | each client: 64 KiB/s upstream, 320 KiB/s downstream, fixed 25 ms up and 45 ms down; no unseeded jitter in the strict gate | `0x0411CA90` | `0x0811CA90` |
| `T2-slow-reader` | raw WS + netem / 60 s | last admitted client pauses its TCP reads after baseline until server high-water; browser corroboration caps receiver ingress at 96 KiB/s; generate one reliable event/s for 20 s | `0x0412510A` | `0x0812510A` |
| `T3-random-loss` | netem / 120 s | receiver ingress both directions: 60 ms RTT total, 15 ms jitter normal, 1% random packet loss, seed as listed | `0x04131055` | `0x08131055` |
| `T4-burst-loss` | netem / 120 s | receiver ingress both directions: 100 ms RTT total, 30 ms jitter normal, `GE(2%,25%,90%,0.2%)`, 0.5% duplicate, 1% reorder with 4-packet gap | `0x0414B057` | `0x0814B057` |

For netem, translate the root seed to its unsigned decimal value and save the
exact commands. `T4`'s GE figures are a falsification profile, not a claim
about a representative ISP. Reorder requires delay to be observable, another
explicit netem limitation. If the installed netem cannot combine the declared
models consistently, split duplicate/reorder into `T4a` and burst loss into
`T4b`; never silently drop an impairment.

The Toxiproxy rows' seeds govern the schedule and cohort identity, not proxy
jitter; strict proxy values are fixed because its stochastic jitter is not
replay-seeded. `T1` is deliberately just above the measured current per-client downstream
shape: the 8p local cohort used 1.927 MB/s aggregate, approximately 241 kB/s
per client if evenly divided. `T2` is intentionally below the current
uncompressed stream and is expected to fence the slow client, not keep it
playable by consuming unbounded memory.

Run `F0` and the Layer A unit corpus on every relevant PR. Run one 4p
`F1/F3/F6` browser cohort on the multiplayer-network PR lane. Run the full
4p/8p matrix plus netem nightly and before a hosted pilot. A failed seeded run
is replayed once for diagnosis, never automatically retried into green.

## Metric definitions and gates

All percentiles use per-client samples after warm-up. Report every client and
the cohort maximum; an aggregate percentile must not hide one bad participant.

- **Input ACK latency:** monotonic time from the first physical send of an
  `inputSeq` to receipt of an ACK covering that sequence. Retransmitted/reissued
  input is tagged, not reset to zero.
- **Snapshot cadence:** arrival-to-arrival time between exact aligned
  public/owner snapshot pairs. Half-pairs do not count.
- **Snapshot age:** local receipt time minus projected authority time using a
  monotonic clock offset sampled from welcome/heartbeat exchanges. Store raw
  arrival cadence separately so clock estimation cannot conceal stalls.
- **Reliable consequence time:** first action-frame send until both the
  semantic action outcome and its expected visible/private consequence have
  arrived. Rejected actions settle successfully as a measured rejection; they
  do not retry forever.
- **Queue bytes:** maximum and time series for application queued bytes,
  reliable bytes, replay-event bytes, socket `bufferedAmount`, inbound bytes,
  and process heap/RSS. Report each connection, not only the adapter sum.
- **Rebase count:** completed baseline ACKs after initial admission, classified
  by reason. Reconnect count is separate.
- **Reconnect time:** declared reset/blackout removal to a new current epoch
  with an aligned baseline accepted and a newly sent input ACKed.

| Profile | Input ACK p95 | Snapshot cadence p95 / age p95 | Reliable consequence p95 | Rebase budget |
|---|---:|---:|---:|---:|
| `F0-clean` | 125 ms | 175 / 250 ms | 300 ms | 0 after admission |
| `F1-regional`, `T1` | 250 ms | 300 / 450 ms | 700 ms | 0 after admission |
| `F2-mixed` worst client | 500 ms | 500 / 750 ms | 1,500 ms | at most 1/client/90 s |
| `F3`, `F4`, `T3`, `T4` | 800 ms | 750 / 1,100 ms | 2,500 ms | at most 2/client/120 s |

Blackout time is excluded from latency percentiles but never from the report.
After restoration, `F5` must recover within 8 seconds. `F6` must recover every
client within 10 seconds at 4p and 15 seconds at 8p, or each must reach an
explicit terminal failure within that budget. No client may remain in a
half-open `connecting/reconnecting` state.

Global hard gates for every row:

- every attempted reliable action has exactly one semantic outcome and every
  consequence is observed at most once; action/event identities never change
  across retry;
- stale connection epochs, credentials, ACKs, public/owner half-pairs, and old
  run frames never mutate the current body;
- healthy connections stay below 256 KiB socket high water and 512 KiB
  application queue, 256 KiB reliable queue, 64 KiB replay-event retention,
  512 KiB inbound per connection, and 8 MiB inbound total;
- `T2` may disconnect only the impaired client. Once its socket buffer reaches
  the 256 KiB high-water mark, it must rebase or disconnect within the existing
  2-second backpressure timeout plus one sweep and close grace (4 seconds
  total). Its application queue still must never exceed 512 KiB;
- after warm-up, authority heap growth slope is at most 1 MiB/minute and final
  RSS growth is at most 64 MiB versus the paired `F0` cohort. No retained
  membership/socket/timer remains after cleanup;
- authority remains `NORMAL` except if an independently specified overload
  stress case deliberately crosses the existing overload threshold. Sim-tick
  p95 must be `<= max(F0 + 2 ms, 10 ms)` and projection-average p95
  `<= max(F0 * 1.5, 12 ms)`. A slow client never changes the match clock alone;
- stream hot-path HTTP count remains zero, HTTP oracle queries stay outside
  latency measurements, and rival private fields remain absent;
- test infrastructure errors, missing samples, unsupported impairment flags,
  dirty cleanup, or absent artifacts are failures, not skips or zeroes.

Application-frame byte counts include JSON payload only; they do not include
WebSocket, TLS, TCP, or IP overhead and say nothing about congestion control.
Likewise, netem packet duplicate/reorder must still arrive to WebSocket as one
ordered message stream after TCP normalization. If a test reports reordered or
duplicated WebSocket messages from netem alone, the instrumentation or endpoint
is wrong.

The latency numbers are engineering gates for the current unpredicted Phase 1
stream, not final movement-feel approval. Greg's hands-on judgment may tighten
them. The authority CPU gates are anchored to the measured 8p local 3.98 ms
sim-tick p95 and 5.49 ms projection-average p95 while leaving enough machine
variance to avoid turning the lane into a host-speed benchmark.

## Reproducibility and evidence contract

Every run writes one immutable artifact directory named by date, commit,
scenario, cohort, and root seed. It contains:

- `manifest.json`: git SHA and dirty state, scenario version/hash, every root
  and derived seed, player-to-proxy mapping, exact impairment parameters,
  ports, OS/kernel/Node/Chrome/proxy/netem versions, start/end monotonic times,
  and pass/fail budgets;
- `frame-decisions.jsonl`: Layer A enqueue/release/omit/duplicate/close choices
  with redacted identities and frame hashes;
- `clients.jsonl` and `authority.jsonl`: one-second metric samples plus raw
  action, rebase, reconnect, mode, queue, memory, and process events;
- browser console/errors, authority/proxy stdout and stderr, CDP WebSocket frame
  byte counters, Toxiproxy configuration/metrics, and `tc -s qdisc` output;
- Layer B only: size- and time-bounded pcaps on both sides of the proxy and a
  capture manifest. Admission tickets and command credentials must be redacted
  from decoded logs; TLS pilot pcaps remain encrypted transport evidence;
- `summary.json` with per-client distributions, cohort maxima, exact-once
  ledger, cleanup result, and the first failed assertion.

Failure replay consumes the saved decision tape before regenerating from the
seed. The minimizer then works in this order: retain the first failing prefix,
remove uninvolved clients down to 2 then 1 where valid, remove fault classes,
halve impairment windows, and shrink the frame-decision tape while preserving
the same invariant failure. Preserve the original artifact beside every
minimized case.

Each scenario has one overall timeout equal to warm-up + active + recovery +
30 seconds. Cleanup runs from `finally` and signal traps: remove toxics, qdiscs,
namespaces, pcaps, temporary Chrome profiles, and port registries; close every
browser; terminate child process groups with `SIGTERM`, then `SIGKILL` after
2.5 seconds; and verify PIDs and listeners are gone. Cleanup failure overrides
a gameplay pass. Use distinct ports/directories per worker and cap concurrent
browser cohorts; these tests must not share one impairment daemon or qdisc.

## Proposed ownership and atomic slices

Do not enlarge `tests/multiplayer-browser-journey.cjs` into a second harness.
Extract reusable journey observation only after contract tests exist.

1. **Deterministic scheduler kernel.** Add
   `tests/network/seeded-frame-scheduler.cjs`, fixtures under
   `tests/fixtures/network-impairment/`, and a pure Node suite proving PRNG,
   distributions, window ordering, tapes, virtual time, and cleanup. No browser
   or runtime changes.
2. **Adapter seam.** Add dependency-injected test scheduling for complete
   non-reliable authority-to-client frames, defaulting to immediate delivery
   and absent from production configuration. Keep `deliveryId` frames and
   terminal error/close frames immediate: the current drain-before-send queue
   accounting and cumulative client delivery ACK cannot safely model reliable
   reorder yet. Extend isolated adapter tests for default parity, the reliable
   bypass boundary, half-pair, old-epoch, blackout, duplication, and reset
   races.
2a. **Reliable impairment prerequisite.** Before F3 can delay, omit, duplicate,
   or reorder reliable consequences, record physical sends separately from
   queue drain and make the client ACK only the highest contiguous delivery
   ID. Prove a held ID 1 plus released ID 2 cannot retire ID 1, then reopen
   reliable scheduling at the same complete-frame seam. Terminal frames remain
   immediate unless close gains an explicit scheduler-completion handshake.
3. **Client seam.** Inject the same interface around the test WebSocket
   implementation, then prove action identity, continuous-input independence,
   reconnect generation fencing, and event playback ACK behavior. Keep HTTP
   oracle tests unchanged.
4. **Instrumented 4p browser lane.** Add
   `tests/multiplayer-network-impairment.cjs` and a small reusable cohort helper.
   Land `F0/F1/F3/F6` at 4p with manifest, JSONL, strict timeouts, and process
   cleanup before adding more scenarios.
5. **Browser transport smoke.** Use existing CDP sessions for fixed
   latency/rate/offline after admission, restore profiles in cleanup, and add
   `T0`. Do not use its WebRTC-only packet controls.
6. **Managed TCP proxy lane.** Add a pinned proxy launcher/control helper and
   `T1/F5`, one listener per browser. Add the paused raw-WebSocket slow reader,
   and accept `T2` only when authority `bufferedAmount` and queue policy prove
   pressure rather than proxy buffering. Do not add a game runtime dependency.
7. **Linux netem lane.** Add a capability-checked wrapper, disposable
   namespaces, exact qdisc commands, pcap capture, and `T3/T4`. Missing
   capability is an explicit job-configuration failure in the scheduled lane.
8. **Full matrix and lane wiring.** Add separate manifest names such as
   `multiplayer-impairment-fast`, `multiplayer-impairment-browser`, and
   `multiplayer-impairment-transport`; update docs only after their first
   measured results exist.

Each slice should be independently reviewable and committed only with its
focused lane green. Runtime queue limits and authority behavior are not owned
by the harness slices; a real defect found there gets a separate fix and
regression commit.

## Rejected alternatives

- **Frame shim only:** repeatable, but cannot create TCP receive-window
  pressure, retransmission, congestion, byte fragmentation, or real socket
  backpressure.
- **Proxy/netem only:** harder to reproduce at semantic-frame granularity and
  poor at explaining which ACK or consequence caused a failure.
- **Chrome throttling as the primary injector:** CDP is useful for observation,
  but its current network API describes request latency/aggregate throughput,
  while packet loss and reorder parameters are specifically WebRTC-oriented
  ([Chrome DevTools Protocol Network domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/)).
  It is not sufficient evidence for LBH WebSocket packet loss or per-client
  directional slow-reader behavior.
- **Toxiproxy packet-loss toxic:** dropping chunks after terminating TCP is not
  IP loss and may only produce malformed WebSocket data.
- **Delayed browser callbacks or proxy blackholes as slow-reader proof:** the
  first may occur after TCP drain and the second may consume/discard bytes.
  Require authority-side `bufferedAmount` growth and queue-policy action.
- **One shared proxy for all browsers:** prevents independent paths and makes a
  single slow reader a cohort-wide artifact.
- **Unseeded chaos/soak first:** finds anecdotes that are expensive to replay
  and minimize. Soak follows seeded contract closure.
- **WAN-first validation:** mixes protocol, TLS, routing, hosting, and process
  placement failures before local causes are controlled.

## Later WAN/TLS pilot

After all local 4p/8p gates pass, run the smallest honest internet pilot:

- one ordinary regional VM contains one LBH match authority and one TLS reverse
  proxy on the same host; this is one logical authority for that match, not a
  global server and not one VM required per future match;
- use a real DNS name and publicly trusted certificate; browsers connect only
  through WSS. Keep the HTTP oracle private to the operator path;
- launch two remote client runners in different network regions, two browsers
  each for 4p and four each for 8p. Run a 20-minute clean cohort and a
  20-minute controlled proxy-latency/reset cohort at each size;
- collect endpoint monotonic traces, authority/proxy metrics, TLS handshake and
  reconnect timings, encrypted pcaps, egress bytes, CPU/RSS, and provider
  instance identity. Apply the same exact-once, privacy, queue, cleanup, and
  authority-mode gates; report observed RTT/jitter instead of asserting the
  route matches a local profile;
- repeat once from a physical Steam Deck before public readiness, but keep
  Greg's movement/art acceptance separate from protocol pass/fail.

Do not introduce a CDN WebSocket edge, relay mesh, multi-region authority,
serverless authority, autoscaling fleet, or Vercel/Cloudflare topology in this
pilot. Those require the control-plane placement and hosted orchestration work
that does not yet exist. The pilot answers only: can one real WSS authority per
match survive two actual internet paths with the measured local contract?

## Decisions reserved for Greg

1. The supported product envelope: whether sustained RTT above 120 ms is a
   warning tier, an unsupported tier, or matchmaking exclusion. The harness
   should measure it; an agent should not decide who may play together.
2. Slow-client UX: immediate spectator/drop, 90-second neutral-input
   reservation with hazards live, or another presentation. The authority must
   still fence unsafe retention.
3. Whether a reconnecting player's private consequence backlog is shown as a
   catch-up sequence or summarized after rebase.
4. When movement prediction becomes necessary. Phase 2 can expose unacceptable
   control feel, but adding prediction belongs to Phase 3 and needs Greg's
   hands-on comparison.
5. Hosted-pilot region/provider and spending approval after local gates. The
   harness should not select a production edge architecture by convenience.

## Source/read-path note

The initial delegation packet named absent
`docs/v0.4/research/network-budget-model.md`. This review used the committed
measured baseline and `p2p-history-network-budgets.md`; the packet path was
corrected during integration, and no missing-file assumptions were silently
filled in.
