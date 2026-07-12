# F5 One-Client Blackout And Recovery Implementation

> Decision-ready contract for `codex/v0.4-multiplayer-architecture`,
> 2026-07-12. F5 proves one client survives a configured userspace stream
> blackhole plus an explicit per-proxy connection fence while three healthy
> clients remain on the same match authority. It does not prove IP loss,
> synchronous TCP RST delivery, WAN, WSS, or TLS behavior.

## Decision

Reuse the accepted T1 topology unchanged:

```text
pilots 0-2 -> their unchanged proxy listeners --+
pilot 3    -> its impaired proxy listener ------+-> one sim PID/run authority
```

This implementation packet is scoped to the first four-browser PR smoke only.
Only pilot 3 is impaired. Precreate one `timeout` toxic per direction on its
listener with `timeout: 0` and `toxicity: 0`. At the scheduled cut, activate
both toxics, verify their exact configuration, and keep them active for at
least 25,000 ms measured from that verification. `timeout: 0` consumes and
discards each stream chunk; it has no delayed-byte buffer to flush.

At recovery, explicitly fence pilot 3's old connection:

1. `PATCH /proxies/<pilot-3> {"enabled":false}` and verify the exact listener,
   upstream, toxics, and `enabled:false` response plus GET;
2. while disabled, remove the two owned timeout toxics and verify none remain;
3. `PATCH /proxies/<pilot-3> {"enabled":true}` and verify the same listener and
   upstream are active with no toxics; and
4. define recovery time zero only after the final verified GET.

Toxiproxy v2.12.0 accepts POST for proxy/toxic updates but marks it deprecated;
use PATCH. Never call global `/reset`: it enables and clears every proxy,
mutating the three healthy paths. Never claim the fence is a synchronous RST.

Pinned source basis:

