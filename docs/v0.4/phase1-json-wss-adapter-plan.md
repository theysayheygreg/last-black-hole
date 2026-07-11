# Phase 1 Same-Process JSON WebSocket Adapter Plan

> Status: source-level implementation plan for
> `codex/v0.4-multiplayer-architecture`. This memo plans one transport slice;
> it does not change the authority model, simulation clocks, or gameplay.

## Decision

Add a small `ws`-based WebSocket adapter to the existing
`scripts/sim-runtime.cjs` process and existing HTTP server. The adapter accepts
HTTP Upgrade requests at `/stream` on the sim's current port. It does **not**
start another process, another gameplay writer, or a second timer-driven sim.

The first production-shaped path is:

```text
one run -> one sim-runtime process -> one mutable runtime -> one tick loop
                                      |                |
                                      | HTTP cold path |
                                      + JSON WS stream +-- 4-8 client sockets
```

Every live match still has exactly one logical single-writer authority. If
there are `M` concurrent matches there are `M` independent authority
instances, packed onto measured fleet capacity. The WebSocket adapter is an
I/O face on one authority instance, not a shared authority across matches.

Keep the current map clocks unchanged:

| Map/profile | Authority tick | State projection |
|---|---:|---:|
| Shallows/small | 15 Hz | 10 Hz |
| Expanse/medium | 12 Hz | 8 Hz |
| Deep Field/large | 10 Hz | 6 Hz |

The exact values continue to come from `src/content/session-profiles.data.json`
through `scripts/content/session-profiles.cjs`. Overload may still lower them
through the existing controller. Phase 1 does not introduce 20/30 Hz movement,
binary frames, deltas, AOI, prediction, rollback, or a new scheduler.

## Why `ws`

Use `ws` as a pinned production dependency and the browser's native
`WebSocket` on the client.

- Node 22 in the current workspace has a WebSocket client but no equivalent
  supported HTTP Upgrade/WebSocket server API.
- Hand-writing RFC 6455 framing, masking, fragmentation, close behavior,
  ping/pong, payload limits, and upgrade validation would turn a transport
  adapter into security-sensitive protocol code.
- `ws` supports `noServer: true`, so it can attach to the existing
  `http.Server` without claiming a port or process.
- The current dependency surface is deliberately small, but one focused
  runtime dependency is cheaper and safer than a bespoke frame parser.

Implementation should pin the reviewed `ws` 8.x release exactly in
`package.json` and `package-lock.json`, not use an open-ended range. Do not
enable `perMessageDeflate` in Phase 1; compression cost and memory behavior
must be measured separately.

The Electron release staging code currently copies only the local CommonJS
closure and data directories. Adding `require("ws")` without packaging it
would pass source tests and fail in the built app. `scripts/build.cjs` must
therefore stage the exact `ws` package closure into
`release-staging/node_modules/ws` and record it in the generated shell
`package.json`. Package tests must execute the staged adapter, not merely check
that the source file exists.

## Current Source Truth

