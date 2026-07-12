# T2 Slow-Reader Pressure Implementation

> Status: approved implementation packet, 2026-07-12. This supersedes the
> single ambiguous `T2-slow-reader` row with two local raw-WebSocket proofs and
> one later Linux/browser corroboration. It does not authorize netem, hosted
> WSS, or gameplay changes.

## Decision

T2 is three separately named claims:

1. **T2a drainable pressure:** one admitted raw pilot stops TCP reads, its exact
   authority WebSocket crosses the production 256 KiB transport high-water
   mark, replaceable state coalesces, a bounded reliable burst is retained,
   and reads resume before the two-second policy timeout.
2. **T2b hard pressure:** the same exact condition persists through the real
   timeout policy, only the impaired pilot is fenced, and its membership
   reconnects on a distinct socket and greater epoch with exact-once replay.
3. **T2c browser ingress:** a later Linux receiver-ingress rate/netem run
   corroborates a real browser path. It remains ingress-cap evidence unless
   that browser's exact authority connection also crosses high water and fires
   the same policy.

The old requirement to generate one reliable event per second for 20 seconds
while the connection remains pressured is rejected. Production policy begins
closing a connection after two seconds without transport progress; a run
cannot both preserve a 20-second pressured connection and prove the shipping
timeout policy.

## Authority and topology

Each case owns exactly one dedicated authority for its match, not one global
authority for the deployment and not one authority per client. The first gate
is four raw clients over four independent TCP/WebSocket connections. The same
fixture later runs at eight raw clients; 24/48/96 capacity work remains a
separate scale lane. T2c alone owns real-browser corroboration.

- pilots 0 through 2 (or 0 through 6 at 8p) continuously read, pong, and ACK;
- only the last pilot uses the raw read gate;
- authority PID, run identity, tick, and overload state remain stable;
- the raw pilot pauses only after welcome, aligned public/owner baseline,
  baseline ACK, and a matched heartbeat pong;
- no proxy, application-frame omission, lowered queue threshold, or synthetic
  giant frame creates the primary pressure condition.

Use a dedicated raw cohort rather than extending the already large browser
cohort:

- `tests/fixtures/network-impairment/phase2-transport-v1.json`;
- `tests/network/raw-ws-client.cjs`;
- `tests/network/sim-pressure-preload.cjs`;
- `tests/network/raw-ws-slow-reader-cohort.cjs`;
- `tests/multiplayer-slow-reader-pressure.cjs`;
- manifest lane `multiplayer-impairment-transport`;
- package scripts for focused T2a and T2b.

## Required adapter seam

The production close path currently sends backpressure close `4008` with
transport intent `1013` without recording a queue-policy disconnect. Extend
the accounting seam to `markQueuePolicy(state, action, reason)`, pass existing
queue outcome reasons at their current call sites, and immediately before that
close record `{ action: "disconnect", reason: "backpressure-timeout" }`. Count
the timeout once only. This is a telemetry correctness fix; it must not change
thresholds, timeout, sweep cadence, queue behavior, or wire semantics.

Aggregate `worstConnection` metrics cannot attribute pressure to the impaired
pilot. Add privacy-safe per-connection pressure diagnostics keyed only by the
existing monotonic `schedulerConnectionId`. The detailed live table is absent
by default and available only to an injected test observer or test-authorized
oracle; bound it to `maxConnections` and remove entries with their connection.
Do not expose player, profile, membership, connection, ticket, credential, or
action identifiers. Each live entry reports:

- bound, closing, and connection epoch;
- current and maximum socket buffered, application queue, reliable queue,
  replay-event, inbound, pending-send, and scheduled-send bytes/counts;
- transport-high state, first-high timestamp, backpressured-since timestamp,
  and latest policy action/reason/timestamp;
- monotonic counts for state offered/coalesced, state frames accepted by
  `ws.send` by class, reliable offered/queued/accepted by `ws.send`/ACK-retired/
  reset on cleanup, high-water crossings, rebases, and disconnects.