- [timeout toxic](https://github.com/Shopify/toxiproxy/blob/v2.12.0/toxics/timeout.go);
- [proxy update API](https://github.com/Shopify/toxiproxy/blob/v2.12.0/api.go#L296-L327);
- [toxic update API](https://github.com/Shopify/toxiproxy/blob/v2.12.0/api.go#L424-L450);
- [proxy connection lifecycle](https://github.com/Shopify/toxiproxy/blob/v2.12.0/proxy.go);
- [dynamic toxic update](https://github.com/Shopify/toxiproxy/blob/v2.12.0/toxic_collection.go#L134-L160); and
- [toxicity no-op selection](https://github.com/Shopify/toxiproxy/blob/v2.12.0/toxics/toxic.go#L79-L89).

## Why not the alternatives

- `reset_peer` with timeout zero waits for a stream chunk. Its linger-zero setup
  occurs when a connection starts with that toxic, not when dynamically added
  to LBH's existing WebSocket. It cannot prove immediate RST timing.
- `limit_data` forwards/truncates up to a per-connection cap and then closes;
  zero still waits for a chunk and creates reconnect churn rather than a
  controlled 25-second blackhole.
- disabling the proxy for the entire interval is deterministic, but models
  endpoint refusal. The chosen timeout-plus-fence profile proves an established
  connection can make no gameplay progress before an explicit recovery fence.
- removing timeout toxics without disabling the proxy may resume the same
  socket. F5 requires a distinct WebSocket and greater authority epoch.

## Scenario and timing

Use root seed `0x0405B1AC` for four players. The PR smoke is 60 seconds:
5 seconds warm-up, 40 seconds active, and 15 seconds recovery. The later
canonical matrix remains 75 seconds at 15/45/15 and reserves eight-player seed
`0x0805B1AC`, but it is not implemented or accepted by this four-listener
packet. That follow-up must create one listener per participant, impair only
the last pilot, and prove every other path unchanged.

The Layer A discard schedule begins at timeline t=20,000 ms and ends at
t=45,000 ms. Proxy timeout activation dispatch also begins at t=20,000 ms.
Both PATCHes must settle, and a GET must show both exact active toxics before
`proxyBlackholeVerifiedMonoMs` is recorded. Any partial activation is rolled
back transactionally: await both activation requests with `allSettled`, PATCH
every possibly active toxic to zero, await every rollback request, then require
the exact inactive GET snapshot. Persist the original and rollback failures
separately. The outage clock never starts unless both exact active responses
and the confirming GET pass.

The proxy fence may not begin until at least 25,000 ms after verified physical
activation. This normally places recovery just after t=45 seconds. Layer A
discard ending at t=45 cannot create a delivery gap because the proxy remains
blackholed until the later verified fence. Record scheduled and actual times;
do not relabel the few milliseconds of activation/fence skew.

PR artifacts use `pr-smoke-5-40-15`; canonical artifacts use
`canonical-15-45-15`. Neither may shorten the 25-second verified proxy interval.

## Layer A semantics

F5 is an application-plus-proxy proof, as reserved by the Phase 2 matrix. Add
pilot-3-only bidirectional blackout decisions with `mode: "discard"` for the
declared t=20--45 interval. Every matching application delivery attempt records
copies zero and explicit blackout-discard evidence. No held frame is released
at recovery.

Discarding a scheduler copy must not change a reliable action identity. A
pre-cut action is only the control and may settle normally. Send a separately
named pilot-3 action during the verified blackout and prove that exact actionId
is observed pending before proxy disable. The same identity must survive
reconnect/replay and produce exactly one stable semantic outcome and at most
one gameplay consequence. Healthy pilots still send at least two reliable
actions each.

Do not change F0/F1/F3/F6/T0/T1 compiled hashes. Blackout data is present only
for F5 and is test-owned in the existing browser scheduler and guarded sim
preload.

## Endpoint outage evidence

Do not use live Toxiproxy byte-counter flatness as the outage clock. In v2.12.0
received/sent counters settle when each link copy exits, and sent accounting
can be absent on an error. Bytes already past a toxic may arrive just after the
active GET, so wait a 250 ms guard and require another exact dual-active GET
before beginning endpoint silence measurement. Require a final exact
dual-active GET immediately before disable dispatch and no intervening
controller mutation. During the interval from the guarded GET through disable
dispatch prove:

- pilot 3 receives no CDP WebSocket gameplay frame;
- its snapshot id, input ACK, event cursor, and aligned-pair progress do not
  advance;
- authority-side pilot-3 gameplay receipt/input sequence does not advance;
- exact timeout toxics remain active; and
- healthy pilots continue progressing without epoch rotation.

CDP outbound frame attempts during the interval are allowed and recorded; they
are not proof of delivery. Finalized proxy counters remain post-termination
forensic attribution only.

## Connection and authority recovery proof

Before the cut record pilot 3's connection epoch, socket hash, snapshot/input/
event cursors, scheduler epoch ordinal, and pending reliable identities. Set
`rotateSchedulerOnNextSocket` before disabling its proxy.

Require this ordered transport evidence:

```text
disable PATCH request dispatch
-> old socket close/error (may precede disable response)
-> verified disabled state, toxic removal, and re-enable
-> distinct new requestId hash
-> handshake request on that hash
-> HTTP 101 handshake response on that hash
```

No successful distinct HTTP 101 may occur before verified re-enable. Recovery
time zero remains the final enabled/no-toxic GET, and every stale-epoch frame
observed around the fence must remain unable to mutate the new epoch.

Then require:

- `welcome.reconnected === true` and a strictly greater connection epoch;
- a rebase and exact aligned public/owner baseline;
- physical baseline ACK on scheduler connection ordinal two;
- a new physical input after that baseline ACK;
- an application-delivered ACK covering the new input;
- no ordinal-one state/ACK/event mutating the new epoch; and
- a final open stream, or explicit terminal failure, within eight seconds of
  verified re-enable.

All three healthy pilots must retain their original socket, epoch, reconnect
count, and post-admission rebase count. The authority PID/run remains singular
and stable.

## Latency and gameplay gates

Pilot 3's steady-state exclusion begins at the earliest Layer A/proxy activation
request and ends only after aligned recovery baseline plus the covering fresh
input ACK. Preserve excluded sample counts and p50/p95/max distributions for
input ACK, cadence, and reliable consequence.

Minimums remain 100 steady input ACKs, 100 aligned pairs, and two reliable
actions per pilot. Provisional PR-smoke gates:

| Client | Input ACK p95 | Cadence p95 | Consequence p95 | Reconnect/rebase |
|---|---:|---:|---:|---:|
| healthy pilots | 250 ms | 300 ms | 700 ms | zero |
| pilot 3 outside exclusion | 800 ms | 750 ms | 2,500 ms | exactly one recovery |

Recovery must complete within eight seconds. Require authority `NORMAL`, zero
transport high-water crossings, zero queue-policy connections, zero transport
release rejections, and all existing application/reliable/replay/inbound
bounds. Pause final pages and drain pending input/action work to zero.

Expected pilot-3 input timeouts must bind uniquely to an input-sequence attempt
with no covering cumulative ACK for the five-second timeout and fall inside the
exact cut/recovery window. Record whether each attempt was Layer A discarded
with copies zero or physically delivered into the active proxy blackhole; do
not call a discarded copy a physical send. Unmatched timeout errors and
unmatched candidate attempts are fatal.

## Controller and harness changes

Extend `ManagedToxiproxy` narrowly:

- allow exact `timeout` definitions with integer `timeout: 0`;
- add `updateProxyEnabled(name, enabled)` using PATCH, requested ownership
  identity, exact unchanged name/listen/upstream/toxics validation, and
  provisional failure evidence; and
- add a focused two-listener proof: timeout zero drops both directions on one
  established socket; disabling that proxy closes only its connection;
  re-enable restores the same listener; the healthy proxy remains live.

Add a separate `tests/network/tcp-proxy-blackout-transport.cjs` rather than
weakening T1's exact four-toxic helper. Extend only the guarded F5 branches in
the phase fixture, decision compiler/browser scheduler, sim preload, cohort,
runner, and package command.

Artifacts add:

- `f5-blackout-schedule.json` and `f5-proxy-transport.json`;
- proxy config before/cut/disabled/restored/final plus command journal/logs;
- `f5-cdp-lifecycle.json` and `f5-input-timeout-causality.json`;
- explicit Layer A discard records and endpoint no-progress deltas;
- per-client steady/recovery distributions and reconnect ledger; and
- manifest tool hash/version, one authority PID/run, four mappings, scheduled/
  actual barriers, exact exclusion, claim boundary, and cleanup.

## Failure and cleanup

If activation is partial, settle both requests, deactivate both toxics, and
verify exact inactive state. If disabling or toxic removal is uncertain, keep
pilot 3's proxy disabled until cleanup establishes a pristine configuration;
never re-enable with an unknown toxic set.

Normal cleanup pauses/drains pages, closes browsers, captures finalized
forensic counters, removes owned toxics, enables any disabled owned proxy,
deletes all four proxies, stops the dedicated daemon, then stops the one sim
and static server. Verify every browser/profile/PID/port/registry/scheduler
fact. Signal and failure paths persist the first failure and settle any active
cut/fence task before proxy cleanup.

## Atomic order

1. Extend the controller plus focused one-client timeout/fence proof. Run the
   focused proof and full multiplayer-network lane. Commit
   `Tests: prove one-client proxy blackout control`.
2. Add F5 Layer A discard, transport schedule, cohort/runner/package wiring,
   and evidence. Retain the first red diagnostic. Run F0/F1/F3/F6/T0/T1,
   controller proof, and full multiplayer-network. Commit
   `L0: prove one-client blackout recovery`.
3. Run clean no-retry F5 once from committed HEAD, audit immutable evidence,
   and add a docs-only acceptance commit.
4. Keep T2 slow-reader, netem, and hosted WSS in later separate lanes.

## Controller slice status — implemented

Commit `271b7a8` adds exact timeout-zero toxic validation and typed per-proxy
enabled PATCH handling without weakening T1 latency/bandwidth definitions. The
focused real-daemon proof keeps two established proxy paths open, verifies the
impaired path makes no endpoint progress after the 250 ms guard while the
healthy path continues, then disables only the impaired proxy, cleans its
toxics, restores the same listener/upstream, and proves a fresh connection.

The proof also covers partial activation rollback to an exact inactive GET,
malformed proxy-update ownership, exact guarded toxic snapshots, phase-scoped
signal cleanup, bounded socket timers, idempotent daemon/port cleanup, and no
counter/RST/packet claim. The focused proof and all 11 multiplayer-network
suites pass.

## Browser cohort acceptance — implemented

Commit `8f5133a` implements the four-browser F5 fixture, Layer-A discard seam,
managed timeout/fence transport, timeout-causality binding, lifecycle gates,
runner wiring, and bounded cleanup. Clean no-retry artifact
`multiplayer-impairment-2026-07-12T122241558Z-f5-one-client-blackout-4p-0405B1AC-11747e`
passes from committed HEAD.

The accepted run retained one authority PID and four upstream connections
through the guarded outage. Pilot 3 recorded six upstream and 316 downstream
Layer-A discards, including the named action, with zero inbound frames,
snapshot movement, or input-ACK movement during guarded silence. After 25.007
seconds of verified physical drop, only its listener was fenced and restored.
A distinct WebSocket recovered from epoch 1 to 2 in 158 ms; the action kept one
identity and converged to one semantic outcome. Pilots 0 through 2 kept their
original sockets and epoch 1. All scheduler, browser, process, proxy, port, and
registry cleanup gates closed.

This accepts only the local 5/40/15 userspace stream proof. It does not add a
packet-loss, synchronous-RST, live-counter, congestion, WAN, WSS, TLS, hosted,
or canonical-duration claim. T2 slow-reader pressure and Linux netem remain
separate work.
