# v0.4 Multiplayer Program Completion Audit

## Post-Audit Implementation Update — 2026-07-11

The audit below is the closure snapshot that triggered implementation. Since
that snapshot, Phase 0 has landed deterministic 1/4/8 authority evidence,
server-created membership/connection epochs, reconnect rotation and fencing,
owner-private live projection, semantically public history, authenticated
idempotent settlement, and explicit `multiplayer-structure` and
`multiplayer-authority` harness lanes. The research/planning verdict remains
valid, while the prior statements that all multiplayer-specific lanes and all
Phase 0 trust work were merely planned are superseded by this update. WSS,
WAN failure/reconnect, hosted identity/fleet proof, heavy 24/48/96 measurement,
and a playable four-to-eight-human internet match remain incomplete.

**Scale-model correction — 2026-07-12:** the canonical forecast now uses one
64 KiB/s average/player product target; 144/288 KiB/s are sensitivity/rejection
rows. Full-snapshot fan-out is population-specific, CPU separates writer
p95/p99 feasibility from mean billable packing, and memory/packing expose their
component vectors. These corrections improve auditability but do not upgrade
any 24/48/96 forecast to measured capacity.

> Audited 2026-07-10 on `codex/v0.4-multiplayer-architecture` through committed
> tip `11e54ec`, including the economics closure and latest v0.3 forward merge.
> This audit compares the current repository and local automation
> state against Greg's original request and later authority/high-count
> corrections. It does not treat a plan, a passing unrelated harness, or the
> absence of an obvious error as proof of a broader requirement.

## Verdict

The **architecture research and planning program is substantially complete**,
but the full user request is **not yet proven complete**.

- The branch, 4–8-player target architecture, Ballpark/EVE compatibility,
  identity model, authority-free P2P study, per-match authority clarification,
  and phased roadmap are proven.
- Hosted vendor comparison, named monthly stack floors, labor/support, lifetime
  cohort, launch CCU, cash-timing, and $4.99 arithmetic now exist. They are
  explicit planning scenarios with quote and measurement gaps, not production
  promises; the closure memo is integrated and committed.
- Current-code 4/8/24/48/96 measurements exist, but the requested heavier
  24/48/96 cases are forecasts. No real heavy-world, recipient-specific wire,
  multi-authority packing, long-soak, or hosted benchmark has run.
- The durable v0.4 prompt exists, but the actual active goal database still says
  v0.3. This is a direct metadata contradiction that already shapes automatic
  continuation context.
- The recurring heartbeat has since executed and continued work across reset
  windows. That proves orchestration continuity, not multiplayer capacity.
- The branch now contains trust and network-evidence implementation as well as
  research. Four to eight people still cannot complete the intended hosted
  multiplayer LBH match, so the ideal product outcome remains incomplete.

The goal must remain active unless its scope is explicitly limited to the
research/planning deliverable and the goal-metadata, integration, and
automation evidence gaps are closed.

## Status Definitions

- **PROVEN** — current authoritative evidence directly satisfies the
  requirement.
- **INCOMPLETE** — a required artifact, implementation, measurement, or cost
  input is still absent.
- **WEAK** — the intended shape exists, but proof is modeled, indirect,
  configuration-only, or otherwise insufficient for the breadth of the claim.
- **CONTRADICTED** — current evidence directly disagrees with the requirement
  or a claimed completion statement.

## Requirement Audit

### 1. Create a new v0.4 branch off v0.3

**Status: PROVEN and current with v0.3 at audit time.**

Evidence:

- Current branch is `codex/v0.4-multiplayer-architecture`; the first v0.4
  commit is `76379a1`.
- `git show -s --format='%H %P' 76379a1` proves its sole parent is
  `56c5b8642d47ba2079ce8827ca1e1cd9a7190deb`, the v0.3 Ballpark tip used at
  branch creation.
- The v0.3 branch later advanced to `b868dbb3`; merge commit `11e54ec` brings
  those nine commits forward into v0.4 without merging v0.4 backward.
