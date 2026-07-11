# Agent Packet — Phase 1 Admission And Resume Ticket Registry

Target branch: `codex/v0.4-multiplayer-architecture`

Own only a new `scripts/multiplayer-ticket-registry.cjs` and new
`tests/multiplayer-ticket-registry.cjs`. Do not integrate it into
`sim-runtime.cjs` yet and do not edit manifests or shared docs.

Implement a bounded in-memory ticket registry for one match authority:
cryptographically random opaque admission and resume tickets, 30-second
default TTL, 32-ticket total cap, single-use redemption, explicit run and
ticket kind, reserved membership/player/profile claim, connection id/epoch
claim for resume, constant-time secret comparison where applicable, reset/run
rotation invalidation, deterministic expiry pruning, and safe diagnostics that
never expose ticket values. Reject reused, expired, wrong-kind, cross-run,
flooded, and malformed tickets explicitly. Keep browser-selected player ids
out of the API.

Test issuance, redemption, replay, expiry with an injected clock, reset,
capacity, cross-run/kind rejection, and secret-free diagnostics. Commit
atomically. Integration into HTTP cold paths and WebSocket hello is a later
authority-owned slice.

