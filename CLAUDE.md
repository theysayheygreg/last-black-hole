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

Start with the active version's `README.md`, the decision source it names, the
direct task spec, and the one design or architecture document that owns the
changed contract. Read `docs/project/BUILD-STATUS.md` for runtime or
playability work. Load broad roadmaps and historical design docs only for
planning, release, or conflict resolution.

For the current v0.3 line, read `docs/v0.3/README.md` and then
`docs/v0.3/DESIGN-INDEX.md`; for the public v0.2 line, use `docs/v0.2/`.
Older jam-era and v0.2 design bodies are preserved under the versioned history
indexes and the stable `docs/design/` paths now contain pointers only.

## Design Pillars (decision lenses, in priority order)

1. **Art Is Product** — the ASCII shader is core identity, not polish
2. **Movement Is the Game** — if surfing isn't fun, nothing else matters
3. **Signal Is Consequence** — signal taxes ambition, never buys capability
4. **Universe Is the Clock** — entropy is the timer, not a countdown
5. **Dread Over Difficulty** — tension from atmosphere, not punishment
6. **Run It Twice** — when unsure, prototype both and compare

See `docs/v0.3/DESIGN-INDEX.md#pillars-and-product-identity` for current
v0.3 design ownership and the historical archive routes.

## Important Constraints

- **Art Is Product is non-negotiable** — Three.js deepens the ASCII-fluid identity; it does not replace it with generic 3D space
- **Forge is the architectural brake** — route concerns through review docs or checkpoint receipts; do not create mandatory night-report ceremony
- **Signal does NOT buy capability** — see
  `docs/v0.3/DESIGN-INDEX.md#signal`
- **Layer boundaries need Greg's sign-off** — especially when changing movement, sim authority, progression, or platform contracts
- **Target 60fps** — performance is a hard constraint, not a nice-to-have
- **Sim authority stays explicit** — local/remote clients consume authoritative state; do not move simulation truth into renderer objects
- **Platform probes stay thin** — iPad/Switch work should consume the existing web/runtime contracts before proposing native gameplay rewrites

## Git Rules

This is a pre-release game. Work moves fast, and commits are durable handoffs.
Cross-task work follows
`docs/project/LBH-ORCHESTRATION-CONTRACT.md`; its primary orchestrator owns
cross-branch routing, CI scheduling, and review intake.

### Commit Cadence

- Commit each meaningful feature, fix, decision, or handoff artifact.
- Commit before another actor depends on the work; the repo history is the
  orchestration spine.
- Fix forward and preserve useful history. Do not optimize for a clock or split
  one coherent change into bookkeeping commits.
- A commit queues broader validation. It does not wait for the full harness.

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

- `main` is the current public/demo line.
- v0.3 and v0.4 use their dedicated version branches and isolated worktrees.
- The primary orchestrator in `docs/project/LBH-ORCHESTRATION-CONTRACT.md`
  owns cross-version routing, merges, and cherry-picks.
- Do not merge a next-version line backward into `main` without Greg's explicit
  promotion call.

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
1. Update a durable decision, changelog, or build-status source only when its
   truth actually changed; do not duplicate routine commits or CI receipts.
2. If you made a durable design decision, append to the active decision source.
3. If your work invalidates anything in the design docs, update or flag it.
4. Note tuning changes in commit messages (what it felt like before/after).

See `docs/project/JAM-CONTRACT.md` for full "When Done" checklist, journal triggers, and ownership table.

## Testing

- During feature work, run the smallest focused check that proves the changed
  behavior. A direct regression, failure to boot, or corrupted project state
  blocks the handoff.
- Broader contract, playable, visual, package, and platform lanes run as CI at
  the checkpoint justified by the change. Unrelated, flaky, and release-only
  failures do not trap the feature thread.
- Manual playtesting remains the feel, art-direction, and balance gate. See
  `docs/design/TEST-HARNESS.md` for lane selection and release gates.

## Playtest Notes

When you make a tuning change, note in the commit message what it felt like before and after. These are invaluable for the balance pass on Sunday.
