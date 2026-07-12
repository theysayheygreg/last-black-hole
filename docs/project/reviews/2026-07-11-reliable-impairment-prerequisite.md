# Reliable Impairment Prerequisite

> Phase 2 implementation contract for `codex/v0.4-multiplayer-architecture`,
> 2026-07-11. This closes the safety gap found while adding the first adapter
> impairment seam. It does not yet enable reliable-frame impairment.

## Decision

Reliable `deliveryId` frames may enter the seeded scheduler only after three
contracts land together:

1. the send queue leases attempts at drain time and records ACK eligibility
   only after a non-throwing physical `ws.send()` call;
2. the client ACKs only the highest contiguous delivery ID in the current
   delivery epoch; and
3. `welcome` and `rebase` are physically ordered epoch barriers that cancel and
   fence every delayed callback from the prior epoch.

Until all three gates pass, the adapter keeps `deliveryId`, `error`, and
`close` frames on its immediate path. `rebase` must also become immediate
before reliable impairment opens unless it gains an explicit completion
handshake.

This is transport bookkeeping, not a second gameplay authority. One logical
authority still owns each match, regardless of how many matches run
concurrently on the fleet.

## Failure being prevented

Today the queue marks a retained frame sent when `drain()` returns it, before
the adapter submits its bytes to the socket. The client ACKs any received
delivery ID cumulatively. If an injector holds ID 1 and releases ID 2, the
server can accept ACK 2 and retire ID 1 even though the client never received
it. A same-socket rebase can also reset IDs to 1 while a delayed old-epoch
callback still exists.

Passing tests around that behavior would certify frame loss rather than fault
tolerance. The prerequisite therefore distinguishes four moments:

```text
retained -> attempt leased -> physically accepted by ws.send -> cumulatively ACKed
```

Scheduling is not sending. A WebSocket callback completing is not required
before ACK eligibility, because a peer ACK can race that callback. A callback
error poisons the connection and forces cleanup rather than retry on the same
socket.

## Server queue contract

Each retained reliable entry keeps one bounded logical copy plus:

```text
everTransportAccepted: boolean
attempt: ready | leased | idle
attemptId: monotonic within queue epoch
physicalCopies: bounded diagnostic
```

Every queue reset increments `queueEpoch`. `drain()` leases ready entries and
returns an opaque `{queueEpoch, reliableId, attemptId}` token without advancing
the sent watermark.

The smallest API is:

- `authorizePhysicalSend(token)`: true only for the live queue epoch, retained
  entry, and leased attempt;
- `recordPhysicalSend(token)`: after `ws.send()` returns without throwing,
  marks the first accepted copy and advances the highest contiguous physically
  sent ID across hole-free entries;
- `completeSendAttempt(token, {physicalCopies})`: zero copies re-arms the entry
  for a later sweep; one or two copies leave it retained but idle until ACK;
- `replayAfter(id)`: invalidates leased attempts above the cursor and creates
  fresh attempts without erasing prior physical-send evidence; and
- `reset()`: increments the epoch and invalidates every outstanding token.

`highestSentReliableId` may remain as a compatibility alias, but it must mean
highest contiguous physically accepted ID—not the maximum drained or released
ID. Releasing ID 2 first leaves that watermark at zero. Releasing ID 1 then
advances it directly to two.

Scheduler omission re-arms on the next heartbeat/sweep, never recursively in
the same flush. Duplication may submit at most two byte-identical physical
copies through one token and one retained entry. Held entries continue counting
against existing reliable message/byte caps. Every release re-checks socket
liveness and backpressure; high water accepts no copy and re-arms the attempt.

## Client contiguous-ACK contract

The stream transport owns a delivery cursor and a bounded set of received IDs
above the first hole:

```js
deliveryAckThrough = 0;
pendingDeliveryIds = new Set(); // maximum 128
```

For a validated reliable action ACK or event:

1. IDs at or below the cursor are duplicates; do not apply them twice, and
   re-ACK the current cursor when useful for retention recovery.
2. A higher ID enters the bounded set.
3. Advance while the set contains `deliveryAckThrough + 1`.
4. Emit one delivery ACK only when the cursor advances.

