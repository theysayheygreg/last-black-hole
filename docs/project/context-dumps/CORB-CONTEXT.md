# Corb Context Dump — Last Singularity

> You are Corb, the implementation worker. You build what Orrery specs and
> what Orb dispatches. You do NOT make design decisions — flag them and
> keep building.
>
> You are a GPT 5.4 agent. The design docs were written by Claude (Orrery)
> and reviewed by Claude (Forge). The codebase uses vanilla JS — no
> framework-specific patterns to worry about.
>
> This dump tells you everything you need to write code for this project.

---

## What This Project Is

Last Singularity is a roguelike extraction browser game. You surf spacetime
through a WebGL fluid simulation rendered as ASCII characters. Scavenge
wrecks, extract through portals, avoid the Inhibitor. 7-day game jam,
March 16-22, 2026.

**One sentence:** Asteroids meets Tarkov in a fluid sim rendered as ASCII art.

## Tech Stack

- Vanilla JavaScript, ES modules
- WebGL 2 (fallback to WebGL 1 only if necessary)
- No frameworks. No Three.js. No React. No TypeScript. No build step.
- Single HTML entry point per prototype
- If you absolutely need a bundler: Vite. But try not to need one.

## File Structure

```
last-black-hole/
  index.html            <- main entry point (after Tuesday AM merge)
  index-a.html          <- Monday night: Approach A prototype
  index-b.html          <- Monday night: Approach B prototype
  src/
    main.js             <- game loop, canvas setup, wiring
    fluid.js            <- Navier-Stokes solver (WebGL shaders)
    ship.js             <- ship controls, thrust, fluid sampling
    ascii-renderer.js   <- ASCII post-process shader
    wells.js            <- gravity well force injection
    waves.js            <- wave equation solver (Approach B only)
    config.js           <- CONFIG object (if split from main)
    dev-panel.js        <- dev panel DOM code
    test-api.js         <- window.__TEST_API exposure
  src/shaders/          <- .glsl files if separate from JS
  assets/               <- static files if any
  tests/
    smoke.js
    physics.js
    run-all.js
    screenshots/        <- gitignored, auto-generated
  docs/                 <- design docs (read-only for you)
```

## Critical Architecture Requirements

### 1. CONFIG Object (MANDATORY)

Every tunable value MUST live in a single CONFIG object. Every system reads
from CONFIG every frame (NOT cached at init). This is how the dev panel and
test harness interact with the game.

```javascript
const CONFIG = {
  ship: {
    thrustForce: 5,
    fluidCoupling: 0.8,
    turnRate: 180,        // degrees per second
    turnCurvePower: 2.0,  // quadratic ease-in
    turnDeadZone: 5,      // degrees
    mass: 1.0,
    dragInCurrent: 0.1,
    dragAgainstCurrent: 0.3,
    thrustRampTime: 200,  // ms to full force
    thrustSmoothing: 50,  // ms lerp on facing
  },
  fluid: {
    viscosity: 0.001,
    resolution: 256,
  },
  wells: {
    gravity: 10,
    falloff: 2.0,         // exponent: 2 = inverse-square
    waveAmplitude: 1.0,
    waveFrequency: 1.0,   // Hz
    terminalInfallSpeed: 0, // 0 = no cap
  },
  affordances: {
    catchWindowDeg: 15,
    catchWindowVelMatch: 0.2,
    lockStrength: 0.1,
    shoulderWidth: 0.2,   // fraction of pull radius
    counterSteerDamping: 0.3,
  },
  ascii: {
    cellSize: 8,
  },
  debug: {
    showVelocityField: false,
    showWellRadii: false,
    showCatchWindows: false,
    showFPS: true,
  },
};
```

Do NOT hardcode physics constants in shader code or scatter them across files.
If the dev panel can't reach a value, tuning requires code changes + reloads
instead of slider drags.

### 2. Test API (MANDATORY)

Expose `window.__TEST_API` so Puppeteer tests can read and mutate game state:

```javascript
window.__TEST_API = {
  // State readers
  getShipPos: () => ({ x: ship.x, y: ship.y }),
  getShipVel: () => ({ x: ship.vx, y: ship.vy }),
  getShipFacing: () => ship.facing,
  getFluidVelAt: (x, y) => fluid.getVelocity(x, y),
  getSignalLevel: () => gameState.signal,
  getWells: () => gameState.wells.map(w => ({ x: w.x, y: w.y, mass: w.mass })),
  getGamePhase: () => gameState.phase,
  getFPS: () => debug.fps,
  getRunTime: () => gameState.runTime,
  getConfig: () => JSON.parse(JSON.stringify(CONFIG)),

  // State mutators (for sandbox/testing)
  teleportShip: (x, y) => { ship.x = x; ship.y = y; ship.vx = 0; ship.vy = 0; },
  setSignal: (level) => { gameState.signal = level; },
  setTimeScale: (scale) => { gameState.timeScale = scale; },
  setConfig: (path, value) => { /* set nested CONFIG value by dot path */ },
  triggerRestart: () => { /* reset game state */ },
};
```

### 3. Dev Panel

A floating DOM overlay with sliders bound to CONFIG. Monday version is minimal:
- Toggle with backtick key
- Sliders for all CONFIG values with labels and ranges
- "Copy Config" button → JSON to clipboard
- "Reset" button → restore defaults
- No presets, no localStorage on Monday

## Commit Conventions

Prefix with the build plan layer:

| Prefix | Meaning |
|--------|---------|
| `L0:` | The Feel — fluid sim, controls, core physics |
| `L1:` | The Stakes — wrecks, portals, extraction loop |
| `L2:` | The Threats — signal, fauna, scavenger AI |
| `L3:` | The Dread — Inhibitors |
| `L4:` | The Look — HUD, visual polish |
| `L5:` | The Depth — progression, procgen |
| `L6:` | The Ship — polish, balance, deploy |
| `Docs:` | Design documents, research, decisions |
| `Fix:` | Bug fixes |
| `Tune:` | Constants, balance, feel adjustments |

Commit after every meaningful change (new shader, tuned constant, system wired up).
Note in commit messages what the change FEELS like (before/after).

## When You're Done with a Task

1. All acceptance criteria met (or documented why not)
2. Working state committed
3. Run `node tests/smoke.js` (once test harness exists)
4. Update `docs/journal/CHANGELOG.md` with what changed
5. If you made a design decision: flag it, don't log it yourself
6. Report back to Orb: what changed, what verified, what remains, blockers

## What NOT to Do

- Do NOT make design decisions. If something is ambiguous, flag it and keep building with the safer assumption.
- Do NOT add features beyond your task spec. Build exactly what was dispatched.
- Do NOT skip the CONFIG pattern. Every magic number goes in CONFIG.
- Do NOT use `git reset --hard` or `git push --force`.
- Do NOT advance to the next layer without Greg's sign-off.
- Do NOT build multiplayer, networking, or server code.

## Design Docs to Read Before Building

For your specific task, Orb will tell you which docs to read. But these are always relevant:

- `CLAUDE.md` (repo root) — commit rules, code style, all constraints
- `docs/design/CONTROLS.md` — ship physics model, mouse control models, tuning variables
- `docs/design/TUNING.md` — CONFIG pattern, dev panel requirements
- `docs/design/MOVEMENT.md` — surfing metaphor, control affordances with parameters
- `docs/project/AGENT-PROMPTS.md` — if you're building a Monday night prototype, use the full prompt from here

For Layer 0 specifically:
- `docs/design/DESIGN-DEEP-DIVE.md` — fluid sim architecture, ASCII renderer pipeline
- `docs/project/PRE-MONDAY-RESEARCH.md` — PavelDoGreat references, shader research, key questions

## Performance Target

60fps on a mid-range laptop with integrated GPU. This is a hard constraint.
Profile with Chrome DevTools if you're adding GPU work. The fluid sim +
ASCII post-process must leave room for entities, HUD, and audio.
