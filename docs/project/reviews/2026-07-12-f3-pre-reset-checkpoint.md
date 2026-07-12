# F3 Pre-Reset Checkpoint

> Durable orchestration checkpoint at 2026-07-12 00:08 PDT for
> `codex/v0.4-multiplayer-architecture`. The Codex primary window resets at
> `2026-07-12T07:22:05Z`.

## Branch and committed baseline

The worktree target is `codex/v0.4-multiplayer-architecture`. Do not merge it
to v0.3 or `main`.

Latest committed evidence slices:

- `62a727e` — accepted F1 regional application-frame delay smoke;
- `a89ca91` — preload activation bound to the adapter process;
- `0fc95b6` — accepted F0 four-browser clean frame baseline;
- `4e99071` — privacy-safe adapter pressure maxima; and
- `564f5ef` — bounded authority tick/projection quantiles.

Accepted immutable evidence:

- F0: `tests/screenshots/multiplayer-impairment-2026-07-12T060905196Z-f0-clean-4p-0400C1EA-f8180d`;
- F0 SIGTERM cleanup diagnostic:
  `tests/screenshots/multiplayer-impairment-2026-07-12T061036997Z-f0-clean-4p-0400C1EA-aa5912`; and
- F1: `tests/screenshots/multiplayer-impairment-2026-07-12T063444319Z-f1-regional-4p-0401A511-55a85f`.

## F3 uncommitted scope

Commit C currently modifies only:

- `package.json`;
- `tests/fixtures/network-impairment/phase2-browser-v1.json`;
- `tests/network/browser-frame-impairment.cjs`;
- `tests/network/multiplayer-browser-cohort.cjs`; and
- `tests/network/sim-impairment-preload.cjs`.

Do not commit this scope until its current diagnostic passes and the red-team
finishes the semantic/privacy/cleanup audit.

Legacy compiled decision hashes remain unchanged:

- F0: `41c68e...`;
- F1: `c4ce21...`.

## Latest completed F3 evidence

Artifact:
`tests/screenshots/multiplayer-impairment-2026-07-12T070333290Z-f3-frame-defense-4p-0403AC11-32bd4d`.

The protocol remained healthy: pilot 3 stayed stream-open at epoch 1 with zero
reconnects and zero pending inputs, actions, or scheduler work. Authority stayed
NORMAL with no queue-policy events.

Every required real fault class received stimulus:

| Pilot 3 class | Decisions | Faults observed |
|---|---:|---:|
| input | 523 | 23 omitted |
| delivery ACK | 74 | 12 omitted |
| event ACK | 46 | 6 duplicated |
| action ACK | 27 | 7 omitted, 2 duplicated |
| event | 59 | 4 duplicated |
| shared upstream reorder | — | 16 reordered blocks |
| shared downstream reorder | — | 260 reordered blocks |

Maximum bounded displacement was three. State and ACK reorder groups now share
stable runtime tape identity; cancellation has an explicit terminal ledger and
pending reorder blocks drain to zero.

The artifact failed only because one browser console error reported an input
ACK timeout caused by a seeded omitted input. The current code narrows the
expected-fault allowance to pilot 3, F3, the exact timeout, and a count no
greater than observed input omissions. Every other browser error remains fatal.
A corrected dirty diagnostic is running at checkpoint time.

## Returned and pending lanes

Returned:

- implementation fixed ACK-kind stream identity, F0/F1 tape compatibility,
  shared bounded reorder groups, action over-stimulation, cancellation ledgers,
  and recovery drain;
- red-team confirmed the latest completed artifact exercised every real fault
  and that protocol/reconnect/queue behavior was healthy.

Pending:

- corrected F3 diagnostic result and artifact path;
- red-team audit of semantic outcomes, consumed-event dedupe, stable IDs,
  privacy, latency gates, and cleanup;
- F0 and F1 regression browser runs;
- validation plus full `multiplayer-network` regression;
- atomic Commit C; and
- one clean-HEAD, no-retry F3 run for immutable acceptance.

## Exact next action after reset

1. Collect the active diagnostic result; do not automatically retry a failure.
2. If green, inspect fault counts, runtime tape hash/contiguity, semantic
   exactly-once ledgers, privacy, pressure, and every cleanup flag.
3. Obtain a red-team approve-for-commit verdict.
4. Run F0 and F1 regressions, validation, `npm run test:multiplayer-network`,
   syntax/JSON checks, and `git diff --check`.
5. Commit only the five-file F3 scope plus its journal/review status.
6. Run `test:multiplayer-impairment:f3` once from clean HEAD with no retries and
   audit immutable provenance before calling F3 accepted.

Terminology remains `application-frame omission`, `duplication`, and bounded
release order. This checkpoint makes no TCP packet-loss, retransmission, WAN,
TLS, or hosted claim.
