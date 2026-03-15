# Last Black Hole — Content Plan

> How to turn the game jam into content. Written pre-jam so we capture the right material during the build.

---

## The Narrative Arc

Every piece of content needs a story. Ours has a strong one:

**A human game designer directs multiple AI agents to build a novel browser game in 7 days. The game itself is technically ambitious (ASCII rendering over fluid simulation — something nobody has done before). The process is experimental (day/night shifts where the human designs and the AI builds overnight). The result is either a compelling proof-of-concept or a spectacular documented failure.**

The arc has three acts:

1. **Vision (Pre-Jam, Days 1-2):** A wild concept crystallizes. Massive design docs. An AI reviewer reins in scope with "fake the theorem, ship the feeling." The ambition is set, the constraints are real.

2. **Construction (Days 3-5):** Does the core bet pay off? Does surfing feel good? The overnight builds. The morning reviews. The scope ratchets. The moment the ASCII shader first renders fluid dynamics as characters. The moment the Inhibitor first wakes.

3. **Ship or Sink (Days 6-7):** Polish, balance, deploy. What made it in. What got cut. The final playtest. The submission.

The emotional hook: can a new kind of human-AI creative collaboration produce something genuinely novel in a week?

---

## Twitter/X Thread Ideas

Each of these is a standalone thread (8-15 tweets). They can be posted during or after the jam.

### Thread 1: "How we used AI agents to build a game in 7 days"
The process story. Day/night shifts. Human taste + AI labor. How Forge's review changed the entire architecture. How the night shift builds worked. What agents are good at (implementation, iteration, boilerplate) and what they are bad at (taste, feel, "is this fun?"). Include screenshots of prompts, commit logs, night reports.

### Thread 2: "ASCII rendering over fluid simulation — why nobody has done this before"
The technical novelty. Explain the pipeline: fluid sim on GPU, render to framebuffer, divide into character cells, look up ASCII glyphs by density and flow direction, tint with energy color. Show the before (raw fluid sim) and after (ASCII rendered). Explain why it works as gameplay feedback — you can READ the physics through the characters. Density, direction, energy are all visible.

### Thread 3: "The signal mechanic: why noise is the core of our game"
Design thread. Start with Tarkov — noise is a tax on doing valuable things. Apply to a cosmic horror extraction game. Every action worth doing creates signal. Skilled movement is quiet. The Inhibitor embodies dark forest theory. The game teaches you to surf by punishing you for not surfing. Include the signal gradient (Ghost through Threshold).

### Thread 4: "We designed a procedural soundtrack where the universe is the instrument"
The music system. No pre-composed tracks. A base drone that gains harmonics as the universe dies. One oscillator per black hole creating chords that shift as wells grow and merge. Filtered noise amplitude-modulated by wave height — the surfing feedback you hear before you see. The signal choir that curdles from pretty to claustrophobic. The Inhibitor's ring modulation that makes everything sound wrong.

### Thread 5: "What EVE Online's wormholes taught us about portal design"
Reference thread. How 15+ years of EVE wormhole mechanics informed a game jam. Dual-depletion portals. The K162 rule (commitment creates information). Imprecise timing. The possibility of denying exits to competitors. The core insight: every action that helps you also exposes you.

### Thread 6: "Everything we cut from a 7-day game jam (and why)"
The anti-feature list. Dual physics systems (fake the theorem). Lethal combat (the Inhibitor IS the combat). Multiplayer networking (clean architecture only). Full AI scavenger pathfinding. Multi-grid ASCII rendering. The mutation system. Show how scope contraction made the game better, not worse.

### Thread 7: "An AI reviewed our game design and saved the project"
Forge's review as a case study. The 200-line technical and creative review. The showstoppers it identified. "The danger is not that the concept is weak. The danger is that the current plan is trying to build three games at once." How a non-human reviewer with no ego attachment to the design could see scope creep that the creators couldn't.

### Thread 8: "The universe as clock — designing time pressure without a countdown timer"
Design philosophy thread. Black hole growth, portal evaporation, Hawking radiation, spacetime viscosity. Four systems that stack to create escalating pressure without a number ticking down. The controls degrade — you feel the universe dying through the input. Why this is more interesting than a timer.

