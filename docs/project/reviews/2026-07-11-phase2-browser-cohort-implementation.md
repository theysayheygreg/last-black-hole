# Phase 2 Four-Browser Cohort Implementation

> Decision-ready implementation contract for
> `codex/v0.4-multiplayer-architecture`, 2026-07-11. This covers seeded Layer A
> application-frame evidence plus the bounded T0 Chrome transport smoke. It
> does not claim TCP packet loss, WAN, TLS, proxy, or netem behavior.

## Decision

Build a new four-browser impairment runner rather than enlarging or importing
`tests/multiplayer-browser-journey.cjs`. Use the landed client and adapter
complete-frame seams, but inject them entirely from the test harness:

- Chrome DevTools response interception rewrites the one exact `src/main.js`
  SimClient construction site in memory, passing a scheduler installed by a
  pre-document script. The harness asserts the expected source marker and hash
  before rewriting and never writes a patched product file.
- The sim child launches with a guarded test-owned Node preload. The preload
  wraps the CommonJS adapter factory in that process and supplies the server
  scheduler. Normal sim launches do not load the preload.

Do not add a production query parameter, environment read, global hook, or
runtime impairment flag to `src/` or `scripts/sim-runtime.cjs`. A WebSocket
facade remains a fallback diagnostic tool, but it is not the canonical lane
because it bypasses the seams this phase just proved.

The first browser commit is an F0 PR-smoke scaffold. Add F1, F3, and F6 in
separate atomic commits. Canonical duration/cost gates remain closed until the
instrumentation prerequisite and the corresponding canonical runs pass.

## Claim boundary

The browser scheduler operates after Chrome has accepted or drained WebSocket
bytes and before LBH application handling. Report:

- `application-frame queued`, `released`, `omitted`, `duplicated`, or
  `delivered`;
- native WebSocket arrival separately from LBH application delivery; and
- F6 as a Layer A connection-close schedule.

Never call these facts packet loss, TCP reset, retransmission, congestion,
receive-window pressure, WAN latency, or WSS evidence. Those belong to the
proxy/netem/hosted slices.

## Files and ownership

The browser lane owns new files rather than the playable journey:

- `tests/multiplayer-network-impairment.cjs`: scenario registry, orchestration,
  gates, summaries, signal handling, and final cleanup verdict;
- `tests/network/multiplayer-browser-cohort.cjs`: isolated static/sim/browser
  lifecycle, normal menu admission, sampling, screenshots, HTTP oracle, and
  process/profile cleanup;
- `tests/network/browser-frame-impairment.cjs`: stable-slot decision compiler,
  pre-document scheduler/release pump, CDP response rewrite, and page evidence
  draining;
- `tests/network/sim-impairment-preload.cjs`: guarded adapter injection,
  downstream release pump, stable slot mapping, and redacted evidence;
- `tests/fixtures/network-impairment/phase2-browser-v1.json`: immutable scenario
  rules, seeds, durations, gates, and schema version;
- manifest/lane/package wiring for separate fast, PR-browser, and canonical
  commands.

Do not modify the scheduler kernel, playable journey, gameplay rules, protocol,
queue, or authority clocks. Any shared admission helper extraction waits until
the new contract runner exists and its behavior is stable.

## Stable decisions across fresh cohorts

Strict kernel replay fingerprints include payload hashes and runtime-generated
IDs, so they cannot be replayed unchanged across fresh browsers. Random action,
heartbeat, client, connection, and timestamp fields belong in evidence—not in
decision lookup.

The browser lane compiles decisions from this stable key:

```text
[scenarioVersion, scenarioId, pilotSlot, phase, direction, frameClass,
 localConnectionEpochOrdinal, streamOrdinal]
```

`pilotSlot` is the stable admission order `pilot-0..pilot-3`. Admission/warm-up
and active measurement use separate phases and ordinals so variable boot frame
counts cannot shift active faults. Reconnect increments the slot-local epoch
ordinal while retaining the slot.

The page consumes bounded precompiled decisions synchronously. The server
preload may use the seeded scheduler's PRNG and decision logic with stable
surrogate identity, but browser replay artifacts are the compiled decision
arrays plus their hash—not the kernel's strict payload fingerprint tape.
Exhaustion, unused required decisions, or ordinal divergence fails the run.
Actual semantic and payload hashes are recorded separately after release.

## Direction ownership

Each direction is impaired exactly once:

- browser pre-document scheduler: client to authority;
- server preload scheduler: authority to client.

The browser records native downstream arrival and LBH application delivery as
two timestamps but does not add a second downstream delay. Barriers and
terminal frames remain immediate on both sides. Fault activation begins only
after four aligned baselines and the declared clean warm-up.

All pages and the preload transition against one coordinator-selected future
wall deadline. Each converts it once to a local monotonic origin and records
actual start skew. Decision and release ordering uses monotonic time only.

## Scenario staging

