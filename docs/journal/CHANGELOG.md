# Changelog

> Human-readable version history of design docs.
> Git is authoritative. This is for quick scanning without `git log`.

---

## 2026-03-15 (Pre-Jam Day 2: Architecture Day)

### docs/design/
- **DESIGN.md** — unchanged (the bible holds)
- **DESIGN-DEEP-DIVE.md** — added ASCII shader research (pmndrs/postprocessing as starting point, 4-pass GPU pipeline, font atlas, braille characters), entity IFF system, NERV HUD architecture, universe gen rules, 10-minute match timeline, scavenger AI, fauna types, Inhibitor mechanics, sound direction, camera system. **Late update:** physics architecture section rewritten to reflect parallel experiment decision (dual-sim → two approaches built simultaneously).
- **SIGNAL-DESIGN.md** — NEW. Signal as "the tax on ambition." 6-tier gradient (GHOST→THRESHOLD), per-player in multiplayer, peak-based Inhibitor trigger. Explicit: signal does NOT buy capability.
- **COMBAT.md** — NEW. Full case for/against weapons. Conclusion: no lethal combat for v1. Non-lethal tools (force pulse, signal flare, tether) as stretch goals.
- **MUSIC.md** — NEW. 5-layer procedural soundscape (drone, well harmonics, wave rhythm, signal choir, Inhibitor presence). All Web Audio API, no libraries, no samples.
- **SCALING.md** — NEW. Player scaling (1→10→100), universe scaling (small→vast). Jam target: 4x4 screens with frustum rendering. Multiplayer architecture (authoritative server + client prediction). 5 clean-architecture choices for the jam. **Late update:** Phase 2 multiplayer relabeled as stretch goal per decision log.
- **PILLARS.md** — NEW. 6 design pillars: Art Is Product, Movement Is the Game, Signal Is Consequence, Universe Is the Clock, Dread Over Difficulty, Run It Twice. Ordered by priority. Each has "the test" section.
- **MOVEMENT.md** — NEW. Surfing metaphor (10 concepts mapped from real surfing), control affordances (wave magnetism, well escape assist, wreck stickiness, portal alignment, input buffering with coyote time), fabric interactions (wells, wrecks, mergers, cosmic signatures), skill progression (beginner→expert), tuning variables with starting values.

### docs/project/
- **BUILD-PLAN.md** — updated: added threat priority note (Inhibitor core, fauna stretch, scavengers only if ahead).
- **JAM-CONTRACT.md** — NEW. Day/night shift protocol, checkpoint cadence, Forge's role as architectural brake, task sequencing rules, agent prompt template, scope ratchet triggers. Updated with Forge review gate. **Late update:** added documentation structure (4-folder layout), journal files, ownership table, 7 update triggers, rules.
- **ROADMAP.md** — NEW. Detailed hour-by-hour roadmap for 7-day jam. 19 named tasks (N1-N19) with deliverables, dependencies, acceptance criteria. Scope ratchets at every day boundary.
- **FORGE-REVIEW.md** — NEW. Two-pass review brief for Forge (creative + technical).
- **GEMINI-PROMPTS.md** — NEW. 8 image generation prompts (3 key art, 3 game moments, 2 entity concepts).
- **PRE-MONDAY-RESEARCH.md** — updated with pmndrs ASCII shader references, CSS color palette, word lists for procgen. **Late update:** font atlas size corrected to 16×16 (matches DEEP-DIVE/pmndrs).

### docs/reference/
- **EVE-WORMHOLE-REFERENCE.md** — NEW. 6 patterns to steal (dual-depletion, asymmetric info, environmental effects, portal capacity, K162 commitment rule, rolling). Universe type table. Naming inspiration.
- **STELLARIS-REFERENCE.md** — NEW. Crisis escalation, Shroud bargains, environmental hazards, anomaly pity timers, archaeology chapters, precursor archetypes, leviathans, L-Gate mystery, Horizon Signal cosmic horror, naming conventions, Alexis Kennedy narrative principles.
- **reviews/forge-review-2026-03-15.md** — Forge's delivered review. Showstoppers, risks, opportunities, recommendations, cut list. Key phrase: "Fake the theorem, ship the feeling."

### docs/journal/
- **DEVLOG.md** — NEW. Reverse-chronological dev journal. Entries for Mar 14 (The Spark) and Mar 15 (The Architecture Day).
- **CONTENT-PLAN.md** — NEW. Post-jam content plan (Twitter threads, blog posts, YouTube concepts).
- **DECISION-LOG.md** — NEW. Full decision trees for: physics architecture (reopened with parallel experiments option), signal mechanic, combat, threats, multiplayer, visual stack, naming. 8 design forks tracked.
- **CHANGELOG.md** — NEW. This file.

---

## 2026-03-14 (Pre-Jam Day 1: The Spark)

### docs/design/
- **DESIGN.md** — NEW. Core game design document. One-sentence pitch, core loop, universe-as-clock, movement/physics, threat hierarchy, visual design (ASCII dithered fluid), procedural generation, progression stubs, tech stack, open questions.

### docs/project/
- **BUILD-PLAN.md** — NEW. 7-layer build plan (L0 Feel → L6 Ship). Scope ratchets. Pre-Monday prep checklist.
