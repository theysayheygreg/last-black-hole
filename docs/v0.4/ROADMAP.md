# v0.4 Multiplayer Roadmap

> Branch truth: `codex/v0.4-multiplayer-architecture`.
>
> Release thesis: **one match, one logical authority; concurrent matches,
> concurrent authorities; finish an honest four-player product before hosted
> packing or high-count work.**

## Current Checkpoint

**Program closeout (2026-07-14):** the multiplayer architecture and costing
goal is complete. Stop extending provider-cost and deployment-benchmark tooling
under this goal. Regional capture, 90-minute soak, and 1/2/4/8 independent-
authority packing remain optional validation work that requires a fresh,
explicit authorization. The next product milestone is the playable four-human
S20 journey.

The research/planning program, durable hosted reference path, and fail-closed
local HTTP reference runtime are complete. Public product implementation,
production provider composition, and deployment proof are not.

- S20 is admitted for one through four players.
- Eight is closed for v0.4. S23/S23P remain default-off research paths; the
  split-fragment prototype is fully reverted. No further eight-player protocol
  optimization is selected.
- Phase 0 trust and local evidence, Phase 1 same-process WSS, failure/reconnect/
  pressure work, and the low-count replication staircase are preserved in
  source and evidence history.
- Provider-neutral hosted identity/entitlement, placement/incarnation/fencing,
  encrypted product state, immutable result outbox, and exact multi-member
  settlement are implemented as pure services with durable SQLite adapters.
  Local JSON remains the default and relational SQLite is explicit opt-in.
- The local hosted HTTP reference runtime is tested across separate client,
  control, and workload auth planes, four seats, strict envelopes, workload
  reincarnation rejection, result/settlement, and restart replay. It is
  fail-closed but not publicly deployed or production-provider composed.
- The full core harness is green. The source-bound benchmark container builds
  locally; startup executes `tcpdump -D` and correctly fails without local
  `NET_ADMIN`/`NET_RAW`. Fly packet-capture capability, provider auth, four
  external origins, and signer/evidence inputs remain unproved/blocking.
- S24 measured a synthetic H24 component fixture only. The live 24-client
  cohort never admitted and raw capture never started. H48/H96 are far
  extrapolations; X96 fails its model screens.

The next work is a four-player product path, not another eight-player rescue.

## Milestone 1 — Four-Player Product Completion

Goal: make the admitted S20 one-through-four path the only normal multiplayer
replication contract and turn the existing local proof into a coherent private
product journey.

The active execution contract is
[`FOUR-HUMAN-PRODUCT-PLAN.md`](FOUR-HUMAN-PRODUCT-PLAN.md). Work proceeds in
this order:

1. **Crew Muster:** stage one authority with frozen world time, admit one
   through four humans, expose host/crew role and seat count, launch once under
   host authority, and remove silent local fallback on multiplayer failure.
2. **Invitations and readiness:** distinct host/join choices, bounded join-code
   surface, four player-readable seats, and clear full/expired/version errors.
3. **Shared-run readability:** identity, teammate state, salvage/signal
   consequence, extraction, and death cues that preserve the ASCII-fluid view.
4. **Failure continuity:** persistent connecting/reconnecting/recovered states,
   reserved seat/body policy, old-epoch fencing, leave, and host departure.
5. **Result and rematch:** one canonical outcome, private reward details, new
   run lineage, and clean leave-to-home.
6. **Evidence and Greg gate:** coherent 1/2/3/4-browser journeys, a real fifth
   browser rejection, four-human playtest pack, and 80/120/160 ms feel passes.

S20 negotiation/fallback, owner privacy, ACK/rebase, reliable actions,
reconnect fencing, and bounded queues remain frozen guardrails. Local/offline
play and the embedded authority remain independent. Three, VFX, UI, audio, and
high-resolution fluid remain presentation-only.

Acceptance:

- every four-player evidence run is `NORMAL`, every recipient >=9 Hz in the
  representative Deep Field profile, and application average <=64 KiB/s/client;
