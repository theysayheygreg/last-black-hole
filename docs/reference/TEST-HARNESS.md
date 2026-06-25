# LBH Test Harness

This is the shareable overview of how LBH test automation works today.

The harness is not one big test. It is a layered system that checks four different things:

- the client can boot and render
- the distributed stack can boot
- the authoritative sim/control-plane path behaves correctly
- the renderer still looks right on deterministic fixtures

The harness now sits beside an explicit runtime-mode model:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/docs/reference/RUNTIME-MODES.md`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/docs/design/TEST-HARNESS.md`

That keeps `test-harness` mode separate from the normal human launch paths.
The design harness doc is the live operator guide; this file is the shareable
overview.

## Simple Graph

```mermaid
flowchart LR
    A["npm test"] --> B["tests/run-all.cjs"]
    B --> C["Client suites"]
    B --> D["Architecture suites"]
    B --> E["Scale + authority suites"]

    C --> C1["smoke.cjs"]
    C --> C2["controller.cjs"]
    C --> C3["keyboard-mouse.cjs"]
    C --> C4["physics.cjs / flow.cjs / systems.cjs"]

    D --> D1["infra-smoke.cjs"]
    D --> D2["telemetry-smoke.cjs"]
    D --> D3["sim-lifecycle.cjs"]
    D --> D4["control-plane.cjs"]
    D --> D5["remote-authority.cjs"]

    E --> E1["player-brain.cjs"]
    E --> E2["overload-state.cjs"]
    E --> E3["coarse-field.cjs"]
    E --> E4["sim-scale.cjs"]

    F["npm run test:renderer"] --> G["renderer.cjs"]
    G --> H["Deterministic visual fixtures"]

    I["tests/helpers.cjs"] --> J["Harness static server :8719"]
    I --> K["Transient control plane"]
    I --> L["Transient sim server"]
    I --> M["CDP browser driver"]
```

## The Layers

### 1. Client canary

These tests answer: can the game page boot and run at all?

- `tests/smoke.cjs`
- `tests/controller.cjs`
- `tests/keyboard-mouse.cjs`
- `tests/physics.cjs`
- `tests/coordinates.cjs`
- `tests/flow.cjs`
- `tests/inventory.cjs`
- `tests/systems.cjs`

This layer is good for catching:

- boot failures
- JavaScript errors
- broken input wiring
- obvious gameplay regressions in the local path

This layer is **not** enough to prove the distributed architecture.

### 2. Distributed stack canary

These tests answer: can the real client/control-plane/sim stack start and behave like a stack?

- `tests/infra-smoke.cjs`
- `tests/telemetry-smoke.cjs`
- `tests/sim-lifecycle.cjs`
- `tests/control-plane.cjs`

This layer is good for catching:

- broken process startup
- bad port/pid behavior
- stale detached server leaks
- control-plane or sim boot regressions
- structured-telemetry regressions in the real stack logs
- lifecycle regressions like empty sims failing to idle or stop

### 3. Authoritative gameplay truth

These tests answer: does the remote-authority version of LBH behave honestly?

- `tests/remote-authority.cjs`
- `tests/player-brain.cjs`
- `tests/overload-state.cjs`
- `tests/coarse-field.cjs`
- `tests/sim-scale.cjs`

This layer is good for catching:

- client/server authority drift
- broken profile hydration
- session join/host/leave regressions
- large-map budget regressions
- overload-state and scale-model mistakes

This is the most important layer for architecture work.

### 4. Deterministic renderer harness

This is a separate command:

- `npm run test:renderer`

It runs:

- `tests/renderer.cjs`

This layer is for visual judgment, not gameplay truth. It captures fixed fixtures over time so renderer work can be compared honestly.

Use it for:

- black-hole readability
- ring/core behavior
- interference between wells
- `5x5` and `10x10` visual scaling

Do not treat normal smoke screenshots as renderer truth.

## Process Model the Harness Assumes

The main runtime ports are:

- dev server: `8080`
- harness static server: `8719`
- control plane: `8791`
- sim server: `8787`

The harness does **not** depend on the human dev server. It spins up its own temporary processes when needed.

The backbone is:

- `tests/helpers.cjs`

That file is responsible for:

- starting the temporary static server
- starting transient control-plane and sim processes
- launching system Chrome through the CDP browser driver
- cleaning up detached children
- isolating ports and pid files so test runs do not stomp on each other

Freshness is part of the contract. Browser tests should use `withFreshGame()`
and authority tests should use `withFreshSimServer()` unless the suite is
explicitly proving long-lived session behavior. The helpers close Chrome, remove
temporary profiles, force-stop stale sim listeners on the test port, and clear
per-port registry state before the case runs.

The sim `/health` response exposes `process.pid`, `process.uptimeSec`, and
`process.memory`. Long-run probes should record those fields before and after a
session instead of guessing whether a movement bug came from old process state.

## What to Run

For normal verification:

- `npm test`

For targeted runtime-telemetry verification:

- `npm run test:telemetry`

For visual/renderer verification:

- `npm run test:renderer`

For movement, camera, or authority-sensitive verification:

- `npm test`
- `npm run test:playtest`
- `npm run test:authority`
- `npm run test:visual` when projection, radius, or renderer scene changes

For build-health verification:

- `node scripts/build-health.cjs verify`

That writes the tracked result to:

- `docs/project/BUILD-HEALTH.json`

## What Chrome DevTools MCP Is For

Chrome DevTools MCP is useful, but it does not replace this harness.

Use the split this way:

- CDP harness = deterministic pass/fail truth
- Codex/Chrome browser tools = live inspection, console, screenshots, perf traces

That keeps CI and weekly release validation honest while still giving agents good browser eyes.

## Practical Rule

Use the right test for the right question.

- “Does the client boot?” → `tests/smoke.cjs`
- “Does the distributed stack come up?” → `tests/infra-smoke.cjs`
- “Are runtime telemetry events still emitted the way the operator tooling expects?” → `tests/telemetry-smoke.cjs`
- “Does remote authority still work?” → `tests/remote-authority.cjs`
- “Does the renderer still look right?” → `npm run test:renderer`
- “Did coordinate/camera/sim assumptions drift?” → inspect `src/coords.js`,
  then run core + playtest + authority + visual lanes
- “Is this commit actually verified?” → `node scripts/build-health.cjs status`

That is the current shape of LBH test automation.
