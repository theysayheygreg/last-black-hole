# Agent Packet — Phase 1 Same-Process JSON WSS Plan

Target branch: `codex/v0.4-multiplayer-architecture`

Own only `docs/v0.4/phase1-json-wss-adapter-plan.md`.

Trace the current sim runtime, protocol, SimClient, stack/package surfaces,
tests, and dependency constraints. Design a real same-process WebSocket upgrade
path with no request-per-input or snapshot-poll hot path. Decide the server
library, transport-neutral handler extraction, frame/queue lifecycle, file
ownership, migration order, tests, rollback, and acceptance gates. Preserve
one logical authority per match and current map clocks. Commit the memo
atomically; do not edit code or other docs.
