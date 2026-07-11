# v0.4 Multiplayer Orchestration

> Durable handoff for the v0.4 work on
> `codex/v0.4-multiplayer-architecture`.

## Goal Prompt

Create and orchestrate a v0.4 multiplayer architecture program for Last
Singularity that:

- produces a playable 4–8-player path compatible with v0.3 Ballpark and the
  EVE-inspired sim/client split;
- defines account, profile, session, run, player, connection, authority,
  reconnect, and settlement identity/data;
- deeply compares true authority-free P2P, player-hosted authority, and
  dedicated hosted authority using historical evidence and quantitative
  network budgets;
- costs centrally hosted authority and $4.99 unit economics at 1K, 10K, 100K,
  and 1M copies;
- distinguishes one logical authority per concurrent match from one physical
  host, and models horizontal fleet packing;
- forecasts one heavier match with 24, 48, and 96 simultaneous clients across
  light, representative, and heavy simulation envelopes;
- turns findings into strong decisions, Greg-owned product questions,
  falsifiable spikes, harness gates, and phased implementation work;
- preserves Art Is Product, Movement Is the Game, sim-owned consequences,
  coordinate ownership, Three presentation boundaries, and 60 fps clients.

## Current Checkpoint

- Branch: `codex/v0.4-multiplayer-architecture`.
- Base: the latest v0.3 Ballpark integration line has been merged forward.
- Integrated docs: `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`,
  `OPEN-DECISIONS.md`.
- Core research, audits, high-count measurements, performance/architecture,
  and hosting-cost memos are under `research/`.
- Full manifest-driven core harness passed after the integrated architecture
  and v0.3 forward merge.
- Phase 0 implementation has landed 1/4/8 authority evidence, membership and
  connection epochs, reconnect fencing, owner-private projection, public-only
  history, authenticated idempotent settlement, and two multiplayer lanes.
- Phase 1 scaffolding has landed a strict JSON frame codec, bounded/coalesced
  send queue, bounded single-use admission/resume ticket registry,
  `multiplayer-network` lane, and same-process WSS adapter plan.

## Completed Independent Lanes

- Ballpark-compatible authority and transport design.
- Multiplayer identity, authentication, persistence, and settlement model.
- True P2P historical study, NAT/relay analysis, and 4/6/8 budgets.
- Hosted vendor and $4.99 unit economics model.
- Independent architecture and cost red teams.
- Live 4/8/24/48/96 synthetic current-authority measurements.
- 24/48/96 performance and heavier-sim model.
- 24/48/96 single-authority architecture pressure test.
- High-count vendor/packing/egress/compute cost model.
- Phase 0 membership/privacy/settlement implementation and deterministic
  1/4/8 baseline.

## Continuation Order

1. Finish Phase 0 verification and keep its remaining admission, durable
   resume, and service-identity gaps explicit.
2. Start Phase 1 by extracting transport-neutral HTTP/input/action executors,
   then add bounded admission/resume tickets and field-revision ownership.
   After those parity gates, pin/stage `ws` and attach `/stream` to the existing
   sim server; do not create a second authority process or timer.
3. Keep the first playable slice JSON WSS at existing map clocks. Do not pull
   binary, AOI, prediction, cloud progression, or 30 Hz forward without its
   preceding evidence gate.
4. Treat 24/48/96 as separate capacity/product profiles. Every claim names
   participants, sim envelope, clock, body/AI counts, bytes, CPU, memory, host
   allocation, and whether TiDi occurred.
5. Commit each meaningful docs/code slice atomically and re-run the relevant
   harness lane. Preserve v0.3 and do not merge v0.4 back without Greg's call.

## CodexBar Heartbeat

### Usage checkpoint — 2026-07-11 19:20 UTC

- Primary five-hour usage reached 90%; reset is
  `2026-07-11T21:07:07Z`.
- Clean implementation boundary: `76d16b6` followed by the committed
  corrective packet `009c965` on `codex/v0.4-multiplayer-architecture`.
- The optional same-process WebSocket runtime is focused-loopback green for
  real 1/4/8 cohorts. Corrected measurements held `NORMAL` near 10 Hz
  projection / 15 Hz authority while charging completed per-recipient
  projection CPU into overload accounting.
