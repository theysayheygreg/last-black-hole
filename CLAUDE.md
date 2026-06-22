# Last Black Hole — Agent Instructions

## Project

Last Singularity is a controller-first ASCII extraction roguelike built around
fluid-surfing movement, server-authoritative runs, and a Three.js presentation
substrate that must preserve the terminal-fluid identity.

The repo path still says `last-black-hole`; treat that as implementation
history. The current product name and player-facing docs use Last Singularity.

Current platform reality:
- Electron desktop is the primary packaged runtime.
- Steam Deck is the main handheld playtest/deploy target.
- Browser/WebGL remains useful for sandbox debugging and web demos.
- iPad/WKWebView and Switch 1 are bench/probe targets, not alternate gameplay
  forks.

## Read These First

Before starting ANY task, load these into context:
1. `docs/v0.2/README.md` — read order and source-of-truth rules for the current line
2. `docs/v0.2/DESIGN-CODE-DELTA.md` — older ideas versus shipped code truth
3. `docs/v0.2/DESIGN.md` — current v0.2 game bible
4. `docs/v0.2/ROADMAP.md` — current phase plan
5. `docs/design/PILLARS.md` — decision lenses, with v0.2 status notes
6. `docs/design/MOVEMENT.md` — control affordances and tuning variables
7. `docs/journal/DECISION-LOG.md` — what's decided, what's open, what was rejected

For your specific layer, also read:
- L0: `docs/design/DESIGN-DEEP-DIVE.md` (physics architecture), `docs/design/CONTROLS.md` (ship physics, input schemes, tuning variables), `docs/design/TUNING.md` (dev panel, CONFIG object, tuning workflow), `docs/design/AGENT-TESTING.md` (test harness, `__TEST_API`), `docs/project/PRE-MONDAY-RESEARCH.md`
- L1-L2: `docs/design/SIGNAL-DESIGN.md`, `docs/design/COMBAT.md`, `docs/design/SCAVENGERS.md` (AI ships), `docs/design/SLINGSHOT.md` (gravity slingshot)
- L3-L4: `docs/design/DESIGN-DEEP-DIVE.md` (ASCII renderer section), `docs/design/AUDIO.md`, `docs/project/RENDERER-RECOVERY-PLAN.md`, HUD section
- L5: `docs/design/SCALING.md`, `docs/design/SIGNATURES.md` (cosmic signatures)

Older jam-era docs in `docs/design/` and `docs/project/` are still valuable idea
mines, but when they conflict with `docs/v0.2/`, prefer the v0.2 docs unless a
newer decision-log entry says otherwise.

## Design Pillars (decision lenses, in priority order)

1. **Art Is Product** — the ASCII shader is core identity, not polish
2. **Movement Is the Game** — if surfing isn't fun, nothing else matters
3. **Signal Is Consequence** — signal taxes ambition, never buys capability
4. **Universe Is the Clock** — entropy is the timer, not a countdown
5. **Dread Over Difficulty** — tension from atmosphere, not punishment
6. **Run It Twice** — when unsure, prototype both and compare

See `docs/design/PILLARS.md` for full descriptions and tests.

## Important Constraints

- **Art Is Product is non-negotiable** — Three.js deepens the ASCII-fluid identity; it does not replace it with generic 3D space
- **Forge is the architectural brake** — flag concerns in night reports, don't just ship
- **Signal does NOT buy capability** — see SIGNAL-DESIGN.md
- **Layer boundaries need Greg's sign-off** — especially when changing movement, sim authority, progression, or platform contracts
- **Target 60fps** — performance is a hard constraint, not a nice-to-have
- **Sim authority stays explicit** — local/remote clients consume authoritative state; do not move simulation truth into renderer objects
- **Platform probes stay thin** — iPad/Switch work should consume the existing web/runtime contracts before proposing native gameplay rewrites

## Git Rules

This is a game jam. Work moves fast. Commits should be frequent and atomic.

### Commit Cadence

- **Commit after every meaningful change.** Not at the end of a session — after each discrete piece of work lands.
- A "meaningful change" is anything you'd be sad to lose: a new shader, a tuned constant, a fixed bug, a design decision, a new system wired up.
- If you've been working for more than 15 minutes without a commit, you've probably gone too long.
- When in doubt, commit. Small commits are always better than big ones during a jam.

### What Gets Its Own Commit

