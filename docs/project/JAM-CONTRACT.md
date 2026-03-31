# Game Jam Contract: Shifts, Checkpoints, and Agent Orchestration

> How Greg, Orrery, and the orbs coordinate a 7-day game jam.
> Finalize into a detailed roadmap Sunday night before Monday kickoff.

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

## Review Protocol: Audit → Codex

After any feature build that touches >200 lines or adds a new system, run a two-pass review before reporting done. The passes catch different classes of bugs.

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

### Trigger Rules

- **Always run both passes:** new system, new entity type, new server↔client wiring
- **Run Codex only:** bug fix >50 lines, refactor touching shared state
- **Skip both:** tuning constants, docs, comments-only changes

### Hook Setup

For automatic Codex review on every commit, add a PostToolUse hook on Bash in `~/.claude/settings.json` that fires `codex-post-commit-review.sh`. The hook script lives at `~/.claude/hooks/codex-post-commit-review.sh` and triggers `codex review --background --scope working-tree` after successful `git commit` commands.

---

## Checkpoint Protocol

### Morning Review (~10am)
Greg wakes up. First thing:

1. `git log --oneline --since="midnight"` — see what the night shift produced
2. Open the game in browser — does it work? What changed?
3. Read the **NIGHT-REPORT.md** the agent leaves behind (see below)
4. Play for 10-15 minutes. Write gut reactions.
5. Decide: **continue this direction** or **course correct**

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

## When Done
- [ ] All criteria met
- [ ] Working state committed
- [ ] If any design doc changed: update CHANGELOG.md in the same commit
- [ ] If a design decision was made: add DECISION-LOG.md entry
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

**`CONTENT-PLAN.md`** — Post-jam content plan. Twitter threads, blog posts, YouTube video concepts. What to capture during the jam for later.

### Commit-Driven Handoffs (critical rule)

The repo history is the orchestration spine.

**Rule:** every handoff-worthy unit of work becomes a commit.
If an actor has produced something the next actor should react to — a pulled card, a plan, a review, a revision, a build result, test evidence, a journal entry, a state transition — that work gets written to the repo and committed before the handoff completes.

This means:
- Orb pulling a task and updating project state/board is a commit
- Orrery writing or revising a plan/design doc is a commit
- Forge review output saved into `docs/reference/reviews/` is a commit
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
6. **Forge review lands** — Orb saves the review to `docs/reference/reviews/` and appends relevant decisions to DECISION-LOG if the review influenced any. Orb commits.
7. **Scope ratchet** — Orb appends a DEVLOG entry explaining what was cut/deferred and why, with pointers to BACKLOG.md. Orb commits.
8. **Memorable moment** — Whoever notices it adds a DEVLOG entry with enough detail to write a tweet or blog post later.

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
- **Keep README.md current** — update it when features, architecture, or setup instructions change. The README is the first thing anyone reads.
- **Tag versions** — use semantic version tags (`v0.2.0`) at meaningful checkpoints. Update `package.json` version to match.
- **Build instructions must be correct** — if you add a new server, script, or dependency, update the README setup section in the same commit or the next one.

---

## Communication Norms

- **Agents write commit messages for each other** — any agent picking up work should be able to read the git log and understand the state
- **No silent failures** — if something doesn't work, commit it broken with a `WIP:` prefix and explain in the message
- **Design decisions in commits** — if you chose approach A over B, say why in the commit message. Future agents (and future Greg) need this.
- **Night report is mandatory** — even if "nothing went wrong, everything on the list is done," write the report. Greg's morning review depends on it.
- **Review is a gate, not decoration** — design audit (Orrery) + code review (Codex) after major implementation work. See Review Protocol above.
- **Codex catches what you can't** — interaction bugs, state leaks, runtime errors from new code meeting old. Always run it after fixing audit findings.