- Independent review found one pre-manifest blocker: an old run's delayed
  async projection can finish after reset and mutate the new run's accounting.
  The exact next task is
  `docs/project/prompts/2026-07-11-agent-phase1-overload-lineage-fence.md`.
- After that fix: independently review, register adapter/runtime suites in the
  manifest, document the measured baseline, then implement reliable idempotent
  actions plus journal replay/gap rebase before SimClient/browser cutover.
- Do not describe Phase 1 as playable multiplayer yet and do not start a
  larger slice before the reset/usage continuation check.

### Near-limit correction — 2026-07-11 19:27 UTC

- `d19265e` implements the run/generation accounting guard and process-wide
  projection single-flight gate; focused runtime, adapter, overload, and full
  authority suites are green.
- Independent review found no implementation defect, but the delayed-reset
  fixture delays wrapper settlement after synchronous adapter work. It does
  not yet prove `projectNow()` itself remains pending across reset.
- Primary usage reached 97%. The narrow follow-up was stopped before edits;
  the branch remains clean.
- Exact next action after reset: move the test-only delay into the injected
  `buildPublicState` callback so `projectNow()` is genuinely awaiting during
  reset, assert one current-lineage completion sample, rerun focused/full
  authority, and obtain read-only review before manifest registration.

### Projection evidence closure — 2026-07-11 19:31 UTC

- `e9b2757` moved the test suspension inside the adapter's awaited public-state
  builder. Reset now occurs during a genuinely pending `projectNow()`.
- Independent re-review returned no findings. The focused runtime remains 6/6,
  adapter core 23/23, and all 1/4/8 cohorts remain `NORMAL` near 10/15 Hz.
- Adapter and runtime suites are now part of multiplayer-network,
  multiplayer-authority, authority, and full harness lanes.
- Next implementation slice: reliable idempotent gameplay action execution,
  delivery acknowledgement, event-journal replay/gap rebase, and reconnect
  recovery before SimClient/browser cutover.

### Automated post-limit continuation — 2026-07-11 21:36 UTC

- The installed heartbeat fired across the exhausted window and verified a
  fresh primary window at 0%, resetting next at `2026-07-12T02:22:05Z`.
- The branch resumed clean at `f328ab8`; the stale v0.3 goal string did not
  redirect work away from `codex/v0.4-multiplayer-architecture`.
- Reliable actions landed in `f260f10` and the independent-review correction
  in `c67d0f9`. Re-review returned no findings. Full multiplayer-network and
  authority lanes pass, with 1/4/8 still `NORMAL` near 10/15 Hz.
- The event-journal recovery packet now has exclusive runtime/adapter
  ownership. SimClient/browser cutover remains gated on its review.

### Server transport closure — 2026-07-11 22:25 UTC

- Reliable actions closed in `f260f10` + `c67d0f9`; reliable event recovery
  closed in `99cbc52` + `31f0a78`. Both independent re-reviews returned no
  findings.
- Current gates: adapter 25/25, runtime 10/10, multiplayer-network 7/7 suites,
  authority 37/37 suites, with 1/4/8 `NORMAL` cadence preserved.
- Event replay is capped at 32 frames / 64 KiB pending per binding and eight
  enqueues per pass, reserving 16 messages / 32 KiB for action ACKs.
- Next bounded lane is dual-transport SimClient/browser cutover. Keep HTTP as
  the diagnostic reference until parity and fallback tests pass; no WAN or
  playable claim precedes a natural four/eight-client browser journey.

### SimClient transport closure — 2026-07-11 23:00 UTC

- Dual-transport SimClient and explicit browser stream selection are integrated;
  HTTP remains the default oracle and stream mode performs no hot-path polling.
- Focused client proof covers exact public/owner merge, independent input/action
  ACKs, reliable rejection settlement, delivery/playback separation, reconnect
  authority rotation, cancellation, and bounded leave behavior.
- Next bounded lane is the natural four/eight-browser journey with real menus,
  movement, private inventory, reconnect, and leave/rejoin evidence. Do not call
  Phase 1 playable before that journey passes.

### Post-reset continuation — 2026-07-11 17:50 UTC

