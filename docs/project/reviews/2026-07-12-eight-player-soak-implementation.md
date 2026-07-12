# Eight-Player Soak And Churn Implementation Packet

> Implementation-ready local evidence contract for
> `codex/v0.4-multiplayer-architecture`, 2026-07-12. This packet reuses the
> accepted eight-player WebSocket authority and T2 pressure harnesses. It does
> not claim WAN, packet, browser, WSS, TLS-edge, hosted, or 24/48/96 capacity.

## Decision

Add one staged, deterministic eight-player lane:

1. a short PR smoke proves the schedule, ledgers, bounded sampler, artifacts,
   cleanup, and failure paths;
2. a **45-minute normal soak** proves a continuously populated local match; and
3. a **90-minute churn soak** proves bounded authenticated join, leave,
   reconnect, fencing, rebase, and exact-once delivery over repeated cycles.

Every test match owns exactly **one logical single-writer authority** shared by
its eight clients. If two matches are run concurrently for a later packing
experiment, there are two authorities, two run identities, two listeners, and
disjoint clients. Nothing here creates one global authority or one authority
per client, and this packet does not require one VM per match.

A short smoke may be implemented immediately. It may establish only that the
soak machinery is deterministic and safe to run; it must be named `pr-smoke`
and must never be reported as long-duration or leak evidence.

## Existing stack to extend

Do not build another protocol client, admission path, or result oracle.

- Use `tests/network/raw-ws-client.cjs` for authenticated stream clients and
  the accepted per-identity receive/ACK ledgers. Add one default-immediate,
  test-owned per-event ACK predicate for churn: only the named consequence may
  withhold both its delivery ACK and event ACK. Log the held identity and fail
  if any other ACK is withheld; the default client path stays immediate.
- Extract or parameterize the cohort lifecycle used by
  `tests/network/raw-ws-slow-reader-cohort.cjs` and
  `tests/network/raw-ws-hard-pressure-cohort.cjs`; preserve its ordinal
  derivation, privacy scan, HTTP classification, artifact limits, PID/port
  ownership, and teardown.
- Reuse the production `/join`, `/leave`, `/multiplayer/ticket`, `/health`, and
  `/stream` paths. No debug endpoint may manufacture membership, delivery, or
  cleanup truth.
- Reuse the accepted action/event accounting, run-qualified event ACK,
  baseline/rebase, connection-epoch, ticket-registry, adapter-pressure, and
  projection diagnostics. `npm run test:multiplayer-network` remains the
  regression gate.
- Keep F5 and T2 as separate focused evidence. Their accepted artifacts prove
  blackout and pressure mechanics; the soak invokes ordinary close/reconnect
  churn and must not silently relabel it as F5/T2, packet loss, or congestion.

The new focused entrypoints should be:

```text
npm run test:multiplayer-soak:smoke
npm run test:multiplayer-soak:normal
npm run test:multiplayer-soak:churn
```

The canonical commands must use `--no-retries`. A failed canonical run is
evidence, not a reason for an automatic retry.

## Minimal diagnostics prerequisite

`/health` already exposes process RSS/heap and the adapter, ticket, projection,
tick, queue, and retained-history facts needed by this lane. It does not expose
first-class CPU/ELU, GC pause/count, or event-loop delay. Add one opt-in
test-authorized authority sampler behind `LBH_SOAK_DIAGNOSTICS=1`, and launch
canonical authorities with `--expose-gc`:

- `perf_hooks.monitorEventLoopDelay({ resolution: 20 })`, reset into one-minute
  p50/p95/p99/max windows;
- a `PerformanceObserver` for `gc` entries, reporting only count, total pause,
  p95/p99/max, and kind counts per one-minute window; and
- one-Hz `process.memoryUsage()`, `process.cpuUsage()`, and
  `performance.eventLoopUtilization()` deltas.

Expose only numeric aggregates in the authenticated/test-authorized health
diagnostics. Retain at most two one-minute windows in the authority and let the
harness own the bounded time series. The flag defaults off, creates no timer or
observer when absent, and disconnects the observer and histogram during normal
and signal cleanup. Add a focused default-off/opt-in/cleanup test before the
soak harness.

