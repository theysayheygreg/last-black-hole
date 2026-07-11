# Agent Prompt: Phase 1 WebSocket Runtime Baseline

> Implementation delegation for the first real same-process `/stream`
> authority fixture on `codex/v0.4-multiplayer-architecture`.

## Purpose

Integrate the hardened injected WebSocket adapter into the one existing match
runtime and prove real 1/4/8-client admission, owner privacy, continuous input,
projection cadence, reconnect fencing, and run reset. This is the first live
server baseline, not the browser cutover and not the complete reliable action
or event-replay slice.

The result must retain exactly one logical single-writer authority per match:
one `sim-runtime` process, one mutable runtime, one HTTP server/port, and one
authority tick loop. The adapter is only another I/O face on that authority.

## Read First

- `docs/v0.4/phase1-json-wss-adapter-plan.md`
- `docs/project/prompts/2026-07-11-agent-phase1-ws-adapter-core.md`
- `scripts/sim-ws-adapter.cjs`
- `scripts/sim-ws-adapter-guards.cjs`
- `scripts/multiplayer-ticket-registry.cjs`
- `scripts/multiplayer-wire-protocol.cjs`
- `scripts/session-registry.cjs`
- `scripts/sim-runtime.cjs`
- `tests/multiplayer-ws-adapter-core.cjs`
- `tests/multiplayer-executor-parity.cjs`
- `tests/multiplayer-field-revision.cjs`

## Current Context

- Exact `ws@8.21.0` source/staged/package resolution is green.
- HTTP input and inventory share transport-neutral executors in `af5d8d1`.
- Run-scoped coarse-field revision is green in `6c6aac7`.
- The injected adapter was hardened through independent review; `94ffed9`
  closes admission, concurrency, privacy, reconnect, backpressure, shutdown,
  Upgrade ownership, delayed-send fencing, rebase, and truthful byte-budget
  concerns. Its focused suite is 23/23.
- This slice keeps HTTP start/join/reconnect/profile/control routes. Healthy
  socket play must not call HTTP `/input`, `/snapshot`, or `/events`.

## Owned Files

- `scripts/sim-runtime.cjs`
- `scripts/session-registry.cjs`
- `tests/multiplayer-ws-runtime.cjs` (new)

Do not edit the adapter core, wire codec, queue, package/build files,
`SimClient`, `src/main.js`, suite manifest, or docs. Commit only owned files.

## Required Runtime Integration

### Enablement and lifecycle

- Gate runtime attachment with `LBH_SIM_WS_ENABLED=true`; default remains off
  until this and later action/event/browser gates pass.
- Instantiate `createSimWebSocketAdapter` on the one existing `http.Server`
  before `listen()`. Never create another listener, port, process, or gameplay
  timer.
- Create one bounded multiplayer ticket registry owned by the match runtime.
  Rotate it synchronously on every `startSession()`/reset with the new run ID;
  call `adapter.rotateRun()` at the same lineage boundary before any new-run
  projection.
- Await adapter shutdown before `server.close()` and process exit. Health and
  diagnostics must be secret-free and distinguish enabled, disabled, bound,
  backpressured, pending inbound bytes, skipped projection beats, and errors.

### Authenticated ticket issuance

Add one cold authenticated HTTP endpoint such as
`POST /multiplayer/ticket`:

- authenticate the current run/player/command credential without consuming a
  gameplay `commandSeq`;
- accept exactly `kind: "admission" | "resume"` and reject caller-selected
  membership, connection, epoch, or ticket claims;
- issue a 30-second, single-use ticket from server-owned authority facts;
- admission binds the current membership/player; resume additionally binds the
  current connection ID and epoch;
- use the durable profile ID when present and a server-created local lineage
  ID when absent; never trust a caller profile claim;
- never log or place tickets/credentials in URLs, health, telemetry, errors,
  close reasons, or adapter diagnostics.

### Hello, binding, and reconnect

Implement adapter callbacks around the current authority records:

- `redeemHello(frame, { signal })` atomically redeems exactly one ticket for
  the active run and maps known ticket errors to sanitized `publicCode` plus
  close `4401`;
- admission validates the reserved membership/player against the current
  authority and binds its current connection;
- resume validates the reserved connection/epoch, then calls the existing
  server authority rotation so connection ID, epoch, and credential change;
- return mutually aligned binding, strict `welcome`, and initial `rebase`
  facts. Binding contains run, membership, player, connection, epoch, profile,
  and mutable recovery cursors but no exposed ticket;
- `revalidateBinding` checks the live run and the current membership,
  connection ID, and epoch after every awaited boundary;
- use the adapter's stable run+membership replacement so a successful resume
  closes the old socket with `4003` before another owner projection.

The welcome must report real `lastInputSeq`, `lastActionSeq` (zero is valid in
this baseline), command sequence facts, and a codec-valid heartbeat interval.

