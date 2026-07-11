# v0.4 Multiplayer Architecture Red Team

> Review date: 2026-07-10. Scope: the three v0.4 architecture, identity, and
> hosted-cost memos, checked against the live v0.3 branch and current primary
> vendor/platform documentation. This is a review, not an implementation plan.

## Verdict

The **central, single-writer authority recommendation survives**. It is the
safest and simplest production topology for LBH's contested movement, contact,
loot, signal, death, extraction, and durable progression. The v0.3 code already
has the right coarse boundaries: a fixed-step sim, separate control plane,
protocol-v2 run/player authority, monotonic command/input counters, Ballpark
identity and spatial queries, swept contacts, bounded events/snapshots, and a
presentation-only client.

The surrounding proposal does not survive unchanged. It prematurely bundles a
30 Hz movement microtick, WSS, binary codecs, recipient AOI deltas, local
prediction, exact field parity, Steam-only identity, a large relational model,
and hosted progression into one first-multiplayer program. That is too many new
failure domains before four humans have completed a truthful run over an
imperfect network.

The simplest safer architecture is:

1. Keep one run in one existing Node authority process.
2. Keep v0.3's map-specific 15/12/10 Hz sim clocks initially; do not introduce
   a 30 Hz subclock until measured WAN feel requires it.
3. Add a persistent WebSocket adapter with JSON first, while retaining the
   HTTP adapter for tests and local diagnostics.
4. Separate owner-private player state from public player state before any
   untrusted session. Send the complete public world initially; defer spatial
   AOI, binary encoding, and baseline deltas until measured bytes require them.
5. Use run-scoped membership, a connection epoch, a short-lived admission
   ticket, and rotated command authority. Do not require the full device,
   inventory-ledger, moderation, and multi-provider schema merely to prove
   multiplayer.
6. Ship invite-only session identity before cloud progression if necessary.
   Add Steam entitlement and transactional hosted settlement only when Greg
   decides hosted progression integrity is part of the first multiplayer
   release.
7. Measure 4- and 8-client CPU, memory, correction, and actual on-wire bytes
   before selecting a vendor or publishing a per-copy service cost.

## Severity-ranked findings

### S0 — blockers before any public or untrusted multiplayer

#### 1. The current trust boundary is correctly diagnosed, but the proposed milestones do not make its closure an explicit first gate

Live v0.3 accepts unauthenticated profile reads and service mutations, lets a
caller choose profile and client identifiers, and returns one shared snapshot
containing every player's `profileId`, exact delta-v, cargo, equipment,
consumables, effects, signal, ability internals, and portal state. Event privacy
does not repair snapshot disclosure. `applyOutcome()` also mutates the profile
before overwriting a run row keyed by run id, so replay can credit EM and stats
again.

The memos identify these defects, but spread their repair across projection,
identity, relational migration, hosted auth, and recovery phases. Public WAN
testing must not precede a narrow security gate:

- authenticated service-to-service settlement;
- authorization on every profile/session object access;
- owner/public snapshot schemas;
- server-created membership rather than caller-owned `clientId`;
- idempotent outcome commit;
- reconnect that cannot accept profile, rig, hull, equipment, or consumable
  mutations from the client.

OWASP's object-authorization rule supports this concern, but the stronger
evidence is the live request and snapshot shape itself
([OWASP API1:2023](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)).

#### 2. The hosted cost conclusion is not decision-grade yet

`$0.18/copy` is a scenario, not a finding. It is the product of two unmeasured
assumptions—12 lifetime hosted player-hours per copy and $0.015 per
player-hour—and the latter folds compute, egress, database, control plane, and
observability into one unexplained allowance. The model does not show fixed
minimum spend, idle/warm capacity, regional mix, database high availability,
backup/restore, logging cardinality, denial-of-service traffic, voice, support
tooling, or launch-peak overprovisioning. At 1,000 copies those fixed costs can
matter more than the modeled $180 variable service cost; at 1,000,000 copies,
operations and support cannot be represented by a flat $0.50/copy reserve.

The current 107.88 KiB snapshot is an uncompressed JSON-size ceiling, while the
proposed 32–96 KiB/s rate is an unbuilt target. Neither is an observed public
wire distribution. The sales table is arithmetically consistent, but it should
be labeled an illustrative cohort scenario and should show at least:

- measured low/base/high player-hour cohorts;
- measured 4/6/8-client bytes and host packing;
- fixed monthly platform/database/observability floors;
- NA/EU and expensive-region egress mixes;
- launch peak and 20–40% warm headroom;
- voice off/on;
- discounts and regional price mix;
- cash timing by monthly cohort.

Do not use `$0.18/copy` to approve hosted progression or a vendor. Use it only
to show why compact replication is plausibly affordable.