External process or runner event-loop sampling is rejected as the primary
prerequisite: it cannot attribute authority V8 heap, GC pauses, or event-loop
stalls. RSS slope remains diagnostic only because allocator arenas and OS
accounting can grow without a JavaScript leak. Post-GC heap slope plus
retained-object bounds own the structural leak gate.

## Seeds and profiles

| Profile | Root seed | Wall time | Warm-up | Measured body | Recovery |
|---|---:|---:|---:|---:|---:|
| `pr-smoke` | `0x08A04E01` | 6 min | 1 min | 4 min | 1 min |
| `normal-45m` | `0x08A04E45` | 45 min | 5 min | 35 min | 5 min |
| `churn-90m` | `0x08C49001` | 90 min | 10 min | 70 min | 10 min |

Use the repository seeded scheduler/PRNG. Persist the root seed, derived
schedule hash, committed HEAD, Node/OS/architecture, scenario version, exact
planned barriers, and actual monotonic timestamps before admitting clients.
No `Math.random()`, wall-clock-derived id, or unrecorded jitter belongs in the
schedule.

All eight clients continuously send deterministic movement/input. During the
measured body, start one reliable action every 15 seconds, selecting client
`round mod 8` and action kind `floor(round / 8) mod 5`. The harness derives
stable action identities from scenario, seed, round, membership incarnation,
and kind. Every authority-accepted identity must converge to exactly one stable
semantic receipt and no more than one consequence. Every visible consequence
must be received FIFO and exactly once per entitled live membership, then
retired by the issued-only ACK path. A rejected or conflicted action remains a
stable single outcome and cannot be counted as an accepted consequence.

## Normal 45-minute schedule

- `t=0..5m`: admit eight clients sequentially, derive scheduler ordinals from
  live-set differences, align public/owner baselines, and drain initial work.
- `t=5..40m`: keep all eight memberships and sockets live. Run continuous
  inputs and the reliable schedule above. No planned leave, reconnect, epoch
  rotation, pressure injection, or run reset is allowed.
- `t=40..45m`: stop issuing actions, continue input until every accepted action
  and consequence is received/ACK-retired, then pause clients and drain.

The normal run fails on any connection replacement, membership change, rebase
after admission, queue-policy action, transport high-water crossing, or
authority PID/run/epoch change. It is the steady-state control for the churn
run, not a mathematically paired performance sample on the same process.

## Churn 90-minute schedule

- `t=0..10m`: admit and align eight clients as above.
- `t=10..80m`: execute fourteen five-minute cycles. Cycle `n` starts at
  `t = 10m + n * 5m`; its target seat is `4 + (floor(n / 2) mod 4)`. Each seat
  receives reconnect and leave/join before the sequence repeats; fourteen
  cycles distribute the unavoidable remainder across the first three rotating
  seats while seats 0--3 stay as continuous controls.
- `t=80..90m`: hold the final eight clients stable, drain all reliable work,
  and prove the authority returns to the steady envelope before cleanup.

Even cycles exercise reconnect; odd cycles exercise physical leave/join:

### Even cycle `n`: same-membership reconnect

1. At `cycle+0s`, issue the cycle's named reliable action instead of any
   coincident background action. Continue reading but use the default-immediate
   test-owned ACK predicate to withhold both delivery and event ACK only for
   that named consequence. Wait for authority acceptance and application
   receipt; do not pause TCP or other ACK/input traffic.
2. At `cycle+5s`, close only that client's stream abruptly. Record the old
   ordinal, socket hash, connection id/epoch, cursors, and pending identity.
3. At `cycle+10s`, request one authenticated resume ticket and open a distinct
   stream. Require connection epoch exactly `old+1`, one aligned rebase and
   baseline, then fresh physical input/ACK progress by `cycle+20s`.
4. The identity keeps its original semantic outcome; the unretired consequence
   replays exactly once after the new baseline and retires only on the new
   epoch's issued delivery/event ACK. The old epoch cannot mutate or retire
   new-epoch state. This deliberately reuses a narrow accepted T2b replay
   mechanic without inducing T2 pressure.

### Odd cycle `n`: leave and replacement join

1. At `cycle+0s`, settle and retire a named reliable action for the departing
   membership.
2. At `cycle+5s`, call authenticated `/leave`, close its stream, and prove the
   membership disappears once. Outstanding tickets for it must not redeem.