Keep the current aggregate schema. Add an optional normalized
`onPressureTransition` adapter callback, default no-op. The test preload
injects it and writes bounded, redacted events named `transport-high-enter`,
`transport-low-exit`, `state-coalesced`, `queue-policy`, `close-dispatched`,
`pressure-sweep`, and `connection-cleanup`. Observer loss, overflow, false
return, or throw is counted and makes the harness RED, but observer failure
must not change authority behavior. Do not retain production tombstones:
cleanup evidence comes from the transition emitted immediately before live
state deletion. The accepted artifact may map pilot labels to scheduler
ordinals, but never persist raw identity material.

`wsSendAccepted` means only that `ws.send()` accepted a frame into the
WebSocket implementation. It does not mean bytes reached the peer, entered a
packet, or traversed TCP. Application receipt plus ACK owns delivery truth.

## Read-gate proof

The Node `ws` client may use its established private socket seam for this
harness only:

```js
ws._socket.pause();
```

Acceptance requires a 250 ms guard after pause with all of:

- `isPaused() === true`;
- `readableFlowing === false`;
- socket `bytesRead` unchanged;
- application receive count unchanged;
- pause acknowledgement occurs within 250 ms after the authority records the
  matched pong.

The high-water and any policy dispatch must occur before the next heartbeat
could become timeout-eligible. This prevents a 4001 heartbeat race from being
mislabelled as backpressure.

Unsupported private-socket behavior is RED, not skipped. Delaying a browser
`message` callback, CDP throttling, or pausing only application dispatch is not
a slow-reader proof because the browser or OS may already have drained TCP.

## T2a drainable gate

After the guard, normal authority projections must make the exact impaired
WebSocket reach at least 262,144 buffered bytes. Do not lower production
limits or manufacture oversized frames. Let `tB` be the adapter-recorded start
of continuous transport backpressure; it must follow that exact crossing and
must not originate from a queue limit or rebase. Once `tB` is recorded:

1. require at least five replaceable state coalesces;
2. issue exactly eight authenticated inventory commands, alternating
   `unequip` and `equipCargo` for one deterministic item, through the normal
   authority executor/journal path; each resulting consequence is at most
   4 KiB and the burst at most 32 KiB;
3. prove all eight enter the reliable queue after `tB` and before resume, with
   increasing reliable depth/bytes and zero `wsSendAccepted` for those IDs;
4. resume reads by `tB + 1,000 ms`;
5. require adapter event `transport-low-exit` at at most 65,536 bytes strictly
   before `tB + 2,000 ms`, with no eligible policy action;
6. require all eight consequences once, in FIFO order, with delivery/event
   ACKs;
7. require every received state pair to be atomic and present in the
   `wsSendAccepted` ledger. Of the snapshot offers made after transport high
   and before low-water, only the greatest coalesced snapshot may gain a new
   send acceptance after drain; valid pre-high in-flight and post-low pairs
   remain allowed;
8. require no close, reconnect, rebase, epoch change, or queue-policy action.

The eight authenticated HTTP requests are declared out-of-band harness
stimulus, not stream fallback. Raw clients issue zero HTTP after ticket and
admission setup; hot-path HTTP remains zero.

The test reports explicit queue caps and cleanup. A single 60-second process
sample is not a leak-freedom claim.

## T2b hard-pressure gate

Use a fresh match or fresh impaired admission so T2a drain state cannot mask
the hard case. Repeat baseline, pong, pause, and guard. After exact high water,
inject the same bounded eight-event burst within 800 ms and keep reads paused.

Let `tB` be the adapter-recorded start of continuous backpressure, `tD` policy
dispatch, and `tC` connection cleanup. The pressure observer records every
sweep with scheduled/actual time and a fixture-declared maximum sweep lateness;
exceeding that budget is infrastructure RED. Require:

- `tD` is the first recorded sweep for which `now - tB >= 2,000 ms`; no
  eligible sweep is skipped;
- `tC` occurs on prompt socket close or the first closing sweep eligible after
  `closeGraceMs`;