### Commit A: F0 PR scaffold — implemented

- four fresh Chrome profiles join one fresh authority through normal host/guest
  menus;
- five-second PR warm-up, 20-second active window, ten-second recovery;
- continuous inputs plus at least two reliable pulse attempts per pilot;
- deterministic scheduler instrumentation enabled with no faults;
- exact-once/privacy/hot-HTTP/cleanup ledgers and evidence artifacts;
- PR gates use the F0 latency/cadence thresholds but make no memory-slope,
  canonical-duration, or WAN claim.

Acceptance requires one no-retry run from the committed clean HEAD plus a
separate SIGTERM diagnostic after all four pilots are admitted. Dirty-tree runs
remain explicitly diagnostic-only and cannot become immutable evidence.

### Commit B: F1 regional frame delay — implemented

- upstream `U(35,10)` ms in browser;
- downstream `U(55,20)` ms in server preload;
- no omission or duplication;
- verify configured decision ranges and report timer overshoot separately.

As with F0, immutable acceptance requires a no-retry run from the committed
clean HEAD. The PR profile measures from scheduler interception—not physical
release—so the reported input and reliable-consequence latencies include the
configured upstream application-frame delay.

### Commit C: F3 frame defense — implemented

Only `pilot-3` receives the declared input/delivery/action ACK omission,
event/action duplication, and bounded state/ACK release-window rules. Increase
stimulus until every required fault class has at least one seeded decision;
otherwise fail for insufficient stimulus. IDs and payloads remain unchanged.

The accepted PR-smoke implementation uses seed `0x0403AC11`, shared bounded
windows for upstream delivery/event ACKs and downstream state/input/action ACKs, and a
five-second recovery drain. It correlates the exact F3 pilot-3 input-ACK
timeout signature to seeded input omissions; that exception is not available
to any other scenario, pilot, or browser error. Dirty-tree runs remain
diagnostic and cannot replace the clean-HEAD evidence below.

Immutable F3 acceptance is
`tests/screenshots/multiplayer-impairment-2026-07-12T073844656Z-f3-frame-defense-4p-0403AC11-cf536a`
from clean commit `e949283`. It exercised every declared fault class, three
duplicated delivered event sequences consumed exactly once, bounded shared
reorder displacement of three, zero reconnects or pending work, and complete
process, port, profile, registry, scheduler, privacy, and pressure cleanup.

### Commit D: F6 Layer A close schedule — implemented

Invoke all four existing connection interruption hooks against one 100 ms
barrier. Every pilot must reach a new connection epoch, aligned baseline, and
new physically sent input ACK within ten seconds or an explicit terminal state.
No client may remain half-open. Proxy reset corroboration remains pending.

The PR-smoke implementation invokes the existing test interruption hook at
25 seconds on four streams proven open immediately beforehand. The 100 ms gate
measures browser hook-invocation skew, not physical socket-close or TCP-reset
timing. Recovered clients must finish on an open stream after a rotated epoch,
aligned public/owner baseline, physical baseline ACK, new physical input, and
covering input ACK. A deterministic regression separately locks the old-event
ACK versus fresh replay race found during diagnostic F6 work. Immutable F6
acceptance is
`tests/screenshots/multiplayer-impairment-2026-07-12T081612179Z-f6-all-flap-4p-0406F1A9-be754c`
from clean commit `6976a7f`. All four streams rotated from epoch one to two,
recovered in 62--66 ms after a 4 ms hook-invocation skew, finished open on the
stream transport, and passed exact consequence, privacy, pressure, and cleanup
gates. Physical socket-close, TCP-reset, proxy, WAN, TLS, and hosted evidence
remain pending.

### Commit E: T0 Chrome transport stall — implemented

T0 configures all four admitted Chrome profiles with the current experimental
CDP pair: `Network.emulateNetworkConditionsByRule` for browser traffic and
`Network.overrideNetworkState` for `navigator` state. The aggregate profile is
35 ms configured latency, 64 KiB/s upload, and 320 KiB/s download. Pilot 3 is
then configured offline for five seconds. Cleanup clears every rule, restores
online/unlimited state, and verifies `navigator.onLine` in every browser.

Chrome 150 stalled and queued the existing WebSocket during the offline gap;
it did not reliably close it. T0 therefore claims only a configured aggregate
Chrome shaping profile, an observed five-second zero-progress gap after a
250 ms guard, and bounded gameplay recovery. It does not claim a disconnect,
TCP loss, receive-window pressure, or reconnect. If the normal heartbeat later
rotates the socket, the runner accepts it only with hash-correlated CDP close,
new socket, handshake request, HTTP 101 response, and the full F6 authority
baseline/input proof.

