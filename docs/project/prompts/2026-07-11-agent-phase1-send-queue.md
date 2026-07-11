# Agent Packet — Phase 1 Bounded Send Queue

Target branch: `codex/v0.4-multiplayer-architecture`

Own only `scripts/multiplayer-send-queue.cjs` and
`tests/multiplayer-send-queue.cjs`.

Implement a pure per-connection queue with a coalesced latest-wins state lane,
FIFO reliable consequence lane, monotonic ids/ack window, exact byte/message
budgets, deterministic overflow/rebase/disconnect behavior, and no unbounded
history. Test flood, coalescing, acknowledgement, duplicate/reorder handling,
accounting, overflow, and reset. Commit atomically. Do not edit shared
manifests or docs.

