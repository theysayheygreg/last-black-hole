# v0.4 Multiplayer Program Completion Audit

> Audited 2026-07-14 against Greg's original request and later authority and
> 24/48/96 clarifications.

## Verdict

The **research, architecture, comparison, costing, identity model, forecasting,
staged implementation plan, and durable hosted one-through-four reference
path are complete and decision-ready** on
`codex/v0.4-multiplayer-architecture`.

The ideal gameplay outcome is only partially complete:

- the requested minimum of four is admitted locally through S20;
- the requested maximum of eight is not admitted and is closed for v0.4;
- hosted identity/entitlement, placement/incarnation/fencing, encrypted product
  state, and exact multi-member outbox/settlement are implemented as pure
  services with durable SQLite adapters;
- a fail-closed local hosted HTTP reference runtime is implemented and tested,
  but public exposure, production provider composition, and a public regional
  authority are not complete;
- live host density, WAN cost/feel, and H24/H48/H96 capacity are unproved.

No document should describe LBH as an already complete 4–8-player public game.

## Status Definitions

- **PROVEN:** supported by committed implementation plus relevant evidence.
- **DECIDED:** architecture/product recommendation is reconciled and ready to
  implement, but not necessarily shipped.
- **MODELED:** formulas/assumptions and provenance exist; not a capacity claim.
- **REJECTED:** a direction failed or was ruled out under declared evidence.
- **OPEN:** requires Greg choice or future implementation/measurement.

## Requirement Audit

### 1. New v0.4 branch off v0.3

**PROVEN.** The live branch is `codex/v0.4-multiplayer-architecture`, created
from the v0.3 Ballpark line. Any stale v0.3 goal-metadata string is overridden
by live Git state and this v0.4 source-of-truth set. The branch has not been
merged backward to v0.3 or `main`.

### 2. Multiplayer for minimum four, maximum eight

**PARTIAL.** S20 admits one through four. Its two four-player product rounds
are `NORMAL` at 9.80–9.85 Hz, 30,203–31,018 B/s/client mean,
32,361–32,766 B/s p95, 54.65–55.04 ms projection p95, and 0.585–0.589
authority core.

Eight is **REJECTED for v0.4**:

- S23 recovered cadence but failed p95/p99 and low-count non-regression;
- S23P improved S23 but still failed 50/70 ms absolute gates and S20
  non-regression;
- the final split-fragment screen crossed its pre-screen abort at 55.9045 ms
  projection/publish p95, was not rerun, and was fully reverted.

S23/S23P remain executable default-off research paths. Split-fragment is
historical only and absent from live source. No further v0.4 eight-player
optimization is selected.

### 3. Ballpark and EVE-inspired sim/client compatibility

**DECIDED and locally grounded.** One run remains one coarse causal unit. The
match authority owns movement, Ballpark bodies/lifecycle, contacts, AI, loot,
signal, death, extraction, events, and results. Clients own input sampling,
local prediction/presentation, interpolation, high-resolution fluid, Three,
UI, VFX, and audio. Durable identity/settlement is separate from the hot sim.

### 4. Multiple clients and unique local/cloud identifiers

**PROVEN as a hosted reference path; production integration OPEN.** The
identity model distinguishes install,
random device registration, provider identity, entitlement, account, LOCAL and
CLOUD profiles, party/session membership, run membership, public player alias,
client process/incarnation, connection/epoch/grant, body incarnation,
authority instance/lease epoch, result, and settlement.

Identifiers locate records; scoped proof and relationships authorize them.
No hardware fingerprint is used. LOCAL and CLOUD economics remain separate;
safe import excludes currency/vault/upgrades/competitive history. Public
gameplay/replay excludes provider/account/device/profile/workload/lease ids,
secrets, raw IP, and moderation records.

The committed provider-neutral service derives account/profile ownership from
verified provider proof, consumes proof/callback once, checks entitlement
separately, preserves terminal entitlement state, rotates sessions, and stores
durable identity in fenced SQLite. Caller-supplied locator/id changes do not
transfer authorization. The existing local JSON control plane remains default;
the relational SQLite adapter is explicit opt-in.

### 5. True no-authority P2P comparison and industry history

**COMPLETE and DECIDED.** The research compares deterministic lockstep,
rollback mesh, distributed object authority, player-host/listen authority, and
dedicated authority. Historical cases cover Age of Empires, GGPO, Diablo,
DirectPlay host migration, Destiny, Colyseus, Donnybrook, Steam Datagram
Relay, ICE/STUN/TURN, and partition/consensus limits.

Decision: reject true authority-free public P2P; keep relay-assisted
player-hosted authority for private/local continuity with unverified
progression; use dedicated authority for verified play; prototype deterministic
replay/rollback beneath authority where useful.

The modeled eight-peer input/hash mesh is ~165 kbit/s per direction per peer
without voice and ~473 kbit/s with full-mesh voice. Bandwidth is feasible;
determinism, 28-route quality, NAT/relay, cheating, privacy, partition
settlement, and support are the blockers.

### 6. Centrally hosted MMO-style source of truth and provider cost