- `git rev-list --left-right --count v0.4...v0.3` is `14 0` at audit time, so
  the v0.4 branch contains the complete current v0.3 line plus its own work.

Remaining action: continue merging future v0.3 fixes forward intentionally;
do not merge v0.4 backward into v0.3 or `main`.

### 2. Make LBH playable by a minimum of four and maximum of eight players

**Status: INCOMPLETE as a product outcome; PROVEN as the planned v0.4 product
envelope.**

Evidence:

- `ARCHITECTURE.md:59-70` fixes the supported human seat range at 4–8 and
  defines invite/join-code public play, offline continuity, and hosted
  progression.
- `ROADMAP.md:15-17` defines success as four and eight real clients completing
  truthful runs over internet-shaped networking.
- `ROADMAP.md:19-170` shows that trust closure, WSS transport, failure handling,
  prediction, replication compaction, hosted identity, and hosted deployment
  are future phases, not completed work.
- `ARCHITECTURE.md:3-5` explicitly says this is a target design and
  falsification plan, not implemented public multiplayer.
- Git diff from the v0.3 base adds documentation only; no multiplayer product
  implementation landed.

Remaining action: implement and pass Phases 0–6, then prove natural four- and
eight-human journeys plus Greg's movement/taste gate before claiming the ideal
outcome.

### 3. Design compatibility with Ballpark and the EVE-inspired sim/client split

**Status: PROVEN for architecture and roadmap.**

Evidence:

- `ARCHITECTURE.md:20-39` assigns authentication/durable truth to the control
  plane, causal gameplay truth to one run authority, and high-resolution fluid
  reconstruction/presentation to clients. It explicitly defines the EVE lesson
  as causal-unit, overload, invalidation, and hot/durable separation discipline,
  not an MMO shared world.
- `ARCHITECTURE.md:43-57` maps the design to persistent Ballpark identity,
  sim-owned movement/consequences/coarse flow, protocol-v2 sequences, privacy,
  event gaps, snapshot rebase, bounded histories, and overload.
- `ballpark-multiplayer-architecture.md:104-141` separates multiplayer-ready
  v0.3 foundations from local-stack illusions that must be removed.
- `ballpark-multiplayer-architecture.md:142-453` specifies protocol lanes,
  recipient snapshots, clocks, prediction, authoritative fluid split,
  relevance/privacy, recovery, and overload.
- `ROADMAP.md:19-170` turns that design into ordered, falsifiable slices rather
  than assuming architecture prose is implementation.

Remaining action: implementation and parity/load evidence remain pending, but
the requested research/design/plan artifact is complete.

### 4. Investigate and design unique client identity and local/cloud data

**Status: PROVEN for the data model; implementation remains pending.**

Evidence:

- `ARCHITECTURE.md:235-278` distinguishes account, profile, session, run,
  membership, public player alias, connection, authority epoch, incarnation,
  local/cloud lineage, and idempotent settlement.
- `multiplayer-identity-data-model.md:70-103` defines identifier lifetime,
  visibility, ownership, rotation, and UUID policy.
- `multiplayer-identity-data-model.md:104-158` covers Steam-hosted, local-only,
  guest, hybrid-link, migration, and later-provider flows.
- `multiplayer-identity-data-model.md:159-321` supplies relational entities,
  constraints, transaction/idempotency rules, and lifecycle state machines.
- `multiplayer-identity-data-model.md:322-460` supplies API, threat, privacy,
  deletion/export, and v0.3 migration plans with primary RFC, Steam, OWASP, and
  EU sources at `:483-492`.

Remaining action: Greg still owns product decisions on import, Chronicle
visibility, reconnect body policy, and hosted identity; then Phase 5 must
implement and negatively test the chosen model.

### 5. Deeply compare true authority-free P2P, benefits/pitfalls, historical
industry examples, and network budgets

**Status: PROVEN.**

Evidence:

- `p2p-history-network-budgets.md:41-58` cleanly distinguishes deterministic
  lockstep, rollback mesh, distributed object authority, and player-hosted
  listen authority.
