# Last Singularity Project Board

**Date:** 2026-06-25
**Status owner:** Orb
**Canonical machine state:** `docs/project/PROJECT-STATE.json`

This is the human-readable operator board.
Orb owns state transitions.
Other agents may recommend updates; Orb records them.

> Status: v0.2 current routing note. The old March jam queue is preserved below
> as history. For the current playable build answer, start with
> `docs/project/BUILD-STATUS.md`.

---

## Current checkpoint

**Checkpoint:** v0.2 — Local Build Recovery
**Goal:** Keep the Three renderer, authoritative sim, coordinates, lifecycle,
and local play path aligned before Deck or public build work resumes.

**Priority order:** local build status → fresh local-host playtest → formal
build-health refresh → Deck/public packaging.

**Status:** `playtest_needed` — recent Three/camera/coordinate/flow/lifecycle
fixes landed, but the post-fix local playable baseline still needs a fresh
app-browser or human playtest recorded in `BUILD-STATUS.md`.

**Next action:** Start a fresh local-host stack, play the current Three build,
record the result in `BUILD-STATUS.md`, then refresh build health once the local
build is worth gating.

---

## Board rules

- `PROJECT-STATE.json` is canonical for agents.
- This board is the glanceable human view.
- Orb owns task/card movement by default.
- No task is "done" just because an implementation agent says so.
- `Ready for Greg` means: enough evidence exists for Greg review.
- If a task changes state, Orb updates both the JSON state and this board and commits them.
- Orb is the journal backstop — commits devlog, changelog, night reports, and state transitions.
- `BUILD-STATUS.md` owns "what can I play right now?" `BUILD-HEALTH.json` owns
  "which commit passed the formal verifier?" `stack:status` owns only live
  process health.

---

## Current v0.2 Board

### Ready for playtest

- **Local Three + authority source build**
  - Launch with `npm run stack:stop` then `npm run stack -- --no-open`.
  - Open the printed `Client URL:`.
  - Check movement, spawn safety, visible hazards, death/extraction, and FPS.
  - Update `BUILD-STATUS.md` with evidence and caveats.

### Waiting on evidence

- **Build health refresh**
  - `BUILD-HEALTH.json` is stale versus current `main`.
  - Run the formal verifier only after the local build is playtest-stable enough
    that a full gate is meaningful.

- **Steam Deck follow-up**
  - Tailscale deploy and Gaming Mode wiring exist.
  - Deck work follows the local build; it should not hide local gameplay bugs.

---

## Historical March Jam Queue

---

## Queued (Monday Night — L0)

### n1a-single-sim-prototype ⭐ MAINLINE / PRIORITY 1
- **Title:** Approach A — single fluid sim + oscillating force injection
- **Lane:** `mainline`
- **Owner:** Orb → Orrery → Corb
- **Scope:** Large (3-5hr)
- **Depends on:** nothing
- **Delivers:** Fluid sim, ship, wells, waves, Tier 1 affordances (wave magnetism, thrust smoothing, input buffering), CONFIG object, `__TEST_API`, layered rendering (ship on Layer 1 above ASCII substrate)
- **Prompt:** See AGENT-PROMPTS.md Prompt A
- **Key refs:** CONTROLS.md, MOVEMENT.md, TUNING.md, VISUAL-SCALE.md, DESIGN-DEEP-DIVE.md

### n2-dev-panel ⭐ PRIORITY 2
- **Title:** Dev panel — minimal Monday version
- **Lane:** `support`
- **Owner:** Orb → Corb
- **Scope:** Small (1-2hr)
- **Depends on:** N1a running with CONFIG
- **Delivers:** Floating slider panel, debug toggles, copy config, reset. No presets/localStorage.
- **Key refs:** TUNING.md