The provisional local-smoke steady-state input-ACK p95 gate is 500 ms with at
least 100 post-exclusion samples per pilot. Pilot 3's interval from the offline
command through its settled recovery observation is excluded from that
steady-state percentile and reported separately as a recovery distribution.
The runner also proves exact causal matching for expected five-second input
timeouts, bounded rejected releases under one declared pressure crossing, zero
pending input/action work after the final drain, and full CDP/profile/process
cleanup. This 500 ms gate is a harness-regression threshold, not a product or
WAN SLO.

Canonical profiles retain the review's 15-second warm-up, declared active
duration, and 15-second recovery. PR profiles use the same scenario version,
seeds, and rules but shorter declared durations and must label every summary
`pr-smoke`.

## Metric ledger

Do not derive percentiles from 250 ms metric polling. Record events at their
actual boundaries:

- input first native physical send to application-delivered covering ACK;
- aligned public/owner application arrival cadence;
- native downstream arrival to LBH application delivery;
- first physical action send to semantic result and expected consequence;
- scheduler enqueue, decision, release, omission, and duplicate copy; and
- connection close schedule to new epoch + aligned baseline + new input ACK.

Snapshot age requires a monotonic offset estimate from clean warm-up heartbeat
samples. Retain the minimum observed local-wall-minus-server offset and preserve
raw cadence separately. Existing `lastSnapshotLagMs` is diagnostic only and
cannot satisfy the canonical age gate.

CDP WebSocket events corroborate native frame counts and bytes. Scheduler-copy
counts remain a separate application-delivery measurement. One-second `/health`
and process-memory samples are authority evidence, not client latency samples.

## Instrumentation prerequisite

Canonical F0/F1/F3 gates require two small production-neutral diagnostic
increments before the browser runner may claim them:

1. adapter-lifetime, privacy-safe worst-connection current/high-water values for
   socket buffered bytes, total/reliable/replay/inbound queue bytes, and pending
   physical/scheduled sends; and
2. bounded every-tick/every-projection duration distributions with explicit
   count, p50, p95, p99, max, capacity, and reset lineage in `/health`.

Sampling aggregate current values once per second is insufficient because it
misses short spikes and does not produce a tick distribution. A PR-smoke runner
may land before these counters only if its summary marks those gates
`unavailable` and makes no canonical pass claim.

Both prerequisites are now landed: adapter diagnostics retain privacy-safe
aggregate and worst-connection current/lifetime maxima, while authority health
reports bounded every-tick and every-projection rolling quantiles. The browser
runner must still prove it samples and persists these schemas correctly before
making a canonical scenario claim.

## Common gates

- exactly four unique profiles, memberships, and authority players share one
  run and aligned baseline;
- at least 100 input ACK and 100 aligned-pair samples per pilot for canonical
  latency gates, plus at least two reliable actions per pilot;
- every attempted action ID has exactly one semantic outcome; accepted pulse
  consequences match accepted pulse outcomes and are observed at most once;
- delivery, event playback, baseline, and action settlement ledgers remain
  distinct;
- every public/owner frame is privacy-scanned, not only the initial baseline;
- browser hot-path gameplay HTTP is zero; tagged `/health`, `/snapshot`, and
  `/events` oracle calls stay outside latency windows;
- no evidence contains tickets, credentials, full hello/welcome frames, private
  state, or raw profile/membership IDs; and
- missing samples, artifacts, required decisions, or cleanup proof fails.

Apply the numeric F0/F1/F3/F6 thresholds from the parent Phase 2 review to each
pilot, then use the cohort maximum. Aggregate percentiles never hide one bad
pilot.

## Evidence and cleanup

Each scenario writes an immutable run directory containing manifest, compiled
decision hash/arrays, decision/release JSONL, client and authority JSONL,
browser errors, sim stdout/stderr, summary/first failure, and host plus impaired
pilot 1280x800 recovery screenshots with SHA-256.

The manifest records commit/dirty state, scenario schema hash, profile, root and
derived seeds, stable slot-to-hashed-runtime-ID mapping, versions, ports, PIDs,
profile directories, monotonic bounds, and budgets.

One scenario owns a fresh sim, static server, four Chrome profiles, evidence
directory, session registry, and port set. Browser cohorts run sequentially
under a single lock. `finally` cancels pumps, clears scheduler tokens, closes
pages/browsers, removes profiles, terminates child process groups, closes
listeners, removes registries, and proves all PIDs/sockets/timers are gone.
Cleanup failure overrides a gameplay pass. No automatic retry may turn a failed
seed green; replay is an explicit diagnostic command.

## Lane shape

- `multiplayer-impairment-fast`: scheduler, adapter impairment, and SimClient
  seam contract suites only;
- `multiplayer-impairment-browser`: sequential four-browser PR profile;
- `multiplayer-impairment-canonical`: explicit canonical profile, scheduled or
  pre-hosted, never silently included in `full` or `multiplayer-network`.

The first browser implementation commit wires only the F0 PR scaffold. It must
finish comfortably inside a dedicated browser timeout, leave no process/profile
residue, and produce a replayable evidence directory before F1 work begins.
