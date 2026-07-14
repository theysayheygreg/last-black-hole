# S22 Runtime Public-Projection Worker Pilot

Status: runtime pilot implemented, rejected for admission, and reverted after
red-team review; eight players remain closed.

## Boundary that was tested

There is still exactly **one dedicated logical authority per match/group**.
Every concurrent match gets another such authority. The two- or four-thread
pool tested here is internal pure compute capacity for one match, not another
gameplay authority and not a shared authority across matches.

Workers receive only clone-isolated normalized current/base public views plus
an opaque recipient work token and immutable match/authority/ballpark/
manifest/recipient/generation fence. They may calculate canonical public
keyframe and delta candidates. They never receive owner/private state.

The match authority retains all of the following:

- public-source projection and privacy stripping;
- owner projection and owner-private data;
- candidate semantic validation against the retained ACK base;
- public/owner pair selection and compression;
- ACK/base and retained-wire ledgers;
- authority/ballpark/manifest/recipient epochs and generation ordering;
- adapter queue ownership, socket send, and final publication commit.

The measured pilot exposed `LBH_SIM_WS_PUBLIC_PROJECTION_WORKERS` with `0`, `2`,
or `4` and defaulted to `0`. Timeout, backpressure, crash, malformed output, stale generation, base
change, disconnect, rebase, and shutdown all fail closed or use the exact
inline publication path. ACK ingestion for a recipient waits behind only that
recipient's active worker lease, preventing its authoritative base from
changing between worker issue and validation.

## Exactness and lifecycle proof

The pilot commits' registered deterministic suites prove byte- and semantic-identical output
against inline for 1/4/8, public-only clone/transfer accounting, mutation after
dispatch isolation, a bounded ACK lease, timeout/late-result rejection,
backpressure fallback, disconnect fencing, crash fallback, and bounded pool
shutdown.

This was safe enough to measure. It was not fast enough or small enough to
retain in production source.

## Product-path screening

All rows use clean commit `a0fc1d4`, S20 compression, isolated client
processes, profiler off, one match, and one dedicated logical authority. The
screening matrix used a 1 s warmup and 3 s window specifically as an early
rejection gate.

| clients | inline Hz / projection p95 / authority core | 2 workers | 4 workers |
|---:|---|---|---|
| 1 | 9.67 / 15.96 ms / 0.179 | 9.67 / 39.69 ms / 0.399 | 9.67 / 38.50 ms / 0.428 |
| 4 | 9.67 / 58.51 ms / 0.642 | 5.33 / 104.78 ms / 0.953 | 5.33 / 105.38 ms / 0.943 |
| 8 | 5.00 / 120.60 ms / 0.645 | 3.67 / 200.84 ms / 1.240 | 3.67 / 195.49 ms / 1.270 |

At eight, two workers timed out 102 of 232 jobs and four timed out 109 of 239
against the 80 ms deadline. Both therefore failed the zero-fallback correctness
gate in addition to cadence, latency, and CPU gates. Four workers did not
recover the clock.

The normal 5 s warmup/20 s two-worker repeat confirmed the rejection:

| clients | authority Hz | projection p95 | authority core | committed / issued | timeout fallback |
|---:|---:|---:|---:|---:|---:|
| 1 | 9.80 | 38.63 ms | 0.383 | 260 / 260 | 0 |
| 4 | 5.30 | 132.69 ms | 0.934 | 587 / 590 | 3 |
| 8 | 3.65 | 206.83 ms | 1.234 | 443 / 851 | 408 |

The worker's eight-player compute p95 is only 16.38 ms in the long run, but
round-trip p95 is 70.10 ms before the authority completes mandatory semantic
validation, owner work, pair selection, compression, and send commit. The run
also cloned 66.4 MB into workers and transferred 23.2 MB back. The synthetic
S21 batch result therefore did not represent the product clock: structured
clone, pool contention, event-loop scheduling, and duplicate authority
validation are the source-structure-supported explanation for the lost gain,
not separately stage-attributed profiler measurements.

No network-semantic concession was used. Deterministic parity proves exact
uncompressed state-pair bytes and semantics; compressed product captures prove
receiver convergence through the unchanged S20 codec path, but are not a
paired same-input compressed-wire comparison. Fallback is explicitly a
correctness failure for admission rather than a hidden success.

## Decision

Reject both two- and four-worker forms of this seam. Revert the production
runtime/publisher/adapter integration while preserving implementation commits
`92f1988`, `513d283`, and `a0fc1d4` plus immutable evidence. The disabled flag
still changed adapter scheduling, results were not bound to the assigned pool
row, and crashed rows were not replaced; a rejected slower feature does not
justify that maintenance and failure surface. The standalone S21 feasibility
harness remains available for research.
Do not spend a second long counterbalanced round on a candidate that already
misses the 9 Hz gate by 59%, exceeds the 100 ms projection gate by 107%, uses
more than one authority core, and falls back on 48% of eight-player jobs.

Eight remains rejected. This result changes no claim for 24/48/96, hosted
economics, heavy-sim sizing, or cadence policy.

## Next bounded lane

The next lane should remove repeated main-thread traversal rather than export
an already-normalized full public view. Design and test an immutable,
content-addressed **shared public body plus tiny recipient lineage envelope**:

1. build and prepare the public entity/world body once per authority beat;
2. keep `connectionEpoch`, `statePairId`, ACK base, and every owner field in a
   recipient-local envelope/ledger;
3. hash and diff the shared body without cloning or reparsing it per recipient;
4. preserve exact independent materialization, privacy, retransmission, and
   recipient-specific lifecycle fences;
5. compare inline S20 versus the new representation at 1/4/8 before reopening
   any worker or admission claim.

That is a protocol/data-representation lane, not permission to share mutable
authority state or create more than one gameplay writer.

## Evidence

Artifacts are under `evidence/state-pair-s22/`:

- screening inline aggregate SHA-256: `dc9d514af660952d2cd2924dfbcb26c67a5216aff380c47c28f4262619f4f264`;
- screening two-worker aggregate SHA-256: `b898d44effb1fb8bb8a21ef076b5dfb5b309d063df7ecd8361dc9085e8073b74`;
- screening four-worker aggregate SHA-256: `62046596839314e413d6d2f82dff1d0d1202ce38297a09c62dbac26e73fcfed0`;
- normal-window two-worker aggregate SHA-256: `48ad9ea292c911c015fd1f4e29d4b85e469b099614afcf150e069bd365427dc6`.

The stored short-screen `run.command` records the profile command but omits the
warmup/window/output environment overrides. Reproduction must use each
`run.json.config` plus the evidence README, not copy that command alone.
