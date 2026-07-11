# v0.4 Multiplayer Orchestration

> Durable handoff for the active Codex goal on
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
- Base: current v0.3 Ballpark integration line at branch creation.
- Integrated docs: `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`,
  `OPEN-DECISIONS.md`.
- Core research, audits, high-count measurements, performance/architecture,
  and hosting-cost memos are under `research/`.
- Full manifest-driven core harness passed after the integrated architecture
  commit.
- No v0.4 multiplayer implementation code has been authorized or landed.

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

## Continuation Order

1. Keep the research recommendation current when Greg resolves an item in
   `OPEN-DECISIONS.md`.
2. Before implementation, create a bounded Phase 0 prompt packet from
   `ROADMAP.md`: trust closure, owner/public schemas, idempotent outcomes,
   server-created membership/connection epoch, and measured 1/4/8 fixtures.
3. Keep the first playable slice JSON WSS at existing map clocks. Do not pull
   binary, AOI, prediction, cloud progression, or 30 Hz forward without its
   preceding evidence gate.
4. Treat 24/48/96 as separate capacity/product profiles. Every claim names
   participants, sim envelope, clock, body/AI counts, bytes, CPU, memory, host
   allocation, and whether TiDi occurred.
5. Commit each meaningful docs/code slice atomically and re-run the relevant
   harness lane. Preserve v0.3 and do not merge v0.4 back without Greg's call.

## CodexBar Heartbeat

Local automation:

`~/.codex/automations/lbh-v04-multiplayer-orchestrator/automation.toml`

It targets this goal thread every 30 minutes and runs:

```sh
codexbar usage --provider codex --source cli --format json --pretty
```

Behavior:

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
scheduled run that can execute after `resetsAt`. The durable branch/docs/goal
checkpoint prevents that reset from becoming lost context.

## Ownership Rules

- Research agents write one named memo and do not edit integrated docs.
- The coordinator reads every returned memo from source, classifies findings,
  resolves contradictions, updates decisions/roadmap, validates, and commits.
- No two active agents own the same high-conflict file.
- The coordinator owns `ARCHITECTURE.md`, `ROADMAP.md`, `OPEN-DECISIONS.md`,
  journal integration, and this orchestration file.
- One clean handoff per agent; no bot-to-bot bounce loop.