- `p2p-history-network-budgets.md:59-116` compares Age of Empires, GGPO,
  Diablo, DirectPlay-era migration, Destiny, Colyseus, Donnybrook, Steam
  Datagram Relay, and modern WebRTC practice. The main claims are tied to
  developer material, standards, papers, and direct historical accounts.
- `p2p-history-network-budgets.md:118-240` analyzes LBH determinism, movement
  delay/correction, cheating, partitions, departure, settlement, privacy,
  forensics, and the unavoidable choice between halt/fork/quorum/authority.
- `p2p-history-network-budgets.md:242-423` models mesh edge count, NAT/ICE/TURN,
  per-peer input/hash, voice, checkpoints, distributed-state deltas,
  player-host traffic, full-snapshot stress bounds, and relay aggregate at
  4/6/8 players.
- `p2p-history-network-budgets.md:424-480` adds RTT, jitter, loss, rollback, and
  topology decisions; `:481-545` supplies bounded falsification spikes.

Remaining action: the bounded authority-free and rollback spikes are still
future empirical work, but the requested investigation/comparison/budget plan
is complete and appropriately does not relabel a listen server as true P2P.

### 6. Compare and cost centrally hosted one-true-source authority on Vercel,
Cloudflare, and alternatives

**Status: PROVEN as a planning cost-out; WEAK as a production forecast.**

Evidence supporting completion:

- `hosted-costs-unit-economics.md:73-94` compares Cloudflare Durable Objects and
  Containers, Fly, Railway, Render, Cloud Run, GameLift, Vercel, relay, and
  voice fit using linked vendor sources.
- `high-player-count-hosting-cost-model.md:226-373` expands provider runtime,
  protocol, pricing, and workload fit.
- `high-player-count-hosting-cost-model.md:374-465` gives named Fly, Railway,
  Render, Cloud Run, GameLift, and heavier-sim compute scenarios.
- `ARCHITECTURE.md:518-540` integrates the hosted position and correctly keeps
  Vercel on website/control-plane duties rather than live run ownership.
- `fixed-stack-cohort-unit-economics.md:33-62` adds current source-backed
  control/edge, database/auth, object storage, observability, paging, and
  authority-host price anchors.
- `fixed-stack-cohort-unit-economics.md:64-130` gives named smallest,
  recommended, and scale monthly floors of $162, $803, and $20,300, with every
  allowance and quote gap visible.
- `fixed-stack-cohort-unit-economics.md:159-198` separates variable cost,
  launch CCU, peak matches, region mix, and one logical authority per match.

Evidence preventing a production-forecast claim:

- The independent audit says the original `$0.015/player-hour` and
  `$0.18/copy` rate is not derived from a named complete stack and is only a
  target (`hosted-costs-unit-economics-audit.md:7-20`).
- The original independent audit correctly identified the absence of fixed
  stack bills (`hosted-costs-unit-economics-audit.md:129-145`); the new
  fixed-stack memo closes that planning-artifact gap, but many scale rows remain
  budget allowances pending quotes rather than vendor-backed prices.
- GameLift remains directionally evaluated but not responsibly costed across
  the requested scenarios (`:120-121` and
  `high-player-count-hosting-cost-model.md:433-441`).
- `high-player-count-hosting-cost-model.md:54-56` explicitly excludes shared
  services and labor from its match-hour rows, while
  `fixed-stack-cohort-unit-economics.md:27-31` defines the newer memo as service
  operations rather than a studio P&L.
- `fixed-stack-cohort-unit-economics.md:301-318` lists the wire, packing, MAU,
  telemetry, support, invoice, quote, retention, and service-term evidence still
  needed to replace assumptions.

Remaining action: obtain saved calculator/contract quotes for quote-gap rows;
replace variable compute,
packing, region, and support assumptions with load-test evidence and invoices
before calling these production costs.

### 7. Derive $4.99 economics at 1K, 10K, 100K, and 1M sales

**Status: PROVEN as an explicit planning model; WEAK as a successful-game
forecast.**