| Area | Current behavior | Integration consequence |
|---|---|---|
| Authority process | `scripts/sim-runtime.cjs` owns one `runtime`, one HTTP server, and one `tickSim` loop (`5716-5898`, `5926+`) | Attach Upgrade handling to this server; never fork a stream service. |
| Snapshot production | `snapshotBody()` builds/caches a public baseline only when an HTTP read or command asks for it (`1759-1771`) | Add one tick-coupled projection hook. A socket-only URL change would push nothing. |
| Privacy | `buildSnapshotBody()` is public; `projectSnapshotForPlayer()` overlays only the authenticated owner (`1680-1757`) | Build one public baseline per projection beat, then project separately per socket. Never cache an owner projection globally. |
| Event recovery | `/events` reads the bounded journal and filters it for one authenticated player (`6066-6090`) | Each socket owns an event cursor; stream recovery keeps the same journal and watermark semantics. |
| Input authority | `/input` validates run/player/credential/command sequence and input sequence, then replaces the player's input mailbox while latching one-shots (`6306-6364`) | Extract this block intact into a transport-neutral executor. The executor updates the mailbox; `tickSim` remains the only gameplay integrator. |
| Reliable mutations | `/inventory/action`, `/leave`, reset, and start are command-sequenced HTTP mutations (`6093-6133`, `6275-6304`, `6366-6404`) | Keep lifecycle/control routes on HTTP first. Extract inventory now for parity, but do not need it on the socket to eliminate the hot paths. |
| Client reads | `SimClient.pollSnapshot()` fetches `/snapshot` then fetches `/events` (`165-268`) | A live stream must deliver snapshot plus event window without either poll. HTTP remains recovery/fallback only. |
| Client writes | `SimClient._commandTail` serializes every mutation; `src/main.js` also gates input on one request in flight (`315-380`; main `4323-4377`) | Give continuous input its own latest-value lane and reliable commands their own bounded FIFO. Multiple input sends may be awaiting acknowledgement. |
| Desktop | Electron forks the same staged sim runtime on a dynamic loopback port and passes its HTTP URL to the renderer (`desktop/electron-main.cjs:219-301`, `450-489`) | Derive `ws://127.0.0.1:<port>/stream` from the same URL. No new port discovery or child lifecycle. |
| Dev/remote stack | `scripts/stack.cjs` passes `simServer=http://...` in local-host and remote-client modes | Keep the query contract. `SimClient` derives `ws:`/`wss:` internally. |
| Test harness | Authority tests already prove sequence fencing, owner projection, reconnect rotation, bounded histories, and 1/4/8 shared truth | Reuse those fixtures through both transports; do not create a weaker WebSocket-only contract. |

Two Phase 1 primitives landed during this source trace and are now mandatory
inputs to the adapter:

- `scripts/multiplayer-wire-protocol.cjs` defines
  `lbh-multiplayer-json-v1`, strict frame directions and byte/count limits,
  admission/resume hello, separate latest input and reliable action lanes,
  public/owner state, events, acknowledgements, rebase, error, and close.
- `scripts/multiplayer-send-queue.cjs` provides the per-connection coalesced
  state lane, retained reliable FIFO, exact byte/message accounting,
  hysteretic transport backpressure, rebase, and hard-disconnect states.

Do not create a second codec or queue inside the adapter. Before integration,
close four source-discovered contract gaps in those primitives:

1. Wire `input` omits `ability1` and `ability2`, but the authority treats
   ability 1 as an edge/toggle and ability 2 as both an edge and a held channel
   (`scripts/sim-runtime.cjs:4883-5102`). Add both booleans to latest input;
   moving the held Hauler tractor field into a one-shot action would regress it.
2. Wire overload modes do not accept the live `THROTTLED` and `DEGRADED`
   states from `scripts/overload-state.cjs`. Use the live four-state enum in
   Phase 1; the finer future shedding names do not exist in runtime yet.
3. The send queue retains reliable envelopes by an internal cumulative id,
   but no wire frame exposes that delivery id and no client-to-server ack can
   acknowledge it. Add `deliveryId` to retained server frames plus a
   client-to-server cumulative delivery ack (or make the queue consume the
   existing event watermark with a proven one-to-one mapping). Do not silently
   release reliable entries on `ws.send` callback.
4. Hello requires `admissionTicket` or `resumeTicket`, but the live authority
   only has a host `joinTicket` and current command credential. Add a bounded,
   single-use, expiring ticket issuer/redeemer before routing hello. Do not
   weaken hello to caller-supplied player ids or put credentials in the URL.

The wire's `fieldRevision` also needs a real authority fact. Initialize it on
run start and increment it when the coarse authoritative field is rebuilt;
do not send a decorative constant once client recovery depends on it.

## Transport-Neutral Command Boundary

Do not duplicate the HTTP route bodies in `sim-ws-adapter.cjs`. First extract
the following functions inside `scripts/sim-runtime.cjs`, where they can use
the existing runtime and simulation helpers. The adapter receives them as
callbacks. This avoids trying to move the 6,000-line runtime into a new object
model as part of a transport change.

### Identity, admission, and authorization