- exactly one policy disconnect with reason `backpressure-timeout`, attributed
  to the impaired ordinal;
- all eight entries were reliably queued after `tB`, increased queue
  depth/bytes, and had zero `wsSendAccepted` events before cleanup;
- server close reason `4008` and transport intent `1013`;
- no heartbeat, auth, rate-limit, injected-reset, or queue-budget cause.

Do not resume application reads on the old socket. Server transition and
cleanup evidence owns close causality. The client may see 1006 if the close
frame cannot drain before grace; that does not override the server-recorded
cause.

Reconnect the same membership through normal admission/resume on a distinct
socket and greater authority epoch. The hello carries the pre-pause
`lastRunId`, `lastSnapshotId`, and pre-burst `lastEventSeq`. Require aligned
rebase/public/owner baseline, baseline ACK, new input plus covering ACK, and all
eight stable consequence identities first becoming application-visible on
epoch 2, then consumed and ACKed exactly once. Transport attempts may repeat;
semantic consumption may not.

## Healthy peers and performance

Every healthy peer must record zero transport-high crossings, policy actions,
rebases, reconnects, epoch rotations, and closes. Existing clean latency,
cadence, consequence, privacy, hot-path HTTP, and pending-work gates remain.

Run a matched all-reading raw control adjacent to the T2 cases on the same
commit and host. Authority must remain `NORMAL`; sim tick p95 must be at most
`max(control + 2 ms, 10 ms)` and projection p95 at most
`max(control * 1.5, 12 ms)`. RSS may not exceed control by more than 64 MiB.
Heap slope is diagnostic in this short run; repeated-cycle soak owns any leak
claim.

## Artifacts

Each immutable run writes:

- `manifest.json`: clean SHA, host/runtime versions, topology, production
  limits/timeouts, stimulus counts/bytes, and claim boundary;
- `connection-map.json`: each pilot's scheduler ordinal/epoch transitions; for
  pilot 3 include both old and replacement ordinals, epochs, and transition
  times, without raw welcome or identity values;
- `raw-reader.jsonl`: baseline/pong, pause/resume, socket read counters, and
  application receive counts;
- `authority-pressure.jsonl`: event-driven per-connection transitions plus
  at most 100 ms samples during the pressure window;
- `state-ledger.json`: offered, coalesced, `wsSendAccepted`, received, and
  absent aligned snapshot frames/pairs;
- `reliable-ledger.json`: issued, queued, `wsSendAccepted`, received, ACKed/
  retired, cleanup-reset, and replayed consequence identities;
- `healthy-peers.json`, `performance.json`, `cleanup.json`, and `summary.json`.

Missing transitions, aggregate-only attribution, unsupported read gating,
identity leakage, dirty cleanup, or an infrastructure error is RED.

## Cleanup

Before authority shutdown, require zero adapter connections, bound/closing
states, application/reliable/replay queues, pending/scheduled sends, hello
timers, and ticket residue; the live adapter correctly retains one liveness
timer. Preload-captured graceful shutdown diagnostics then require zero
liveness timers and zero current pressure totals. Stop every raw client,
authority, and actual helper, and close all ports. T2a/T2b do not require a
static server or browser profile. Cleanup failure overrides every gameplay or
performance pass.

## Claim boundary

Allowed claim:

> A locally admitted raw pilot stopped application reads; that exact authority
> WebSocket crossed 256 KiB, bounded/coalesced replaceable state, retained or
> replayed bounded reliable consequences, and drained or was fenced without
> affecting healthy peers.

Disallowed claims include packet loss/reorder, kernel receive-window
exhaustion, congestion control, retransmission, head-of-line behavior,
representative ISP bandwidth, WAN, WSS, TLS, hosted behavior, or 24/48/96
capacity. T2c may add receiver-ingress evidence only under its own artifact and
label.

## Atomic order

1. Fix timeout action/reason accounting; add opt-in per-live-connection
   current/max telemetry, the bounded transition-callback contract, and focused
   four-connection adapter regressions. Commit alone.
