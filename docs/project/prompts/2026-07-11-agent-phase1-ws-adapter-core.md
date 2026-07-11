# Agent Prompt: Phase 1 Injected WebSocket Adapter Core

> Implementation delegation for a bounded server-transport slice on
> `codex/v0.4-multiplayer-architecture`.

## Purpose

Build the reusable same-process WebSocket I/O core before touching the
6,000-line sim runtime. The module must attach to an injected `http.Server`,
use the committed wire codec and bounded send queue, and delegate every
authority decision through injected callbacks. It must never own gameplay
state, a simulation timer, a second server, or a second port.

This is the first half of the direct `/stream` fixture. A later authority
integrator will provide real ticket redemption, connection fencing, command
executors, projections, events, and tick-coupled calls from `sim-runtime.cjs`.

## Read First

- `docs/v0.4/phase1-json-wss-adapter-plan.md`
- `scripts/multiplayer-wire-protocol.cjs`
- `scripts/multiplayer-send-queue.cjs`
- `scripts/multiplayer-ticket-registry.cjs`
- `tests/multiplayer-wire-protocol.cjs`
- `tests/multiplayer-send-queue.cjs`
- `scripts/sim-runtime.cjs` only to understand the future attachment seam

## Current Context

- Branch: `codex/v0.4-multiplayer-architecture`.
- `ws@8.21.0` is pinned, staged, package-resolved, and production-audited in
  `8c9be36`.
- HTTP input/inventory share transport-neutral executors in `af5d8d1`.
- Run-scoped `(runId, fieldRevision)` truth landed in `6c6aac7`.
- The strict JSON codec, ticket registry, and bounded queue are already green.
- One logical authority exists per match. Fleet hosts may pack many match
  processes, but this adapter serves exactly one injected match authority.

## Owned Files

- `scripts/sim-ws-adapter.cjs` (new)
- `tests/multiplayer-ws-adapter-core.cjs` (new)

Do not edit `scripts/sim-runtime.cjs`, `src/`, package files, build scripts,
suite manifests, or docs. Commit only the two owned files.

## Required Contract

Export one constructor/factory with an explicit injected interface. Exact
names may improve during implementation, but it must support:

- attach Upgrade handling at `/stream` to one supplied `http.Server` using
  `WebSocketServer({ noServer: true, perMessageDeflate: false })`;
- reject other paths without exposing tickets or credentials;
- require one valid `hello` inside a bounded timeout, then bind the opaque
  callback result to that socket;
- call injected `redeemHello(frame)` and emit codec-valid `welcome` plus an
  initial rebase; never interpret caller-selected identity itself;
- revalidate a bound connection through an injected callback before every
  private send and inbound command;
- route valid `input`, `action`, `pong`, and cumulative delivery `ack` frames
  to injected callbacks; encode every reply through the committed codec;
- expose an explicit tick-coupled `project(...)`/`projectNow(...)` method that
  queues one public state and a separate owner state per bound socket; no
  independent projection interval;
- enqueue retained events/consequences with their wire `deliveryId`, release
  them only through cumulative delivery acknowledgement, and never drop them
  on `ws.send` callback;
- use one `MultiplayerSendQueue` per socket, its byte/message limits, and its
  `observeTransportBufferedBytes()` hysteresis; state may coalesce, reliable
  frames may not;
- emit explicit rebase or close on queue policy outcomes; close a no-progress
  backpressured connection after a bounded interval;
- support application heartbeat/pong, run rotation/fencing, deterministic
  adapter shutdown before the HTTP server closes, and secret-free diagnostics;
- keep timers limited to connection liveness/hello timeout. No gameplay or
  projection timer is allowed.

The factory must be usable with fake authority callbacks in its focused test
and with real callbacks from `sim-runtime.cjs` later. Callback errors must map
to bounded codec-valid error/close behavior rather than uncaught process errors.

## Focused Test Deliverable

`tests/multiplayer-ws-adapter-core.cjs` must use a real loopback `http.Server`
and real `ws` client(s), but fake authority callbacks. Cover at minimum:

1. non-`/stream` Upgrade rejection and hello timeout;
2. invalid/expired/reused callback rejection without secret leakage;
3. codec-valid hello/welcome/initial rebase;
4. input/action routing and callback revalidation;
5. public and owner frames remain distinct and per-binding private state does
   not cross between at least four sockets;
6. cumulative delivery ack releases reliable retention; stale and future acks
   follow queue policy;
7. replaceable state coalescing under a paused/slow consumer while reliable
   order is preserved;
8. run rotation fences old sockets and clears queue state;
9. adapter shutdown leaves no open socket/listener/timer.

Use polling/deadlines rather than brittle fixed sleeps. Assert bounded
diagnostics and that serialized diagnostics/close reasons contain no supplied
ticket or credential marker.

## Guardrails

- One supplied HTTP server, one match authority, no second listener.
- No gameplay state or sim clock in the adapter.
- No URL ticket or credential.
- No alternate JSON parser, validator, or queue implementation.
- No unbounded arrays/maps/timers.
- Do not weaken the committed wire contract to make the test easier.
- Do not claim runtime integration, 1/4/8 gameplay, or browser cutover from
  this injected-core slice.

## Verification and Handoff

Run:

```sh
node tests/multiplayer-ws-adapter-core.cjs
node tests/multiplayer-wire-protocol.cjs
node tests/multiplayer-send-queue.cjs
git diff --check
```

Commit atomically with an `L0:` message. Report the exact exported API,
callback contract, timers/bounds, test results, commit hash, and the remaining
runtime-integration gaps.