### S1 — high-risk architecture assumptions

#### 3. A 30 Hz player/contact microtick is premature and cuts across live v0.3 clocks

The live profiles run Shallows at 15 Hz, Expanse at 12 Hz, and Deep Field at
10 Hz, with lower explicit world/field/growth schedules. The latest Deep Field
budget is 7.74 Hz against an 8 Hz test target. The memo's recommended 30 Hz
movement/contact microtick would therefore be a new multi-clock physics design,
not a transport setting. It must define what happens when a player contact
microtick samples wells, waves, portals, moving wrecks, AI, or a coarse field
whose source state advances at a different cadence. It can also multiply the
most authority-sensitive work before an 8-human CPU profile exists.

Swept contact already addresses the strongest low-tick tunneling failure. Start
at the existing map clock with immediate local input presentation and remote
interpolation. Compare 15/20/30 only after a four-human WAN trace shows that
prediction and sweep cannot protect surf feel. If 30 Hz wins, promote one
shared movement/contact clock with golden parity tests; do not casually bolt a
microtick onto independently moving source bodies.

#### 4. The first milestone contains too many coupled migrations

The proposed sequence makes recipient projection, quantization, component
masks, deltas, tombstones, binary encoding, WSS, message-class queues,
prediction/replay, field revisions, auth tickets, reconnect, and hosted
settlement mutually adjacent. Failures will be difficult to attribute and the
first playable evidence arrives late.

Use vertical falsification slices instead:

- **Slice A:** four clients, existing full public JSON world, owner-private
  state, persistent JSON WebSocket, no prediction, local authority.
- **Slice B:** loss/jitter/reconnect/backpressure with the same schemas.
- **Slice C:** local-player movement prediction against the existing authority
  clock.
- **Slice D:** measure; then add static-manifest separation and deltas.
- **Slice E:** add AOI only if full public-world deltas remain too large.
- **Slice F:** add binary only if serialization or bandwidth is still material.
- **Slice G:** hosted admission and settlement after session gameplay is true.

This ordering protects `Movement Is the Game`: it isolates transport feel from
codec, persistence, and vendor work.

#### 5. Privacy projection is mandatory; MMO-style neighborhood relevance is not

At 4–8 players, owner/public schema separation is a correctness and security
requirement. Spatial AOI is a bandwidth optimization with game-design costs:
off-screen deaths, portals, signals, rival motion, or future team information
may be intentionally global. Toroidal enter/leave and tombstone logic also adds
state-machine surface.

First send all public dynamic bodies after static-manifest separation. Measure
that shape. Add neighborhood relevance only for body families whose absence is
both semantically safe and materially valuable. Do not let an EVE-inspired
relevance vocabulary create MMO machinery for an eight-seat run.

#### 6. The identity model is substantially larger than the product decision supports

The proposed taxonomy includes account, auth identity, entitlement, device,
installation, optional device keypair, auth session, local profile, cloud
profile, party, session, run, membership, player alias, incarnation,
connection, authority grant, authority secret, authority epoch, ticket,
result, settlement, ledger, bans, privacy requests, and revisions. Most are
reasonable eventual concepts; together they are not the smallest identity
model for an invite-only 4–8-player game.

The MVP session kernel needs only:

- verified account subject **or** explicitly local guest subject;
- run id;
- server-created membership id and public run-scoped player id;
- connection id/epoch;
- short-lived join/resume ticket;
- command secret plus command/input sequences;
- idempotent result id if hosted settlement is enabled.

Defer device registration, proof-of-possession keys, party persistence,
moderation schema, inventory instances, currency ledger, and multi-provider
adapters until their product features exist. A relational transaction for
settlement is necessary before authoritative cloud rewards; a maximal schema is
not.

#### 7. Steam-only hosted identity and separate local/cloud progression are product choices, not settled architecture

