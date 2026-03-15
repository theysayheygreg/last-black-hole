# Agent Prompts: Monday Night Parallel Experiments

> Copy-paste one of these to an agent at 12:01a Monday March 16.
> Two agents run simultaneously — one per approach. Compare Tuesday AM.

---

## Shared Context (include with BOTH prompts)

```
You are building Layer 0 of Last Black Hole — a roguelike extraction game where
you surf spacetime in an ASCII-dithered fluid simulation.

READ THESE FILES BEFORE WRITING ANY CODE:
- CLAUDE.md (root) — commit conventions, code style, constraints
- docs/design/PILLARS.md — design lenses (Art Is Product is #1)
- docs/design/MOVEMENT.md — surfing metaphor, control affordances, tuning variables
- docs/design/CONTROLS.md — ship physics model, mouse control models, tuning variables
- docs/design/TUNING.md — dev panel requirements, CONFIG object pattern, tuning workflow
- docs/design/DESIGN-DEEP-DIVE.md — physics architecture (Section 1), ASCII renderer (Section 2)
- docs/project/PRE-MONDAY-RESEARCH.md — fluid sim research, shader references, key questions

WHAT YOU'RE BUILDING:
- WebGL canvas, fullscreen
- Fluid simulation on GPU
- 1-3 gravity wells (black holes) injecting force into the fluid
- A ship (triangle/arrow) controlled by mouse-aimed thrust
- Ship reads fluid velocity at its position, adds to own velocity
- Drift when not thrusting — feel the current carry you
- Waves propagating from gravity wells — can you surf them?
- ASCII dithering post-process shader over everything

WHAT YOU'RE NOT BUILDING:
- No entities (wrecks, portals, fauna, scavengers, Inhibitors)
- No HUD beyond debug info (fps counter, velocity readout)
- No game loop (no win/lose/score)
- No sound
- No metagame
This is ONLY physics + ship + shader. Nothing else.

TECH STACK:
- Vanilla JS, ES modules
- Entry point: `index-a.html` (Approach A) or `index-b.html` (Approach B) — winner renamed to `index.html` Tuesday AM
- WebGL 2 (fallback to WebGL 1 only if necessary)
- No frameworks, no Three.js, no build step
- File structure: src/ for JS modules, src/shaders/ for GLSL if separate

CRITICAL: TEST API
Expose window.__TEST_API on the game window. This is how automated tests
and the dev panel interact with game state. See docs/design/AGENT-TESTING.md
for the full interface. At minimum for L0:
- getShipPos(), getShipVel(), getFluidVelAt(x,y), getFPS()
- teleportShip(x,y), setTimeScale(scale)
- getConfig(), setConfig(path, value)

CRITICAL: CONFIG OBJECT PATTERN
Every tunable value MUST live in a single CONFIG object at the top of your code.
Every system reads from CONFIG every frame (not cached at init). Example:

const CONFIG = {
  ship: { thrustForce: 5, fluidCoupling: 0.8, turnRate: 180, mass: 1.0 },
  fluid: { viscosity: 0.001, resolution: 256 },
  wells: { gravity: 10, falloff: 2.0, waveAmplitude: 1.0, waveFrequency: 1.0 },
  affordances: { catchWindow: 15, lockStrength: 0.1, shoulderWidth: 0.2 },
  ascii: { cellSize: 8 }
};

This is NOT optional. A dev panel will bind to this object so Greg can
tune values live with sliders. If values are hardcoded in shader code
or scattered across files, the dev panel can't reach them and tuning
requires code changes + reloads instead of slider drags.

TUNING VARIABLES (starting points — expect hourly changes):
- Fluid grid: 256×256
- Thrust force: tune relative to well pull at mid-range
- Fluid coupling: 0.8 (ship velocity = 80% fluid + 20% own momentum)
- Wave magnetism catch window: ±15 degrees, ±20% velocity match
- Wave magnetism lock strength: 10% of wave force
- Thrust smoothing: 50ms lerp on ship facing
- Target: 60fps on a mid-range laptop

ACCEPTANCE CRITERIA:
"Is it fun to just fly around in this?"
- Surfing a wave should feel like catching a real wave — momentum, acceleration, flow
- Drifting in a current should feel physical, not floaty
- Fighting toward a gravity well should feel dangerous and effortful
- The ASCII shader should make the fluid beautiful, not just readable
- Performance: 60fps sustained with 3 gravity wells active

COMMIT CONVENTIONS:
- Prefix: L0:
- Commit after every meaningful change (new shader, tuned constant, system wired up)
- Note in commit messages what the change feels like (before/after)

WHEN DONE:
- [ ] All acceptance criteria met (or documented why not)
- [ ] Working state committed to main
- [ ] Update docs/journal/CHANGELOG.md
- [ ] Write night report to docs/journal/reports/night-1-monday.md
- [ ] STOP — do not proceed to Layer 1. Wait for Greg's review.
```