Evidence:

- `hosted-costs-unit-economics.md:148-180` states cohort assumptions and gives
  all requested 1K/10K/100K/1M gross, modeled receipts, service target,
  contribution, and support-reserve rows.
- The independent audit recomputes the receipt formula as `$3.1171532/copy`
  and confirms every cohort row to rounding
  (`hosted-costs-unit-economics-audit.md:153-167`).
- The audit also identifies unsupported store/refund/tax/FX assumptions, no
  explicit loaded labor model, no fixed monthly stack, no service lifetime,
  and no cash-flow/shutdown obligation model (`:169-200`).
- It concludes `$0.18/copy` is defensible as a design target, not the current
  planning forecast, and lists the benchmark proof needed before approval
  (`:202-236`).
- `fixed-stack-cohort-unit-economics.md:132-215` now makes low/base/high
  lifetime hours, service months, play distribution, regional mix, variable
  cost, CCU, and loaded service labor explicit.
- `fixed-stack-cohort-unit-economics.md:217-246` gives all 1K/10K/100K/1M
  low/base/high rows before fixed cost, after fixed cost, and after service
  labor. `:248-272` adds payout lag and launch reserve.
- The new model's negative rows are meaningful: at $4.99, hosted gameplay can
  be cheap while a staffed long-lived service remains commercially difficult.

Remaining action: independently verify the closure memo formulas; replace
assumed variable player-hour, retention, store mix,
support load, and quote-gap stack rows with public-test measurements,
storefront data, invoices, and vendor quotes.

### 8. Be specific that dedicated authority means one logical authority per
concurrent match, multiplied by concurrent matches

**Status: PROVEN.**

Evidence:

- `ARCHITECTURE.md:9-18` states one single-writer authority per live match,
  `M` matches means `M` independent authorities, and physical hosts may pack
  multiple isolated authorities.
- `ARCHITECTURE.md:96-124` gives the fleet equations and the explicit example:
  2,000 matches means 2,000 logical authorities and, at a hypothetical proven
  density of 40, roughly 50 hosts before reserve.
- `ROADMAP.md:6-13` repeats “one match, one logical authority; concurrent
  matches, concurrent authorities” and rejects interpreting it as one VM per
  match.
- `high-player-count-hosting-cost-model.md:7-26` distinguishes causal owner,
  physical host, process, worker, and CPU core.

Remaining action: replace the example packing density with measured
authorities-per-host before using it for capacity or cost commitments.

### 9. Forecast network and server performance/cost for heavier single matches
at 24, 48, and 96 simultaneous clients

**Status: WEAK as forecast evidence; INCOMPLETE as measured capacity/cost
proof.**

Evidence supporting the requested forecast:

- `ARCHITECTURE.md` defines one logical authority at every count and the
  one-writer plus deterministic-worker shape at 96; this is multiplied by
  concurrent matches at the fleet layer.
- The canonical network model uses 64 KiB/s/player average as its product
  target, with 144 KiB/s representative sensitivity and 288 KiB/s heavy
  rejection envelopes. None is an achieved codec measurement.
- Population-specific 6 Hz full-snapshot fan-out reaches a modeled 564.009
  GB/match-hour and about 1.253 Gbit/s at 96, exposing why full JSON is
  rejected rather than smearing one snapshot size across all counts.
- The CPU model now factorizes players, bodies, candidates, contacts, events,
  AI, field, world work, and GC without inventing replacement milliseconds.
  The legacy 83.07 ms Heavy96 result is explicitly superseded P-only
  sensitivity, not a current forecast.
- Writer p95/p99 is a lane-feasibility gate; mean billable CPU drives
  reservation and packing. Memory exposes a component formula, including at
  most 48 MiB of application queues and a separate 24 MiB all-clients-at-
  high-water observation at 96. Host fit takes the minimum of writer lanes,
  CPU, RAM, egress, encode, PPS, process, and failure-domain constraints.
