# Forge Review Brief #2: Pre-Launch Check

> Forge — second pass. We've done a full day of architecture since your first review.
> You flagged showstoppers, we responded to all of them. Now we need you to stress-test
> the execution plan before code starts in ~12 hours.

---

## What Changed Since Your Last Review

Your first review (2026-03-15) flagged three showstoppers and four risks. Here's what we did with each:

### Your Showstoppers → Our Responses

| You Said | We Did | Status |
|----------|--------|--------|
| Dual-physics is too ambitious for week one | Reopened as parallel experiment (Pillar 6: Run It Twice). Two agents build both approaches Monday night. We compare Tuesday AM and pick the winner. Your single-sim recommendation is Approach A. | See DECISION-LOG.md #1, ROADMAP.md N1a/N1b |
| Multiplayer is architectural drag | Relabeled as stretch goal. No networking code. Clean data boundaries only. | See SCALING.md Phase 2, DECISION-LOG.md #5 |
| Threat scope too wide | Inhibitor is the only required threat. Fauna is stretch. Scavengers only if ahead. | See BUILD-PLAN.md Layer 2 note, DECISION-LOG.md #4 |

### Your Risks → Our Responses

| You Said | We Did | Status |
|----------|--------|--------|
| Signal may punish instead of create decisions | Still "tax on ambition, not currency." Door explicitly open for playtesting to override — Wednesday is the validation day. If "do less" appears, we pivot. | See SIGNAL-DESIGN.md, DECISION-LOG.md #2 |
| Inhibitor may flatten other threats | Threshold is hidden and randomized (±10%). Inhibitor is the capstone, not the floor. Fauna/scavengers deferred. | See ROADMAP.md Wednesday |
| Visual stack may get expensive before gameplay is proven | ASCII shader goes in Monday (Pillar 1: Art Is Product). Dev panel with live sliders means visual tuning doesn't require code changes. | See TUNING.md, ROADMAP.md N2/N3 |
| Procedural identity may be too text-light | Cosmic signatures per run (tidal, turbulent, viscous, sparse, dense, decaying). Wreck clusters with civilization themes. | See ROADMAP.md N13 |

---

## What's New Since Your Review

Read these files — they didn't exist yesterday:

| File | What It Is | Why It Matters |
|------|-----------|---------------|
| `docs/design/PILLARS.md` | 6 design pillars as decision lenses | "Art Is Product" is #1. "Run It Twice" directly enables the dual-sim experiment. |
| `docs/design/CONTROLS.md` | Ship physics model + input schemes | Turn speed curves, mass/inertia, gravity response, thrust model. Mouse control models (3 ranked). DualSense controller design with adaptive triggers and haptics. |
| `docs/design/MOVEMENT.md` (updated) | Expanded affordances | Near-miss correction, counter-steer damping, beginner drift guard, visual affordances for invisible assists. Surfing metaphor expanded. |
| `docs/design/TUNING.md` | How we iterate on feel | Dev panel with live sliders (mandatory Monday deliverable). Sandbox mode. Scenario snapshots. CONFIG object pattern. Greg-says→numbers translation table. |
| `docs/design/AGENT-TESTING.md` | Automated test harness | Puppeteer smoke/physics/gameloop tests. Agents verify "does it work?" so Greg only verifies "does it feel right?" |
| `docs/project/ROADMAP.md` (updated) | Hour-by-hour jam plan | 20+ named tasks with deliverables and acceptance criteria. Parallel experiment for Monday night. Scope ratchets at every day boundary. |
| `docs/project/AGENT-PROMPTS.md` | Copy-paste agent prompts | Ready for Monday 12:01a. One per physics approach. CONFIG object and __TEST_API mandatory. |
| `docs/reference/GAMEPLAY-FORGIVENESS-MASTER-REF.md` | Control affordance research | Coyote time, magnetism, corner correction, counter-steer, smart steering. From Gemini deep research. |

---

## What We Need From You

### 1. Execution Plan Review

The roadmap is now 900+ lines with specific tasks, dependencies, and acceptance criteria. Stress-test it:

