# Forge Review Brief: Last Singularity

> Forge — we need your eyes on this. Two passes: one creative, one technical.

---

## What This Is

A browser-based roguelike extraction game set in a collapsing universe. You surf gravity waves through a fluid simulation, scavenge wreckage of dead civilizations, and extract through evaporating portals before spacetime swallows you. ASCII dithered rendering over a WebGL fluid sim. NERV/EVA-style HUD. Procedural soundscape. 7-day game jam build (March 16-22, 2026).

**Read these first:**
- `docs/DESIGN.md` — the game (what it is, how it plays)
- `docs/DESIGN-DEEP-DIVE.md` — the systems (how they work)
- `docs/BUILD-PLAN.md` — the schedule (what gets built when)
- `docs/SCALING.md` — multiplayer and universe size architecture
- `docs/MUSIC.md` — procedural audio design
- `docs/JAM-CONTRACT.md` — how agents coordinate the build

---

## Pass 1: Creative & Thematic Review

We want your taste here. You've read widely and you have strong opinions — that's what we need.

### Game Feel & Fantasy
- Does the core fantasy hold together? "Last black hole surfer, scavenging dead civilizations while spacetime collapses." Does this pitch make you want to play it?
- The tone is Three Body Problem meets Revelation Space meets Caves of Qud. Hard sci-fi cosmic dread with a roguelike extraction loop. Are there tonal collisions in the design? Places where the vibe undercuts itself?
- The "universe as clock" mechanic (no countdown timer — the world visibly dies around you) is the central design bet. Does this feel like enough pressure, or does a player need more explicit urgency?

### Dark Forest & Signal Mechanic
- Signal management is the core risk/reward dial. Every action makes noise. Noise attracts threats. The Inhibitor embodies dark forest theory — your existence is a statistical threat. Does this create interesting decisions, or does it just punish activity?
- In multiplayer (2-3 players, jam goal): one noisy player can wake the Inhibitor for everyone. Is this fun social dynamics or griefing? How should we handle it?

### The Inhibitor
- The Inhibitor is unkillable, fast, extradimensional. It hunts by signal. You can hide near wrecks or in accretion disks. Is this the right threat design? Should there be ANY counter beyond evasion?
- The audio inversion moment (all sound briefly goes through ring modulation when it wakes) — does this land as horror, or is it just jarring?

### Procedural Identity
- Each wreck has a generated civilization name, death cause, age, and loot table. Is this enough to make runs feel unique? What else could distinguish one collapsing universe from another?
- The "vines on iron trellis" approach (handcrafted mechanics, generated content) — are we generating enough? Too much?

### What's Missing?
- What would you add to the design that we haven't thought of?
- What would you cut?
- Is there a reference game, film, or book we should be looking at that isn't in the design docs?

---

## Pass 2: Technical Architecture Review

Deep review. Poke holes. Find the problems before Monday.

### Fluid Simulation
- We're proposing a dual-system: Navier-Stokes for local fluid physics + a wave equation solver for gravity wave propagation. The wave amplitude feeds into the fluid as a force multiplier. Is this the right coupling? Are there simpler approaches that give us "surfable waves" without two physics systems?
- The PavelDoGreat WebGL-Fluid-Simulation fork is our starting point. It runs advection → diffusion → force injection → pressure solve (Jacobi, 20-40 iterations) → divergence correction. At 256×256, is this enough resolution for the ASCII renderer to have interesting density variation? Too much for 60fps with the post-process on top?
- Spatially-varying parameters (viscosity texture, damping texture) — is this straightforward to add to the existing sim, or does it require rearchitecting the pressure solve?
- Object-fluid coupling: wrecks as boundary conditions, portals as sinks, ship thrust as force injection. Which of these are simple to implement and which are research problems?

### ASCII Rendering Pipeline
- 4-pass pipeline: fluid sim → scene color → feedback blend → ASCII post-process. The ASCII shader samples a font atlas texture (1024×1024, 16×16 grid of glyphs). Each cell does: pixelate UV → sample luminance → index into atlas → multiply by scene color. Is there a performance concern we're missing?
- The two-axis character lookup (density selects weight, velocity direction selects shape) — is this achievable in a single fragment shader pass, or does it need a lookup texture beyond the font atlas?
- Multi-grid layering (3 character grids at different scales, composited with alpha) — is this 3 additional draw calls, or can it be done in the same pass?
- Temporal feedback buffer for motion trails — ping-pong framebuffers with 85-95% decay. Any gotchas with WebGL framebuffer management here?

### Multiplayer Architecture
- For 2-3 players: authoritative server running the fluid sim, broadcasting state snapshots at ~10Hz, clients interpolating. Player inputs are ~12 bytes/tick. Fluid state delta-compressed to ~10-20KB per snapshot. Does this bandwidth budget hold up?
- The fluid sim is "deterministic" on GPU — but floating point differences across GPUs mean client prediction will drift. How bad is this in practice? Is interpolation toward server state sufficient, or do we need full server-authoritative fluid with no client prediction?
- WebSocket vs WebRTC for 2-3 players? WebSocket is simpler. WebRTC has lower latency for the input path. For a fluid sim game where the physics is continuous (not frame-locked like a fighting game), does the latency difference matter?
- Should the server be a Node.js process running the fluid sim on CPU (no GPU), or do we need a GPU-equipped server? CPU Navier-Stokes at 128×128 is feasible but won't match the visual quality of the client's GPU sim.

### Rendering Architecture
- Canvas + WebGL for the game world, DOM overlay for the HUD. The HUD uses CSS animations and mix-blend-mode for CRT effects. Any z-index or compositing issues with canvas-under-DOM on different browsers?
- The frustum optimization: ASCII post-process only on visible viewport + 1 screen buffer, fluid sim runs on full universe grid. Is there a clean way to implement this in WebGL (viewport scissor? separate FBO for the visible region?)?
- At 4 screens square (16 total screens of game world): the fluid sim texture would need to be 1024×1024 or larger to maintain density at the character cell level. Is this a VRAM concern on integrated GPUs?

### Performance Budget
- Our target: 60fps on a mid-range laptop (integrated GPU, 2020-era). The fluid sim + ASCII post-process + entity rendering + feedback buffer. Give us your gut estimate: are we in budget, or are we going to have to make cuts?
- Where would you expect the first performance cliff? Fluid sim resolution? ASCII cell count? Number of entities? Feedback buffer memory?
- Any WebGL-specific gotchas we should watch for? (context loss, mobile GL ES differences, shader compilation stalls)

### Build Tooling
- We want to stay at "single HTML file" as long as possible (jam speed, zero build step). At what complexity point does this become untenable? When do we need Vite?
- Shader code: template literals in JS vs separate .glsl files? Template literals are simpler for a single file. Separate files need a build step or runtime fetch. Recommendation?

---

## How to Deliver Your Review

Write your review as `docs/reviews/forge-review-2026-03-16.md` (or today's date if reviewing pre-Monday).

Structure it however makes sense to you, but flag:
- **Showstoppers** — things that will definitely not work as designed
- **Risks** — things that might not work, depending on implementation details
- **Opportunities** — things we haven't considered that could make it better
- **Recommendations** — specific changes you'd make to the architecture

Be direct. We have 7 days. We'd rather know the problems now than discover them Wednesday.