Receiving ID 2 before ID 1 therefore sends no ACK. ID 1 closes the hole,
advances through both, and emits ACK 2. An action result may settle by stable
action identity before its delivery hole closes, but the server retains it
until the contiguous transport ACK arrives.

Out-of-order events remain non-playable until their delivery hole closes.
`consumeEvents()` removes only eligible events and emits semantic event ACKs
for what gameplay actually consumed. If the 64-event semantic buffer or the
128-ID delivery window would overflow, the client fails closed and reconnects
without ACKing the unretained frame.

The ACK meanings remain separate:

| ACK kind | Meaning |
|---|---|
| `delivery` | Highest contiguous reliable delivery received in this epoch |
| `event` | Highest relevant event sequence actually handed to gameplay |
| `baseline` | Aligned public/owner recovery snapshot accepted |
| action ACK frame | Semantic action settlement; separately participates in delivery retention |

## Delivery-epoch barrier

A delivery epoch starts after a physically ordered `welcome` or `rebase` and
begins at reliable ID 1. The adapter must centralize outbound reset:

1. cancel all scheduled sends for the connection;
2. increment an outbound generation;
3. reset the reliable queue, advancing its queue epoch;
4. send the barrier before any new-epoch reliable frame; and
5. reject every late callback whose connection, outbound generation, queue
   epoch, run, or connection epoch no longer matches.

Use that helper for explicit recovery rebase, broadcast rebase, connection
replacement, run rotation, cleanup, and shutdown. The client resets its cursor,
pending delivery IDs, and unplayed old-epoch events on accepted `welcome`,
accepted `rebase`, stream reset, and terminal stop.

## Atomic implementation order

1. **Client contiguous ACK — landed.** Land the bounded cursor/set while the server still
   sends reliable frames immediately and in order. Prove ACK-kind separation,
   duplicate idempotence, holes, overflow, reconnect, and same-socket rebase.
2. **Queue attempt leases.** Change queue accounting without enabling reliable
   scheduling. Prove drain is not sent, contiguous physical watermark behavior,
   omission re-arm, bounded duplicate copies, backpressure, error cleanup,
   replay, reset, and caps.
3. **Adapter barrier and integration.** Centralize outbound reset, make rebase
   an immediate ordered barrier, pass queue attempt tokens through the existing
   scheduler seam, and keep terminal frames immediate.
4. **Reliable fault gate.** Remove the `deliveryId` bypass only after an
   integration adversary holds ID 1, releases ID 2, observes no ACK eligibility,
   then releases ID 1 and proves exactly-once semantic outcome plus ACK 2.

Each step is independently reviewable and keeps production/default delivery
immediate. Do not combine this work with the browser cohort or TCP proxy lanes.

Step 1 landed with a 128-ID delivery window, 64-event semantic buffer, and a
bounded 128-entry settled-action receipt cache. Its focused stream suite now
has 12 cases and the complete `multiplayer-network` lane remains green.

## Required adversaries

- action ACK ID 2 before event ID 1 settles the action once but emits no
  delivery ACK until ID 1 arrives;
- event ID 2 before event ID 1 exposes neither event until the hole closes,
  then preserves semantic event ordering and a separate playback ACK;
- duplicate IDs above and below a hole never duplicate semantic effects or
  grow the bounded set without limit;
- drain, hold ID 1, physically release ID 2, and prove ACK 2 is rejected until
  ID 1 is physically accepted;
- omit ID 1, release ID 2, retry ID 1 on a later sweep, then retire both once;
- duplicate one leased attempt into two identical socket submissions but one
  retained entry;
- socket send throw/callback error, high-water release, replay, queue reset,
  connection replacement, run rotation, and shutdown all fence stale tokens;
- same-socket rebase cancels old held work and delivers its barrier before
  new-epoch reliable ID 1; and
- default no-scheduler behavior remains byte/order compatible with the current
  stream path.

## Exit gate

Reliable impairment is open only when focused queue, client, and adapter suites
all pass; the full `multiplayer-network` lane passes; diagnostics return to zero
after cleanup; and the red-team can no longer construct a hole that the server
retires or the client plays across. Frame omission remains the correct Layer A
term. TCP packet loss remains a later netem claim.