---

## Prompt A: Single-Sim Approach

```
YOUR APPROACH: Single Navier-Stokes Fluid Sim

You are building Approach A of the parallel physics experiment. Another agent
is simultaneously building Approach B (dual solver). Tuesday morning Greg
compares both.

PHYSICS STRATEGY:
Fork or reimplement PavelDoGreat/WebGL-Fluid-Simulation. Single Navier-Stokes
solver. Create wave-like behavior through OSCILLATING FORCE INJECTION from
gravity wells:

- Each gravity well has a persistent radial inward force: F = G * mass / r²
- ALSO inject periodic perturbation: amplitude * sin(frequency * t)
- Amplitude scales with black hole mass (bigger = stronger pulses)
- Frequency decreases with mass (bigger = slower, more powerful waves)
- The oscillation creates expanding rings of high-velocity fluid — surfable!
- When two wells' oscillations interfere, complex wave patterns emerge

This is the simpler approach. The bet: Navier-Stokes with clever force
injection can produce surfable waves without a separate wave equation solver.

GPU PIPELINE (4 passes):
1. Fluid sim (advect → diffuse → force injection → pressure solve → divergence correction) → fluid FBO
2. Render fluid density/velocity as color → scene FBO
3. Feedback blend with previous frame (trails/persistence) → feedback FBO
4. ASCII post-process (cell → luminance → atlas lookup → color multiply) → screen

KEY REFERENCES:
- PavelDoGreat/WebGL-Fluid-Simulation — shader pipeline to fork
- GPU Gems Chapter 38 (Jos Stam "Stable Fluids") — the algorithm
- pmndrs/postprocessing ASCIIEffect — ASCII shader starting point
  - ASCIIEffect.js, ascii.frag, ASCIITexture.js
  - 1024×1024 atlas, 16×16 glyph grid

SHIP-FLUID COUPLING:
- Ship → Fluid: thrust injects small radial force at ship position (creates wake)
- Fluid → Ship: ship velocity = thrust + bilinear sample of fluid velocity at position
- Higher thrust = more force injection = visible wake = eventually more signal (L2)

YOUR UNIQUE ADVANTAGE:
- Simpler codebase, easier to debug
- Proven approach (PavelDoGreat is battle-tested)
- More performance headroom (one solver, not two)
- If the oscillating injection creates convincing waves, this wins on shipping risk

YOUR RISK:
- Oscillating force injection might produce ripples but not long-range propagating
  waves. If the surfing feel is weak, tune amplitude/frequency hard before giving up.
- The Navier-Stokes diffusion will dampen waves over distance. You may need to
  reduce viscosity or add per-cell damping control.

FILE NAMING:
- src/fluid.js — Navier-Stokes solver (WebGL shaders)
- src/ship.js — ship controls, thrust, fluid sampling
- src/ascii-renderer.js — ASCII post-process shader
- src/wells.js — gravity well force injection + oscillation
- src/main.js — game loop, canvas setup, wiring
- index-a.html — entry point (Approach A prototype)
```

---

## Prompt B: Dual-Solver Approach