- current S20 reference stays within its measured 30,203–31,018 B/s/client mean
  and 32,361–32,766 B/s p95 unless a separately reviewed schema change explains
  the delta;
- no owner-private field crosses recipients; no duplicate irreversible
  consequence; no unbounded app/reliable/transport queue;
- reconnect fences old control before new control and never accepts caller
  profile/loadout/inventory truth;
- local launch and run completion work with platform/cloud unavailable;
- Greg completes movement honesty/art/readability review at four humans.
- no human requires terminal commands, test APIs, or operator intervention to
  create, join, launch, finish, reconnect, leave, or rematch.

Abort:

- any fifth-seat admission, privacy leak, duplicate settlement/consequence,
  queue growth, authority split, or product dependence on S23/S23P/split.

### Optional Lane — GregBot Friends-Only Internet Host

This is an optional private-play bridge, not a prerequisite for the verified
hosted program. Greg may host one S20 authority locally for himself and exactly
three invited remote players through an identity-gated outbound tunnel. It
must use an isolated appliance, loopback-only origin, exact-email perimeter
authentication, one-use game invitations, four-seat enforcement, unverified
local results, bounded lifetime, and tunnel-first emergency shutdown.

The complete plan and abort gates are in
[`OPTIONAL-LOCAL-INTERNET-HOST.md`](OPTIONAL-LOCAL-INTERNET-HOST.md). Its
evidence cannot prove cloud regional hosting, authority packing, verified
progression, or 24/48/96-client capacity.

## Milestone 2 — Greg Chooses The Service Product

This is a product checkpoint, not an engineering benchmark.

Choose one:

1. central verified authority and cloud progression;
2. hybrid hosted identity/settlement with private player-host continuity;
3. local/private-only first release.

Also ratify entitlement/storefront, local-to-cloud import, AI fill, reconnect
body, late join, leader powers, voice, Chronicle visibility, account
concurrency, youth/region scope, and service-tail promise. All unresolved calls
are in [`OPEN-DECISIONS.md`](OPEN-DECISIONS.md).

Do not let a provider benchmark silently select product policy.

## Milestone 3 — Phase 5 Identity, Settlement, And Placement

Goal: build the provider-neutral control plane while retaining local mode.

Committed reference-path checkpoint (2026-07-14): Stages 3A–3D now compose in
one durable four-member SQLite lifecycle. Provider proofs are one-shot,
entitlement is separately checked and terminal states cannot be replayed into
access, account/profile ids are server-derived, placement fences authority
instance plus process incarnation, product state is encrypted at rest, and
placement-owned terminal-result acceptance feeds an immutable outbox and
exactly-once multi-member settlement. Accepted authority lineage is retained
through settlement replay until the exact settlement-ack/archive protocol
closes it. At that checkpoint this was service/repository evidence only; the
later fail-closed local HTTP reference still does not constitute a public or
regional deployment claim.

Durability closure checkpoint (2026-07-14): the co-located single-SQLite
reference now repairs exact bootstrap, ready, admission, and drain response-
loss/crash windows; placement owns the exact admitted-membership digest/count;
and a prepared-result journal plus bounded settlement-worker recovery closes
the terminal placement-to-outbox gap. Independent final review found no P0/P1
in this demonstrated local composition.

Final local lifecycle checkpoint (2026-07-14): reviewed legacy identity-HMAC
migration now fences startup and new linking until untagged rows migrate.
Unverifiable pre-repair placement acceptances refuse startup by default and
only an explicit operator-reviewed quarantine permanently fences their run
lineage without fabricating member truth. Catchable create failures compensate
the exact placement; hard crashes are bounded by readiness-deadline sweep.

Exact settlement receipts now acknowledge placement's accepted tuple and move
it into a finite payload-free audit plus permanent closed-lineage fence.
Delivered/settled outbox, journal, and result payloads redact and clean up under
bounded retention while pending, leased, and unsettled dead-letter rows remain
safe. Bounded restartable account erasure/de-identification runs only after
archive acknowledgement and repeats its live-run/settlement safety checks
inside the same SQLite writer lock to close TOCTOU races. Independent final
red-team found no P0/P1 in this demonstrated co-located composition.