Steam session ticket exchange is a credible passwordless path: Valve documents
server-side `AuthenticateUserTicket` and app-ownership checks
([Steam authentication and ownership](https://partner.steamgames.com/doc/features/auth?l=english)).
But making Steam the *only* hosted identity path means every player needs an
entitled Steam account and ties hosted multiplayer to one storefront. That may
conflict with web, itch, DRM-free, or friend-pass goals. Likewise, refusing all
economic import from local profiles is the secure competitive default, but it
can be a poor co-op experience if LBH has no trading or leaderboard integrity
to protect.

Greg must decide storefront scope, whether all 4–8 seats require a purchased
copy, whether cloud progression is in the first multiplayer milestone, and how
much cheating matters in private co-op. Architecture should not silently turn
those choices into requirements.

#### 8. Reconnect truth is contradictory across the memos and live code

The architecture memo recommends a 45-second entity grace window. The identity
memo recommends 90–120 seconds. Live v0.3 has neither an account-bound resume
ticket nor a connection epoch: reconnect requires the current command
credential, reuses that credential, and then accepts client-supplied profile,
rig, hull, equipped, and consumable changes. The v0.3 roadmap wording that
authority “rotates” on reconnect overstates the implementation.

Choose one initial policy—90 seconds is a reasonable playtest value, not an
architecture truth—and test it. On reconnect, increment an authority epoch,
rotate the secret, invalidate the old connection, and rehydrate only from sim
and control-plane state. Keep the body hazardous and apply neutral input; do
not accept durable or loadout state from the reconnecting client.

#### 9. Network budgets are target envelopes without a codec or packet trace

The 3 KiB expected delta, 16 KiB keyframe, and 65 KB/s expected downlink are
useful constraints, but no schema/codec demonstrates them. “On-wire” adds a
generic allowance without stating WebSocket batching, TLS record behavior,
compression, TCP acknowledgements, reconnect bursts, or baseline churn. The
budget also needs upstream/action burst totals and per-host aggregate ingress,
serialization CPU, and send-queue memory.

Retain the numbers as falsifiable gates. Do not use them as inputs to vendor
economics until an actual 8-client capture reports p50/p95/p99 by message class,
map, and gameplay phase.

### S2 — important corrections and missing failure modes

#### 10. The Vercel conclusion is based on contradictory current official documentation

The cost memo says Vercel Functions cannot act as WebSocket servers. Vercel's
current limits page still says exactly that
([Vercel limits](https://vercel.com/docs/limits)), but a newer official June
2026 knowledge-base article says Functions now natively support WebSockets,
with connections pinned only for the function's maximum duration and future
connections not guaranteed to reach the same function
([Vercel WebSocket support](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)).

This vendor-doc contradiction invalidates the categorical factual claim. It
does **not** make Vercel a good authority host: bounded connection lifetime,
non-sticky reconnect, and external durable state still make it a weak fit for a
single-writer run. Record it as “not recommended pending vendor confirmation
and a stateful-run proof,” not “unsupported.”

#### 11. Durable Object upside is plausible, but hibernation does not describe an active fixed-step run

Cloudflare's current pricing charges active duration at 128 MB allocation and
bills incoming WebSocket messages at a 20:1 ratio; outgoing WebSocket messages
are not request-billed
([Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)).
Hibernation is valuable for sparse rooms, but a 10–15 Hz authority continuously
advancing simulation cannot hibernate between player messages without a
different scheduling/state model. Each object is single-threaded and has a
soft 1,000 request/s limit, while CPU is accounted per invocation
([Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)).

The memo is right to call this a port and benchmark, but wrong to imply its
chat-room economics transfer automatically. Model an always-active run, timer
jitter, restart reconstruction, and eight clients at actual input cadence. Do
not count hibernation savings during live play.

#### 12. Host packing and regional placement are unproven, so compute cost is not yet known

The only current budget cited is one Deep Field authority profile; it does not
show 4/8 human replication, prediction bookkeeping, per-recipient encoding, or
multiple isolated runs sharing one CPU. Fly's listed 1 GB shared Machine price
and $0.02/GB NA/EU egress are current
([Fly pricing](https://fly.io/docs/about/pricing/)), but “pack several runs” is
the variable that determines unit compute cost. One noisy run must not create
tick debt for its neighbors.

Benchmark one run per process first, then 2/4/8 processes per host with an
explicit fairness gate. Regional tests must include the party-placement rule:
minimize worst-player latency, leader latency, or average latency. That is a
gameplay decision for surfing, not only a hosting toggle.

#### 13. Control-plane outage and sim crash policy need product-facing consequence rules

“Void the run” protects data integrity but can be unacceptable after a long
successful run. The memos defer live sim failover, correctly, yet do not define
whether an interrupted hosted run refunds consumables, preserves the pre-run
loadout, records no Chronicle entry, or grants a bounded consolation. Similarly,
an unavailable control plane can continue a leased run, but the lease duration
and final result queue durability are unspecified.

Before hosted progression, define a pre-run checkout transaction, settlement
idempotency, interruption outcome, retry retention, and operator replay path.
Do not attempt transparent hot failover for v0.4.

#### 14. TCP head-of-line and backpressure policy needs an explicit reliable-event escape hatch

WSS is the correct first transport. However, a single ordered TCP stream means
large baselines and reliable events can delay fresh deltas. Coalescing state
does not help bytes already queued in the kernel or intermediary. Chunk
baselines, cap application and socket buffered bytes, stop producing dependent
deltas during rebase, and disconnect a client before reliable event retention
can no longer serve it. Only consider WebTransport after packet traces show
this is a real movement problem.

#### 15. “Reliable semantic events immediately” conflicts with tick-boundary determinism

Socket reads should enqueue intents and the sim should publish one stamped
output after a tick. Gameplay events produced by that tick should therefore be
delivered promptly **after the authoritative tick commits**, not “immediately”
from arbitrary callbacks. Out-of-band control events such as heartbeat,
shutdown notice, or admission rejection can bypass the tick. This wording
should be tightened so transport urgency does not become mid-tick mutation.

## Missing failure tests

The proposed harness is strong, but should add these cases explicitly:

- two players claim the same Steam/account subject or profile seat;
- admission succeeds but the sim dies before membership confirmation;
- sim accepts a player but the control plane times out and retries placement;
- result settles while a delayed old sim also attempts settlement;
- reset/new run races a reconnect for the old run;
- ticket is consumed on one edge while a duplicate reaches another edge;
- server deploy or region evacuation occurs during a run;
- database is read-only, slow, or out of connections at settlement time;
- static manifest/content hash differs between clients and authority;
- owner-private data appears in logs, metrics labels, crash dumps, or replays;
- baseline chunk loss occurs after later reliable events have arrived;
- one client advertises support for a codec/schema it cannot decode;
- one process-hosted run monopolizes CPU and harms sibling runs;
- all eight players reconnect simultaneously after a regional network flap;
- the party has one cross-ocean outlier and region selection is visibly bad;
- a player is offline when entitlement cache expires mid-run;
- account deletion or ban arrives during a live run;
- local/cloud profile names collide and the UI launches the wrong lineage.

## Decisions that truly need Greg

These are product choices. Everything else can be falsified by engineering
spikes without blocking on taste or business policy.

1. **First release boundary:** session-only multiplayer with local progression,
   or authenticated hosted progression in the same milestone. Recommended:
   prove session multiplayer first.
2. **Store and entitlement scope:** Steam-only, every seat owns a copy, versus
   friend pass/guest/web/itch support. Recommended MVP if Steam launch is the
   goal: Steam-only entitled seats, but keep the provider boundary narrow.
3. **Progress integrity:** competitive/leaderboard-clean cloud economy versus
   permissive private-co-op imports. Recommended: separate lineages only if
   hosted progression has competitive value; otherwise allow a clearly tagged
   one-time import.
4. **Reconnect/abandon behavior:** how long a ship remains reserved and what
   happens to its hazardous body. Recommended starting test: 90 seconds,
   neutral input, hazards remain live.
5. **Late join:** allowed throughout, cutoff by run phase, or disabled after
   launch. Recommended first playable: reconnect only; add true late join after
   the four-player core is stable.
6. **Information design:** which rival/player facts are legitimately visible,
   and whether Chronicle echoes are private, party-visible, or shared.
7. **Crash consequence:** void/refund/consolation policy for interrupted hosted
   runs. Recommended: restore the pre-run durable state and record an
   interruption with no reward or loss until settlement reliability is proven.
8. **Voice scope:** platform voice, third-party relay, or no built-in voice for
   v0.4. Recommended: no custom voice in the first architecture milestone.

Greg does **not** need to choose WSS versus WebTransport, JSON versus binary,
15 versus 30 Hz, Fly versus Cloudflare, or AOI radii now. Those should be
evidence-driven gates.

## Recommended decision record

Adopt the following provisional v0.4 thesis:

> LBH multiplayer uses one run-scoped, server-authoritative sim. v0.4 first
> proves four, then eight clients over persistent WebSockets while preserving
> v0.3 authority, movement, Ballpark, privacy, and recovery contracts. The
> initial transport uses JSON and existing map clocks. Owner/public projection
> is mandatory; AOI, binary deltas, a 30 Hz movement clock, hosted progression,
> and vendor-specific runtimes must earn adoption through measured traces.

This keeps the central recommendation, removes speculative machinery from the
critical path, and leaves clean seams for the richer identity and hosting model
when the playable evidence justifies them.

## Evidence checked

Live branch sources inspected:

- `docs/v0.3/ROADMAP.md`
- `docs/v0.3/OPEN-DECISIONS.md`
- `docs/project/LOCAL-PROTOCOL.md`
- `docs/project/NETWORK-ARCHITECTURE-PLAN.md`
- `docs/project/SIM-DECOUPLING-PLAN.md`
- `src/content/session-profiles.data.json`
- `src/sim/sim-client.js`
- `scripts/sim-runtime.cjs`
- `scripts/sim-protocol.cjs`
- `scripts/sim-event-journal.cjs`
- `scripts/sim-snapshot-ring.cjs`
- `scripts/control-plane-store.cjs`

Current primary external sources are linked beside the claims they support.