### Continuous input

Add a stream input executor beside the existing shared HTTP executor:

- revalidate the bound authority;
- require `inputSeq` newer than the player's accepted input;
- translate wire `moveX`, `moveY`, `thrust`, `brake`, `slingshot`, `ability1`,
  `ability2`, and `clientTimeMs` into the existing latest input mailbox;
- preserve queued slingshot edges and latched pulse/extract/consume fields;
- do not consume protocol-v2 `commandSeq`; return strict input ACK;
- keep `tickSim` as the only gameplay integrator.

For this baseline, `onAction` must return a strict, reliable **rejected** action
ACK with a stable `action-not-enabled` result and no gameplay mutation. Do not
silently accept, invent partial inventory behavior, or weaken the action
schema. Reliable actions and event replay are the immediately following slice.

### Public and owner projection

- Drive projection from the existing authority tick using the active
  `runtime.session.snapshotHz` accumulator. No `setInterval`/second projection
  clock. Prevent overlapping async projections; skipped/coalesced beats must be
  measured rather than spawning unbounded promises.
- Build one public `snapshotBody()` baseline per projection beat and one
  `publicState` frame shared across sockets. Remove `recentEvents` from its
  state because reliable journal delivery is not enabled in this baseline.
- Build one `ownerState` containing only `ownerPrivatePlayerSnapshot()` for the
  bound player. Do not serialize a combined owner snapshot.
- Public and owner frames must align exactly on run, snapshot, tick, sim time,
  last event, field revision, and overload mode. Use real owner input/action
  watermarks; public-only watermarks may be zero.
- Recheck binding immediately before every owner projection. Do not put
  command credentials or profile-private state in the public frame.

Do not claim event recovery in this slice. Initial rebase points to the current
snapshot/event watermarks; journal pumping, delivery ACK recovery, and gap
rebases remain explicitly pending.

## Direct Runtime Test

Create `tests/multiplayer-ws-runtime.cjs` using real loopback HTTP and WebSocket
connections to a spawned sim with `LBH_SIM_WS_ENABLED=true`. Use polling and
deadlines, not brittle fixed sleeps. Cover:

1. disabled default has no accepted `/stream`; enabled health reports bounded
   adapter/ticket diagnostics without secrets;
2. unauthenticated/caller-forged ticket issuance fails; authenticated current
   authorities receive opaque tickets;
3. expired/reused/cross-run tickets fail and no supplied marker appears in URL,
   error, close, health, or logs;
4. deterministic 1, 4, and 8 human clients join over existing HTTP cold paths,
   redeem admission tickets, receive strict welcome/rebase and aligned pushed
   public/owner state;
5. every client sees the same public snapshot ID and only its own private
   profile/owner marker; no rival private marker crosses;
6. each client sends multiple continuous input frames without any HTTP
   `/input`, `/snapshot`, or `/events` request after welcome; ACK sequences are
   monotonic and final owner/public player state reflects authority integration;
7. observed Shallows push cadence tracks the existing 10 Hz projection target
   within timer tolerance and authority tick remains the existing 15 Hz target;
8. action receives explicit reliable rejection and delivery ACK releases it;
9. resume rotates connection ID/epoch/credential, immediately closes the old
   socket, and the new socket alone receives subsequent owner state;
10. reset invalidates tickets and closes old sockets; new run re-establishes
    field revision 1 and new lineage;
11. shutdown closes adapter before HTTP and leaves no listener, socket, child,
    or timer.

Keep test payload/count/runtime bounds explicit. Report p50/p95 public and owner
frame bytes, observed projection/tick cadence, input ACK count/latency, and
adapter max queued bytes/pending inbound bytes for 1/4/8. These are loopback
baseline facts, not hosted capacity claims.

## Guardrails

- One logical authority per match; concurrent matches mean concurrent
  authorities, not one global writer.
- No browser/client changes and no claim of multiplayer playability yet.
- No reliable gameplay action, event replay, or gap-recovery overclaim.
- No ticket/credential in query strings or logs.
- No caller-selected identity or client-owned gameplay truth.
- No second tick/projection timer and no unbounded callback/task queue.
- Preserve all HTTP parity, membership/privacy, field revision, package, and
  RemoteAuthority behavior.

## Verification and Handoff

Run at minimum:

```sh
node tests/multiplayer-ws-runtime.cjs
node tests/multiplayer-ws-adapter-core.cjs
node tests/multiplayer-executor-parity.cjs
node tests/multiplayer-field-revision.cjs
node tests/multiplayer-membership.cjs
node tests/multiplayer-privacy.cjs
node tests/protocol-v2-authority.cjs
npm run test:authority
git diff --check
```

Commit atomically with an `L0:` message. Report exact endpoint/callback/frame
contracts, tests, measurements, commit hash, and the explicitly unimplemented
reliable action/event/browser gaps.
