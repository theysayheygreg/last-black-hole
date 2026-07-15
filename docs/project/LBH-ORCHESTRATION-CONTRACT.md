# LBH Orchestration Contract

Primary control cycles use the installed `lbh-primary-sol` skill at
`~/.codex/skills/lbh-primary-sol/SKILL.md`. This file remains the project-specific
authority; the skill supplies the reusable producer workflow.

Primary Sol also owns the installed LBH skill portfolio: Forge, harness,
delegation, Three lifecycle, social screenshot, and public update passes. It
routes them when useful, keeps them aligned with this contract, and avoids
running overlapping passes as ceremony.

Primary Sol owns cross-version merges and RC candidate selection. Workstream
Sols produce commits; they do not promote or merge version lines independently.

> Status: active. Effective 2026-07-14.
>
> This document owns Codex task hierarchy, branch routing, agent roles,
> handoffs, review intake, and CI scheduling for Last Singularity. It applies to
> the primary task, branch workstream tasks, and their subagents.

## Authority

Greg sets product direction, taste, promotion, and release calls. The primary
orchestrator translates those calls into bounded branch work and is the only
Codex task that coordinates across LBH workstreams.

The primary orchestrator is task
`019f6315-910b-7e03-99c3-a50a3ed8efa6`. It remains the control plane until Greg
replaces it or explicitly hands orchestration to another task.

For orchestration conflicts, precedence is:

1. Greg's current instruction.
2. This contract.
3. The owning version's decisions, roadmap, and architecture contracts.
4. A workstream or subagent prompt.

## Topology

```text
Greg
  -> Primary Sol x1 (cross-project control plane)
       -> v0.4 Workstream Sol x1
            -> feature Lunas x1-3
            -> CI Lunas x0-3
       -> v0.3 Workstream Sol x1
            -> feature Lunas x1-3
            -> CI Lunas x0-3
       -> Orrery Review Intake x0-1
            -> finding receipts only
       -> Primary Sol accept / defer / fix-forward routing
```

The counts are ceilings, not quotas. Each workstream Sol owns its descendant
agents. The primary Sol coordinates workstream leads and does not micromanage
their Lunas unless work is colliding, stalled, or outside scope.

## Version And Merge Boundary

The version hierarchy is one-way:

```text
main (v0.2 current/live public)
  -> v0.3 next feature line and RC candidates
       -> v0.4 experimental multiplayer
```

- `main` stays the playable, deployable v0.2 public line. Only current demo,
  release, deploy, and narrow live fixes belong there.
- v0.3 owns Ballpark, feature reworks, gameplay iteration, UI iteration, and
  the next release-candidate lineage.
- v0.4 owns experimental multiplayer authority, networking, crew flow, and
  multiplayer product work. It is not a shortcut into v0.3 or `main`.
- Primary Sol merges v0.2 fixes forward into v0.3 and compatible v0.3 progress
  forward into v0.4 at explicit checkpoints.
- Never merge v0.4 backward into v0.3 or `main` for convenience. Promotion of
  any version requires Greg's explicit call.

Primary Sol selects an immutable v0.3 commit as an RC only after its coherent
feature scope is ready. Broad release/package/platform validation runs against
that candidate asynchronously; it does not run on every feature commit. v0.4
CI and experimental failures do not block a v0.3 RC unless an intentionally
shared contract is affected.

`codex/lbh-ci-policy` was created above history that later proved to contain
v0.3.1 review commits on the v0.4 architecture line. Never merge that source
branch wholesale into `main`. `codex/lbh-ci-policy-main` is the clean
main-based integration branch containing only shared process-file diffs; v0.4
prompt/changelog artifacts remain on v0.4. Once accepted, merge the clean
shared commit forward through `main`, v0.3, and v0.4 in hierarchy order.

## Live Assignment Register

Update this table only when ownership, branch, or milestone changes. Ordinary
progress belongs in commits and task receipts, not status churn here.