Browser WebSockets cannot set the three current authority headers, and the
committed hello deliberately contains no caller-selected player id or command
credential. The adapter must redeem exactly one opaque `admissionTicket` or
`resumeTicket` through a transport-neutral ticket service:

```js
issueAdmissionTicket({ runId, reservedPlayerId, profileClaim, expiresAt })
redeemAdmissionTicket(ticket)
  -> creates membership/player, rotates connection authority, consumes ticket

issueResumeTicket({ runId, membershipId, connectionId, connectionEpoch })
redeemResumeTicket(ticket, { lastSnapshotId, lastEventSeq })
  -> proves membership, rotates connection authority, consumes ticket
```

For the local Phase 1 spike this can be a bounded in-memory map owned by the
single match process: 30-second TTL, 32-ticket cap, cryptographically random
values, delete-on-redeem, clear-on-run-reset. The cold HTTP start/invite/join
flow may request the ticket. Hosted signed admission remains later control
plane work, but the adapter must not restore today's unauthenticated guest
join behavior on an internet-facing socket.

`welcome` returns the newly issued `membershipId`, `playerId`, `connectionId`,
`connectionEpoch`, and `commandCredential` exactly as the committed wire
contract specifies. The client stores a separately issued resume ticket; it
does not send the returned credential in every socket frame. Every inbound
frame and outbound private projection rechecks that the socket's bound
connection id/epoch still matches `runtime.playerAuthorities`. When reconnect
rotates connection authority, close the prior socket with application code
`4003` before it can receive another owner frame.

Internet play requires `wss:`. Plain `ws:` is allowed only on loopback/private
development paths. Tickets and credentials never enter URL query strings,
telemetry fields, or close reasons.

### Command executors

The HTTP reference and stream have different envelope shapes but must call the
same authority operations. Extract these functions inside `sim-runtime.cjs`:

```js
resolveAuthorityIdentity({ headers = {}, body = {} })
authorizePlayerIdentity(identity, body, options)

executeLegacyInputCommand({ identity, body }) -> { status, body }
executeStreamInput({ binding, frame })         -> { status, ackFrame }
executeReliableAction({ binding, frame })      -> { status, ackFrame }
executeInventoryMutation({ player, action })   -> { ok, result }
```

Keep `authorizePlayerRequest(req, ...)` as a thin HTTP wrapper during
migration. `executeLegacyInputCommand` contains the current `/input` route
logic byte-for-byte so HTTP remains a golden reference. Preserve its current
validation order and its existing behavior that authority acceptance precedes
stale-input rejection; do not hide a semantic cleanup in the transport patch.

`executeStreamInput` is intentionally different only at the envelope layer:

1. revalidate the socket's current run/membership/connection epoch;
2. reject `inputSeq <= player.lastInput.seq`;
3. normalize/clamp movement, thrust, brake, held slingshot, ability 1, and
   ability 2;
4. replace only those continuous fields in `player.lastInput`;
5. return `ackKind: "input"` with the accepted input sequence.

Continuous input does not consume the protocol-v2 `commandSeq`. Reliable
actions do. `executeReliableAction` revalidates the binding and enforces all
three action identities: globally monotonic `commandSeq`, monotonic
`actionSeq`, and idempotent `actionId`. Extend the per-membership authority
record with `lastActionSeq` and a bounded 32-result action cache. An exact
retry returns the original ack; reused ids with different content, stale
sequences, or skipped ownership are rejected deterministically.

Map committed action kinds to the existing authority mailbox/mutation logic:

| `actionKind` | Authority operation |
|---|---|
| `slingshotEdge` | validate/dedupe edge id, merge into pending slingshot edges |
| `pulse` | latch `player.lastInput.pulse` until `tickSim` consumes it |
| `extractConfirm` | latch extraction confirmation until the authority tick |
| `consume` | latch validated consumable slot until the authority tick |
| `inventory` | call extracted `executeInventoryMutation`, refresh Ballpark, return owner result |

Ability booleans remain latest input because Hauler ability 2 is a held
channel. Leave/session start/reset remain cold HTTP commands in this slice.

### Read/projection functions

Expose callback-shaped operations to the adapter:

```js
buildPublicStreamState()
  -> one public baseline plus tick/snapshot/event/field/overload watermarks

buildOwnerStreamState(binding, publicBaseline)
  -> only ownerPrivatePlayerSnapshot for that bound player

readStreamEvents({ runId, playerId, since })
  -> journal result with filterEventsForPlayer(..., playerId)
```

Do not serialize `projectSnapshotForPlayer()` as one combined wire frame. The
committed codec requires separate `publicState` and `ownerState` frames. Build
the public body once per projection beat, strip `recentEvents` into the
reliable event lane, then create one small owner frame per socket. Public and
owner frames share snapshot/tick/event watermarks.

## Stream Frame Flow

All frames are UTF-8 JSON validated and encoded by
`scripts/multiplayer-wire-protocol.cjs`. The wire version is
`lbh-multiplayer-json-v1`; the adapter must not invent aliases.

### Open and recovery

```text
client                                  authority/control path
  |--- cold HTTP start/invite -------------->|
  |<-- admission or resume ticket -----------|
  |--- Upgrade /stream -------------------->|
  |--- hello ------------------------------>|  ticket, optional resume cursors
  |<-- welcome -----------------------------|  rotated connection authority
  |<-- rebase(initial/resume) ---------------|
  |<-- publicState --------------------------|  shared full JSON baseline
  |<-- ownerState ---------------------------|  private overlay only
  |<-- event ... ----------------------------|  retained events after cursor
  |--- ack(baseline/event/delivery) -------->|
```

`hello` includes `wireVersion`, `simProtocolVersion`, exactly one admission or
resume ticket, and resume cursors only with a resume ticket. The server gives
an unauthenticated socket three seconds and one frame to authenticate. It
rejects binary, malformed, oversized, or non-hello first frames.

`welcome` returns the committed membership/connection fields and heartbeat
interval. The initial `rebase` names the baseline and event watermark. If the
resume event cursor is retained, send filtered `event` frames after it;
otherwise rebase to a fresh full baseline and advance the connection cursor to
that baseline's watermark. This is the existing recovery contract over push,
not a new replay model.

### Steady state

Client to server:

- `input`: latest continuous intent and `inputSeq`, with the two ability
  booleans added by the prerequisite contract correction;
- `action`: reliable/idempotent slingshot edge, pulse, extract confirm,
  consume, or inventory command;
- `ack`: cumulative baseline/event/delivery acknowledgements;
- `pong`: JSON heartbeat correlation required by the committed protocol.

Server to client:

- `ack` with `ackKind: "input"` or `"action"`;
- separate `publicState` and `ownerState` at the existing `snapshotHz`;
- one reliable ordered `event` frame per semantic event;
- `rebase`, `error`, and application `close` frames;
- JSON `heartbeat` at the negotiated interval; terminate after two missed
  matching `pong` windows. Native ping/pong may additionally detect dead TCP
  peers but does not replace the committed application heartbeat.

Phase 1 deliberately sends full JSON snapshots. It must not call the HTTP
`/snapshot` or `/events` endpoints from `SimClient` while the stream is
healthy. Full frames make this an adapter proof, not the compact replication
solution promised by later phases.

## Projection Scheduling

Do not add a free-running `setInterval` per socket. Add one
`streamAdapter.onAuthorityTick()` call at the end of a successful `tickSim`.
The adapter keeps one match-level projection accumulator using the current
wall-clock authority cadence, not dilated `simTime`:

```text
projectionAccumulator += 1 / current tickHz
if accumulator >= 1 / current snapshotHz:
    subtract one projection interval
    materialize one public snapshot baseline
    project and offer it once to each authenticated socket
```

The accumulator is reset on session start/reset and reads `tickHz` and
`snapshotHz` after overload changes. It may emit at most one projection per
authority tick. This gives 10 projections over 15 Shallows ticks without a
second simulation clock and follows 12/8 and 10/6 profiles without changing
their values.

Build the public `snapshotBody()` once per projection beat so all recipients
share a `snapshotId` and public state. Encode that as `publicState`, then build
only `ownerPrivatePlayerSnapshot()` as each connection's `ownerState`.
Read/filter each socket's event window against the same snapshot watermark.

