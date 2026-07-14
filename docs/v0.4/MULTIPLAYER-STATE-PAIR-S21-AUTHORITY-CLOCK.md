# S21 Eight-Player Authority Clock Profile

Status: diagnostic attribution complete; public-only projection-worker
feasibility is positive enough for one bounded runtime pilot. Eight players are
still rejected for product admission.

## Authority boundary

There is one dedicated **logical single-writer authority per live match/group**.
Concurrent matches multiply that authority horizontally: 100 concurrent
matches mean 100 isolated match authorities scheduled across the regional
fleet. A worker pool inside one match authority may compute pure bytes, but it
does not become another authority and never owns gameplay state.

S21 did not change product behavior. The stage profiler is normally off, and
the worker implementation is a hermetic feasibility harness. The authority
still owns the sim tick, owner-private projection, exact ACK/base and retained
wire ledgers, authority/ballpark/recipient epochs, result ordering, mixed-pair
selection, compression, queue ownership, socket send, and commit.

## Product truth and A/B/A diagnostic capture

The sealed counterbalanced S20 runs remain product truth: four is admitted
when compression is negotiated, while eight remains `DILATED` at 5.00/4.90 Hz
with 119.94/129.17 ms projection/publish p95. S21 did not rerun admission or
replace that result.

S21 instead captured profiler-on A, profiler-off B, then profiler-on A on the
same Apple M4 host. These runs are deliberately not compared as a causal
product A/B because instrumentation is expensive.

| Capture | Clean commit | 1-player Hz / p95 ms | 4-player Hz / p95 ms | 8-player Hz / p95 ms | 8-player authority core |
|---|---|---:|---:|---:|---:|
| profiler A1 | `995d003` | 9.85 / 22.37 | 5.90 / 86.00 | 3.75 / 188.03 | 0.747 |
| profiler-off B | `bf54903` | 9.75 / 14.60 | 8.85 / 53.92 | 4.95 / 123.20 | 0.650 |
| profiler A2 | `ec515a8` | 9.85 / 22.27 | 5.90 / 85.76 | 3.75 / 187.29 | 0.743 |

The repeat A reproduces the first A closely. B demonstrates the profiler's
material overhead and is only a same-source control; the two counterbalanced
S20 rounds remain the admission record.

## Eight-player critical path

At eight in profiler A2, sim-tick p95 is only 1.41 ms while
projection/publish is 178.56 ms p50 and 187.29 ms p95. There is no queue,
backpressure, or socket-buffer accumulation. The authority clock is limited by
serial per-recipient projection/publish work, not by the sim tick or network
drain.

The profiler rows are not universally additive. `pairChoiceFallback` is an
inclusive parent around proof, size, and composition. JSON timing can occur
inside opaque publisher paths. Async socket-send callback latency overlaps the
serial loop and is not authority CPU. With those constraints, the stable A2
means per accepted eight-recipient beat are:

| Stage group | Mean ms/beat | Interpretation |
|---|---:|---|
| public core + public projection + public delta candidate | 75.06 | dominant pure public, per-recipient work |
| owner source + owner projection + owner delta candidate | 5.37 | authority-private; keep local |
| raw snapshot, manifest, hashes, inclusive pair choice, compression, accounting, queue/send call, ACK | 7.05 | authority-owned fixed/commit work |
| JSON serialization row | 13.85 | diagnostic row; nesting prevents simple addition |
| socket-send callback | 618.67 | overlapping async wall latency; never add to CPU |

Compression is 0.64 ms/beat, adapter enqueue 0.91 ms/beat, socket send calls
0.30 ms/beat, and ACK ingestion 0.09 ms/beat. Optimizing those cannot recover
the missing eight-player clock. The first useful isolation boundary is pure
public keyframe/delta construction.

## Public-only worker feasibility

The hermetic corpus contains 234 jobs across 1/4/8 recipients, 18 beats, mixed
ACK bases, 19 recovery jobs, and 27 recipient-incarnation churn jobs. Each job
matches the production publisher's positional byte count, digest, decoded
frame, and pair selection: 936 exact comparisons, zero mismatch.