| Role | Codex task | Owned line | Current assignment |
|---|---|---|---|
| Primary Sol | `019f6315-910b-7e03-99c3-a50a3ed8efa6` | `codex/lbh-ci-policy-main` shared process integration and cross-workstream routing | Own this contract, route goals and CI, synthesize status for Greg; preserve `codex/lbh-ci-policy` as source history only |
| v0.4 Workstream Sol | `019f4fd7-87b8-7be0-ab08-bc20811b701f` | v0.4 integration owner | Stalled in the pre-contract P5 turn after `372be4e`; preserve it and do not depend on its uncommitted context |
| v0.4 P5 Feature Luna | `019f6364-bcc2-7d70-8cc6-9bc22454bb6d` | `codex/v0.4-p5b-feature-luna` from stable product commit `f9f6075` | P5B accepted and fast-forwarded; P5C terminal results residency routed through Luna xhigh |
| v0.3 Workstream Sol | `019defe1-385a-7913-bbca-8cb09bdfd1b0` | `codex/v0.3.1-movement-truth` in `/private/tmp/lbh-v031-movement-truth` | W1-A1 accepted at `45331aa`; W1-A2 shared gravity family routed through one Luna xhigh |
| Orrery Review Intake | `019f6363-2751-7d93-9db0-a6d29e769883` (Primary-owned child) | Read-only repo/Discord review ingress | `#last-black-hole` handshake confirmed by Orrery message `1526766996308496485`; heartbeat stays paused until a bundled E2/E3 milestone is sent |

Existing Orrery fix/review tasks under the v0.3 task remain descendants of the
v0.3 workstream. They do not form a third implementation branch.

The original `codex/v0.4-multiplayer-architecture` checkout acquired committed
v0.3.1 design-review artifacts while P5 was active. Preserve that history: do
not reset or revert it. v0.4 feature work continues from P5 checkpoint
`372be4e` on the isolated product child branch above; the v0.3 workstream owns
importing the final review artifacts into its line.

## Role Contracts

### Primary Sol

Primary Sol:

- converts Greg's direction into bounded `/goal` packets;
- owns branch and workstream boundaries;
- inspects task receipts and committed artifacts;
- schedules CI and review at checkpoints;
- routes cross-version findings to one owner;
- reports one synthesized project view to Greg.

Primary Sol does not implement branch features, run suites, poll successful
processes, interpret successful logs line by line, or repair unrelated CI
failures inside this task.

### Primary Control Loop

Primary Sol keeps the project moving by checking for artifacts, not asking for
status narration. For each active workstream it tracks the current goal,
branch/worktree, last meaningful commit, next deliverable, and blocker.

Intervene and narrow the goal when any of these occurs:

- the same test or failed approach is attempted more than twice;
- a builder starts a broad lane, screenshot retry loop, or unrelated cleanup;
- scope expands beyond the routed deliverable;
- one context compaction or roughly 60 minutes passes without a commit or
  concrete blocker;
- two agents begin touching the same high-conflict file;
- the workstream needs a cross-version change or a Greg decision.

The intervention is a smaller goal, a different Luna, a deferred CI receipt,
or a concise human question. It is not an invitation for another planning
report.

### Greg Decisions

Primary Sol asks Greg when existing decisions do not resolve product taste,
design direction, promotion, destructive migration, or conflicting version
goals. Ask one short question with the relevant evidence, 2–3 real options,
the impact of each, and a recommendation.

Use this Codex task by default. Use `#last-black-hole` when Greg is more likely
to need the decision asynchronously. Routine LBH receipts, Forge status posts,
review handoffs, and completions go to that channel. Only Primary Sol may send
Greg an LBH Forge DM, and only when a design choice, blocker, release decision,
or comparable issue actually needs his attention. Child tasks never send
routine LBH DMs. Do not let a child thread keep working around an unresolved
human decision, and do not ping repeatedly for the same question.

### Workstream Sol

A workstream Sol owns one version line. It may decompose a routed goal into
non-overlapping Luna scopes, integrate their committed work, select the smallest
direct proof, commit a coherent feature slice, and return a checkpoint receipt.
Focused checks belong to the feature Luna or a narrow CI Luna whenever
practical; the workstream Sol is not the default test runner.

A workstream Sol must not silently change branches, broaden the product goal,
merge another version line, or turn itself into the broad CI runner. Cross-line
needs return to Primary Sol for routing.

### Feature Luna

A feature Luna owns one explicit write scope. It builds a meaningful feature,
fix, decision, or handoff artifact; runs only the smallest directly relevant
check; and returns the changed files, result, focused proof, and commit SHA to
its workstream Sol. If agents share one integration worktree, the workstream Sol
must commit the integrated slice before another actor depends on it. There is no
uncommitted cross-task handoff.

### CI Luna

