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
At the end of a night shift, the working agent writes `docs/reports/YYYY-MM-DD-night.md`:

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

## When Done
- [ ] All criteria met
- [ ] Working state committed
- [ ] If night shift: update night report
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

## Communication Norms

- **Agents write commit messages for each other** — any agent picking up work should be able to read the git log and understand the state
- **No silent failures** — if something doesn't work, commit it broken with a `WIP:` prefix and explain in the message
- **Design decisions in commits** — if you chose approach A over B, say why in the commit message. Future agents (and future Greg) need this.
- **Night report is mandatory** — even if "nothing went wrong, everything on the list is done," write the report. Greg's morning review depends on it.
- **Forge review is a gate, not decoration** — use it before risky architecture work and after major implementation work.