## Queue and Backpressure Contract

### Client outbound

`SimClient` must stop using one `_commandTail` for every mutation.

- **Latest input slot:** one replaceable unsent movement/held-state sample,
  including held ability booleans. New samples overwrite only continuous
  fields.
- **Reliable action FIFO:** slingshot edges, pulse, extraction confirmation,
  consumable use, and inventory are separate `action` frames keyed by
  `actionId`; cap at 32 entries and 128 KiB total.
- **In-flight input window:** allow up to four unacknowledged input frames.
  Do not gate input production on round-trip time. When full, retain one newest
  pending continuous sample and the merged action latches.

`src/main.js` should offer input on the current authority cadence and consume
ack events from `SimClient`; it should no longer use
`remoteInputRequestInFlight` as the network clock. The client applies pushed
snapshots immediately through the existing `applyRemoteSnapshot` path and
never starts `remoteSnapshotRequestInFlight` while stream health is `open`.

### Server inbound

- `maxPayload`: the codec's 256 KiB `LIMITS.maxFrameBytes`; the codec then
  enforces the smaller 4/8/2/16 KiB class limits.
- Reject binary and fragmented application messages not assembled within the
  library limit.
- Token bucket per connection: 40 `input` frames/s with burst 12; 10
  reliable commands/s with burst 8. Sustained excess closes with `4008`.
- Parsing/validation occurs on the authority event loop. The only immediate
  mutation from input is the existing bounded `player.lastInput` mailbox;
  `tickSim` remains the only owner of movement and consequences.
- Revalidate the current connection epoch for every command, not only hello.

### Server outbound

Use one committed `MultiplayerSendQueue` per authenticated socket. Store the
paired public/owner projection together as its single replaceable state
payload so coalescing cannot mix snapshot ids. Put events and retained action
results in its reliable consequence lane. The adapter unwraps queue envelopes
and encodes their payload frames with `encodeWireFrame` before `ws.send`.

- Keep the queue defaults: 256 total messages/512 KiB, 128 reliable
  messages/256 KiB, 256 KiB transport high-water and 64 KiB low-water.
- Feed `socket.bufferedAmount` into `observeTransportBufferedBytes`; its
  hysteresis determines pause/resume instead of a parallel threshold system.
- A state-budget result triggers explicit `rebase`; reliable retention failure
  triggers close/disconnect. Never drop a reliable entry silently.
- If transport makes no progress for two seconds despite the queue's paused
  state, close with `1013` so the client resumes/rebases elsewhere.
- Serialize only when the socket can accept the frame. Record JSON encode time,
  bytes, dropped/replaced state count, queue depth, buffered bytes, cursor lag,
  and close reason per match and per connection.

Do not use the Node stream socket's internal buffer as the queue. These bounds
are part of correctness and fleet isolation, not optional telemetry.

## File and Ownership Plan

| File | Change | Owner |
|---|---|---|
| `package.json`, `package-lock.json` | Pin `ws` production dependency | transport implementer |
| `scripts/sim-ws-adapter.cjs` (new) | Upgrade lifecycle, frame parsing, per-connection queues/cursors, ping/pong, bounded sends; no gameplay logic | transport implementer |
| `scripts/multiplayer-wire-protocol.cjs` | Existing codec; correct ability fields, live overload enum, and reliable delivery ack | protocol owner |
| `scripts/multiplayer-send-queue.cjs` | Existing queue; use as-is unless delivery-ack integration exposes a focused defect | queue owner |
| `scripts/session-registry.cjs` | Persist `lastActionSeq`/bounded action idempotency state in membership authority | identity owner |
| `scripts/sim-protocol.cjs` | Advertise stream path/version without duplicating frame validation | protocol owner |
| `scripts/sim-runtime.cjs` | Extract identity/command/read callbacks, attach adapter to existing server, call projection hook, close/reset streams on run rotation and shutdown | authority integrator only |
| `src/sim/sim-client.js` | Stream state machine, independent input/reliable queues, pushed snapshot/event handling, HTTP fallback | client transport implementer |
| `src/main.js` | Replace request-in-flight input and snapshot polling gates with stream offer/consume path | client integrator only |
| `scripts/build.cjs` | Stage `ws` package closure and adapter; declare generated shell dependency | packaging implementer |
| `desktop/electron-main.cjs` | No structural change expected; optionally expose stream URL/status in diagnostics | packaging implementer |
| `scripts/stack.cjs` | No URL contract change; diagnostics may report derived stream URL | packaging implementer |
| `tests/multiplayer-ws-adapter.cjs` (new) | Direct protocol, admission, fencing, privacy, cadence, backpressure, recovery | transport test owner |
| `tests/multiplayer-wire-protocol.cjs`, `tests/multiplayer-send-queue.cjs` | Existing focused primitive proofs plus the prerequisite corrections | primitive owners |
| `tests/remote-authority.cjs` | Browser journey over stream and HTTP fallback | client test owner |
| `tests/desktop-package.cjs`, `tests/release-package.cjs` | Staged dependency and packaged stream smoke | packaging test owner |
| `tests/suite-manifest.cjs` | Put adapter fixture in multiplayer/authority/full lanes | harness owner |