Workers receive only structured-clone-isolated public current/base input plus
identity and an issued fence. The synthetic harness's expected-output oracle
proves parity; it is not the runtime trust mechanism. Workers return canonical
public keyframe/delta `ArrayBuffer`s.
Owner input never enters a worker. The authority reconstructs the owner lane,
chooses the mixed pair, compresses it, verifies exact output, checks the live
issued-request fence, and commits in order.

Three Latin-square topology orders, with four alternating-recipient-order
rounds in every cell, produced the following synthetic eight-recipient batch
p95 ranges:

| Topology | Batch wall p95 range | Scope |
|---|---:|---|
| inline | 66.24–68.57 ms | public compute + authority finalization serially |
| two workers | 37.30–37.45 ms | public work isolated; authority finalizes |
| four workers | 27.73–29.33 ms | public work isolated; authority finalizes |

The worker result transfers 38,189 public bytes p95 plus 473 bytes of cloned
metadata in this fixture; inbound public JSON size proxy is 57,333 bytes p95.
Across each 52-job Latin-square cell, two workers use 0.343–0.347 worker
core-seconds plus 0.050 authority-finalization core-seconds; four use
0.413–0.426 plus 0.049–0.051. The worker-count-multiplied V8 heap upper bounds
are 32.5–33.9 MiB for two and 61.7–62.2 MiB for four. Sampled whole-process RSS
high-water is 202.6–216.6 MiB for two and 256.6–267.0 MiB for four.
The artifact also records inbound public clone-proxy bytes, main-thread input-
preparation/dispatch wall and CPU, and whole-process RSS high-water. These are
short synthetic-run observations. Dispatch CPU p95 is 4,237–4,745 microseconds
per population batch, but includes the harness's JSON size-proxy work and is
not raw structured-clone CPU. Scheduler/message-delivery CPU and native or
clone allocation attribution remain incomplete. They are feasibility
diagnostics and must not be used for packing or cost forecasts. The runtime
pilot must measure total authority-process CPU/RSS and clone cost.

The live issued-request test registry binds match, authority incarnation,
ballpark epoch, manifest, recipient incarnation, snapshot, tick, and work
generation. Actual delayed worker-pool tests reject stale-authority,
cross-match, duplicate, and out-of-order results; isolate post-dispatch host
mutation; and exercise ready handshake, backpressure, timeout, crash, graceful
drain, forced shutdown, and pending-request rejection.

## Decision and next lane

Eight remains closed. S21 proves neither a 9 Hz live runtime nor hosted/fleet
capacity, and makes no 24/48/96 or heavy-sim claim.

The next and only open lane is a **feature-flagged runtime public-only
projection-worker pilot inside one dedicated logical authority per match**:

1. Dispatch clone-isolated public current/base inputs only; owner-private data
   never crosses the worker boundary.
2. Bind every request to the live authority, ballpark, manifest, recipient,
   snapshot, tick, and latest request generation. Validate the returned public
   lineage/hashes against current authority state without a precomputed test
   oracle. Drop late, duplicate, superseded, stale, or cross-match results
   before owner construction, compression, or any ledger/queue mutation.
3. Keep owner construction, pair choice, compression, ACK/retained-wire
   ledgers, admission, ordering, queue ownership, and socket commit on the
   authority thread.
4. Retain the current inline path as a one-switch fallback. Worker crash,
   timeout, overload, or drain must fail back without changing semantics.
5. Run counterbalanced profiler-off 1/4/8 product evidence. Admit eight only if
   correctness is exact, all recipients sustain at least 9 Hz in `NORMAL`,
   projection/publish p95 is at most 100 ms, traffic stays within the S20 gates,
   and total CPU/memory/clone cost remains bounded.

Do not move owner data or compression into a worker, lower cadence, start
hosted economics, or extrapolate high-count capacity from the synthetic win.
