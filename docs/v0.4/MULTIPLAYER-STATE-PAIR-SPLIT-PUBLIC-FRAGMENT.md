# Split Public-Fragment Eight-Seat Terminal Negative

Status: **rejected at the short abort screen; implementation fully reverted.**

This was the final bounded low-count replication experiment after S23P. It
asked whether one lossless public fragment built once per authority beat plus
recipient-local owner overlays could admit eight simultaneous clients without
changing gameplay authority, cadence, transport, AOI, workers, or precision.

The topology remained one logical gameplay authority for one match/group.
Concurrent matches multiply isolated authorities horizontally; this never
meant one global authority for the whole game or one paid VM per match.

## Preserved prototype proof boundary

Historical implementation commits `2642633`, `255a140`, and `c9d52da` added
the codec, match-local fragment authority, and default-off runtime integration.
Focused prototype tests passed the intended structural claims: one exact public
fragment `Buffer` across eight recipient queues, recipient-local overlays,
either-order atomic client reconstruction, ACK/retransmit/recovery mechanics,
and unchanged S20 fallback when the capability was absent.

Those are focused-test claims only. They are not production semantic, privacy,
pressure, or admission proof. Post-screen red-team review found high risks in
fragment retention, mutable `Buffer` ownership, delta-schema/privacy validation,
and replaceable-queue recovery. These are reasons the unshipped prototype was
reverted, not observed exploits, privacy leaks, or screen failures.

The prototype and a post-screen closure patch were preserved in history, then
explicitly reverted:

| Historical slice | Commit | Revert |
|---|---|---|
| codec prototype | `2642633` | `5189833` |
| match-local fragment authority | `255a140` | `d26f590` |
| runtime/client/harness integration | `c9d52da` | `642452f` |
| post-screen closure attempt | `a3f67d9` | `e696e08` |
| WIP closure/evidence draft | `68d2826` | `3658219` |

No split-fragment capability, codec, authority, runtime path, or focused
prototype suite remains in live source. The negative-evidence validator proves
the raw artifact, exact revert targets, restored pre-prototype tree, declared
abort boundary, historical instrumentation cause, and live-source absence:

```sh
node tests/split-public-fragment-terminal-negative.cjs
```

## One eight-client short screen

The only screen ran at implementation commit
`c9d52dac492293976ff6974e002f4b84847df763` with one match-local authority,
eight isolated client processes, 2 seconds of warmup, and one exact 3-second
window. The immutable artifact is under
`docs/v0.4/evidence/split-public-fragment-screen-c9d52da/`; its composite
SHA-256 is
`35fdbe0a00e6e3f2ee3e576685c4472466bc8dc8373634e5dd64e7cc9bd6a9a9`.

| Measure | Result | Precommitted boundary | Disposition |
|---|---:|---:|---|
| receiver cadence | 9.6667 Hz | >=9 Hz | pass |
| projection/publish p95 | 55.9045 ms | operator-provided pre-screen abort above 55 ms | **terminal fail** |
| authority CPU | 0.510 core | <1 core | pass |
| worst recipient mean downlink | 49,386.7 B/s | <=64 KiB/s | pass |
| one-second recipient-window p95 | 49,922 B/s | <=80 KiB/s | pass |
| overload | `NORMAL` | `NORMAL` | pass |
| observed queue transition | none | none | pass |
| observed recovery request | none | none | pass |
| observed client error | none | none | pass |

The 55.9045 ms p95 independently exceeded the operator-provided pre-screen
`>55 ms` abort threshold. The raw artifact does not itself encode that
threshold; the terminal validator proves the declared comparison, not the
threshold's precommit chronology. The crossing alone rejected the experiment.
No sealed 20-second capture, candidate rerun, or full-network validation was
permitted after the abort.

The raw artifact's logical-pair count invariant is invalid instrumentation, not
a semantic correctness failure. The first harness classified the public
fragment and owner overlay physical wires as two logical state-pair deliveries,
so it reported 20 authority accepts/s against the configured 10 Hz publication
rate while receivers published at 9.6667 Hz. The raw flag is retained unchanged
but is unusable for correctness. It is not cited as a failure and was not used
to rerun or rescue the candidate.

## Terminal decision

- S20 remains the admitted replication path for one through four players.
- Eight-player v0.4 admission is closed; the product cap remains four.
- The low-count replication optimization staircase is complete. S23 and S23P
  remain live default-off research paths, not admitted product paths;
  split-fragment is historical only and absent from live source.
- S24 remains terminal/not proven. Nothing here supports 24/48/96, hosted,
  fleet, WAN, AOI, or heavier-sim capacity claims.
- Exactly one next phase is selected: hosted identity, match placement, hosting
  cost, and unit economics for the admitted four-player product path.

Any future eight-player attempt requires a new version decision and a
materially different architecture hypothesis, not another step on this
staircase.
