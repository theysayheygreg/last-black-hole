# Split Public-Fragment Eight-Seat Terminal Experiment

Status: **rejected at the short abort screen; no sealed capture was run.**

This was the final bounded low-count replication experiment after S23P. It
tested whether one lossless immutable public fragment could be built once per
authority beat, reused as the exact same `Buffer` across eight recipient
queues, and paired with small recipient-local owner overlays. It did not add a
second gameplay writer, lower the simulation or replication cadence, add AOI,
move owner state to workers, change transport, or use lossy quantization.

## Authority and capability boundary

`state-pair-split-public-fragment-v1` is negotiated only when the complete S20,
S23, and S23P dependency chain is also negotiated. It defaults off and requires
`LBH_SIM_WS_SPLIT_PUBLIC_FRAGMENT_V1=true`. S20 remains byte- and behavior-exact
when the capability is absent.

One authority object belongs to one live match/group and remains the only
logical gameplay writer. Concurrent matches multiply isolated authority
objects horizontally; this design never means one global authority for the
whole game and never implies one paid VM per match.

The experiment's fixed-schema binary fragment and overlay envelopes are
canonical, lossless, Brotli-q1 compressed, length-bounded, SHA-256 bound, and
public-privacy validated. Their shared Buffer identity is an authority-owned
contract; the adapter verifies exact wire digests before queueing. A fragment
or overlay alone never publishes client state.
The client accepts either arrival order and commits only after fragment,
overlay, public-body lineage, owner hash, privacy shape, and identity all pass.
ACK, retransmit, rebase, disconnect, pending, retired, and global-fragment
history are bounded.

## Focused proof

The implementation commits are:

- `2642633` — fixed-schema fragment/overlay codec and integrity/privacy proof;
- `255a140` — match-local fragment authority and exact eight-recipient Buffer reuse;
- `c9d52da` — ticket, welcome, manifest, runtime, queue, client, retransmit,
  harness, and default-off fallback integration.

Focused results before the screen:

- codec: 12 assertions, zero mismatch;
- authority: 38 assertions, one fragment object identity across eight recipients,
  zero per-recipient public traversal/composition;
- end-to-end runtime: 93 assertions, eight clients, fragment-first and
  overlay-first atomic reconstruction, ACK, retransmit, recovery, and two-beat
  keyframe/delta lineage;
- unchanged runtime-state-pair, ticket, wire, and queue suites passed.

## Short eight-client abort screen

The screen used one conventional match-local authority, eight isolated client
processes, 2 seconds warmup, and one exact 3 second window. Raw immutable files
are under:

`docs/v0.4/evidence/split-public-fragment-screen-c9d52da/`

The generated artifact composite SHA-256 is
`35fdbe0a00e6e3f2ee3e576685c4472466bc8dc8373634e5dd64e7cc9bd6a9a9`.
The artifact verdict is intentionally `FAIL`.

| Measure | Screen result | Abort boundary | Verdict |
|---|---:|---:|---|
| receiver cadence | 9.667 Hz | >=9 Hz | pass |
| projection/publish p95 | 55.905 ms | <=55 ms | **fail** |
| projection/publish p99 | 68.516 ms | observation; sealed gate would be <=70 ms | pass only as observation |
| authority CPU | 0.510 core | <1 core | pass |
| worst recipient mean downlink | 49,386.7 B/s | <=64 KiB/s | pass |
| one-second recipient-window p95 | 49,922 B/s | <=80 KiB/s | pass |
| overload | `NORMAL` | `NORMAL` | pass |
| queue/high-water/recovery/client errors | zero | zero | pass |

The raw artifact also reports authority cadence as 20 Hz and fails the
authority/receiver count-delta invariant. That is not a 20 Hz simulation claim:
the first harness revision classified both the public fragment and owner
overlay as logical `statePair` deliveries. The post-screen closure patch gives
the fragment its own accounting class so one owner overlay represents one
logical atomic pair. Per the precommitted abort contract, this instrumentation
repair was not used to rerun or rescue the candidate. The independent 55.905 ms
p95 failure already closes the experiment.

The retained default-off code has one explicit pressure caveat: a delta names
the immediately prior global public fragment. Replaceable queue coalescing can
drop that predecessor, in which case the client requests recovery and the next
authority beat becomes a global keyframe. The zero-pressure screen did not
exercise that branch; it is not an eight-player admission claim.

## Decision

- Do not run the counterbalanced 5 second warmup plus exact 20 second sealed
  evidence. The short screen crossed a hard stop.
- Do not promote the capability or admit eight players in v0.4.
- Keep S20 as the product replication path for one through four players.
- Retain the default-off code and negative evidence as bounded research
  scaffolding; it is not release configuration.
- Stop the low-count replication staircase. Do not infer hosted, fleet,
  heavier-sim, AOI, or 24/48/96 capacity from this screen.

Exactly one next lane remains: productize and internet-shape the already
admitted four-player S20 path. Any future eight-player attempt requires a new
version decision and a materially different hypothesis, not another tweak to
this staircase.