**DECIDED, priced, and implemented as a durable reference; deployment OPEN.**
“One dedicated authority” means one
logical writer per match/group, multiplied by concurrent matches, not one
global authority. A central control plane owns account, entitlement, party,
placement, tickets, cloud profiles, and settlement. Each run receives one
fenced authority lease; many authorities may share a host only after packing
measurement.

Provider position from official sources accessed 2026-07-14:

- Fly performance CPU: first live-authority benchmark;
- Cloudflare Workers/Pages edge plus Postgres: control plane;
- Hetzner CCX: operational fallback; CX is price-floor experiment only;
- Cloudflare Container, one Durable Object per match, and ordinary container:
  measured comparators;
- Vercel: web/control only; bounded function epochs are not uninterrupted
  match authority;
- Railway/Cloud Run: not first authority because socket/request lifetime needs
  explicit continuity proof.

No unmeasured packing is credited.

The committed reference composes identity/entitlement, four-seat membership,
placement, monotonic lease epoch, authority instance plus process incarnation,
encrypted match state, one placement-owned terminal-result CAS, immutable
outbox, and exactly-once multi-member settlement. Reopen/retry proof preserves
one settlement and each exact member's profile/ledger/inventory mutation.
Accepted authority lineage remains retained until an explicit future
settlement-ack/archive protocol.

The fail-closed HTTP reference runtime exercises distinct client/control/
workload auth planes, strict bounded envelopes, one-through-four admission,
authority-incarnation rejection, terminal result/settlement, and restart
replay against the local composition. It is not a public deployment or a
production provider composition.

The local co-located SQLite durability proof closes exact bootstrap, ready,
admission, and drain replay windows; makes placement authoritative for exact
admitted-membership digest/count; and uses a prepared-result journal with
bounded settlement recovery. Independent final review found no P0/P1 for the
demonstrated local composition. Remaining P2s are create-time placement
capacity reclamation via sweep, migration/reset policy for pre-repair accepted
rows, retention/privacy operations, production key custody, and the co-located
single-SQLite/direct-callback boundary.

Identity-subject HMAC, encrypted product-state, and placement-token key
rotation are **PROVEN locally**. Each uses a bounded current/previous keyring;
placement/product key identifiers are authenticated and identity key
identifiers are validated against the configured ring; old generations dual-
read; identity and encrypted product rows lazily migrate with compare-and-set
protection; migrated state survives safe retirement; and unknown/tampered key
identifiers fail closed. This is not a public, multi-database, or production
key-management deployment claim.

Fly packaging and fail-closed preflight pass 13/13. The source-bound container
builds locally; startup executes `tcpdump -D` and fails without local
`NET_ADMIN`/`NET_RAW`. Fly runtime capture capability remains unproved and must
be probed after authentication. The actual regional run is **NOT DONE** because
Fly auth, four external client origins, and signer/evidence inputs are absent.
Therefore there is no observed authority density, packing factor, invoice, or
cost claim.

### 7. $4.99 economics at 1K, 10K, 100K, and 1M copies

**COMPLETE as a reproducible model.** Inputs, formulas, source statuses, full
tables, component ledgers, sensitivity rows, and checksums live under
`evidence/unit-economics/` and are documented in
[`MULTIPLAYER-UNIT-ECONOMICS.md`](MULTIPLAYER-UNIT-ECONOMICS.md).

Fly four-seat authority cost is $0.0590/$0.0693/$0.0903 per authority-hour or
$0.014750/$0.017325/$0.022575 per occupied player-hour best/base/worst.
Central break-even is 614/11,598/none.

Central contribution at 1K/10K/100K/1M:

| Case | 1K | 10K | 100K | 1M |
|---|---:|---:|---:|---:|
| best | $1,537 | $37,365 | $395,644 | $3,978,440 |
| base | -$30,984 | -$4,670 | $258,468 | $2,889,848 |
| worst | -$1,756,030 | -$1,763,504 | -$1,838,241 | -$2,585,609 |

The worst central case is structurally loss-making: $2.816 receipts/copy are
below $3.646 variable operations/copy before its 84-month $20,300/month fixed
stack and $50,000 one-time work. At 1M, operations are $5,401,400 against
$2,815,791 receipts. Hybrid and local remain positive at large scale under the
modeled cases; all remain planning models pending actual retention, occupancy,
support, egress, and safe density.

### 8. One authority per match, multiplied by concurrent matches

**PROVEN as the current local boundary and DECIDED for hosted.** Every owned
integration document now uses the same definition. Internal high-count workers
may produce pure revision-tagged derived work behind deterministic barriers;
only the match writer commits gameplay.

### 9. Heavy 24/48/96 network and server forecasts

**PARTIALLY MEASURED SYNTHETICALLY; otherwise MODELED, not capacity.**