Remaining P2/policy work is explicit: erasure-key custody and rotation;
status/worker authorization nuance; legal, accounting, and privacy retention
schedules; unsettled dead-letter operator workflow; production provider and
key custody; and distributed multi-database/cross-region transaction,
acknowledgement, cleanup, and erasure semantics.

Local crypto-rotation checkpoint (2026-07-14): identity-subject HMACs,
encrypted product match state, and placement bootstrap/admission tokens now use
bounded current-plus-previous keyrings. Placement/product key identifiers are
authenticated and identity key identifiers are validated against the configured
ring; old generations dual-read, identity and product rows lazily migrate with
compare-and-set protection, migrated data survives safe old-key retirement,
and unknown/tampered identifiers fail closed. This is local repository/codec
proof, not production key custody, public deployment, or a coordinated multi-
database rotation protocol.

Stage A boundary checkpoint (2026-07-14): default local/offline behavior is
unchanged, while explicit hosted mode now requires service authentication,
uses a strict versioned plain-data envelope, emits generic errors and
pseudonymous diagnostics, rejects caller bypass/identity smuggling, and binds
the product cap to one through four at control-plane plus reusable ticket/
authority gates. Hosted public identity remains deliberately unavailable
until 3B; this is boundary hardening, not a hosted product claim.

### 3A. Relational local parity

**Reference implementation complete.** The JSON adapter remains default;
SQLite is explicit opt-in and preserves import/export/delete/reopen boundaries.

- put profile revisions, inventory, ledger, result, settlement, session,
  membership, placement, and lease repositories behind current interfaces;
- import current JSON/local saves with dry-run report, source hash, rollback
  copy, export, deletion, and crash-boundary tests;
- prove identical result delivery 100 times mutates once and conflicting hash
  quarantines.

### 3B. Hosted identity and privacy

**Pure service plus durable SQLite reference complete.** A fail-closed local
HTTP reference is tested; public deployment and production provider integration
remain open.

- exchange a verified provider ticket for an internal account session; check
  entitlement separately; store no LBH password and no hardware fingerprint;
- implement rotating refresh families, ownership middleware, local/cloud
  lineage UX, safe import, link/unlink, export/delete, retention, and minimal
  moderation;
- use run-public aliases in gameplay and evidence; keep provider/account/device/
  cloud-profile/lease/secret data out of public state, replay, and logs.

### 3C. Placement, lease fencing, and tickets

**Pure service plus durable SQLite reference complete.** Lease epochs and
authority process incarnations fence stale work; public fleet wiring remains
open.

- register capacity and artifact/protocol compatibility;
- create one active monotonic writer lease for each live run; route every
  member to it; fence stale heartbeat/route/ticket/result work;
- issue opaque short-lived single-use admission/resume tickets bound to
  account/profile/session/run membership, player/seat, authority lease,
  process/incarnation, capability, and manifest;
- leader promotion changes lobby role only, never gameplay authority.

### 3D. Hosted settlement

**Durable reference complete.** Placement owns the one terminal result CAS;
the encrypted product path, immutable outbox, exact member set, and SQLite
settlement remain replay-safe across reopen. Production delivery remains open.

- authenticate each authority workload, not one shared fleet bearer;
- submit immutable result facts through an encrypted bounded outbox;
- transact one result, settlement, ledger/inventory mutation, profile revision,
  and Chronicle update; identical retry returns original; conflict quarantines;
- expose `RESULT PENDING`; never credit client-authored temporary currency.

Acceptance:

- two placement claimants, stale authority return, stale ticket, and stale
  result cannot produce two writers or two settlements;
- changing any account/profile/session/run/member/player/connection id cannot
  transfer authorization;