### Thread 9: "Day 1: does surfing spacetime feel good?"
Real-time thread posted during the jam. The Layer 0 playtest. Does the core bet pay off? Video of the first playable build. Honest reaction. What works, what doesn't, what needs to change. This could be the most engaging thread if the moment of "it clicks" is captured.

---

## Blog Post / Article Angles

Longer form. 1500-3000 words each.

### "Human Direction, AI Labor: A Game Jam Experiment"
The full process breakdown. How we structured human-AI collaboration for a creative project with hard deadlines. The day/night shift model. When to use AI (implementation, iteration, boilerplate) and when not to (taste, feel, design decisions). What we'd do differently. Aimed at game developers and AI practitioners.

### "ASCII as Physics: A New Rendering Technique for Browser Games"
Technical deep dive for a game dev audience. The full pipeline from fluid simulation to ASCII output. How character selection encodes physics data. The font atlas approach. Performance characteristics. Why this is both an aesthetic choice and a gameplay mechanic. Code snippets and shader breakdowns.

### "Designing the Dark Forest: Signal Mechanics in Extraction Games"
Game design essay. How dark forest theory from Three-Body Problem becomes a mechanic. Signal as tax on ambition. The Inhibitor as mathematical inevitability. How EVE Online's wormhole space informed the design. Why we chose no weapons. What this says about threat design in extraction games more broadly. Aimed at game design audience.

### "The 7-Day Build Log: Last Black Hole from Concept to Ship"
The complete chronological story. Pull from the DEVLOG.md entries. The spark, the expansion, the contraction, the build, the pivots, the ship. Include commit graphs, screenshots at each stage, before/after comparisons. The definitive record. Could be submitted to game dev publications.

### "Procedural Audio as Game Design"
The music system deep dive. How simulation state drives every sonic element. The drone, the well harmonics, the wave rhythm, the signal choir, the Inhibitor's wrong note. How audio teaches game state without HUD. Web Audio API implementation details. Why procedural beats composed for a game like this.

---

## YouTube Video Concepts

### Video 1: "Making a Game in 7 Days with AI Agents" (10-15 min)
The hero video. Covers the full arc. Talking head + screen capture + gameplay footage. Structure: concept pitch (30s), pre-jam design (2min), day-by-day build montage with key moments (6-8min), final game showcase (2min), what we learned (2min). Needs: screen recordings of each day's build state, gameplay footage at multiple stages, git log visualizations, key prompt/doc screenshots.

### Video 2: "How ASCII Fluid Rendering Works" (5-8 min)
Technical explainer. Animated diagrams of the pipeline. Side-by-side raw fluid vs. ASCII rendered. Zoom into individual character cells showing the lookup process. Shader code walkthrough. Before/after of each rendering pass. Needs: pipeline visualization, shader debug views, slow-motion rendering.

### Video 3: "The Game Design That Argued Itself Out of Combat" (8-12 min)
Design essay video. Walk through the combat analysis document. Build the case for weapons (Tarkov precedent, dark forest logic, fluid physics combat). Then dismantle it. Show why the Inhibitor replaces the entire combat system. Could become a popular game design video beyond the jam audience. Needs: game footage showing the Inhibitor encounter, comparison clips from Tarkov/Hunt/extraction games.