3. At `cycle+10s`, call production `/join` with the predeclared replacement
   profile/client fixture for that seat, obtain its server-created membership
   and admission ticket, and align a new stream by `cycle+20s`.
4. The replacement gets a distinct membership/incarnation and only entitled
   public history. It cannot see the departed owner's private state or ACK the
   departed membership's delivery. The match may contain seven clients for at
   most 15 seconds and must otherwise contain exactly eight.

Only one seat churns at a time. No artificial pause, proxy, lowered queue cap,
or giant payload is used. Every non-target live client must preserve its socket,
epoch, baseline count, private projection, and continuous input/ACK progress.
The schedule compiler gives every coincident barrier a total order: cycle
transition, cycle-owned action, admission/recovery, quiet checkpoint, then
background action. A cycle-owned action replaces a background action at the
same timestamp. During each churn cycle, the forced-GC checkpoint runs at
`cycle+150s`, after recovery; issuance pauses, reliable work drains, GC/sample
runs, then issuance resumes. All omissions and deferrals are part of the
committed schedule hash.

## Measurements and slope method

Sample the opt-in authority diagnostics at one Hz and poll its bounded health
window every five seconds; produce one-minute aggregate windows. Samples before
the profile warm-up boundary are diagnostic and excluded from performance and
slope gates. Use monotonic time and retain both scheduled and actual sample
time. Missing samples, observer failure, or less than 95% one-Hz coverage is
RED.

At declared quiet checkpoints, stop new action issuance, drain current reliable
work, invoke `global.gc()` twice, wait two seconds, then sample heap. Checkpoints
occur every 150 seconds in the 45-minute profile and at `cycle+150s` in each
five-minute churn cycle, yielding at least twelve post-warm-up points in each.
Tag and exclude the complete one-minute aggregate window containing a forced-GC
checkpoint **and its immediately following minute** from cadence, event-loop,
GC, and CPU performance gates; both still count toward sampling coverage and
wall-time/correctness ledgers. The conservative second exclusion covers the
accepted diagnostics limitation that a `PerformanceObserver` callback may
assign a boundary-adjacent GC entry to the next current window. Schedule quiet
checkpoints away from rollovers where possible, but do not rely on timing alone.
Every p99/max gate applies independently to each non-excluded minute; never
compute a percentile of per-minute percentiles. Missing `global.gc`, a failed
drain, or fewer than twelve valid points is RED.

Use Theil-Sen bytes/minute across post-GC `heapUsed` points as the leak gate.
Also report ordinary least-squares slope/R-squared as diagnostic, one-minute
medians, first/last five-minute median, peak, and post-GC minima. Do not
cherry-pick endpoints. The canonical leak gate requires both bounded post-GC
slope and bounded retained registries; a positive RSS slope alone never proves
a leak. Record RSS with the same methods for capacity diagnosis only.

Persist at least:

- RSS, heap used/total, external and array-buffer bytes, process CPU deltas and
  authority event-loop utilization;
- GC count by kind, total pause duty, p95/p99/max pause;
- event-loop delay p50/p95/p99/max;
- observed authority and projection Hz per minute; sim-tick and completed
  projection p50/p95/p99/max;
- overload mode and transitions; scheduler-lateness or missed-tick fields are
  not claimed until the authority exposes a first-class source;
- aggregate and per-ordinal application/reliable/replay/inbound/pending/
  scheduled queue current/max bytes and messages, high-water/policy facts;
- tickets issued/redeemed/expired/invalidated/pending/retained;
- event journal, action receipt, playback/delivery window, membership history,
  state-pair, and connection-history current/max/capacity;
- input/state/reliable bytes accepted, received, ACKed, and retired per minute
  and per client, plus aggregate application bytes/player-second; and
- join/leave/reconnect/rebase/epoch ledger with authority PID/run stability.

## Canonical pass/fail gates

The PR smoke uses the same assertions except heap slope, RSS slope, GC duty,
and long-window recovery, which are reported as `NOT_APPLICABLE_SHORT_RUN`.
Canonical thresholds are initial GregBot regression gates and must be preserved
with machine identity in the artifact rather than marketed as universal host
capacity.