A CI Luna receives an immutable commit SHA and one lens or shard. It uses an
isolated worktree plus assigned ports, browser profile, temp paths, and artifact
paths. It runs only the requested shard and returns one compact receipt.

A CI Luna does not edit the feature commit, repair failures, broaden the run,
or retry unrelated lanes. Reuse existing runner output; do not create a second
report merely to satisfy this contract.

### Orrery Review Intake

The review-intake task watches the agreed Discord source for new Orrery LBH
feedback. It is read-only. It does not implement fixes or launch broad tests.

Orrery is premium design capacity, not a commit-review lane. Primary Sol uses
this escalation ladder:

- **E0 routine correctness:** Luna plus focused CI; no Orrery.
- **E1 meaningful feature step inside a settled direction:** Workstream Sol or
  the relevant LBH pass; no Orrery.
- **E2 milestone vertical:** a coherent playable/capturable slice, integrated
  multi-system checkpoint, or genuinely cool artifact exists and independent
  taste can shape the next milestone; Orrery is eligible.
- **E3 strategic fork:** a costly design choice, pillar tension, cross-version
  authority contract, hard-to-reverse architecture choice, RC-level product
  judgment, or explicit Greg request; Orrery is recommended.

"A lot of work" is measured by milestone closure and integrated behavior, not
commit count or diff size. Packets bundle the relevant committed artifacts and
ask one concrete question that tests, Luna, or existing decisions cannot answer
cheaply. Do not send stepwise reviews after each commit or phase. Keep at most
one live Orrery review per workstream.

Each actionable finding returns:

```text
Source/message:
Affected version and branch:
Claim and evidence:
Severity: blocker | fix-forward | backlog | Greg decision
Suggested owner:
```

Primary Sol decides whether and when a finding interrupts a workstream. A new
review comment is not automatically a feature blocker.

The cited Discord message is the durable source artifact; do not duplicate it
into the repo unless accepting it changes a decision, backlog, or implementation.

Primary Sol creates one owned Codex child task for each active Orrery packet.
The prompt is a committed MD under `docs/project/prompts/`. The child mentions
`<@1482130403841277975>` in `#last-black-hole` (`1470862507672600751`) and sends
the MD path/link with a short read-and-reply request. It does not use `/goal`,
another slash command, or paste the prompt body into Discord. Reviews target an
exact commit and claim; they do not ask Orrery to broadly re-review the game.

The child task receives a heartbeat that reads new `#last-black-hole` messages
after its handoff. It accepts only Orrery's response or an exact reply, then
returns the source message, classified findings, and recommended owner to
Primary Sol. Primary Sol presents a checkpoint to Greg in this task before
acting. After that checkpoint, accepted low-risk findings may move forward;
design/product choices wait for Greg. Unaccepted suggestions remain review
input rather than silently becoming requirements.

## Model And Token Routing

- Primary Sol runs `gpt-5.6-sol` at `high` for cross-workstream routing,
  synthesis, and human decisions; it does not spend those tokens implementing
  features.
- v0.3 and v0.4 Workstream Sols run `gpt-5.6-sol` at `medium` to integrate
  committed artifacts, decompose goals, and own their branch.
- Every descendant feature, CI, review, or delegation worker uses
  `gpt-5.6-luna` at `high` by default.
- Luna `xhigh` is reserved for risky authority, movement, renderer lifecycle,
  concurrency, or difficult root-cause work.
- No child promotes itself to Sol `high`, `xhigh`, `max`, or `ultra`, spawns
  another Sol, or otherwise exceeds Primary Sol's model/cost ceiling. Luna
  `xhigh` is the approved deep-reasoning child lane.
- Every Codex task directly orchestrated by Primary Sol counts as delegation
  depth 0, regardless of its UI parentage. A depth-0 task may spawn one parallel
  worker layer at depth 1; depth-1 workers may not spawn again.
- Workstream Sols use Luna `high` or the approved Luna `xhigh` risk lane for
  depth-1 workers. A directly orchestrated Luna may spawn Luna at its own effort
  level. Depth-1 scopes stay disjoint, and the depth-0 task owns integration and
  the final receipt.
- A Luna prompt names the exact outcome, branch/base, owned files, preserved
  boundaries, committed deliverable, focused proof, and stop conditions.
- Do not ask a Luna to familiarize itself with the whole repo, write a broad
  plan, run a general review, or discover its own project scope before working.
