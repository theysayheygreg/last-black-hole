# Agent Packet — Phase 1 Authoritative Field Revision

Target branch: `codex/v0.4-multiplayer-architecture`

Begin read-only unless the executor-parity slice has already landed. Then own
only `scripts/sim-runtime.cjs` field-revision plumbing and a new
`tests/multiplayer-field-revision.cjs`; coordinate with the authority
integrator before editing the high-conflict runtime.

Create a real monotonic field revision fact owned by the match authority. It
starts at one on run creation/reset, advances only when the authoritative
coarse field content clients depend on is rebuilt or invalidated, appears in
public snapshots/protocol health, and never changes merely because a client
reads or reconnects. Prove run reset invalidates the old revision lineage,
stable ticks preserve the revision, actual field rebuild/invalidation advances
it, and all recipients of one snapshot share it. Do not send a decorative
constant and do not move field ownership to the renderer/client.

Run coarse-field, protocol runtime/rebase, multiplayer privacy/authority, and
the authority lane. Commit atomically.