Only the authority integrator edits `scripts/sim-runtime.cjs`; only the client
integrator edits `src/main.js`. This keeps the two highest-conflict files out
of parallel transport, packaging, and test work.

## Migration Order

Each numbered step is an atomic, revertible commit.

1. **Close primitive integration gaps.** Amend the committed wire contract for
   ability holds, live overload names, and reliable delivery acknowledgement;
   keep its focused tests green. The bounded send queue is already landed.
2. **Transport-neutral parity.** Extract legacy HTTP input and inventory
   operations in `sim-runtime.cjs`; keep every HTTP route and response unchanged.
   Add stream input/action executors and membership action sequence/cache.
3. **Admission seam.** Add bounded single-use admission/resume ticket issuance
   and redemption with reset/expiry/flood tests.
4. **Dependency and packaging closure.** Pin `ws`; add the generic staging
   mechanism and a package test that requires the staged module from the same
   location Electron will use.
5. **Server adapter fixture.** Add `/stream`, ticket redemption, welcome,
   public/owner frames, events, inputs/actions, acknowledgements, fencing,
   committed send queues, and tick-coupled projection. Exercise it directly
   from Node while HTTP remains the browser default.
6. **Dual-transport `SimClient`.** Connect with the ticket, accept pushed
   state/events, add independent queues, and expose transport health/metrics.
   Keep automatic HTTP fallback behind the same public client methods.
7. **Browser hot-path cutover.** Remove request-in-flight input as a cadence
   gate and disable snapshot/event polling while the socket is healthy.
   Preserve HTTP only for start/join/reconnect/profile, explicit recovery, and
   fallback.
8. **Packaged proof.** Run exact staged Electron authority, wait past the old
   idle timeout, join, send multiple inputs without RTT serialization, receive
   pushed owner state, and exit cleanly.
9. **Default and cleanup.** Make stream preferred after soak evidence. Keep a
   `?simTransport=http` or equivalent runtime flag for one release cycle; do
   not delete HTTP diagnostics or recovery routes.

## Test Slices

### Executor parity

- HTTP status/body compatibility for valid, stale-run, wrong-player,
  invalid-credential, stale-command, stale-input, and conflicting identity;
- sequence consumption remains identical on rejected stale input/action;
- held ability state survives input coalescing; slingshot edge, pulse,
  extract, and consume survive reliable action retry;
- inventory success/failure and owner projection remain unchanged.

### Direct WebSocket adapter

- non-`/stream` upgrades rejected; unauthenticated hello timeout; expired,
  reused, cross-run, and flooded tickets rejected;
- ticket/credential never appears in URL/log/close reason;
- current connection epoch accepted; reconnect closes/fences old socket;
- 1/4/8 clients see one aligned public snapshot id and only their own private
  overlay;
- 100+ input frames complete without HTTP `/input` calls and without one
  request/ack serialization lane;
