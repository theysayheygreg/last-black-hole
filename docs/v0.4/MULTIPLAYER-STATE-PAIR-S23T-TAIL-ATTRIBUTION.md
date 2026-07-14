# S23T Public-Body Tail Attribution

Status: attribution complete. No release/default behavior changed. S23 remains
default-off, S20 remains the admitted one-through-four path, and eight remains
closed.

S23T reserves `S24` for the future 24-player scale track. It profiles one
dedicated logical authority per match; concurrent matches still multiply those
isolated authorities horizontally.

## Method

`LBH_S23T_PUBLIC_BODY_PROFILE=1` is accepted only with `NODE_ENV=test`, the
replication evidence guard, accounting capture, and the evidence-harness guard.
It cannot be enabled by a ticket, capability, content manifest, product config,
or release default.

The profiler keeps a 512-source-beat ring containing only ordinal recipient
slots and numeric timings/counters/process values. Exclusive synchronous timers
cannot nest. Socket callbacks and ACK ingestion are separately labeled async
wall and excluded from reconciliation. No diagnostic serialization, hashing,
clone, or size callback runs inside a timed span unless that operation is the
production stage being measured.

Clean commit `65e3676f01e398f1a2d41c50681d6686ac61b9e2` produced:

- A1, profiler on, population order 1 then 8;
- B, profiler off product control, population order 8 then 1;
- A2, profiler on, population order 8 then 1;
- one profiler-on S20 one-player comparator.

Every population used one authority process, one client process per recipient,
a five-second warmup, and an exact twenty-second measurement window.

## Method validity

B remains `NORMAL`, correct, clean, and at 9.35/9.85 Hz for eight/one. Its
83.08 ms eight-player p95 is 6.1% below the sealed S23 median 88.45 ms; its
28.47 ms one-player p95 is 0.7% above the sealed 28.26 ms median. Its p50 is
67.61/25.51 ms versus the sealed 72.47/25.38 ms median, within 6.7%/0.5%.

Profiler-on p50/p95 overhead versus B stays between -3.7% and +3.5% / -2.8%
and +3.8%; positive authority-core overhead is at most 0.018. Each profiler
capture retains 192--204 complete beats. Aggregate exclusive-stage
reconciliation is 99.15--99.20%, and unattributed p95 is 0.26--0.85 ms, below
1% of outer p95 in every capture.

## Attribution

The leading bounded family is **public source/body preparation**:

1. public source/core construction and source wire validation;
2. source/body normalization plus allowlist/source-bound validation;
3. source/body/structural canonical encoding and hashes.

At eight its p95 is 43.67 ms in A1 and 44.36 ms in A2, a 1.6% repeat
difference. Those values are 136% and 122% of the measured 32.19/36.26 ms
excess above the 50 ms product gate. At one, its p95 is 16.25/15.67 ms versus
0.80 ms in the S20 comparator; the added 15.45/14.87 ms explains 117%/120% of
S23's 13.19/12.37 ms one-player p95 regression. Savings elsewhere partially
offset that family, which is why its contribution can exceed 100%.

The most important repeated operation inside that family is per-recipient
canonical source validation over the shared public frame plus owner frame.
S23 builds one body per source beat, but it still proves the large public source
again while validating each recipient's atomic source pair. This is distinct
from recipient-local owner truth, ACK lineage, and final envelope work, which
must remain isolated.

Other eight-player p95 rows are smaller: cohort lookup/delta/size serialization
is about 14--15 ms, legacy placeholder/owner publishing about 12 ms, envelope
serialization/retention about 12--13 ms, owner source/preparation about 4 ms,
compression about 1 ms, and synchronous queue/send work about 2 ms. Async
socket callback latency is not CPU attribution and is not summed.

GC is not the leading cause. Eight-player GC p95 is 0.45/0.52 ms, p99
1.00/1.18 ms, with maxima 4.66/4.14 ms; 502 of the retained 512 events in each
capture are minor collections. RSS high-water is 141,967,360/142,344,192 bytes,
heap-used high-water 47,273,384/45,993,880 bytes, and ArrayBuffer high-water
2,654,369/2,187,695 bytes. The fixed rings and captures show no unbounded
profiler retention.

## Decision

Exactly one implementation lane is justified: **S23P prepared public-source
proof**. Hoist one immutable, normalized, source-sized and canonically proven
public body preparation before the recipient loop, then validate only the
recipient-local owner source and its binding against that unforgeable same-beat
proof. Do not share owner data, recipient identity, ACK/base choice, pending or
retired records, compression state, queue/send state, or commit authority.

S23P must remain default-off until exact semantic/privacy/adversarial parity and
the unchanged 50/70 ms product gates pass in counterbalanced profiler-off
evidence. Do not add workers, relax cadence/tail gates, promote S23, start the
S24 high-count track, or model hosting costs from S23T.