2. Add the raw helper/control, pressure preload/sink, and T2a. Run focused
   adapter tests, T2a, and the full multiplayer-network lane. Commit alone.
3. Add T2b reconnect/replay. Run T2a/T2b and regressions. Commit alone.
4. Run clean 4p cases, audit artifacts, and add docs-only acceptance.
5. Add 8p only after 4p is accepted. Keep T2c/netem in a later Linux slice.

## Adapter prerequisite status — implemented

Commits `381f435` and fix-forward `c09882d` implement the step-one adapter
contract without changing queue limits, timeout, wire semantics, or gameplay.
The timeout path now records exactly one
`disconnect:backpressure-timeout` policy action. An injected observer enables
privacy-safe per-live-connection pressure facts and immutable transitions;
ordinary production diagnostics omit the detailed table and its allocations.

Independent review found and fixed double-reading of `bufferedAmount`, stale
`backpressuredSince` event ordering, rebase contamination of cleanup-reset
counts, post-cleanup transitions, and default-path detailed telemetry work.
One immutable sample now owns aggregate/detail/transition/maxima facts,
`connection-cleanup` is final for its ordinal, and cleanup-only reset accounting
stays distinct from operational rebase. The focused adapter core passes 28/28
and the full multiplayer-network lane passes all 11 suites.

## T2a status — accepted

T2a is independently accepted at `3cfc9a8` from clean artifact
`multiplayer-transport-2026-07-12T144443527Z-t2a-432a63`. One exact impaired
ordinal crossed transport high water and later drained before timeout. The
artifact closes exact-one reliable queue/send/receive/ACK identity flow,
normalized state-pair acceptance coverage, authority-validated heartbeat
causality, healthy-peer isolation, stable authority PID, bounded observer and
artifact limits, classified HTTP use, privacy, and teardown. Its claim remains
local PR-smoke raw-WebSocket pressure only. T2b hard fence/reconnect/replay is
the next code slice; T2c and packet/browser/WAN/WSS/hosted/capacity evidence
remain separate.

## T2b status — accepted

T2b is independently accepted at `98498b9` plus ledger fix-forward `0955171`.
Clean artifact `multiplayer-transport-2026-07-12T153314140Z-t2b-94c169`
records continuous high-water entry, first timeout eligibility, and the first
closing sweep on one exact old ordinal. That socket closes once with the
shipping pressure policy and resumes as a distinct ordinal at connection epoch
2 without replacing the match authority. Eight journal consequences first
become visible on the replacement epoch, FIFO and exactly once. Exact baseline,
delivery, event-ACK, retirement, cleanup-reset, normalized state, and reliable
ledgers close the evidence; healthy peers, performance, HTTP classification,
privacy, limits, and teardown pass. This is local raw-WebSocket hard-pressure
PR smoke only. T2c, packet/browser/WAN/WSS/hosted/soak/capacity evidence remain
separate.

## Eight-player status — accepted

The product-maximum extension is independently accepted through `b6a2513` from
clean artifacts `multiplayer-transport-2026-07-12T162402942Z-t2a-8p-9aee16`
and `multiplayer-transport-2026-07-12T162436593Z-t2b-8p-aa8731`. Each control
and pressure match admits eight distinct raw clients under one logical match
authority. T2a drains only the exact impaired ordinal before timeout; T2b
fences only that ordinal, resumes a distinct connection at exactly epoch +1,
and replays eight consequences FIFO/exactly once after one aligned rebase and
baseline. All seven healthy peers remain pressure-free, epoch-stable, and
owner-private clean. State, reliable, delivery/event ACK, cap, performance,
HTTP, privacy, artifact-bound, process, port, and teardown gates pass. A fresh
independent focused rerun also passes. The result closes local raw-WebSocket
pressure for the supported 4–8 envelope only; T2c and Linux packet/browser,
WAN/WSS, hosted, soak, and high-count capacity evidence remain separate.
