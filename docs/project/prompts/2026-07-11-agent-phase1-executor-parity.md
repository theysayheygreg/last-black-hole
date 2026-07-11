# Agent Packet — Phase 1 Transport-Neutral Executor Parity

Target branch: `codex/v0.4-multiplayer-architecture`

Primary ownership: `scripts/sim-runtime.cjs` and a new
`tests/multiplayer-executor-parity.cjs`. Do not edit the socket adapter,
SimClient, `src/main.js`, packaging, manifests, or shared docs.

Extract the current HTTP `/input` and `/inventory/action` authority work into
transport-neutral executors that receive already-parsed identity/body data and
return explicit status/body results. Keep the HTTP handlers as thin wrappers
and preserve their externally observed validation order, sequence consumption,
status codes, response bodies, one-shot latching, Ballpark refresh, and owner
projection exactly. Add stream-shaped executor entrypoints only where they can
reuse the same mailbox/mutation operations; do not add WebSockets or a second
tick path.

The parity test must exercise valid, stale-run, wrong-player,
invalid-credential, conflicting-identity, stale-command, stale-input,
inventory success/failure, held ability fields, and reliable one-shot behavior
through the HTTP reference before and after extraction. Run protocol-v2,
membership/privacy, PlayerBrain, SlingshotEdgeQueue, RemoteAuthority, and the
authority lane. Commit atomically. Any response drift is a blocker, not a test
rewrite opportunity.