| Area | Required gate after warm-up |
|---|---|
| Authority | one stable PID, run id, and logical writer; no reset/crash; `NORMAL` for >=99% of one-minute samples and at final drain |
| Cadence | every one-minute authority/projection rate >=90% of configured target; sim tick p95 <=10 ms, p99 <=20 ms, max <=100 ms; completed projection p95 <=20 ms, p99 <=40 ms, max <=150 ms |
| Event loop | p99 <=50 ms, max <=250 ms, zero stalls >=1 s |
| GC | total pause duty <=2%; pause p99 <=50 ms, max <=250 ms; no increasing full-GC frequency across three consecutive ten-minute bins |
| Heap | >=12 valid post-warm-up forced-GC points; post-GC Theil-Sen slope <=1 MiB/min; last post-GC five-point median <= first five-point median +32 MiB; raw peak <= first measured five-minute median +96 MiB |
| RSS | peak <= first five-minute median +160 MiB; slope is recorded but diagnostic only |
| Queues | every current/max value <= its production advertised cap; zero queue-policy disconnects or pressure crossings in normal; in churn, only scheduled socket closes and zero pressure-policy closes |
| Tickets/history | no configured registry capacity exceeded; pending/retained tickets return to zero after every cycle and at drain; every retained journal/receipt/playback/membership/connection collection stays <= advertised cap |
| Identity | exact planned cardinality: normal has 8 admissions/0 churn; churn has 8 initial admissions, 7 reconnects with epoch exactly +1, 7 leaves, 7 replacement admissions with new membership/incarnation and initial epoch, and zero unplanned changes |
| Reliability | every accepted action has one stable receipt; every entitled consequence is FIFO/exactly once and ACK-retired; zero unknown, duplicated, cross-run, cross-membership, or stale-epoch retirement |
| Isolation | non-target clients have uninterrupted input/ACK progress and no epoch/rebase change; owner-private markers never appear outside their owner |
| Traffic | uncompressed application traffic is measured, not hidden; <=2.5 MB/s aggregate steady eight-player full-JSON regression ceiling and no client exceeds 2x cohort median outside its scheduled recovery window |
| Recovery | each reconnect/replacement aligned by `cycle+20s`; client count returns to eight within 15 s; final ten-minute churn window satisfies the steady cadence/queue gates |
| Cleanup | zero clients/connections/bound or closing states/queues/tickets; before authority shutdown only the adapter liveness timer plus explicitly enumerated soak sampler resources may remain; after sampler and authority shutdown every owned timer, observer, histogram, PID, port, handle, profile, and registry is gone |

The traffic ceiling reflects the current measured full-JSON loopback baseline
(about 1.93 MB/s at eight), not the 64 KiB/s/player shipping target. Crossing
64 KiB/s/player is therefore recorded as product debt, not a surprise soak
failure. Compression, AOI, binary deltas, and hosted egress remain later work.

## Evidence and artifact bounds

Create `tests/screenshots/multiplayer-soak-<timestamp>-<profile>-<seed>-<hash>/`
with immutable, exclusive-create files:

- `manifest.json`, `schedule.json`, `summary.json`, `cleanup.json`;
- `authority-health.jsonl`, `runtime-windows.jsonl`, `client-ledger.jsonl`,
  `membership-ledger.jsonl`, `reliable-ledger.jsonl`, and
  `bounds-and-privacy.json`;
- first error/abort cause, stdout/stderr tails, HTTP method/path/status counts,
  and process/port ownership; and
- per-gate `PASS`/`FAIL`/`NOT_APPLICABLE_SHORT_RUN` with numerator,
  denominator, threshold, and source records.

Cap each JSONL at 16 MiB and 25,000 records; cap stdout/stderr at 2 MiB each;
do not retain every state/input frame: keep per-minute counters plus at most
10,000 identity-bearing or sampled normalized facts per raw client. Cap the
complete smoke, normal, and churn directories at 32, 64, and 96 MiB
respectively. On nearing a cap, retain aggregates and the first/last 500
records but mark the run RED for evidence overflow. Never store frame payloads,
tickets, credentials, profile/membership/player/connection ids, IP addresses,
or private inventory values.
Use pilot labels, scheduler ordinals, salted per-run hashes, counts, and bytes.
Scan every artifact for seeded secret markers before acceptance.

