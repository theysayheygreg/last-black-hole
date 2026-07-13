# Independent S7 Review

Independent review on clean branch `codex/v0.4-multiplayer-architecture` at
`0b0becf` accepts the S7 evidence method and upholds product rejection. No
tracked file changed during review.

The fresh review artifact is `review/`, composite SHA-256:

`023acc4dd693ef27ee8a2cd01abaa5decad263b4505a4b97e78148148c13c1d6`

Artifact validation exits `0`; product admission exits `2`. A separately
corrupted checksum copy exits `1`, proving invalid evidence is distinct from a
valid product rejection.

## Fresh result

| Recipients | Actual mean | Actual p95 / p99 | Cadence | 10 Hz mean | 10 Hz p95 / p99 | Projection / event-loop p95 | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 152,003 B/s | 162,570 / 162,891 B/s | 9.70 Hz | 156,689 B/s | 167,584 / 167,912 B/s | 18.92 / 33.98 ms | byte guards fail; correctness, clock, NORMAL pass |
| 8 | 96,288 B/s | 107,817 / 115,424 B/s | 4.60 Hz | 208,754 B/s | 233,833 / 250,328 B/s | 144.89 / 158.47 ms | bytes, cadence, clock, NORMAL fail; correctness passes |

One-player churn passes correctness, clock, and `NORMAL`. Eight-player churn
passes correctness but fails clock and `NORMAL`. ACK rejects are exactly zero
in all four fresh review scenarios.

Prepared projections are enabled, the S5 stage profiler is disabled, and the
bounded event-loop monitor is enabled. Raw-WebSocket application accounting
uses exact callback-accepted compact JSON. The 10 Hz model scales only accepted
state-pair bytes and leaves measured non-state traffic unchanged. WebSocket,
TLS 1.3, and IPv4/TCP overhead remain separate modeled sensitivity views and
are explicitly excluded from admission.

The fresh normal samples contain 194 and 92 accepted frames. Both reconcile
exact encoded pair bytes to public, owner, and outer lanes; public operation,
owner component, and update lexical views also reconcile. Raw strings are
cleared before evidence write and no owner values persist. The S4 canonical
composite checksum and S6 analysis checksum independently match their bound
references.

## Canonical ACK rejection

Canonical normal-one records 3,522 accepted ACKs, one rejected ACK, and 3,522
base advances. Its client records two `base-mismatch` recoveries after frames
3264 and 3525. The publisher's preserved keyframe reasons include one
`client-recovery-request`, but do not include an `ack-rejected:<reason>` entry.
The current publisher counter does not retain the rejection reason or frame,
and its transient force reason can be cleared before evidence collection.

Therefore this evidence cannot classify the reject as a product liveness/base
defect versus a deliberate stale or duplicate ACK that is counted too broadly.
Correlation with recovery exists, but causation is unproved. The exact-zero
contract correctly keeps canonical product correctness false.

Root-cause ownership belongs to the authority delta publisher and WebSocket
adapter recovery/ACK integration. The next diagnostic should add a bounded,
privacy-safe ACK rejection-reason histogram plus rejected frame id, current
pending range, and recovery/rebase ordering, then reproduce a long normal-one
window. Do not relax admission while investigating.

## Verdict

Prototype one bounded schema cleanup plus explicit field-cadence slice first.
Compact-codec lexical bytes are an upper-bound proxy, not a forecast. AOI lacks
distance/visibility proof in this workload, and a cadence cap conflicts with
the configured 10 Hz product contract. Preserve S6 prepared projections and
rerun the same S7 product gate after the payload prototype.
