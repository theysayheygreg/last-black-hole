# Game Jam Contract: Shifts, Checkpoints, and Agent Orchestration

> Status: v0.2/v0.3 branch process contract. Updated 2026-07-14. This began as the 7-day jam
> coordination doc; keep that historical context, but current agent work is
> centered on the Three renderer, authoritative sim, platform targets,
> next-version branch work, and periodic architecture hygiene.

---

## The Two Shifts

### Day Shift (Greg) — ~10am to midnight
**Role:** Creative director, playtester, decision-maker, vibe-checker.

Greg's time is the most valuable resource. It should be spent on:
- **Playing the game** and giving feel/vibe feedback
- **Making design decisions** that agents can't make (is this fun? does this feel right?)
- **Reviewing overnight work** and course-correcting before agents run another cycle
- **Writing prompts** for the next night shift when something needs human taste
- **Art direction** — "more of this, less of that"

Greg should NOT spend time on:
- Boilerplate code (agents do this)
- Debugging shader math (agents do this)
- Wiring systems together (agents do this)
- Writing the same thing twice (agents do this)

### Night Shift (Agents) — midnight to ~10am
**Role:** Heavy construction, implementation, iteration on clear specs.

The night shift is 10 hours of uninterrupted agent compute. This is where layers get built. The key constraint: **agents must work from clear specs with defined deliverables**, because Greg isn't awake to answer questions.