- **Monday night is the riskiest night.** Two parallel physics prototypes + ASCII shader + dev panel + test harness. Is this too much for two agents in 10 hours? What would you cut from Monday night if we're overloaded?
- **The Tuesday AM comparison gate** — we play both prototypes and pick a winner (or merge). What if neither feels right? The roadmap says "fix physics, hold everything" but that's vague. What specific fallback would you recommend?
- **Wednesday is the signal validation day.** If signal-as-tax fails (the "do less" failure mode you warned about), we need a pivot plan. You recommended signal should "buy something." What's the simplest version of signal-upside we could implement Wednesday night if needed? We need it specced as a contingency, not designed under pressure.
- **The scope ratchets** — are they aggressive enough? Too aggressive? Is there a day where we should be more willing to cut?

### 2. Architecture Review (Updated)

The architecture has evolved significantly. New questions:

- **CONFIG object pattern** — every tunable lives in one object, every system reads from it every frame. Dev panel binds to it. Tests read from it. Is there a performance concern with reading CONFIG properties every frame instead of caching at init? At 60fps with ~60 config values?
- **Dev panel as mandatory build deliverable** — we're treating the tuning UI as infrastructure, not polish. It ships Monday night alongside the physics prototype. Is this the right call, or should the agents focus purely on physics and defer the panel to Tuesday?
- **`window.__TEST_API`** — the game exposes state readers and mutators for Puppeteer tests. Is there a risk this test surface area introduces bugs or performance issues in the game itself? Should it be behind a flag?
- **Mouse control Model 1 (distance = thrust intensity)** — we're recommending this as the default, with binary click as fallback. Your gut: is distance-modulated thrust intuitive enough for a jam game, or should we start with the simpler binary model?
- **DualSense controller support** — designed but deferred to Tuesday/Wednesday. The adaptive trigger resistance design (heavy near wells, light on waves, dead past commitment) is ambitious. Is Gamepad API + WebHID realistic for a browser game jam, or should we stick to basic stick+trigger and forget haptics?
- **The test harness** (Puppeteer, ~690 lines across 7 files) — is this the right investment for a 7-day jam, or is it over-engineering? The argument is: agents run tests automatically, Greg never wastes time on "does it load?" verification. The counter-argument: 690 lines of test code is 690 lines not spent on the game.

### 3. Control Affordances Review

The movement and controls docs are now the most detailed part of the design. You've played a lot of games — gut-check these:

- **Wave magnetism** (±15° catch window, 10% lock strength) — does this sound right for a fluid sim where the player is learning a new physics model? Too generous? Too tight?
- **Well escape assist** (20% shoulder width, soft pull reduction when thrusting away) — does this preserve the dread, or does it neuter the wells?
- **Near-miss correction** (wreck: 120% loot radius, portal: 150% entry radius) — is nudging the player toward targets the right call for a game that's about reading flow and positioning?
- **Counter-steer damping** (30% blend toward ideal escape vector) — does this feel like "the game is helping me" or "the game is playing for me"?
- **Turn speed curve** (quadratic ease-in, 180°/s base, speed-dependent reduction) — does this create the "committed high-speed surfing" feel we want, or will it frustrate players who need to dodge quickly?
- **Beginner drift guard** (subtle perpendicular force preventing passive well collision) — you said dread matters. Does a safety net for beginners undercut that? Should we cut it?

### 4. What We're Missing

You have the full picture now. 20+ design docs, a detailed roadmap, agent prompts ready to go. What haven't we thought of? What's going to bite us Wednesday that we could prevent now?

Specific prompts:
- Is there a system interaction we haven't considered? (e.g., does the ASCII shader's cell size interact badly with the wave catch window visualization?)
- Is there a playtesting blind spot? (Something we'll discover feels bad but haven't designed a response for?)
- Is there a jam-specific risk? (Something that always goes wrong in game jams that our plan doesn't account for?)

---

## How to Deliver

Write your review to `docs/reference/reviews/forge-review-2-2026-03-15.md`.

Same structure as last time: Showstoppers, Risks, Opportunities, Recommendations. But this time we also need:
- **Contingency: signal pivot spec** — if signal-as-tax fails Wednesday, what's the simplest upside mechanic?
- **Monday night priority ranking** — if agents can only finish 3 of 5 tasks (N1a, N1b, N2, N3, N0), which 3?
- **One thing to cut** — what's in the plan right now that you'd remove to buy margin?

Be direct. Code starts in 12 hours.
