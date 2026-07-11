# Agent Packet — Phase 1 JSON Wire Protocol

Target branch: `codex/v0.4-multiplayer-architecture`

Own only `scripts/multiplayer-wire-protocol.cjs` and
`tests/multiplayer-wire-protocol.cjs`.

Implement a pure transport-neutral JSON frame contract for hello/welcome,
membership binding, heartbeat, latest-wins input, reliable idempotent actions,
public and owner state, consequences, acknowledgement, rebase, and explicit
error/close. Enforce version, type, size, sequence, and count limits. Preserve
protocol-v2 authority semantics and keep gameplay out of the codec. Run the
focused test and commit atomically. Do not edit shared manifests or docs.

