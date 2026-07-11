# Agent Prompt: Phase 1 SimClient Dual Transport

> Sequential implementation packet for `codex/v0.4-multiplayer-architecture`.
> The server-side stream contract is closed in `99cbc52` + `31f0a78`.

## Purpose

Add a WebSocket transport to `SimClient` without deleting the HTTP diagnostic
oracle or forcing the browser onto an unproven path. Stream mode must preserve
the client-facing snapshot, input, action, event, lifecycle, and metrics
contracts that `src/main.js` already consumes while removing request-per-input
and snapshot polling from the hot path.

This is a transport/client-state slice, not the final four/eight-browser
playable claim. It should leave one explicit query/config switch that can run
the same browser journey over HTTP or stream for parity comparison.

## Read First

- `src/sim/sim-client.js`
- `src/main.js` remote start/join/input/poll/inventory/event paths
- `scripts/sim-protocol.cjs` `/protocol` stream discovery
- `scripts/multiplayer-wire-protocol.cjs`
- `scripts/multiplayer-protocol-constants.cjs`
- `tests/multiplayer-ws-runtime.cjs`
- `tests/remote-authority.cjs`
- `docs/v0.4/research/phase1-ws-runtime-baseline.md`
- `docs/v0.4/ROADMAP.md` Phase 1 gate

## Owned Files

- `src/sim/sim-client.js`
- one new browser-compatible stream codec/state helper under `src/sim/` if it
  keeps transport mechanics out of the existing client facade
- focused Node/loopback tests for the client transport helper/facade
- `src/main.js` only for an explicit `simTransport=http|stream` selection and
  the smallest response-shape compatibility changes
- `src/test-api.js` only for secret-free transport diagnostics needed by proof

Do not edit server runtime/adapter/wire behavior, renderer/entity systems,
manifest, package, integrated docs, or existing remote-authority gameplay
expectations in this slice.

## Required Changes

1. Discover stream path, wire version, and sim protocol version from
   authenticated-safe `GET /protocol`; do not duplicate server constants in
   browser source. Convert the configured HTTP(S) base URL to WS(S) safely.
2. Keep session start/reset, join/leave, profile fetch, ticket issuance, and
   health as HTTP control-plane operations. After join in stream mode, request
   an authenticated single-use admission ticket and complete
   `hello -> welcome -> rebase -> publicState -> ownerState`.
3. Merge aligned public and owner frames into the same authoritative snapshot
   shape currently returned by `pollSnapshot()`. Never expose rival private
   state and never apply an owner frame whose run/snapshot/membership/player
   lineage differs from the active welcome/public frame.
4. In stream mode, `pollSnapshot()` reads the latest merged stream state and
   may await first/new state when forced; it must not issue `/snapshot` or
   `/events` hot-path requests. HTTP mode remains byte/behavior compatible.
5. Split continuous input from reliable actions. Stream input carries only
   latest-wins continuous fields and `inputSeq`; slingshot edges, pulse,
   extraction confirm, consume, and inventory use action frames with stable
   `actionId`, contiguous `actionSeq`/global `commandSeq`, and retry state.
   Preserve the current `sendInput()`/`inventoryAction()` response shapes used
   by `src/main.js` so one-shots clear only after accepted semantic ACKs.
6. ACK reliable deliveries after storing them. ACK event playback cumulatively
   only after `consumeEvents()` hands consequences to the game. Baseline ACK
   must use the advertised rebase cursor, not the latest state watermark.
7. On reconnectable close/blackout, obtain a resume ticket over authenticated
   HTTP and send the all-or-none
   `{lastRunId,lastSnapshotId,lastEventSeq}` cursor. Adopt rotated connection
   credential/cursors, resend latest continuous input, and retry unresolved
   actions with original identities. Clear connection-scoped delivery ids.
8. Handle heartbeat/pong, error, close, explicit event-gap/run-changed rebase,
   bounded backoff, shutdown/leave, and one in-flight reconnect. Old socket
   callbacks cannot mutate the new connection generation.
9. Expose secret-free diagnostics: selected/active transport, stream state,
   reconnect count/reason, last input/action/delivery/event ACKs, pending
   actions, latest run/snapshot/event cursors, and whether any hot-path HTTP
   request occurred in stream mode.
10. Preserve HTTP default behavior. `simTransport=stream` is explicit until the
    subsequent browser parity/journey gate passes.

## Verification

Add direct loopback proof for:

- discovery plus HTTP/stream dual-mode parity at first merged snapshot;
- zero `/input`, `/snapshot`, `/events`, or `/inventory/action` hot-path HTTP
  calls in stream mode;
- continuous input ACK and all one-shot/action response shapes;
- ordered public/owner merge and rival owner rejection;
- delivery ACK versus `consumeEvents()` playback ACK;
- disconnect before action/event ACK, resume cursor, rotated credential,
  pending action retry, and one consequence;
- event-gap and run-changed atomic rebase handling;
- stale socket callbacks ignored after generation rotation;
- bounded pending state and clean leave/shutdown;
- unchanged HTTP remote-authority suite.

Run focused client tests, then:

```sh
npm run test:multiplayer-network
npm run test:authority
git diff --check
```

Commit atomically with an `L0:` or `Fix:` message. Report response parity,
HTTP hot-path count, reconnect/retry results, metrics, tests, and hash.

## Guardrails

- The match server remains the only gameplay writer. Client merge/retry logic
  presents and recovers authority truth; it never manufactures consequence.
- Do not add prediction, binary encoding, AOI, hosted identity, invite UI, WAN
  shaping, or renderer changes here.
- Do not delete HTTP transport or make stream the default in this slice.