HTTP evidence must classify every call by method/path/status and reject unknown
or debug routes. Bind listeners to loopback on OS-assigned/free verified ports;
record actual ports and ownership. Cleanup is signal-safe and idempotent: stop
issuance, settle active cycle work, close clients, collect final diagnostics,
stop the soak sampler timer, histogram, and GC observer and emit one final
diagnostics-cleanup record, then stop the authority, close helper/control
listeners, verify ports reusable, and record stable PID disappearance. Cleanup
failure overrides every other pass.

## Interruption and continuation

Write a bounded checkpoint atomically every minute with scenario identity,
schedule hash, last completed barrier, ledgers' cumulative counts, sampler
window, and owned PIDs/ports. A process, Codex, machine, or limit interruption
does **not** permit stitching two time series or continuing a canonical timer.
The interrupted artifact is finalized `ABORTED`, cleanup runs from its ownership
record, and orchestration may restart the entire same profile from `t=0` with
the same seed after the interruption clears. Checkpoints are forensic and
cleanup aids, not resumable soak credit. Never overwrite an abandoned artifact.

## Atomic implementation and acceptance order

1. **Diagnostics prerequisite** — opt-in event-loop/GC sampler, bounded health
   schema, default-off and cleanup tests. Landed at `b7d262d` as
   `L0: expose bounded soak runtime diagnostics`.
2. **PR smoke** — parameterized eight-client soak cohort, deterministic
   schedule compiler, default-immediate named-event ACK predicate, ledgers,
   caps, abort/checkpoint, privacy and cleanup.
   Run the focused smoke twice with identical schedule hashes plus
   `npm run test:multiplayer-network`. Commit `Tests: add deterministic
   eight-player soak smoke`.
3. **Normal canonical run** — run once from committed clean HEAD, independently
   audit the immutable artifact, then commit docs-only acceptance. Do not edit
   thresholds to fit the run; fix a causal defect and rerun from zero.
4. **Churn canonical run** — run once from the accepted normal baseline,
   independently audit the immutable artifact, then commit docs-only acceptance.
5. Only a later, separately authorized lane may add concurrent-match packing,
   Linux packet/browser, WAN/WSS/TLS-edge, hosted, or 24/48/96 claims.

Owned implementation files should remain narrow: one new fixture, one reusable
cohort/helper, two focused test wrappers if the manifest requires separate
durations, manifest/package entries, and the minimal runtime sampler. Do not
change gameplay, queue limits, timeout policy, projection cadence, or identity
semantics to make a soak pass.

## Runtime and local cost

- PR smoke twice plus focused regressions: about 20--30 minutes.
- Canonical normal including drain/audit setup: about 55--70 minutes.
- Canonical churn including drain/audit setup: about 100--120 minutes.
- Full staged local evidence: roughly 3--4 wall-clock hours, serially.

Provider cost is **$0** on GregBot; the cost is local CPU time, about 2.5 hours
of canonical authority occupancy plus implementation/audit time and at most
192 MiB of retained canonical artifacts before later pruning. These local raw
WebSocket results must not be extrapolated into WAN quality, hosted cost, TLS
edge behavior, packet mechanics, public readiness, or heavy-sim capacity.

## PR-smoke status — accepted

The deterministic machinery stage is independently accepted through `df6ea4b`.
Two clean six-minute artifacts,
`multiplayer-soak-2026-07-12T202149588Z-pr-smoke-08A04E01-62e806c96537` and
`multiplayer-soak-2026-07-12T202805064Z-pr-smoke-08A04E01-62e806c96537`, share
the exact schedule hash
`62e806c96537e432eaafa7aa6af31f49cb4547e9e8e2d2aaeb3e6522745f5d41`.
Both close eight-client topology, one logical authority for the match,
reconnect and replacement membership changes, exact FIFO consequence/delivery/
event-ACK retirement, private isolation, diagnostics, bounds, classified HTTP,
ABORTED cleanup, process/port ownership, and final teardown. The complete
multiplayer-network lane passes all 12 suites.

Traffic is a watch item: both runs passed the 2.5 MiB/s aggregate full-JSON
smoke ceiling, while the first run's busiest included minute reached about
98.4% of that ceiling. The smoke therefore validates machinery, not the 64
KiB/s/player product target. Heap/RSS slope, GC duty, long-window recovery, and
leak freedom remain `NOT_APPLICABLE_SHORT_RUN`; the 45-minute normal and
90-minute churn profiles are still unrun and own those claims.