```
YOUR APPROACH: Dual Solver (Navier-Stokes + Wave Equation)

You are building Approach B of the parallel physics experiment. Another agent
is simultaneously building Approach A (single fluid sim). Tuesday morning Greg
compares both.

PHYSICS STRATEGY:
Two physics layers running on separate grids, coupled via force injection:

LAYER A — Navier-Stokes Fluid (Local Physics):
- Governs local movement: currents, eddies, drag, thrust interaction
- Based on Jos Stam's "Stable Fluids" (GPU Gems Chapter 38)
- 256×256 grid
- Operations: advect → diffuse → force injection → pressure solve (Jacobi, 20-40 steps) → divergence correction
- Ship reads velocity here

LAYER B — Wave Equation Solver (Gravity Waves):
- Governs large-scale spacetime distortion
- Simple 2D wave equation: u(t+1) = 2*u(t) - u(t-1) + c²*∇²u(t) - damping*u(t)
- Runs on coarser grid (128×128) sampled less frequently
- Wave amplitude feeds into the fluid sim as a FORCE MULTIPLIER
- Where waves crest, fluid velocity increases — this creates the surfable waves

COUPLING:
- Wells inject force into BOTH systems independently
- Into fluid: persistent radial inward force (drain effect)
- Into wave equation: periodic perturbation at well location
- Wave equation output modulates fluid forces each frame
- The wave equation creates the long-range propagation
- The fluid sim creates the local navigation feel

GPU PIPELINE (5 passes):
1. Wave equation step (separate FBO, 128×128) → wave FBO
2. Fluid sim + wave force injection (256×256) → fluid FBO
3. Render fluid density/velocity as color → scene FBO
4. Feedback blend with previous frame → feedback FBO
5. ASCII post-process → screen

KEY REFERENCES:
- GPU Gems Chapter 38 (Jos Stam) — Navier-Stokes algorithm
- 2D wave equation is straightforward — implement directly in a fragment shader
- pmndrs/postprocessing ASCIIEffect — ASCII shader starting point
  - ASCIIEffect.js, ascii.frag, ASCIITexture.js
  - 1024×1024 atlas, 16×16 glyph grid

SHIP-FLUID COUPLING:
- Ship → Fluid: thrust injects small radial force at ship position
- Fluid → Ship: ship velocity = thrust + bilinear sample of fluid velocity
- Ship does NOT interact with the wave equation directly — only through the fluid

YOUR UNIQUE ADVANTAGE:
- Physically accurate wave propagation (real surfing feel)
- Waves maintain shape over long distances (wave equation doesn't diffuse like N-S)
- Wave interference patterns are naturally complex and beautiful
- Clear separation: waves for surfing, fluid for local navigation

YOUR RISK:
- Two solvers = more GPU work. Budget carefully. Profile early.
- Coupling them wrong could create feedback loops or instability
- More complex = harder to debug when something feels off
- If performance drops below 60fps with 3 wells, reduce wave grid to 64×64 first

PERFORMANCE BUDGET:
- Wave equation step: < 1ms (it's simple math on a small grid)
- Fluid sim: < 8ms (this is the expensive one)
- ASCII post-process: < 3ms
- Everything else: < 4ms
- Total: < 16ms (60fps)

FILE NAMING:
- src/fluid.js — Navier-Stokes solver (WebGL shaders)
- src/waves.js — wave equation solver (separate WebGL pass)
- src/ship.js — ship controls, thrust, fluid sampling
- src/ascii-renderer.js — ASCII post-process shader
- src/wells.js — gravity well force injection into both systems
- src/main.js — game loop, canvas setup, wiring
- index-b.html — entry point (Approach B prototype)
```

---

## Tuesday AM Comparison Criteria

When Greg reviews both approaches Tuesday morning, evaluate on:

| Criterion | Weight | How to Test |
|-----------|--------|-------------|
| **Surfing feel** | 40% | Can you catch a wave and ride it? Does it feel like momentum, not teleportation? |
| **Visual interest** | 20% | Do the fluid patterns + ASCII look beautiful? Complex? Alive? |
| **Performance** | 20% | Sustained 60fps with 3 gravity wells? |
| **Drift feel** | 10% | Does passive drifting feel physical? Can you feel the current? |
| **Code simplicity** | 10% | How maintainable is this for 6 more days of jam building? |

Possible outcomes:
1. **One wins clearly** → use that, archive the other
2. **Both good, different strengths** → merge (waves from B, fluid from A)
3. **Neither works** → hybrid approach informed by both failures
4. **Both bad** → step back, reassess physics approach entirely