- one-through-four admit and fifth/eight reject at every trust boundary;
- local mode remains network-independent; safe import cannot mint cloud
  economics; secrets/PII pass structured-log and replay scans;
- no P0/P1 remains in the demonstrated local identity/placement/settlement
  composition; listed P2 production/migration/operations gaps stay explicit.

Abort:

- optional hosted-auth bypass, shared fleet settlement credential, client-
  chosen durable identity, two active leases, client snapshot recovery, or a
  local mode that requires the cloud.

## Milestone 4 — Phase 6 Regional Four-Player Benchmark

Goal: select authority runtime from measured LBH evidence.

Current checkpoint: the Fly artifact, entrypoint, config, and fail-closed
preflight are committed and the preflight suite passes 13/13. The source-bound
container builds locally. Its startup executes `tcpdump -D` and fails without
local `NET_ADMIN`/`NET_RAW`, which is correct fail-closed behavior. No Machine
has been deployed and no regional capture exists. Fly runtime capture
capability must be probed after authentication; Fly auth, four external client
origins, and signer/evidence inputs remain blockers.

Run the exact same artifact, seed, four-client schedule, Deep Field content,
and 90-minute soak in at least two regions:

1. Fly Machines performance CPU—the first benchmark;
2. Hetzner CCX—the operational fallback;
3. Cloudflare Container and/or ordinary DigitalOcean-style container;
4. one Durable Object per match as a separate port experiment.

Cloudflare edge plus Postgres remains the control-plane reference. Vercel may
host compatible web/control surfaces but is not a live authority candidate.

Record:

- startup/readiness/drain/replacement and route/lease transitions;
- recipient cadence, writer and projection p50/p95/p99, CPU, RSS/heap, GC,
  event-loop delay, tick debt, overload, and result-outbox timing;
- application and on-wire bytes/s, packets/s, WebSocket/TLS overhead,
  retransmit/loss, reconnect/rebase bursts, and regional egress;
- application/reliable/transport queue high-water and slow-client isolation;
- actual invoice inputs and regional placement/availability failures;
- four-human movement/readability review at realistic RTT/loss/jitter.

Acceptance:

- 90 minutes in `NORMAL`; all recipients >=9 Hz; writer p95 <50% and p99 <70%
  of the chosen frame budget; application average <=64 KiB/s/client;
- bounded queues, no healthy-peer starvation, no duplicate/forked writer,
  reconnect <=3 seconds p95 after socket open, late join <=2 seconds p95 if
  product policy enables it;
- 80/120/160 ms WAN cases preserve truthful consequences and pass Greg's
  movement-feel gate at the supported threshold;
- cost projection uses the observed runtime rate and egress, not a blended
  planning constant.

Abort:

- normal operation needs TiDi; forced socket epoch creates a second writer;
  a provider cannot guarantee the required runtime epoch; queues, RSS, CPU, or
  egress are unbounded; or one client can delay another/the writer.

## Milestone 5 — Measure `safeAuthoritiesPerHost`

Goal: determine horizontal fleet economics without pretending copies equal
concurrency or vCPU equals density.

- run 1/2/4/8/... independent four-player matches per host with unique leases,
  queues, journals, result outboxes, and process/resource accounting;
- counterbalance normal and noisy-neighbor match schedules;
- saturate CPU, writer lanes, RAM/RSS, egress, packet rate, encode throughput,
  process/socket caps, and failure-domain policy independently;
- kill/drain one authority and one host while other matches continue;
- set `safeAuthoritiesPerHost = floor(largestPassingDensity * safetyFactor)`.

Acceptance:

- every match preserves the Milestone 4 gates under the declared safety
  factor; no cross-match privacy, routing, starvation, or settlement effect;
- host failure blast radius and warm reserve meet the chosen service posture;
- measured density and uncertainty feed the economics config and provider
  comparison.

Abort:

- any writer-tail regression outside the precommitted tolerance, cross-match
  starvation, aggregate queue/RSS/egress/PPS breach, or shared failure-domain
  exposure beyond policy.