| Vector | Evidence | Writer | B/s/client | Match traffic |
|---|---|---:|---:|---:|
| H24 representative | measured synthetic fixture | 0.828/1.417 ms p95/p99 | 13,468 | 2.586 Mbit/s |
| H24 dense | measured synthetic sensitivity | 3.417/4.333 ms p95/p99 | same schema | same schema |
| H48 base | far extrapolation | 1.207 ms | 26,354 | 10.120 Mbit/s |
| H96 base | far extrapolation | 2.646 ms | 50,150 | 38.515 Mbit/s |
| X96 base | modeled rejection | 86.769 ms | 118,219 | 90.792 Mbit/s |

The synthetic fixture did not pace the live authority, open real sockets,
observe actual CPU scheduling/queues, or capture on-wire traffic. The proposed
live H24 cohort never admitted: ordinary adapter capacity was 16, exact
400-body/48-AI production load did not exist, and two guarded eligibility
attempts failed at first-client state-pair admission. The raw command never
started according to the orchestrator and no `raw.json` exists.

H48/H96 exceed the measured domain by 2.25x/4.5x bodies and 2x/4x recipients.
They are far extrapolations. One writer per match remains mandatory; derived-
work workers at 48/96 never become additional gameplay authorities.

At refreshed Fly NA/EU egress, those application rows imply network-only
floors of about $0.023/$0.091/$0.347 per H24/H48/H96 match-hour. The older
64 KiB/s-client S1 total planning sensitivity is
$0.2206/$0.4412/$0.8824 per match-hour. Both are MODELED: live provider CPU,
RSS, queues, worker barriers, and safe allocation remain unmeasured.

### 10. Broad goal prompt and subagent orchestration

**COMPLETE.** `ORCHESTRATION.md` and the project prompt packets define the
durable objective, disjoint ownership, continuation order, checkpoints, and
research lanes. Returned research and evidence are committed independently and
integrated here.

### 11. Heartbeats and continuation across usage windows

**COMPLETE as an operating mechanism.** The recurring
`lbh-v04-multiplayer-orchestrator` heartbeat checks CodexBar, goal state, live
agents, branch/status, and continues or checkpoints according to usage. This
audit does not claim Codex can bypass provider rate limits; it records the
durable handoff and automatic resumption behavior.

### 12. CodexBar limit/reset monitoring

**COMPLETE operationally.** Heartbeats run the local CodexBar command and use
the returned primary threshold/reset when available, tolerating provider
notification lines and unavailable primary fields. Limit monitoring is not a
game deliverable and does not alter repository architecture.

### 13. Commit and verification discipline

**PROVEN.** Research, architecture, experiments, reverts, evidence, provider
refresh, and economics are preserved as atomic commits. The final synthesis
is docs-only and runs link/path, diff, economics, S24 terminal, split-terminal,
and relevant local validation without another network suite.

## Completion Matrix

| Deliverable | Status |
|---|---|
| v0.4 branch from v0.3 | PROVEN |
| Ballpark/EVE-compatible architecture | DECIDED |
| one-through-four local product evidence | PROVEN |
| eight-player v0.4 product | REJECTED |
| one logical authority per concurrent match | PROVEN/DECIDED |
| authority-free P2P study | COMPLETE; rejected for production |
| player-host private fallback | DECIDED; implementation open |
| local/cloud/hybrid identity model | PROVEN reference; production integration open |
| fenced per-match lease and settlement model | PROVEN durable reference; deployment open |
| fail-closed local hosted HTTP reference runtime | PROVEN locally |
| public hosted deployment/provider composition | INCOMPLETE |
| local co-located SQLite lifecycle P0/P1 | CLOSED for demonstrated composition |
| hosted lifecycle P2 operations/migration/distribution gaps | OPEN |
| identity/product/placement-token key rotation | PROVEN locally |
| Fly benchmark package/preflight | PROVEN; 13/13 |
| real regional four-client benchmark | INCOMPLETE / not run |
| measured host packing and observed costs | INCOMPLETE / no claim |
| provider comparison and official-source cost refresh | COMPLETE as of 2026-07-14 |
| $4.99 1K/10K/100K/1M economics | COMPLETE model |
| H24 synthetic component measurement | PROVEN synthetic only |
| live H24 capacity | INCOMPLETE / not proven |
| H48/H96 capacity | INCOMPLETE; far extrapolation only |
| X96 normal capacity | MODELED REJECTION |
| staged product/host/packing roadmap | COMPLETE |
| Greg product decisions | OPEN |
| public hosted multiplayer | INCOMPLETE |

## Next Closure Work

1. Complete the S20 four-player product journey and Greg four-human feel/art
   review.
2. Greg selects central, hybrid, or local/private service posture and ratifies
   the remaining product decisions.
3. Compose the tested HTTP/runtime reference with production provider/storage
   boundaries; close capacity compensation, accepted-row migration/reset, key
   custody/rollout, retention/privacy, and distributed transaction P2s.
4. Resolve Fly auth and external origins/signing/evidence inputs, prove packet-
   capture capability in Fly runtime,
   then run Phase 6 same-scenario two-region 90-minute four-player benchmarks,
   starting with Fly performance CPU.
5. Measure noisy-neighbor host packing and derive `safeAuthoritiesPerHost`.
6. Only then build a production-valid H24 fixture and consider one live capture.

No additional eight-player optimization is part of v0.4 closure.
