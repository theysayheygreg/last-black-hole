# Last Black Hole — Agent Instructions

## Project

Roguelike extraction game. Browser/WebGL. Game jam: March 16-22, 2026.
Design docs live in `docs/`. Code starts Monday 12:01a.

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

## Code Style

- Vanilla JS, no framework, no TypeScript (jam speed)
- Single HTML file if possible, split only when a file exceeds ~500 lines
- WebGL shaders as template literals or separate `.glsl` files — dealer's choice based on what's cleaner
- No build step unless we absolutely need it (Vite if forced)
- Comments for "why" not "what" — and especially for magic numbers in physics/rendering

## Playtest Notes

When you make a tuning change, note in the commit message what it felt like before and after. These are invaluable for the balance pass on Sunday.