## Milestone 6 — Private Continuity

Goal: make the economically safer long tail explicit without weakening
verified play.

- add a transport abstraction and relay-assisted player-host authority;
- select host from RTT, loss, uplink, CPU, power/suspend risk, and deterministic
  tie-break; do not call this authority-free P2P;
- keep results local or visibly unverified;
- prototype canonical checkpoint plus event/input watermarks, new authority
  epoch, credential rotation, and old-host fence before claiming migration;
- test graceful leave, process kill, Wi-Fi change, sleep, relay-only path,
  partition, stale-host return, and result duplication.

Acceptance: a non-adversarial private session either resumes one canonical
authority within the chosen pause budget or ends explicitly; no partition can
produce two verified settlements.

## Deferred Scale Track — S24 Then 48/96

Do not reopen this track before Milestones 1–5 establish the four-player host,
network, and packing baseline.

### Current evidence

| Vector | Evidence class | writer | B/s/client | match traffic |
|---|---|---:|---:|---:|
| H24 representative | measured synthetic | 0.828/1.417 ms p95/p99 | 13,468 | 2.586 Mbit/s |
| H24 dense | measured synthetic sensitivity | 3.417/4.333 ms p95/p99 | same schema assumption | same schema assumption |
| H48 base | far extrapolation | 1.207 ms | 26,354 | 10.120 Mbit/s |
| H96 base | far extrapolation | 2.646 ms | 50,150 | 38.515 Mbit/s |
| X96 base | modeled rejection | 86.769 ms | 118,219 | 90.792 Mbit/s |

The live H24 cohort never admitted and raw capture never started. The table is
not capacity evidence.

### Re-entry order

1. build a production-valid exact H24 fixture: 24 clients, 400 dynamic bodies,
   48 expensive AI, declared field/world/event schedules;
2. pass admission/privacy/cleanup without consuming the single paced capture;
3. run one warmed 24-client live capture and record real cadence, overload,
   writer stages, CPU/RSS/GC, queues, application/on-wire traffic, PPS, and
   cleanup;
4. require H24 normal operation without TiDi, p95 <=16.667 ms, p99 <=23.333 ms,
   <=64 KiB/s/client average, and bounded queues before any H48 experiment;
5. introduce AOI, dirty components, multirate far lanes, and deterministic
   derived-work workers only from measured bottlenecks;
6. treat H48/H96 as new empirical programs. X96 is an overload/fairness probe,
   not normal capacity.

Exactly one canonical writer remains per match at every population. Internal
workers may return pure revision-tagged derived work behind barriers; they
never commit gameplay. Do not reopen multi-writer sharding until an optimized
one-writer H96 fails and spatial handoff correctness plus material benefit are
proved.

## Release Gates

A hosted v0.4 alpha requires all of the following:

- Greg has ratified the service/product decisions;
- natural four-human invite, play, reconnect, result, and rematch journeys;
- Phase 5 identity/privacy/lease/settlement gates and no P0/P1, with remaining
  P2 erasure-key custody/rotation, status/worker auth nuance, retention/legal/
  accounting policy, dead-letter operations, production provider/key custody,
  and distributed multi-database/cross-region semantics closed;
- Phase 6 two-region 90-minute proof and Greg movement/art judgment;
- measured authority density or an explicit one-authority-per-host budget;
- current provider prices refreshed and the unit-economics model regenerated;
- a declared outage, interruption, refund/support, privacy, moderation, and
  service-tail policy.

Eight-human playable proof is deliberately not a v0.4 gate because eight is
not an admitted v0.4 product surface.

## Non-Goals

- another eight-player replication optimization;
- authority-free public P2P or peer-authored verified settlement;
- one global gameplay authority or multiple writers for one match;
- unmeasured host packing;
- Vercel Functions as live match truth;
- built-in voice before product need and moderation/privacy budget;
- H48/H96 implementation from the current synthetic fit;
- moving gameplay truth into Three, UI, VFX, audio, or GPU fluid.