- The current synthetic diagnostic records 4/8/24/48/96 tick, snapshot, heap,
  and Ballpark samples; 24 remains plausible, 48 engineered, and 96 R&D.

Evidence preventing a measured-support claim:

- The diagnostic was short, loopback HTTP, full-snapshot, same capped world,
  and all cases entered `DILATED`; it did not exercise a heavier sim
  (`2026-07-10-high-player-count-synthetic-baseline.md:64-99`).
- It did not measure real WSS/wire bytes, recipient projections, scaled
  ecology, 15/20/30 Hz, WAN failure, packing, GC percentiles, CPU saturation,
  or long soak (`:87-99`).
- The cost model declares every larger-match CPU, memory, packing, and traffic
  value a forecast (`high-player-count-hosting-cost-model.md:3-5`) and says no
  LBH 24/48/96 CPU/memory/encode/wire or safe packing benchmark exists
  (`:557-560`).

Remaining action: run the documented H24/H48/H96/X96 matrix for 90 minutes per
case with real recipient encoding/transport, quiet/representative/heavy action
mixes, scaled bodies/AI/fields, system-level p50/p95/p99 traces, GC/RSS, WAN
faults, slow readers, TiDi state, and one then 2/4/8 authorities per host on the
candidate vendors. Replace forecast coefficients and packing assumptions with
captured measurements and bills.

### 10. Create a broad durable goal prompt and orchestrate with subagents

**Status: PROVEN for the durable prompt packets and independent work products;
CONTRADICTED for the actual active goal's version metadata; WEAK for a
long-running recurring control loop.**

Evidence:

- `ORCHESTRATION.md:6-27` preserves the broad goal, including every later
  correction.
- `docs/project/prompts/2026-07-10-agent-*.md` contains four disjoint prompt
  packets with target branch, exclusive output, source-reading requirements,
  research questions, guardrails, and deliverables.
- The four resulting memos are independently committed at `ceb0d00`,
  `2202216`, `53eae8d`, and `9668f75`; red-team and high-count lanes follow in
  separate commits through `b4a6e42`.
- `ORCHESTRATION.md:41-51` inventories the returned lanes, while `:98-106`
  records coordinator/agent ownership rules.

Contradiction and weakness:

- The authoritative local goal database record for thread
  `019f4fd7-87b8-7be0-ab08-bc20811b701f` is active goal
  `89ce4806-38db-494c-a776-4771fecc252d`, but its objective says “Create and
  orchestrate a **v0.3** multiplayer architecture research and planning
  branch.” Greg subsequently corrected the branch and work to v0.4. The
  repository and automation prompt say v0.4, but automatic goal continuation
  still injects the stale v0.3 text.
- `ORCHESTRATION.md` now records repeated dispatch/integration cycles, a 90%
  durable checkpoint, and automated post-reset continuation. The stale v0.3
  goal metadata remains the only contradiction in this requirement.

Remaining action: after the stale goal's own completion audit is satisfied,
replace it with an exact v0.4 continuation goal on the same thread; do not mark
the broader v0.4 program complete merely to repair metadata. Retain
dispatch/return/checkpoint evidence for the next scheduled cycles and record
any new bounded lane plus coordinator integration commit.

### 11. Set heartbeats to check agents and continue orchestration

**Status: PROVEN. Configured and observed recurring.**

Evidence:

- `~/.codex/automations/lbh-v04-multiplayer-orchestrator/automation.toml` exists
  with `kind = "heartbeat"`, `status = "ACTIVE"`, a 30-minute recurrence, and
  the active target thread id.
- Its prompt requires checking the goal, live subagents, branch, worktree,
  completed research, and next dispatch/integration action.
- `ORCHESTRATION.md` records repeated scheduled executions, useful work
  advanced by those runs, and automated post-limit continuation. The
  automation continues to target this thread and inspect CodexBar, goal,
  agents, branch, and worktree before dispatch or integration.

### 12. Check CodexBar locally on GregBot, record limits/reset, and keep the goal
going after a five-hour limit

**Status: PROVEN. Live query and reset-crossing continuation are recorded.**