- The prior five-hour window reset successfully after the durable `76d1dde`
  checkpoint. The first verified post-reset read reported 5% primary usage and
  a new reset at `2026-07-11T21:07:07Z`.
- Branch remained clean at `76d1dde` on
  `codex/v0.4-multiplayer-architecture`; no shared-runtime work leaked across
  the exhausted window.
- Executor parity was dispatched with exclusive ownership of
  `scripts/sim-runtime.cjs` and `tests/multiplayer-executor-parity.cjs`.
- WebSocket dependency/package staging and authority field revision were
  dispatched as read-only audits. Field-revision runtime edits remain gated on
  the executor commit, so no two agents own the sim runtime concurrently.
- This proves the active goal continued across an actual five-hour reset. It
  does not prove the separately installed 30-minute scheduler heartbeat fired;
  that still requires a logged automation submission while the thread is idle.

### Usage checkpoint — 2026-07-11 07:45 UTC

- Primary five-hour usage: 90%.
- Reset: `2026-07-11T11:02:18Z`.
- Clean branch boundary: `b9ae027` on
  `codex/v0.4-multiplayer-architecture`.
- All Phase 0 and bounded Phase 1 scaffold/ticket agents have returned.
- Latest completed slices: strict JSON wire contract, protocol-agnostic bounded
  send queue with explicit reliable delivery ids, bounded opaque admission and
  resume tickets, same-process adapter plan, and `multiplayer-network` lane.
- Next bounded implementation after reset: extract transport-neutral HTTP
  input/inventory executors while holding responses and authority semantics
  byte-compatible; then add bounded admission/resume tickets and field revision.
- Do not start the `ws` adapter, dependency/package staging, or `src/main.js`
  cutover before those parity gates.
- Post-reset prompt packets are durable under `docs/project/prompts/` for the
  executor-parity, ticket-registry, and field-revision slices. Executor parity
  owns the high-conflict runtime first; the ticket registry can proceed in
  parallel and is now complete; field-revision runtime integration waits for
  the executor commit.
- The automation remains installed/configured; a scheduler-fired execution is
  still pending proof because this target thread has remained busy.

Local automation:

`~/.codex/automations/lbh-v04-multiplayer-orchestrator/automation.toml`

It is installed with `status = "ACTIVE"`, targets this thread, and is configured
for a 30-minute recurrence. Its first actual LBH scheduler execution is still
pending verification. It runs:

```sh
codexbar usage --provider codex --source cli --format json --pretty
```

Configured behavior:

- inspect the five-hour `usedPercent` and `resetsAt` values;
- inspect the active goal, live agents, branch, and worktree;
- at or above 90%, write a durable checkpoint with branch, commits,
  returned/pending lanes, next action, and reset timestamp instead of starting
  a large slice;
- below 90% or after reset, collect returned work, dispatch the next disjoint
  lane, integrate/verify/commit, or advance the roadmap;
- return `NO_REPLY` only when the goal is complete or no useful progress/alert
  exists.

This does not bypass a Codex usage limit. If the service cannot execute while
the five-hour window is exhausted, the heartbeat resumes on the first
scheduled run that can execute after `resetsAt`. The durable branch and docs
prevent that reset from becoming lost project context.

Runtime verification requires a logged heartbeat submission containing this
automation id after the target thread has been idle for a scheduler pass. The
06:51 continuation on July 11 came from automatic goal persistence, not this
automation, so it does not count as proof.

## Goal Metadata Note

The thread goal was created before Greg corrected the work from v0.3 to v0.4,
and the goal API cannot edit an active objective in place. Its database text
still names v0.3. The actual branch, committed artifacts, orchestration prompt,
and later user correction are v0.4. The stale goal should be marked complete
only after the completion audit passes; do not treat its version string as
current branch truth.

## Ownership Rules

- Research agents write one named memo and do not edit integrated docs.
- The coordinator reads every returned memo from source, classifies findings,
  resolves contradictions, updates decisions/roadmap, validates, and commits.
- No two active agents own the same high-conflict file.
- The coordinator owns `ARCHITECTURE.md`, `ROADMAP.md`, `OPEN-DECISIONS.md`,
  journal integration, and this orchestration file.
- One clean handoff per agent; no bot-to-bot bounce loop.