Night shift work must be:
- **Fully specified** before Greg goes to sleep (prompt written, acceptance criteria clear)
- **Independently verifiable** (agent can check its own work — does it render? does it run? do the tests pass?)
- **Safely mergeable** (work on separate systems that don't conflict, or sequential on the same branch)
- **Committed atomically** (every working state gets a commit per CLAUDE.md rules)
- **Commit-driven at handoff boundaries** — if the work is real enough to hand to the next actor, it is real enough to commit

---

## Forge's Role

Forge is not the main planner and not the main builder. Forge is the architectural brake and the code-shape check.

Forge should be invoked in two places:

1. **Before risky work starts** — when a task involves engine choice, rendering architecture, simulation complexity, or a build-order fork.
2. **After implementation lands** — before Greg burns playtest time on something that is obviously overbuilt, technically fragile, or pointed at the wrong target.

In practice:

- Greg sets the direction and taste.
- Orrery turns that into a concrete plan and task framing.
- Orb routes implementation work to the right agents.
- Forge checks whether the planned work is the simplest build that can succeed this week.
- After the work lands, Forge reviews whether it is technically sound enough to hand back to Greg for playtest.

Forge should be used as an architecture review before work and a code review after work. That is the simplest place for it in the loop.

---

## LBH Forge Pass

Use `$lbh-forge-pass` after large architectural shifts, broad refactors, major
feature bursts, or when Greg asks for a deep cleanliness/centralization pass.
This is not the everyday test suite and not a substitute for playtesting.

The daily harness answers: **did a known contract regress?**

The Forge pass answers: **are the code, comments, docs, tests, and process
contracts still describing the game we are actually building?**

A Forge pass should review:

- Sim/client authority, including client-only features that need sim truth.
- Coordinate, camera, flow, and radius math that may have drifted from
  `src/coords.js`.
- Three renderer assumptions, stale legacy-renderer compatibility, and visual
  contracts that no longer match the active version branch.
- Comments that describe old behavior, magic numbers without context, and
  duplicated calculations that should be centralized.
- Test harness relevance: obsolete tests should be rewritten, deleted, or moved
  to legacy lanes; new contracts should get representative coverage.
- Docs holistically, with a visible version/revision note in every updated
  source-of-truth document.

Run only the validation lanes justified by the systems touched, then broaden if
the pass changes shared authority, renderer, controls, lifecycle, or platform
behavior.

## Agent QA North Star

### Feature-Flow Validation Policy

LBH is a pre-release game without public players or a production reliability
contract. Feature threads should spend roughly 80-90% of their time building
the game. During implementation, only the changed contract and any affected
launch path are blocking proof.

Broad authority, network, soak, package, visual-matrix, agent-eval, and full
lanes behave like CI: run them asynchronously at integration and release
checkpoints. A non-critical failure opens a bounded QA/debug task; it does not
hold the feature builder in a serial repair loop. Codex task
`019f6315-910b-7e03-99c3-a50a3ed8efa6` is the resolution source for the detailed
throughput redesign.

Agents should verify that features work before Greg plays them. Greg's time is
for feel, taste, art direction, and product judgment, not first-contact QA.

Before a release or Greg-facing handoff, the responsible agent should leave
three kinds of evidence. These are checkpoint receipts, not requirements after
every feature commit:

- the deterministic contract lane that matches the changed system;
- a playable or visual artifact showing the feature in context;
- a short written readout of what was proved, what remains subjective, and what
  is still blocked.

`npm run test:agent-eval` is the standard source-build playable receipt for
v0.3 work. It is not as deep as `npm run test:authority` and not as artful as a
promo capture, but it proves a fresh no-debug Shallows journey through normal
menus/controller input, slingshot, salvage, signal, confirmed extraction,
results, Rig, Chronicle, and a changed second run. A second fresh branch selects
Breacher, dies to a named visible well, and returns Home. Greg remains the human
polish gate, not first-contact QA.

For a release handoff, source proof is not enough. Commit first, run
`npm run release:internal`, then run `npm run release:status` and
`npm run test:package`. The package gate must find the exact HEAD artifact,
boot authority from its real `app.asar`, render the packaged Three title, keep
idle authority alive through the attract-screen wait, and launch a human run.

---

## Review Protocol: Audit → Codex

At integration checkpoints for a feature that touches >200 lines or adds a new
system, run a two-pass review. Ordinary implementation commits use focused
review and keep moving; the passes below must not serialize the feature loop.

### Pass 1: Design Audit (Orrery)

Run research agents against the design docs to compare implementation against spec. This catches:
- Dead or mismatched config values
- Missing mechanics that the design requires
- Wrong algorithms (e.g. speed proxy where flow alignment was specified)
- Orphaned code paths from refactors

The audit checks *intent* — does the code do what the design says it should? Fix everything found before proceeding to Pass 2.

### Pass 2: Code Review (Codex)

Run `codex review --base <pre-feature-commit>` against the full diff. This catches:
- Interaction bugs between new and existing code
- Runtime errors (undefined variables, unreachable code paths)
- State leaks across system boundaries
- Capacity/slot conflicts from adding entities to shared data structures

Codex checks *correctness* — will the code crash, loop, or produce wrong behavior at runtime? Fix everything found, then run one more Codex pass to confirm.

### Why Two Passes

| | Orrery Audit | Codex Review |
|---|---|---|
| **Catches** | Design divergence, dead config, wrong algorithms | Runtime errors, interaction bugs, state leaks |
| **Misses** | Code that's correct but crashes in context | Code that works but doesn't match design intent |
| **Speed** | ~5 min (parallel research agents) | ~3 min (automated diff review) |
| **When to skip** | Never on new systems. Skip on pure tuning. | Never after audit finds fixes. Skip on docs-only. |

### Math / Authority / Camera Pass

After the Three migration and authority work, movement regressions usually come
from stale assumptions crossing system boundaries. Any task that touches
movement, spawning, hazards, death, map scale, flow sampling, sim snapshots,
camera, or renderer projection gets one extra checklist before Greg playtests:

1. **Coordinate source of truth** — conversions go through `src/coords.js`.
   Feature code must not inline `1.0 - y`, hand-roll toroidal wrapping, or
   invent new screen/world/UV scale math.
2. **Authority parity** — gameplay truth lives in the sim. If a feature exists
   client-side for presentation or sandbox prediction, the server-side sim path
   must still own the authoritative version before it is considered shipped.
3. **Camera/projection agreement** — Three's top-down camera, overlay canvas,
   fluid window, and sim snapshot all describe the same world slice. Visible
   wells, stars, hazards, spawn points, kill radii, and loot ranges must line up
   with the sim, not merely look centered.
4. **Fresh-process evidence** — movement/playtest evidence comes from a fresh
   browser and fresh sim unless the task is explicitly a long-run stability
   probe. Reloading a page is not a clean process boundary.
5. **Representative lanes** — during implementation, run the focused contract
   for the changed movement, sim, coordinate, or presentation behavior. Queue
   `test:playtest`, `test:authority`, and `test:visual` as parallel checkpoint
   receipts when the slice is integrated.

If the player dies to an invisible well, spawns off-route, gets pulled by a
thing they cannot see, or bounces between positions, treat that as a contract
failure first. Tune only after the math, authority, and camera contracts agree.

### Trigger Rules

- **Always run both passes:** new system, new entity type, new server↔client wiring
- **Run Codex only:** bug fix >50 lines, refactor touching shared state
- **Skip both:** tuning constants, docs, comments-only changes

### Hook Setup

For automatic Codex review on every commit, add a PostToolUse hook on Bash in `~/.claude/settings.json` that fires `codex-post-commit-review.sh`. The hook script lives at `~/.claude/hooks/codex-post-commit-review.sh` and triggers `codex review --background --scope working-tree` after successful `git commit` commands.

---

## Checkpoint Protocol

### Codex Memory Checkpoint Protocol

After any substantial LBH session, write a short Codex memory checkpoint note in
`~/.codex/memories/extensions/ad_hoc/notes/`. Repo docs remain the source of
truth; memory is the routing index that helps future Codex runs find the right
current docs before falling back to fresh repo archaeology.

Substantial means at least one of:

- broad architecture, Three renderer, sim/client authority, platform, build, or
  deploy work;
- a fresh playtest or build-status change;
- a major feature implementation or deep bug-fix pass;
- a process/doc update that changes how future agents should work;
- anything another agent would otherwise have to reconstruct from chat history,
  terminal output, or scattered commits.

Keep the note concise. It should include durable retrieval facts only: repo
path, current branch/build/playtest state, canonical docs to read first, new
decisions, exact commands that worked, and stale-history warnings such as
"check `BUILD-STATUS.md` before trusting old build-health."

Do not write memory checkpoints for tiny Q&A, one-line fixes, or duplicate
status pings. The goal is better recency, not memory spam.

### Public Update Checkpoint Protocol

Around visible milestones, run `$lbh-public-update-pass` after the build/status
truth is known and after any fresh screenshot or GIF capture exists. Use it for
v0.2/v0.3 checkpoint notes, Feature Friday copy, public devlog paragraphs,
Discord updates, Twitter/X posts, itch/Steam page copy, and teaser captions.

The public update pass should not duplicate the changelog. Its job is to turn
the current project truth into player-facing language, media pairings, and claim
guardrails: what is fun to show, what is still internal, and what must not be
promised until the build gate or playtest gate is actually green.

### Build Status Protocol

Before answering "where does the local build stand?", check these in order:

1. `docs/project/BUILD-STATUS.md` — the human/playable snapshot: launch target,
   current assessment, caveats, and next evidence needed.
2. `node scripts/build-health.cjs status` — the formal automated verifier for a
   specific commit.
3. `git log --oneline -20` — the recent change history if the status snapshot
   is stale.
4. `npm run stack:status` or sim `/health` — only when a live process may
   explain current behavior.

These are intentionally different records. `BUILD-HEALTH.json` can be stale
while targeted fixes and tests have landed. The git log can show lots of work
without proving the build is playable. `stack:status` can show healthy live
processes without proving the repo is correct after a restart. `BUILD-STATUS.md`
is the place where agents reconcile those signals into a short current-truth
answer.

Update `BUILD-STATUS.md` whenever a movement, camera, sim, renderer, lifecycle,
controls, or platform change affects playability, and whenever a fresh playtest
changes the assessment. If memory or chat lacks local-build context, do not
infer that the work was not recorded; read the repo status docs first.

### Morning Review (~10am)
Greg wakes up. First thing:

1. `git log --oneline --since="midnight"` — see what the night shift produced
2. Read `docs/project/BUILD-STATUS.md` — know the latest local-build caveats
   before playtesting
3. If present, read the latest `tests/screenshots/agent-play-eval-*/summary.md`
   for what agents already proved and what they left for human judgment
4. Start a fresh play stack (`npm run stack:stop` then `npm run play`, or
   `npm run stack -- --no-open` and open the printed URL) — does it work? What
   changed?
5. Read the **NIGHT-REPORT.md** the agent leaves behind (see below)
6. Play for 10-15 minutes. Write gut reactions.
7. Decide: **continue this direction** or **course correct**

### Evening Handoff (~midnight)
Greg goes to sleep. Before signing off:

1. Play the current build, note what feels good and what doesn't
2. Write the night shift prompt(s) — specific tasks with deliverables
3. If the next task is technically risky, get a Forge review before launching it
4. Update the layer checklist in BUILD-PLAN.md
5. Commit any design decisions or tuning notes
6. Launch the agent(s)

### Mid-Day Check-in (~3pm, ~7pm)
Quick pulse checks during the day:

1. Is the current agent task still on track? (check git log)
2. Any blocking decisions needed? Make them now, don't let agents spin.
3. If a large task just landed, run it through Forge review before full playtest
4. Playtest anything new. Quick feedback in a commit message or note.

### Night Report (Agent writes this)
At the end of a night shift, the working agent writes `docs/journal/reports/YYYY-MM-DD-night.md`:

```markdown
# Night Report — [date]

## What I Built
- [list of commits with one-line descriptions]

## What Works
- [things you can see/test right now]

## What Doesn't Work Yet
- [known issues, incomplete features]

## Decisions I Made
- [any judgment calls — Greg reviews these first]

## What I'd Do Next
- [suggested next tasks, in priority order]

## Blockers / Questions for Greg
- [anything that needs human taste or a design call]
```

---

## Task Sequencing Rules

## Branching And Version-Line Protocol

Detailed policy lives in `docs/project/BRANCHING-AND-RELEASE-LINES.md`. This
section is the quick operating version.

The project now has two active kinds of work:

1. **Current public/demo line** — small fixes and polish that make the current
   build more demoable.
2. **Next-version line** — bigger systems work that should not destabilize the
   public demo while it is still being shown.

Treat these as separate release trains.

### Branch Roles

| Branch | Role | Allowed Work | Not Allowed |
|--------|------|--------------|-------------|
| `main` | Current v0.2 demo/public build line | Small fixes, playability polish, Deck deploy fixes, README/play instructions, build-status updates, v0.2 release artifacts | Large refactors, new architecture kernels, speculative renderer rewrites, broad harness migrations |
| `codex/v0.3-ballpark-roadmap` | Current v0.3 integration branch | Ballpark authority, ECS-ready data shape, event/snapshot spine, renderer contracts, structural harness work, next-version docs | Weekend demo fixes that should ship immediately on v0.2 |
| `codex/v0.3/<slice>` or equivalent | Optional child branch | One risky/overlapping v0.3 slice with a clear owner | Long-lived drift or mixed unrelated work |

Greg can rename or replace the active next-version branch. Until then, agents
should treat `codex/v0.3-ballpark-roadmap` as the v0.3 integration branch.

### Routing Rules

- If the work makes this weekend's demo better, it starts on `main`.
- If the work changes architecture for the next version, it starts on the
  active next-version branch.
- If the work is a process rule that affects all agents now, land it on `main`
  first, then merge `main` forward into the next-version branch.
- If a next-version task reveals a current-version bug, fix the bug on `main`
  first when practical, then merge forward.
- Do not merge next-version work back to `main` until Greg explicitly calls the
  v0.3 promotion.

This is the new normal: **big changes go forward, small demo fixes stay
public.**

### Subagent Branch Discipline

Every delegated task prompt should include:

- target branch;
- owned write scope;
- files/modules to avoid;
- expected validation lane;
- whether the worker should commit directly or report a patch for integration.

Default:

- Direct commits to the next-version integration branch are acceptable only
  when write scopes are disjoint.
- Use child branches when two workers may touch the same file, especially
  `scripts/sim-runtime.cjs`, `src/main.js`, `src/render-three/three-renderer.js`,
  `tests/suite-manifest.cjs`, or shared docs.
- One agent should act as integrator for high-conflict files.
- Workers must not switch the shared main-thread checkout without saying so in
  their handoff.

### Merge Flow

For a v0.2 demo fix:

1. Start on `main`.
2. Make the smallest useful fix.
3. Run the risk-matched validation lane.
4. Commit to `main`.
5. If the fix still matters to v0.3, merge `main` into the v0.3 branch or
   cherry-pick the single commit if the branch is intentionally isolated.

For v0.3 structural work:

1. Start from the active v0.3 integration branch.
2. Use a child branch if the work overlaps another active slice.
3. Keep commits slice-sized: scaffold, adapter, migration, harness gate,
   cleanup.
4. Run targeted tests first, then the branch's current integration gate.
5. Do not change public v0.2 docs or release status unless the finding also
   affects `main`.

For promotion from v0.2 to v0.3:

1. Greg calls the promotion window.
2. Freeze new v0.2-only work except urgent demo fixes.
3. Merge current `main` into the v0.3 branch.
4. Resolve conflicts on the v0.3 branch, not on `main`.
5. Run full release gates, including local playtest and Deck acceptance.
6. Update version docs, build status, release notes, README, and public train.
7. Merge v0.3 into `main` intentionally.
8. Tag or build according to the release process.

### Branch Checks

Before any non-trivial edit, run:

```sh
git branch --show-current
git status --short
```

If the branch does not match the work type, switch before editing. If switching
would strand local changes, stop and decide whether to commit, stash, or move
the changes to the right branch. Never use `git reset --hard` as branch hygiene.
For the full branch policy, promotion flow, subagent prompt template, and
validation expectations, read `docs/project/BRANCHING-AND-RELEASE-LINES.md`.

### When Agents Can Pick Up the Next Task
An agent can autonomously start the next task when ALL of these are true:

1. **Current task is committed and working** (not just "done" — verified working)
2. **Next task is on the same layer** (within-layer tasks are pre-approved to chain)
3. **Next task doesn't require a design decision** (no "should this feel X or Y?")
4. **Next task has clear acceptance criteria** (agent knows when it's done)
5. **It's still night shift** (don't start a 3-hour task at 9am when Greg wakes at 10)

### When Agents MUST Stop

- **Layer boundary**: Never start a new layer without Greg's sign-off. Layer 0 → Layer 1 requires Greg to play it and say "yes, surfing feels good, proceed."
- **Feel/vibe question**: "Is this fun?" is never an agent decision. Stop and leave a note.
- **Architecture fork**: If there are two valid approaches (e.g., DOM HUD vs canvas HUD), don't pick one — document both and stop.
- **Technical overreach**: If the task starts turning into infrastructure, research, or future-proofing that is not needed for the current layer, stop and ask for a scope cut.
- **Breaking change**: If the next task would require reworking something Greg already approved, stop and ask.
- **Performance cliff**: If you discover the approach won't hit 60fps, stop. Don't optimize — flag it. The fix might be a design change, not a code change.

### Task Dependencies (What Can Parallelize)

```
                    ┌─ ASCII Shader ─────────────┐
                    │                             │
Fluid Sim ──────── ┤                             ├── Entity Rendering
                    │                             │
                    └─ Ship Controls ─────────────┘

                                                  HUD (independent, DOM-based)

                                                  Sound (independent, Web Audio)

                                                  Procgen text (independent, pure JS)
```

- **Fluid sim must come first** — everything else reads from it
- **ASCII shader and ship controls** can develop in parallel once fluid sim renders to FBO
- **Entity rendering** needs both the ASCII shader (for visual integration) and ship controls (for collision reference)
- **HUD, sound, and procgen text** are fully independent — can be built anytime by a separate agent
- **AI (scavengers, fauna)** needs entity rendering + ship controls as foundation

---

## Agent Prompt Template

When launching an agent for a specific task, use this structure:

```markdown
## Task: [short name]
Layer: [L0-L6]
Branch: [main or feature/name]
Estimated scope: [small: <1hr, medium: 1-3hr, large: 3-8hr]

## Context
[What exists right now. What files matter. What the game currently does.]

## Deliverable
[Exactly what should exist when this task is done. Be specific.]

## Acceptance Criteria
- [ ] [thing that must be true — testable, not vibes]
- [ ] [another thing]
- [ ] Commits follow CLAUDE.md rules
- [ ] Game still runs at 60fps after changes

## Constraints
- [Don't touch X]
- [Must work with Y]
- [Don't make design decisions about Z — leave a note instead]

## References
- [Relevant files to read]
- [Repos to reference]
- [Design doc sections]

## Architecture Requirements
- [ ] All tunables in the `CONFIG` object (see TUNING.md) — systems read CONFIG every frame, not cached at init
- [ ] Expose `window.__TEST_API` for automated test access (see AGENT-TESTING.md)
- [ ] Add dev panel sliders for any new tunable constants
- [ ] All coordinate conversion, radius projection, wrapping, and fluid UV math goes through `src/coords.js`
- [ ] Gameplay-affecting behavior is implemented sim-side first; client-only code is presentation, sandbox prediction, or debug support
- [ ] Camera/projection changes update renderer fixture expectations and any affected tests

## When Done
- [ ] All criteria met
- [ ] If movement, spawning, hazards, camera, renderer projection, or sim/client authority changed: run the Math / Authority / Camera Pass above
- [ ] Working state committed
- [ ] If any design doc changed: update CHANGELOG.md in the same commit
- [ ] If a design decision was made: add DECISION-LOG.md entry
- [ ] If this was a substantial LBH session: write a Codex memory checkpoint
      note in `~/.codex/memories/extensions/ad_hoc/notes/`
- [ ] If this is a release handoff: the exact committed hash passes
      `release:status` and `test:package`
- [ ] If night shift: update night report in docs/journal/reports/
- [ ] If more tasks remain on this layer: proceed to [next task]
- [ ] If layer complete: STOP and wait for Greg's review
```

---

## Day-by-Day Overview

*Rough shape — detailed roadmap gets written Sunday night.*

### Monday (L0: The Feel)
- **Night (Sun→Mon):** Agent builds fluid sim + gravity well + ship controls
- **Day:** Greg plays it. "Does surfing feel good?" Tune constants. Add ASCII shader.
- **Night (Mon→Tue):** Agent polishes L0 based on Greg's feedback, adds multi-well

### Tuesday (L1: The Stakes)
- **Day:** Greg reviews L0 overnight work. Green-lights L1. Playtests wrecks/portals.
- **Night (Tue→Wed):** Agent builds extraction loop, HUD basics, portal evaporation

### Wednesday (L2: The Threats)
- **Day:** Greg playtests the loop. Is push-your-luck working? Tune portal timing.
- **Night (Wed→Thu):** Agent builds signal system, fauna, scavenger AI

### Thursday (L3: The Dread)
- **Day:** Greg playtests threats. Signal management interesting? Scavengers competitive?
- **Night (Thu→Fri):** Agent builds Inhibitors, UI corruption, terror mechanics

### Friday (L4: The Look)
- **Day:** Greg playtests Inhibitor. Is it terrifying? Art-directs HUD and visual polish.
- **Night (Fri→Sat):** Agent builds full NERV HUD, visual effects, screen distortion

### Saturday (L5: The Depth)
- **Day:** Greg does a full playthrough. Notes balance issues. Directs procgen flavor.
- **Night (Sat→Sun):** Agent builds metagame, upgrades, wreck generation, difficulty scaling

### Sunday (L6: Ship Day)
- **All day:** Title screen, game over, sound, balance pass, performance, deploy
- **Evening:** Submit to jam

---

## Scope Ratchet Triggers

Check these at each morning review:

**Ahead of schedule** (current layer done before its day):
- Pull stretch goals from the layer or next layer
- Add a parallel agent on an independent system (sound, procgen text)
- Increase visual polish budget

**On schedule** (current layer finishing on its day):
- Stay the course. Don't add scope.

**Behind schedule** (current layer not done by end of its day):
- Apply scope ratchets from BUILD-PLAN.md immediately
- Cut the weakest feature from the current layer
- Skip to the next layer's core feature only
- Remember: minimum shippable game is ship + fluid + wells + wrecks + portal + Inhibitor

**In crisis** (more than one layer behind):
- Stop all polish work
- Cut to minimum viable: one portal, no fauna, simplified scavenger AI
- All agent time goes to closing the gap to "playable game"
- Greg focuses on the single most important feel issue

---

## Documentation Structure

### Folder Layout

```
docs/
  design/           # What we're building — feature specs
  project/          # How we work — process, plans, contracts
  reference/        # Why we made those choices — research, reviews
  journal/          # The record — what happened, what we decided
```

**`docs/design/`** — Living design docs. These are the specs agents build from and Greg playtests against. They reflect the current state of each feature, not the history. When a design changes, the doc changes.

**`docs/project/`** — Process docs. This contract, the build plan, the roadmap, Forge review briefs, research checklists. How the team coordinates.

**`docs/reference/`** — Research that informed design decisions. EVE wormhole mechanics, Stellaris patterns, Forge's delivered reviews. These don't change — they're the record of what we studied.

**`docs/journal/`** — The full creative record. Designed to be mined for content after the jam and to let us revisit earlier thinking.

### Journal Files

**`DEVLOG.md`** — Reverse-chronological narrative of the jam. One entry per day (or per shift if a lot happened). Covers what was built, what was cut, design pivots, memorable moments, playtest reactions. The high-level story of the project.

**`DECISION-LOG.md`** — Full decision trees for every significant design fork. Tracks: the question, all options considered, who advocated what, where it landed, and whether the door is still open. When we revisit a decision, we add a new dated entry — never overwrite. This is the record of our thinking, including the roads not taken.

**`CHANGELOG.md`** — Human-readable version history of design docs. Git is authoritative, but this is for quick scanning without `git log`. Updated whenever a design doc changes meaningfully.

**`BUILD-STATUS.md`** — Current local build/playability snapshot. This answers:
what target to launch, whether the local build is green/recovery/blocked, what
evidence supports that assessment, and what caveats remain. It is not a test
log and not a replacement for `BUILD-HEALTH.json`.

**`CONTENT-PLAN.md`** — Post-jam content plan. Twitter threads, blog posts, YouTube video concepts. What to capture during the jam for later.

### Commit-Driven Handoffs (critical rule)

The repo history is the orchestration spine.

**Rule:** every handoff-worthy unit of work becomes a commit.
If an actor has produced something the next actor should react to — a pulled card, a plan, a review, a revision, a build result, test evidence, a journal entry, a state transition — that work gets written to the repo and committed before the handoff completes.

This means:
- Orb pulling a task and updating project state/board is a commit
- Orrery writing or revising a plan/design doc is a commit
- Forge review output saved into `docs/project/reviews/` is a commit unless it
  is long-term reference material
- Corb implementation progress is a sequence of commits, not one end-of-task dump
- Test results written into project docs/reports are committed
- Journal/report/state updates are committed at the moment they become true

**Operational consequence:** Orb should treat commits as the default machine heartbeat. A new commit from the active actor is the primary trigger that the next handoff can proceed. Discord can carry the narration and invocation, but the repo is the durable proof that a step actually landed.

### Who Updates What, When

| Document | Owner | When | Commits? |
|----------|-------|------|----------|
| **Design docs** | Corb (during build) or Orrery (during planning) | When the feature spec changes due to implementation discoveries or Greg feedback | Yes — same commit as the code change if Corb, separate `Docs:` commit if Orrery |
| **DEVLOG.md** | Orb | At each `ready_for_greg` transition, morning review, evening handoff, and after major pivots | Yes — Orb commits journal updates with `Docs:` prefix |
| **DECISION-LOG.md** | Orrery (design decisions) or Greg/Orrery via Claude (during sessions) | Immediately when a design fork is decided or revisited. Don't batch. | Yes — whoever writes the entry commits it |
| **CHANGELOG.md** | Orb (at state transitions) or Corb (when modifying design docs during build) | When design docs change meaningfully. Orb appends at each completed section. | Yes — same commit as the doc change, or batched by Orb at section completion |
| **BUILD-STATUS.md** | Current actor, with Orb as backstop | After playability-affecting bug fixes, platform/deploy changes, fresh playtests, or stale/full build-health decisions | Yes — same commit as the fix when practical, otherwise next `Docs:` commit |
| **Codex memory checkpoint** | Current Codex actor | After any substantial LBH session, especially renderer/sim/platform/build/playtest/process work | No repo commit; write one short ad-hoc note under `~/.codex/memories/extensions/ad_hoc/notes/` |
| **Night reports** | Orb (compiled from Corb build reports + Forge review + test results) | End of each night shift cycle, in `docs/journal/reports/` | Yes — Orb commits the report |
| **CONTENT-PLAN.md** | Greg or Orrery | When new content-worthy moments happen | Yes |
| **PROJECT-STATE.json** | Orb | Every state transition | Yes — Orb commits state changes |
| **PROJECT-BOARD.md** | Orb | Every state transition (mirrors PROJECT-STATE.json for humans) | Yes — same commit as JSON update |

### Commit Responsibilities by Actor

The old question was "who commits which categories?"
The tighter rule is: **everyone commits their own handoff-worthy work.**
If the next step depends on it, it should exist as a commit first.

**Orb commits:**
- `PROJECT-STATE.json` and `PROJECT-BOARD.md` state transitions
- task pulls / card movement / orchestration-state updates
- `DEVLOG.md` entries at checkpoints
- `CHANGELOG.md` batched updates at section completion (or sooner if needed for handoff clarity)
- `BUILD-STATUS.md` whenever playability status changes and no other actor recorded it
- Night reports compiled from build/test/review evidence
- Forge review files when Forge review lands and Orb is the recorder for that step
- Commit prefix: `Docs:` for journal/review docs, `State:` for project state

**Orrery commits:**
- planning docs, spec docs, and plan revisions produced during task shaping
- `DECISION-LOG.md` entries when design forks are resolved during planning
- design doc updates when plans reshape feature specs
- Commit prefix: `Docs:`

**Corb commits:**
- code in small, atomic units (prefix: `L0:`, `L1:`, etc.)
- implementation-driven design doc updates when the spec must be clarified
- test evidence docs/reports produced in Corb's lane before handoff
- `CHANGELOG.md` entry in the same commit when modifying a design doc
- Commit prefix per CLAUDE.md layer table

**Forge commits:**
- review docs or review note files when Forge is the actor producing the review artifact directly
- otherwise, Forge review must still be written to the repo and committed before the handoff is considered complete
- Commit prefix: `Docs:`

**Greg commits:**
- tuning changes from dev panel sessions (prefix: `Tune:`)
- design direction changes (prefix: `Docs:`)
- whatever Greg wants — Greg is the repo owner

**Short version:** no actor gets to keep meaningful work only in chat if another actor is expected to build on it.

### Journal Update Triggers

The journal must be updated at these moments. **Orb is responsible for ensuring these happen** — either by writing the entry itself or by verifying the responsible actor did.

1. **Section reaches `ready_for_greg`** — Orb appends a DEVLOG entry summarizing: what was built, test results, Forge review outcome, remaining caveats. Orb commits this.
2. **Morning review** — Orb appends a DEVLOG entry summarizing overnight work and Greg's reactions. Orb commits this.
3. **Evening handoff** — Orb appends a DEVLOG entry summarizing the day's work, playtest notes, and the night shift plan. Orb commits this.
4. **Design pivot** — Orrery (or Greg via Claude) appends a DECISION-LOG entry with the full option tree. Committer commits this.
5. **Design doc change** — The modifying agent (usually Corb or Orrery) adds a CHANGELOG entry in the same commit.
6. **Build/playability status changes** — The current actor updates `BUILD-STATUS.md` with the launch target, evidence, caveats, and next evidence needed. Orb backstops this if the status question is asked later and no one recorded it.
7. **Forge review lands** — Orb saves the review to `docs/project/reviews/` unless the review belongs in long-term reference, and appends relevant decisions to DECISION-LOG if the review influenced any. Orb commits.
8. **Scope ratchet** — Orb appends a DEVLOG entry explaining what was cut/deferred and why, with pointers to BACKLOG.md. Orb commits.
9. **Memorable moment** — Whoever notices it adds a DEVLOG entry with enough detail to write a tweet or blog post later.
10. **Substantial Codex session** — The current Codex actor writes one concise
    memory checkpoint note under `~/.codex/memories/extensions/ad_hoc/notes/`
    so future runs can route to the current repo docs and build status.

### Rules

- **Decision Log entries are append-only.** Never edit a past entry. If a decision is revisited, add a new dated row to the table and update "Where it landed."
- **Devlog entries are narrative.** Write them like you're telling someone the story of the day, not filing a report.
- **Changelog is mechanical.** Just the facts: what file changed, what changed in it.
- **Capture screenshots and recordings.** Note them in the devlog even if we can't embed them. `[Screenshot: first time ASCII shader looked right, 2026-03-17 3pm]` is enough.
- **Orb is the journal backstop.** If a trigger fires and nobody wrote the entry, Orb writes it from available evidence (build reports, test results, state transitions). The journal never falls silent.

---

## Remote Repo Hygiene

The remote repo must stay current. This is a shared workspace — other agents, Codex, and Greg all read from the remote.

- **Push after every milestone** — feature build, audit cycle, journal update. Not just at session end.
- **If 5+ commits have accumulated without a push, push.**
- **Release/handoff pushes get hash-named builds.** Before pushing a real build
  or handoff milestone to `origin`, commit the source, then run
  `npm run release:internal`. The build version is `0.2.x.<commit-hash>`: the
  third number is the public train and the fourth field is the committed source
  hash. The helper runs the fast gate, builds every release target
  (`web,ipad,mac,win,linux`), stages weekly assets, and verifies the artifact
  shape.
- **Commit hook reminder.** With `git config core.hooksPath .githooks`
  installed, every commit prints `npm run release:status -- --brief`: current
  public train, current hash build version, and whether the all-target artifact
  exists. Treat a missing artifact as expected during normal coding and as a
  handoff blocker before push.
- **Use the pre-push guard.** Install the tracked hook once with
  `git config core.hooksPath .githooks`. It blocks `origin` pushes when the
  current public train is behind upstream or the matching hash-named all-target
  release build is missing. For intentional docs/process-only pushes that do not
  publish a build, use `LBH_SKIP_RELEASE_PREP=1 git push origin main`.
- **Public version bumps are Greg calls.** `npm run release:public` advances the
  active train's third number. Commit that bump, then build. Large decisive
  minor/major train moves remain Greg's explicit call.
- **Keep README.md current** — update it when features, architecture, or setup instructions change. The README is the first thing anyone reads.
- **Tag versions** — public checkpoint tags use the active public train
  (`v0.2.x` on `main`, `v0.3.x` after promotion); build artifacts use
  `<public-version>.<hash>`. Update `package.json` only when the
  public train changes.
- **Build instructions must be correct** — if you add a new server, script, or dependency, update the README setup section in the same commit or the next one.

---

## Communication Norms

- **Agents write commit messages for each other** — any agent picking up work should be able to read the git log and understand the state
- **No silent failures** — if something doesn't work, commit it broken with a `WIP:` prefix and explain in the message
- **Design decisions in commits** — if you chose approach A over B, say why in the commit message. Future agents (and future Greg) need this.
- **Night report is mandatory** — even if "nothing went wrong, everything on the list is done," write the report. Greg's morning review depends on it.
- **Review is a gate, not decoration** — design audit (Orrery) + code review (Codex) after major implementation work. See Review Protocol above.
- **Codex catches what you can't** — interaction bugs, state leaks, runtime errors from new code meeting old. Always run it after fixing audit findings.