### Video 4: Timelapse / Dev Montage (2-3 min)
Short-form. Git commit history as a timelapse. Screen recordings compressed. The game evolving from blank canvas to finished product. Good music (maybe the game's own procedural soundtrack). Minimal narration. Shareable. Needs: continuous screen recording during dev sessions, or regular screenshots at commit points.

---

## Key Moments to Document

### Must Capture (Screenshots + Screen Recording)

- [ ] **First fluid sim render.** The raw fluid before ASCII. The "before" in every before/after comparison.
- [ ] **First ASCII shader output.** The moment characters appear over fluid. This is the signature image.
- [ ] **First playable surfing.** Ship riding a wave for the first time. Video. Greg's reaction.
- [ ] **The "it clicks" moment.** When surfing goes from technical demo to fun. Video + audio.
- [ ] **First wreck interaction.** Looting in the fluid field. Does the fly-over feel right?
- [ ] **First portal extraction.** The extraction loop completing for the first time.
- [ ] **First Inhibitor encounter.** The audio inversion. The HUD corruption. The terror. Video with audio is essential.
- [ ] **The HUD going on.** Before/after of NERV HUD over the ASCII world. Side by side.
- [ ] **A full run, start to finish.** Unedited gameplay. The complete arc from drop to extraction (or death).
- [ ] **The final build.** Polished game as shipped. Multiple runs showing variety.
- [ ] **Scope cuts in real time.** If something gets cut mid-jam, capture the state before removal.

### Must Capture (Process / Meta)

- [ ] **Git log visualization.** Commit frequency, message patterns, layer progression.
- [ ] **Night shift handoff prompts.** The actual prompts Greg writes before sleeping. Show the human-AI handoff.
- [ ] **Morning review reactions.** Greg seeing overnight work for the first time. Genuine reactions.
- [ ] **Forge review delivery.** The moment the scope contraction happens. Before and after plans.
- [ ] **Agent coordination.** Screenshots of multiple agents working, commit interleaving.
- [ ] **Design doc evolution.** DESIGN.md at start vs. end of jam. What changed and why.

### Nice to Have

- [ ] Side-by-side comparison: the Gemini pre-vis art vs. the actual game output
- [ ] Performance profiling views (GPU timings, frame budget breakdowns)
- [ ] Failed experiments — things that didn't work, with explanation
- [ ] The game running on different devices (laptop, phone if mobile works, big screen)
- [ ] Player reactions from anyone who tests it during the jam

---

## Content Calendar (Post-Jam)

Assuming jam ends Sunday March 22. Stagger content for sustained visibility.

| When | What | Platform |
|------|------|----------|
| Sunday March 22 | Ship the game. Short "we made a thing" post with gameplay GIF | X, Bluesky |
| Monday March 23 | Thread 9: "Day 1: does surfing feel good?" (most timely) | X |
| Tuesday March 24 | Thread 1: "How we used AI agents to build a game in 7 days" | X |
| Wednesday March 25 | Thread 2: "ASCII rendering over fluid sim" (technical hook) | X |
| Thursday March 26 | Blog post: "Human Direction, AI Labor" | Personal blog, cross-post |
| Friday March 28 | Thread 6: "Everything we cut" | X |
| Week 2 | Video 1: full jam video (needs editing time) | YouTube |
| Week 2 | Blog post: "ASCII as Physics" (technical) | Dev blog, Hacker News |
| Week 2 | Thread 3: "The signal mechanic" | X |
| Week 3 | Video 3: "The game design that argued itself out of combat" | YouTube |
| Week 3 | Blog post: "Designing the Dark Forest" | Game dev publication |
| Ongoing | Thread 7: "An AI reviewed our design and saved the project" | X |

---

## What Makes This Worth Documenting

Four things make this jam unusual enough to be worth serious content:

1. **A novel visual technique.** ASCII dithering over real-time fluid simulation in a browser. Nobody has shipped this. The before/after comparison alone is striking.

2. **Human-AI creative collaboration at speed.** Not "AI generated a game." A human designer directing AI agents with defined roles (builder, reviewer), day/night shifts, structured handoffs. The process itself is the innovation.

3. **A strong design with documented reasoning.** Every major decision has a written rationale. The combat analysis that concluded "no combat." The signal design built from Tarkov insight. The EVE wormhole research. The Forge review that contracted scope. This is a case study in game design thinking, not just a jam build.

4. **The game concept itself.** "Surfing gravity waves in a dying universe" is immediately compelling. Extraction roguelike mechanics in a cosmic horror setting with fluid physics. Even if the execution is rough, the concept draws interest.

The worst case: the game doesn't come together, but the design documents and process story are valuable on their own. The best case: the game is good AND the story of how it was made is interesting. Either way, the documentation pays off.
