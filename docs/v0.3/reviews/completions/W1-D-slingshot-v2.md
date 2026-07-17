# W1-D Slingshot v2 Completion

Date: 2026-07-14
Branch: `codex/v0.3-w1d-slingshot-v2`
Base: `765baa224b3456b7f1a082b192affa8e65c19249`
Lineage anchor: `f9e4fc5291b947842243f91a2ae62def84b1bcd5`

## Outcome

W1-D is implemented as a server-authoritative grappling-hook slingshot. The
sim owns capture, coyote grace, lock, arc ownership, chain eligibility,
payoff, release, and release-ghost lifetime. The client consumes the
authoritative snapshot and presents the telegraph; it does not decide the
movement result.

The contract has exactly five player-facing knobs:

| Knob | Value | Range | Step | Unit | Start bias |
| --- | ---: | ---: | ---: | --- | --- |
| `captureRadius` | 450 | 100-1000 | 25 | m | medium |
| `magnetism` | 30 | 0-90 | 5 | deg | large |
| `coyoteTime` | 50 | 0-500 | 50 | ms | small |
| `payoffCurve` | 1.4 | 1.0-3.0 | 0.1 | x per quarter-turn | medium |
| `chainWindow` | 0.5 | 0-3.0 | 0.5 | s | disabled-or-small |

The contract supports `chainWindow=0` as disabled, while the W1-D starting
value is 0.5 seconds. Existing hull identity multipliers and the anchor-family
range factors that preserve W1-E's 450/300/180 m ruler rings remain internal
implementation details; none is registered as a sixth tuning knob.

## Authority And Math

The authority seam is `tickPlayerSlingshot()` in
`scripts/sim-runtime.cjs`. It runs inside the server movement step, writes the
player slingshot state, and emits `player.slingshot.telegraph` in the
authoritative snapshot. `src/presentation/presentation-frame.js` sanitizes that
data, `src/main.js` carries it into the scene state, and
`src/render-three/entities/player-visual-family.js` renders it.

The release cap is relative to the measured entry speed:

```text
cap = entrySpeed * payoffCurve ^ (arcRadians / (pi / 2) + chainCount * 0.5)
```

Release direction is the canonical stick-relative movement vector when the
stick is active, otherwise the current velocity vector. The bounded release
delta solves the available positive velocity delta against the cap and applies
only that delta. It never writes a maximum speed or teleports the player, and
it has no facing-versus-velocity branch.

The deterministic state path is `aim -> lock -> arc -> release-ghost`.
Capture updates `lastAimSeenTime`; coyote is a real 50 ms boundary checked by
the shared pure helper. Chain count is resolved from the prior authoritative
release anchor and the five-knob chain window. The ratified v0.3.1 internal
presentation durations are a 0.25 s lock telegraph and a 1.0 s release ghost;
they are not tunables.

The authoritative telegraph carries `aimCue`, `lock`, `ownedArc`, and
`releaseGhost` payloads as their phases become active. The renderer uses the
W1-E ruler and force-ledger handlers for the readable overlay instead of
recreating conversion or debug math.

## Focused Receipt

The route fixture uses only the five knobs above:

```text
thrust-only:  1.788854 s
slingshot:    1.285714 s
time margin:  28.13% (required: 25%)
```

Pure and authoritative proof:

- `node tests/slingshot-contract.cjs`: `SlingshotContract: 10/10 passed`
- `node tests/slingshot-v2.cjs`: `2 passed, 0 failed` including the 25% route,
  aim/lock/arc/release-ghost, stick-relative exit direction, bounded cap, and
  deterministic chain count
- `node tests/slingshot-edge-queue.cjs`: `1 passed, 0 failed`
- `node tests/ruler-contract.cjs`: `4/4`
- `node tests/force-ledger.cjs`: `3/3`
- `node tests/presentation-frame.cjs`: `4 passed, 0 failed`
- `node tests/ruler-overlay.cjs`: `8/8`
- `node --check scripts/sim-runtime.cjs`: passed
- `git diff --check`: passed

One headed live sequence was run after adding a temporary untracked
`node_modules` symlink to the primary dependency tree. The symlink was removed
before commit. The sequence produced all four phases, 11 overlay handlers,
force tick 8, `scaleBarPx=42.66666666666667`, `captureRadiusPx=192`, reduced
motion enabled, and zero browser errors.

Capture directory:
`tests/screenshots/slingshot-v2-live-20260714/`

| Frame | SHA-256 |
| --- | --- |
| `01-aim-cue.png` | `1e2c2af6e06d37cc0a12d56363504d66483a739ce231eb47655d46219bc0e127` |
| `02-lock.png` | `38b05b489470e5a748e513bf9722ecf32f976d554197b790864d881666ba4884` |
| `03-owned-arc-ruler-force.png` | `ab587a91a51e661827d00833e2427ed65b34d6db39248acb2675206ba72c627b` |
| `04-release-ghost.png` | `651ece03cab8f5dfc6674d13d49d17eabb46cc027042cac4a3dc1a4f03090711` |

The owned-arc frame was visually inspected: the active arc, capture rings,
100 m scale bar, all five slingshot ruler rows, and the six labeled force
vectors are readable in one frame.

## Files And Anchors

Implementation and focused evidence are in:

- `scripts/sim/slingshot-contract.cjs`
- `scripts/sim-runtime.cjs`
- `src/ruler-contract.js`
- `src/ruler-overlay.js`
- `src/presentation/presentation-frame.js`
- `src/hud.js`
- `src/main.js`
- `src/render-three/entities/player-visual-family.js`
- `tests/slingshot-contract.cjs`
- `tests/slingshot-input-path.cjs`
- `tests/hud-deck.cjs`
- `tests/slingshot-v2.cjs`
- `tests/slingshot-v2-live.cjs`

This completion record is the W1-D anchor update. No merge, rebase,
cherry-pick, package, candidate-gate, cross-version, or root-governance work
was performed.

## Deviations And Open Decisions

The v0.3.1 RC ratification keeps the five gameplay values above and closes the
packaged input-path presentation gap: F/Y rising edges travel through
InputManager, main, SimClient, and authority, while the authoritative aim ring
gets a device-correct prompt. A press without an eligible anchor reports the
range gate instead of appearing inert. The internal lock/ghost durations are
0.25 s and 1.0 s. These choices do not add a gameplay knob or reopen movement
thrust/gravity tuning.

W1-B fabric work and W1-C seeded-sea work remain separate and untouched. This
branch does not change their status or claim their implementation.