- no HTTP `/snapshot` or `/events` calls occur during healthy steady state;
- pushed cadence matches 15/10, 12/8, and 10/6 within timer tolerance;
- journal gap triggers labeled full rebase, not a partial event history;
- delivery acknowledgements actually release the committed reliable queue,
  while stale/future acks deterministically ignore or disconnect;
- slow consumer replaces state, preserves reliable results, then closes at the
  hard bound; heap/queue counts return to baseline after disconnect;
- session reset/run rotation invalidates all old sockets and cursors.

### Browser and package

- existing remote-authority movement, inventory, extraction, death, results,
  and reconnect journeys run with `transport=ws`;
- deliberate Upgrade failure falls back to the unchanged HTTP path with a
  visible diagnostic, not silent local authority;
- browser network instrumentation proves zero steady-state `/input`,
  `/snapshot`, and `/events` requests;
- desktop staging contains and can require `ws` and the adapter;
- the exact packaged app joins its embedded dynamic-port authority, receives
  pushed state, moves, and survives its app-lifetime keep-alive contract;
- shutdown closes WebSockets before the HTTP server and leaves no child or
  port listener behind.

## Acceptance Gates

Phase 1 is accepted only when all of these are true:

1. One match still has one mutable runtime and one tick loop; no test can
   produce two writers for one run.
2. Existing 15/12/10 Hz authority and 10/8/6 Hz projection clocks remain the
   source values and are observed on the stream.
3. Healthy play makes zero request-per-input and zero snapshot/event polling
   calls after stream welcome.
4. Four and eight clients pass shared-public/owner-private alignment, ticket
   redemption, command fencing, reconnect rotation, held-ability, and
   reliable-action tests through the socket.
5. The client permits multiple input frames in flight and does not make RTT
   the input-send clock.
6. No queue is unbounded. Slow-client tests prove state replacement, reliable
   queue policy, hard disconnect, and post-disconnect memory recovery.
7. Current JSON payload p50/p95, serialization time, event lag, input ack RTT,
   socket buffered bytes, and per-match egress are emitted as evidence. Phase
   1 may be inefficient; it may not be unmeasured.
8. HTTP fallback and gap recovery pass, but a fallback is surfaced in health
   and test output so it cannot masquerade as a WebSocket pass.
9. Source, local stack, remote browser, and exact packaged Electron tests pass.

## Rollback

Rollback is transport selection, not authority recovery.

- Keep HTTP routes and current `SimClient` fallback throughout Phase 1.
- Gate WebSocket preference with one client option/query flag and one server
  environment flag (`LBH_SIM_WS_ENABLED`, default off until adapter gates pass).
- If stream health fails before or during a run, close it, clear stream-only
  queues, reauthenticate if the connection epoch changed, fetch one full HTTP
  snapshot/event rebase, and resume HTTP input/polling. Never run both input
  transports concurrently for the same connection.
- Reverting the adapter commit removes `server.on("upgrade")` and the tick
  projection hook; the existing authority, protocol-v2 HTTP path, control
  plane, stack scripts, and desktop child topology remain intact.
- Do not fall back from dedicated authority to local client simulation.

## Smallest Implementation Slice

The smallest safe next slice is **wire/runtime parity correction**, not a
half-connected socket. The codec and send queue already exist; source tracing
found that the codec cannot yet represent current abilities or overload state,
and the retained queue cannot yet be acknowledged over the wire.

1. add `ability1`/`ability2` booleans to `input` validation and fixtures;
2. replace the future-only overload enum with the live
   `NORMAL/THROTTLED/DEGRADED/DILATED` values;
3. expose the send queue's cumulative reliable delivery id and validate a
   client-to-server delivery ack;
4. keep `tests/multiplayer-wire-protocol.cjs` and
   `tests/multiplayer-send-queue.cjs` green.

That is a small, pure, transport-neutral commit with no package, port, client,
clock, or gameplay behavior change. Immediately after it, extract
`executeLegacyInputCommand`, `executeStreamInput`, and
`executeReliableAction` in one authority-owned commit while leaving HTTP
responses unchanged. Only then add `ws` and `/stream`; otherwise the first
adapter would either regress abilities, reject live overload frames, or grow a
reliable queue that no client can drain.
