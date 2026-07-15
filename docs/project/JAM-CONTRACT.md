# Game Jam Contract: Shifts, Checkpoints, and Agent Orchestration

> Status: v0.2/v0.3/v0.4 branch process contract. This began as the 7-day jam
> coordination doc; keep that historical context, but current agent work is
> centered on the Three renderer, authoritative sim, platform targets,
> next-version branch work, and periodic architecture hygiene.

Historical shift schedules and day-by-day checklists below are optional
context. Live task topology, model routing, CI ownership, Orrery escalation,
branch merges, and RC selection come from
`docs/project/LBH-ORCHESTRATION-CONTRACT.md`.

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
- **Focused-proof verifiable** (the smallest affected contract or boot check passes)
- **Safely mergeable** (work on separate systems that don't conflict, or sequential on the same branch)
- **Committed meaningfully** (each feature, fix, decision, or handoff artifact gets a commit)
- **Commit-driven at handoff boundaries** — if the work is real enough to hand to the next actor, it is real enough to commit

---

## Forge's Role

Forge is not the main planner and not the main builder. Forge is the architectural brake and the code-shape check.

Forge is risk-selected. Invoke it for E2/E3 architectural shifts, broad
refactors, major renderer/sim/platform boundary changes, an explicit
`$lbh-forge-pass`, or when a concrete hygiene concern cannot be resolved by the
owning workstream. Ordinary feature commits do not receive automatic before-
and-after Forge review.

In practice:

- Greg sets the direction and taste.
- Orrery turns that into a concrete plan and task framing.
- Orb routes implementation work to the right agents.
- Forge checks whether the planned work is the simplest build that can succeed this week.
- At a qualifying checkpoint, Forge reviews whether the architecture is sound
  enough to hand back to Greg for playtest.

Forge is not a universal code-review gate. Primary Sol selects it when the
checkpoint exposure justifies the cost.

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
  contracts that no longer match v0.2.
- Comments that describe old behavior, magic numbers without context, and
  duplicated calculations that should be centralized.
- Test harness relevance: obsolete tests should be rewritten, deleted, or moved
  to legacy lanes; new contracts should get representative coverage.
- Docs holistically, with visible v0.2 status notes in docs that are updated.

Run only the validation lanes justified by the systems touched, then broaden if
the pass changes shared authority, renderer, controls, lifecycle, or platform
behavior.

## Agent QA North Star

Agents should verify that features work before Greg plays them. Greg's time is
for feel, taste, art direction, and product judgment, not first-contact QA.

Feature threads should spend roughly 80–90% of their effort implementing. They
run focused proof, commit the artifact, and continue independent work while
broader CI runs elsewhere. Playable and visual evidence belongs at reviewable
milestones, selected by the claim being handed to Greg rather than required as
a three-part bundle for every commit.

`docs/project/LBH-ORCHESTRATION-CONTRACT.md` owns the live Primary Sol,
workstream Sol, Luna, CI, and Orrery review-intake flow.

For a release handoff, source proof is not enough. Commit first, run
`npm run release:internal`, then run `npm run release:status` and
`npm run release:check`. The release gate must find the complete hash-named
artifact set for the exact committed HEAD. Active version branches may add
stronger packaged-runtime boot proof at their candidate gate.

---

## Review Protocol

Independent review is a risk lens, not a per-commit ceremony. Use design audit
for intent-sensitive architecture and code review for risky integration or
milestone diffs. A second pass is required only when blocking findings changed
the reviewed surface. Tuning, docs, isolated fixes, and ordinary feature slices
do not automatically trigger review.

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
5. **Representative proof** — run the smallest affected check now. Queue
   authority, playtest, visual, and fresh-process lenses for the next checkpoint
   when the exposure area requires them.

If the player dies to an invisible well, spawns off-route, gets pulled by a
thing they cannot see, or bounces between positions, treat that as a contract
failure first. Tune only after the math, authority, and camera contracts agree.

---

## Checkpoint Protocol

### Codex Memory Checkpoint Protocol

Write a Codex memory checkpoint note only when Greg explicitly requests one.
Use `~/.codex/memories/extensions/ad_hoc/notes/`; repo docs remain the source of
truth, while memory is only a routing index for future Codex runs.

When requested, a useful substantial checkpoint covers at least one of:

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
3. Start a fresh play stack (`npm run stack:stop` then `npm run play`, or
   `npm run stack -- --no-open` and open the printed URL) — does it work? What
   changed?
4. Read the **NIGHT-REPORT.md** the agent leaves behind (see below)
5. Play for 10-15 minutes. Write gut reactions.
6. Decide: **continue this direction** or **course correct**

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
section is a quick operating summary; the detailed file wins if this historical
jam contract drifts.

The project has three version lines:

1. **`main` / v0.2** — current public/demo fixes and cross-version governance.
2. **v0.3** — next features and release-candidate lineage.
3. **v0.4** — experimental multiplayer product work.

Treat them as separate release trains that merge only forward.

### Branch Roles

| Branch | Role | Allowed Work | Not Allowed |
|--------|------|--------------|-------------|
| `main` | Current v0.2 demo/public and governance line | Small fixes, playability polish, deploy/release work, README, project roadmap/decisions, process policy | Later-version features or casual promotion |
| `codex/v0.3-ballpark-roadmap` | Current v0.3 integration branch | Ballpark authority, ECS-ready data shape, event/snapshot spine, renderer contracts, structural harness work, next-version docs | Weekend demo fixes that should ship immediately on v0.2 |
| `codex/v0.3/<slice>` or equivalent | Optional child branch | One risky/overlapping v0.3 slice with a clear owner | Long-lived drift or mixed unrelated work |
| `codex/v0.4-multiplayer-product` | Current v0.4 product branch | Multiplayer authority, networking, crew flow, results, rematch, multiplayer UX | Backward shortcuts into v0.3 or `main` |

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
- Do not merge v0.4 backward into v0.3. Primary Sol merges compatible v0.3
  checkpoints forward into v0.4.

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
4. Run focused proof, then queue the branch integration gate for its checkpoint.
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
For detailed release-line and promotion policy, read
`docs/project/BRANCHING-AND-RELEASE-LINES.md`. Task hierarchy, goal packets, and
validation routing come from `docs/project/LBH-ORCHESTRATION-CONTRACT.md`.

### When Agents Can Pick Up the Next Task

A workstream may continue to the next independent slice only when it remains
inside the routed goal and owned branch, the current slice is committed, and no
Greg decision is required. A new milestone, branch, or product goal returns to
the primary orchestrator for routing.

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

## Agent Goal Template

Use the compact goal packet and receipt in
`docs/project/LBH-ORCHESTRATION-CONTRACT.md`. Add task-specific constraints only
when they change the worker's scope or acceptance. Do not copy the old jam-era
planning, evidence, journal, and review checklists into every goal.

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

**`DECISION-LOG.md`** — Durable cross-version rules and one summarized entry
when a version promotes. Detailed design forks belong in the owning version's
decision sources named by its `README.md`; v0.3 uses `OPEN-DECISIONS.md`, while
v0.4 uses `DECISIONS.md` and `OPEN-DECISIONS.md`. Never copy those files
backward merely to update the project journal.

**`CHANGELOG.md`** — Project-wide release, promotion, and large-revision
history. Git is authoritative. Version branches may keep their own detailed
changelogs; routine doc edits and CI receipts are not duplicated here.

**`BUILD-STATUS.md`** — Current local build/playability snapshot. This answers:
what target to launch, whether the local build is green/recovery/blocked, what
evidence supports that assessment, and what caveats remain. It is not a test
log and not a replacement for `BUILD-HEALTH.json`.

**`CONTENT-PLAN.md`** — Post-jam content plan. Twitter threads, blog posts, YouTube video concepts. What to capture during the jam for later.

### Commit-Driven Handoffs (critical rule)

The repo history is the orchestration spine.

**Rule:** every feature, fix, design decision, or other handoff-worthy artifact
becomes a meaningful commit before another actor depends on it. Do not create
separate state, report, journal, or evidence commits merely to narrate progress.

Update the active version's decision, changelog, or build-status source named
by its README only when that source actually exists and its truth changes. The
owner of the related change includes that update in the same commit when
practical.

### Journal Update Triggers

Update durable docs only when their truth changes: a design decision, playable
or release status, a version promotion, or a public/devlog milestone. Ordinary
commits, CI results, morning/evening handoffs, and orchestration state do not
require duplicate journal entries.

### Rules

- **Decision Log entries are append-only.** Never edit a past entry. If a decision is revisited, add a new dated row to the table and update "Where it landed."
- **Devlog entries are narrative.** Write them like you're telling someone the story of the day, not filing a report.
- **Changelog is mechanical.** Just the facts: what file changed, what changed in it.
- **Capture screenshots and recordings at visual, playable, and public
  milestones.** Ordinary feature commits do not need a devlog entry.

---

## Remote Repo Hygiene

The remote repo must stay current. This is a shared workspace — other agents, Codex, and Greg all read from the remote.

- **Push meaningful branch milestones.** Do not hold committed feature work
  behind package or release gates.
- **Candidate/release pushes get hash-named builds.** Before publishing a real
  candidate or release build to `origin`, commit the source, then run
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
- **Use the pre-push guard for public publication.** The tracked hook invokes
  release preparation only for an `origin/main` update. Version-branch pushes
  stay cheap. For an intentional main-line docs/process push that does not
  publish a build, use `LBH_SKIP_RELEASE_PREP=1 git push origin main`.
- **Public version bumps are Greg calls.** `npm run release:public` advances the
  third number (`0.2.x`). Commit that bump, then build. Large decisive `0.3` or
  `1.0` moves are by Greg's explicit call only.
- **Keep README.md current through Primary Sol.** Workstreams propose root
  README changes in their receipt; Primary Sol applies them on `main` when the
  public or cross-version truth changes.
- **Tag versions** — public checkpoint tags use the public train (`v0.2.x`);
  build artifacts use `v0.2.x.<hash>`. Update `package.json` only when the
  public train changes.
- **Build instructions must be correct.** If a version branch adds a server,
  script, or dependency, update its branch-local docs and flag the root README
  change for Primary Sol before promotion.

---

## Communication Norms

- **Agents write commit messages for each other** — any agent picking up work should be able to read the git log and understand the state
- **No silent failures** — if something doesn't work, commit it broken with a `WIP:` prefix and explain in the message
- **Design decisions in commits** — if you chose approach A over B, say why in the commit message. Future agents (and future Greg) need this.
- **Night reports are optional** — write one only when it materially improves a
  handoff beyond commits and the checkpoint receipt.
- **Review is risk-selected** — use it for risky integration, milestones, and
  candidate/release gates as defined above.
