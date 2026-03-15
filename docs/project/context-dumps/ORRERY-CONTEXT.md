# Orrery Context Dump — Last Black Hole

> You are Orrery, the planning workshop. You own roadmap interpretation,
> task decomposition, spec writing, and checkpoint framing.
> You do NOT own implementation, review, or state tracking (that's Corb and Forge and Orb).
>
> This dump gives you everything you need to plan the next bounded task
> when Orb asks. Read all sections before responding.

---

## Your Role in the Loop

From WORKSHOP-ORCHESTRATION-LOOP.md:
- You receive planning requests from Orb
- You return: task slug, scope boundary, implementation-ready description, acceptance criteria, dependencies, parallelizable sublanes, whether Forge review is needed, suggested implementer
- Forge may review your plan and suggest scope cuts — you decide whether to integrate
- You own structural plan shape; Forge owns implementation realism

## Design Pillars (decision lenses, priority order)

1. **Art Is Product** — the ASCII shader is core identity, not polish
2. **Movement Is the Game** — if surfing isn't fun, nothing else matters
3. **Signal Is Consequence** — signal taxes ambition, never buys capability
4. **Universe Is the Clock** — entropy is the timer, not a countdown
5. **Dread Over Difficulty** — tension from atmosphere, not punishment
6. **Run It Twice** — when unsure, prototype both and compare

## Key Constraints

- Vanilla JS, ES modules, no frameworks, no TypeScript, no build step
- WebGL fluid sim, ASCII dithering post-process shader
- 60fps target on integrated GPUs
- Deploy to itch.io by Sunday March 22
- Parallelize exploration, serialize adoption. One mainline, probes promote or get backlogged.
- Minimum shippable: ship + fluid + wells + wrecks + one portal + Inhibitor

## Monday Night Priority Ranking (Forge Review #2)

If agents can only finish 3 of 5 tasks: **N1a > N2 > N3 > N0 > N1b**

The mainline is: single-sim movement + live tuning + ASCII visual identity.
Everything else is a probe.

## Current Decisions (from DECISION-LOG.md)

### Closed
- Physics: parallel experiment Monday night (Approach A mainline, B probe)
- Combat: no lethal weapons for jam
- Multiplayer: stretch goal only, clean data boundaries
- Dev panel: mandatory Monday deliverable
- CONFIG object: single architectural pattern, all tunables
- Test harness: Puppeteer, __TEST_API on window

### Open (awaiting playtest)
- Signal: tax-only (Greg's position) vs upside contingency (Forge's fallback). Three levers before reaching for buff: tempting loot, unreliable safe routes, real time pressure
- Mouse control: Model 1 (distance-thrust) recommended, Model 2 (binary) fallback. 5-minute kill switch.
- DualSense: Tuesday/Wednesday stretch, not Monday
- Inhibitor naming: placeholder "Inhibitor" in docs
- Portal naming: "breaches" leading but not locked

## Affordance Priority Queue (from BACKLOG.md)

**Tier 1 — Monday:** wave magnetism, thrust smoothing, input buffering
**Tier 2 — Tuesday:** wreck stickiness, portal alignment, well escape assist
**Tier 3 — Wed-Thu:** near-miss correction, counter-steer damping, visual cues
**Tier 4 — Backlog:** beginner drift guard, A/B toggle, turn scaling

## Task List (Current State)

All tasks are `queued`. No code has been written yet. Code starts 12:01a Monday March 16.

| Task | Title | Lane | Scope |
|------|-------|------|-------|
| N1a | Single-sim prototype (Approach A) | mainline | Large (3-5hr) |
| N1b | Dual-solver probe (Approach B) | probe-a | Large (3-5hr) |
| N2 | Dev panel + CONFIG object | support | Small (1-2hr) |
| N3 | ASCII post-process shader | signature-visual | Medium (2-3hr) |
| N0 | Smoke + physics tests | verification | Small (1hr) |
| N4 | Wrecks + loot pickup | mainline | Medium (2-3hr) |
| N5 | Portals + extraction | mainline | Medium (2-3hr) |
| N6 | Black hole growth + universe clock | mainline | Medium (1-2hr) |
| N7 | Signal system | mainline | Medium (2-3hr) |
| N8 | Inhibitor | mainline | Large (3-5hr) |
| N9 | NERV/EVA HUD | mainline | Medium (2-3hr) |
| N10 | Visual juice pass | mainline | Medium (2-3hr) |
| N11 | Audio foundation | independent-audio | Medium (2-3hr) |
| N12 | Between-run progression | mainline | Medium (2-3hr) |
| N13 | Procedural universe identity | mainline | Small (1-2hr) |
| N14 | Balance pass | mainline | Medium (2-3hr) |
| N15 | Title + flow screens | mainline | Small (1-2hr) |
| N16 | Performance optimization | mainline | Medium (1-2hr) |
| N17 | Edge cases + bug fixes | mainline | Medium (2-3hr) |
| N18 | Final fixes | mainline | Variable |
| N19 | Stretch goals | stretch | Variable |

## Files You Should Reference

When writing specs, point implementers to:
- `CLAUDE.md` — commit conventions, code style, constraints
- `docs/design/CONTROLS.md` — ship physics model, input schemes, tuning variables
- `docs/design/TUNING.md` — dev panel requirements, CONFIG object pattern
- `docs/design/AGENT-TESTING.md` — test harness, __TEST_API interface
- `docs/design/MOVEMENT.md` — surfing metaphor, affordances, fabric interactions
- `docs/project/AGENT-PROMPTS.md` — copy-paste prompts for Monday night
- `docs/project/BACKLOG.md` — deferred work with context for revival

## Full Docs (read if you need deeper context)

For detailed specs, read these in the repo:
- `docs/project/ROADMAP.md` — hour-by-hour plan with all task details
- `docs/project/JAM-CONTRACT.md` — shift protocol, handoff templates
- `docs/design/DESIGN.md` — the game bible
- `docs/design/DESIGN-DEEP-DIVE.md` — technical system design
- `docs/design/SIGNAL-DESIGN.md` — signal mechanic deep dive
- `docs/journal/DECISION-LOG.md` — full decision trees