Evidence:

- `/opt/homebrew/bin/codexbar` exists and CodexBar.app is running locally.
- The exact command in the automation returns structured Codex CLI usage. At
  audit time it reported a 300-minute primary window, `usedPercent = 38`, and
  `resetsAt = 2026-07-11T11:02:18Z`.
- The automation prompt contains the 90% checkpoint behavior and resumes useful
  work below 90%/after reset. `ORCHESTRATION.md` records both the durable 90%
  checkpoint and successful work in a fresh usage window.
- An automation cannot execute while the provider refuses all turns; it can
  only retry on a later scheduled run. The docs state this correctly, so there
  is no claim that limits were bypassed.

### 13. Commit meaningful changes and verify them

**Status: PROVEN for atomic documentation history and current regression
harness; WEAK for multiplayer-specific verification.**

Evidence:

- Git history contains twelve named atomic documentation commits covering
  program setup, vendor economics, identity, Ballpark authority, P2P, red team,
  measurement, high-count architecture/performance/cost, integrated design,
  and orchestration.
- `node tests/run-all.cjs` was rerun from merge tip `11e54ec` during this audit
  and exited 0 with every selected core suite passing.
- The worktree contained only this audit file after that run.

Weakness:

- The current core harness validates v0.3 product behavior and architectural
  regressions; it does not validate the planned multiplayer transport,
  recipient privacy, identity settlement, network faults, hosted cost, or
  24/48/96 heavy envelopes.
- `ROADMAP.md:265-272` correctly lists future `multiplayer-structure`,
  `multiplayer-network`, `multiplayer-authority`, `multiplayer-soak`,
  `multiplayer-playable`, and `multiplayer-hosting` lanes, none of which exists
  as implemented proof yet.

Remaining action: add those lanes as each implementation phase lands and do
not use the current v0.3 core pass to claim multiplayer correctness or capacity.

## Completion Matrix

| Requirement | Status |
|---|---|
| v0.4 branch off v0.3 | PROVEN |
| 4–8 product envelope | PROVEN as plan |
| Playable 4–8 multiplayer game | INCOMPLETE |
| Ballpark/EVE-compatible architecture | PROVEN |
| Local/cloud identity and data model | PROVEN as design |
| True P2P history, comparison, and budgets | PROVEN |
| Hosted vendor/runtime comparison | PROVEN |
| Hosted planning cost-out | PROVEN |
| Production-verified hosted costs | WEAK |
| $4.99 cohort arithmetic | PROVEN |
| Explicit 1K–1M planning economics | PROVEN |
| Production-verified 1K–1M economics | WEAK |
| One logical authority per concurrent match | PROVEN |
| 24/48/96 heavy network/server forecasts | WEAK; auditable model, not measured |
| 24/48/96 measured capacity and cost | INCOMPLETE |
| Broad prompt and multi-agent orchestration | PROVEN for first program pass |
| Active goal correctly names v0.4 | CONTRADICTED |
| Recurring heartbeat execution | PROVEN |
| CodexBar query and reset visibility | PROVEN |
| Continuation across an actual five-hour limit | PROVEN |
| Atomic docs commits and current core regression pass | PROVEN |
| Multiplayer-specific verification lanes | INCOMPLETE |

## Minimum Remaining Closure Work

For the **research/planning program** to be completion-grade:

1. Replace quote and workload assumptions in the committed fixed-stack/cohort
   model with measurements before presenting it as a production forecast.
2. Replace the stale active v0.3 goal metadata with the exact v0.4 continuation
   goal without prematurely closing the broader v0.4 program.
3. Decide whether “forecast” was the intended stopping point for 24/48/96. If
   measured feasibility was intended, run the documented heavy benchmark
   matrix before closing.

For the **ideal multiplayer-game outcome** to be complete, implement the
roadmap through invite alpha and pass its multiplayer-specific automated,
network, soak, playable, hosted, and Greg feel gates. The present branch is a
strong blueprint, not the finished multiplayer game.