- Each new system or module (fluid sim, ASCII shader, ship controls, etc.)
- Each bug fix
- Each tuning pass (even if it's just changing constants)
- Each design doc update or decision
- Each visual/audio addition
- Wiring two systems together

### What Does NOT Get Batched

- Don't combine "added entity system + fixed fluid sim + tuned controls" into one commit
- Don't hold work waiting for a "good stopping point" — the commit IS the stopping point
- Don't skip commits on "small" changes — a one-line constant tweak that makes surfing feel good is the most important commit of the day

### Commit Message Style

```
Layer: short description

Optional: why this matters or what it changes about gameplay feel.
```

Prefix with the build plan layer when applicable:

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

Examples:
```
L0: fluid sim running on GPU, single gravity well
L0: ship reads fluid velocity, drift feels good
Tune: increased wave amplitude 2x, surfing more pronounced
L1: wrecks spawn, fly-over loot pickup working
Fix: ship escaping gravity well at high thrust
Docs: resolved portal charge-time question (instant for v1)
```

### Branch Strategy

- `main` is the deployable game at all times (after Layer 0)
- Feature branches only if two agents are working simultaneously on different systems
- Merge to main as soon as a feature works — don't let branches drift
- No PRs during the jam — direct commits to main unless parallel work requires coordination

### Recovery

- If something breaks, `git stash` or commit the broken state with `WIP:` prefix before fixing
- Never `git reset --hard` — we might want to recover a direction that didn't work
- If you need to revert, use `git revert` (creates a new commit) not `git reset`

## Coordinate Conventions

Three coordinate spaces exist in the game. All conversions between them go through `src/coords.js`. No inline `1.0 - y` flips anywhere in the codebase.

| Space | Origin | Y direction | Range | Used by |
|-------|--------|-------------|-------|---------|
| **Screen** | top-left | Y-down | pixels (0,0) to (W,H) | canvas overlay, ship position, mouse input, wave ring rendering |
| **Well** | top-left | Y-down | normalized (0,0) to (1,1) | well definitions, gravity calculations, test API |
| **Fluid UV** | bottom-left | Y-up | normalized (0,0) to (1,1) | WebGL shaders, fluid sim textures, readPixels, display shader |

Key conversion functions in `coords.js`:
- `wellToFluidUV(wx, wy)` — flip Y for shader use
- `fluidUVToWell(fu, fv)` — flip Y back from shader
- `screenToFluidUV(sx, sy, W, H)` — normalize + flip Y
- `fluidUVToScreen(fu, fv, W, H)` — denormalize + flip Y
- `wellToScreen(wx, wy, W, H)` — same convention, just scale
- `fluidVelToScreen(fvx, fvy)` — negate Y velocity component

**Rule:** If you need to convert between these spaces, import from `coords.js`. If you find yourself writing `1.0 - y` inline, you are doing it wrong.

## Code Style

- Vanilla JS, ES modules, no framework, no TypeScript (jam speed)
- One system per file: `fluid.js`, `ship.js`, `ascii-renderer.js`, `wells.js`, etc.
- WebGL shaders as template literals or separate `.glsl` files — pick one and be consistent within the project
- File structure: `src/` for code, `src/shaders/` for GLSL if separate, `assets/` for static files
- No build step unless we absolutely need it (Vite if forced)
- Comments for "why" not "what" — and especially for magic numbers in physics/rendering
- Keep files under ~500 lines. Split when they grow.

## Documentation Workflow

After completing a task, before reporting done:
1. Update `docs/journal/CHANGELOG.md` with what changed
2. If you made a design decision, append to `docs/journal/DECISION-LOG.md`
3. If your work invalidates anything in the design docs, update or flag it
4. Note tuning changes in commit messages (what it felt like before/after)

See `docs/project/JAM-CONTRACT.md` for full "When Done" checklist, journal triggers, and ownership table.

## Testing

- **Automated:** `node tests/run-all.cjs` — manifest-driven Node/CDP smoke, physics, renderer, and gameplay tests. Run after every commit. See `docs/design/TEST-HARNESS.md`.
- **Manual:** playtesting for feel, art direction, balance. No unit test framework.
- `console.log` is fine. Remove before ship day (Sunday).
- Performance matters: 60fps on a mid-range laptop. Profile if you're unsure.
- Expose `window.__TEST_API` for automated test access to game state (see AGENT-TESTING.md).
- Self-verify: run tests + open the game in browser, confirm your change works, then commit.

## Playtest Notes

When you make a tuning change, note in the commit message what it felt like before and after. These are invaluable for the balance pass on Sunday.