- If a Luna cannot produce a commit or concrete blocker inside its bounded
  goal, stop it and re-scope rather than increasing context and retries.

## Operating Cycle

1. Primary Sol sends one bounded goal to the owning workstream Sol.
2. The workstream Sol keeps the task or delegates disjoint slices to feature
   Lunas.
3. Feature work runs focused proof and becomes a meaningful commit.
4. The workstream Sol sends one checkpoint receipt to Primary Sol.
5. Primary Sol accepts the slice, selects checkpoint CI/review lenses, or
   creates a bounded fix-forward goal. The owning workstream Sol spawns and
   manages its CI Lunas, then returns their receipts; Primary Sol dispatches
   directly only for cross-workstream validation.
6. Independent feature work continues while non-blocking CI runs elsewhere.

This cycle adds no planning report, test matrix, evidence bundle, or review memo
unless the goal itself requires one. The durable artifacts are the commit and
one compact receipt.

### Goal Packet

```text
Outcome:
Owning workstream and branch:
Owned write scope:
Boundaries to preserve:
Committed deliverable:
Focused proof:
Stop or escalation conditions:
```

### Workstream Checkpoint Receipt

```text
Status: accept-ready | needs-ci | blocked
Branch and commit:
Outcome delivered:
Focused proof:
Exposure needing later CI/review:
Next independent feature slice:
Blocker or Greg decision, if any:
```

### CI Receipt

```json
{
  "commit": "<sha>",
  "lens": "<lens>",
  "status": "pass|fail|infra",
  "durationSec": 0,
  "failedSuites": [],
  "failureSummary": "",
  "artifactPaths": []
}
```

## Validation And Capacity

Feature builders have priority over CI on GregBot.

- **Feature commit:** focused changed-contract or boot proof only.
- **Integration checkpoint:** relevant authority, network, browser, visual, or
  playtest lenses on the immutable checkpoint.
- **Candidate/release:** full, package, platform, soak, and evidence gates.

Until fresh throughput measurements justify a different ceiling, run at most
one browser/sim-heavy shard and two pure-Node shards concurrently across LBH.
Do not run two screenshot, multiplayer-browser, package, or soak lanes at the
same time. Primary Sol may lower the ceiling when feature work needs the host.

A CI shard stops on its first product failure. One retry is allowed only when
the receipt is classified as infrastructure or suspected flake and the owning
Sol requests it. Screenshot capture/upload/reinterpretation does not retry for
ordinary feature work.

## Failure Routing

- **Block now:** the changed behavior fails, the build cannot boot, the branch
  is corrupted, or continuing would overwrite another actor's work.
- **Fix forward separately:** a real regression outside the current slice has
  a clear owner and can be repaired without discarding useful work.
- **Defer:** flaky, harness-only, unrelated, broad-regression, soak, package,
  platform, and release-only failures before their checkpoint.
- **Ask Greg:** taste, product direction, promotion, irreversible scope change,
  or a conflict between version goals.

Do not revert useful feature work merely to green an intermediate SHA. Preserve
history and fix forward with a new bounded goal.

## Branch And Communication Boundaries

- v0.3 and v0.4 workstreams use separate branches and worktrees.
- Only one integrator owns a high-conflict file in a workstream at a time.
- Cross-version fixes are reported to Primary Sol before cherry-pick or merge.
- Workstream Sols communicate upward through receipts; their Lunas communicate
  through the owning Sol.
- Primary Sol is the normal status surface for Greg. Workstreams escalate
  directly only when Greg addresses them or a blocking decision cannot wait.
- Chat context is not a handoff. If another actor depends on the work, commit it
  first and include the SHA.

## Review Timing

Independent review is selected by risk:

- ordinary feature slice: no automatic review;
- risky architecture or shared-state integration: one focused review;
- milestone checkpoint: review the integrated claim;
- blocking findings that changed the reviewed surface: one re-review;
- candidate/release: full required review and validation gates.

Orrery findings enter through Review Intake and are routed by version and
severity. They do not bypass the workstream owner or create surprise edits on a
branch.

## Completion

A workstream goal is complete when its committed outcome and focused proof are
accepted by Primary Sol. Broad CI may still produce follow-up work.

This primary orchestration task remains active across workstream goals. It is
complete only when Greg retires it, replaces it, or declares the current LBH
program finished.