### n3-ascii-postprocess ⭐ PRIORITY 3
- **Title:** ASCII dithering post-process shader + layered rendering
- **Lane:** `signature-visual`
- **Owner:** Orb → Corb
- **Scope:** Medium (2-3hr)
- **Depends on:** N1a or N1b (working FBO)
- **Delivers:** Font atlas, ASCII shader, 4-layer pipeline (substrate/entity/VFX/HUD), color mapping
- **Key refs:** VISUAL-SCALE.md, DESIGN-DEEP-DIVE.md

### Test Harness — PRE-BUILT (not a task)
- Already in repo: `tests/smoke.js`, `tests/physics.js`, `tests/run-all.js`
- Corb runs `npm install && node tests/run-all.js index-a.html` after building
- Grows with the game — new test files added as features land

### n1b-dual-solver-probe — PRIORITY 4 (probe, not mainline)
- **Title:** Approach B — dual solver probe
- **Lane:** `probe-a`
- **Owner:** Orb → Orrery → Corb
- **Scope:** Large (3-5hr)
- **Depends on:** nothing (parallel track)
- **Delivers:** Same interface as N1a but with wave equation + Navier-Stokes coupling
- **Decision rule:** If not clearly better by Tuesday 10am, backlog immediately.
- **Prompt:** See AGENT-PROMPTS.md Prompt B

---

## Queued (Tuesday — L1)

### n4-wrecks-loot
- **Title:** Wrecks + loot pickup
- **Lane:** `mainline`
- **Scope:** Medium (2-3hr)
- **Depends on:** N1a winner → index.html

### n5-portals-extraction
- **Title:** Portals + extraction
- **Lane:** `mainline`
- **Scope:** Medium (2-3hr)
- **Depends on:** N1a winner

### n6-well-growth-universe-clock
- **Title:** Black hole growth + universe clock
- **Lane:** `mainline`
- **Scope:** Medium (1-2hr)
- **Depends on:** N1a winner. Can parallel with N4/N5.

---

## Queued (Wednesday — L2)

### n7-signal-system
- **Lane:** `mainline` | **Scope:** Medium | **Depends on:** N4, N1a winner

### n8-inhibitor
- **Lane:** `mainline` | **Scope:** Large | **Depends on:** N7

---

## Queued (Thursday — L3/L4)

### n9-hud
- **Lane:** `mainline` | **Scope:** Medium | **Depends on:** N7, N5, N4

### n10-visual-juice
- **Lane:** `mainline` | **Scope:** Medium | **Depends on:** N3, N4, N5

### n11-audio
- **Lane:** `independent-audio` | **Scope:** Medium | **Depends on:** nothing (reads game state)

---

## Queued (Friday — L5)

### n12-progression
- **Lane:** `mainline` | **Scope:** Medium | **Depends on:** N4, N5

### n13-procgen-universe
- **Lane:** `mainline` | **Scope:** Small | **Depends on:** nothing

### n14-balance-pass
- **Lane:** `mainline` | **Scope:** Medium | **Depends on:** all gameplay systems

### player-primer
- **Lane:** `independent` | **Scope:** Small | **Depends on:** core game systems

---

## Queued (Saturday-Sunday — L6)

### n15-title-flow-screens
### n16-perf-optimization
### n17-edge-cases
### n18-final-fixes
### n19-stretch-goals

---

## Ready for Build

_None yet._

---

## Building

_None yet._

---

## Testing

_None yet._

---

## Reviewing

_None yet._

---

## Ready for Greg

_None yet._

---

## Done

### orchestration-bootstrap
- Orchestration loop defined, project state bootstrapped, actor wiring verified, context dumps staged, journal/commit responsibilities enumerated. Approved by Claude review.

### design-docs-complete
- All pre-jam design docs written: DESIGN, DEEP-DIVE, MOVEMENT, CONTROLS, TUNING, AGENT-TESTING, VISUAL-SCALE, SIGNAL-DESIGN, COMBAT, MUSIC, SCALING, PILLARS. Two Forge reviews delivered and incorporated. Decision log with 13 entries. Backlog with prioritized affordance queue.

### context-dumps-staged
- Orrery, Forge, Corb, and Orb context dumps with role-specific lenses and commit responsibilities.
