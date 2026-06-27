# Test Harness

> Status: v0.2 current truth. The Three renderer and authoritative sim are the
> primary validation targets. The original headless-only plan in
> `AGENT-TESTING.md` is historical context.

## Position

The harness is split by the question being asked. Fast data invariants, browser
boot checks, authority-process checks, renderer visual fixtures, and real
playtest flows should not all live in one default command. When they do, a
stale browser or a slow menu transition makes unrelated renderer work look
broken.

For "where does the local build stand?", start with
`docs/project/BUILD-STATUS.md`, then check `node scripts/build-health.cjs
status`. The harness provides evidence; the build-status doc records the
playability assessment and caveats.

Use the CLI harness for deterministic facts. Use the Codex app browser for
visual/playtest judgment. Use Computer Use only when the target is a real Mac
app surface or OS UI that the browser cannot expose.

The daily harness is not the periodic Forge pass. The harness should answer
"did a known contract regress?" quickly and repeatably. `$lbh-forge-pass`
should answer "are these still the right contracts?" after large architecture,
renderer, sim, platform, or process shifts.

Browser suites run through `tests/browser-driver.cjs`, a small Chrome DevTools
Protocol wrapper around system Chrome. In Codex desktop sessions headless Chrome
may not advance ambient `requestAnimationFrame`, so frame-sensitive tests call
`window.__TEST_API.stepFrameForTest()` through the shared `stepGameFrames()`
helper. Tests that need rendered evidence should step frames explicitly before
reading FPS, perf stats, or pixels.

## Freshness Contract

Browser and sim state are disposable in tests. A browser test should use
`withFreshGame()` when it needs Chrome, and authority tests should use
`withFreshSimServer()` when they do not explicitly need one continuous sim
session. Those helpers close Chrome, remove the temporary profile, force-stop
stale LBH sim listeners on the test port, clear per-port registry state, and
start a new process before the case runs.

Only suites whose purpose is a long-lived session contract should keep one sim
across multiple assertions, and those suites should say so in the file header.
For movement/input/playtest coverage, prefer fresh process boundaries over page
reloads. Reloads can preserve renderer, WebGL, input, or sim-side failure modes
that are exactly what the harness is supposed to isolate.

Sim `/health` includes `process.pid`, `process.uptimeSec`, and
`process.memory` so long-run probes can watch process age and memory growth
instead of inferring leaks from control feel alone.

Each match is a bounded authority session, not a forever simulation. When the
last human pilot is dead or extracted, or when the configured run cap expires,
the sim marks the session ended and stops the tick loop while keeping the
process briefly inspectable. Use `/health.session.status`,
`/health.session.endReason`, `/health.idleState.activeHumanPlayerCount`, and
`/health.match` to verify that result screens are not still advancing the
world. Stress tests can opt into different bounds with
`LBH_SIM_MAX_SIM_TIME`, `LBH_SIM_TERMINAL_GRACE_MS`, and
`LBH_SIM_MAX_WRECK_REPEAT_WAVES`.

Manual playtests follow the same rule. If the question is control feel,
spawning, camera, death, or anything that smells like sim drift, start from a
fresh stack (`npm run stack:stop` then `npm run stack -- --no-open`, or
`npm run play`) before judging it. A browser reload is not a clean reset: it can
leave an old authority process, old WebGL state, old input state, or stale
process memory in the loop.

Use long-lived browser/sim sessions only when the test is explicitly about
long-run stability. In that case, record `/health` process age and memory before
and after the session so "the ship feels haunted" becomes inspectable evidence.

When a fresh playtest or movement/lifecycle fix changes the local playable
assessment, update `docs/project/BUILD-STATUS.md`. A passing lane buried in
terminal history is useful for the current actor, but it is not a durable
handoff by itself.

## Movement, Coordinates, And Camera Regressions

Movement bugs are often math bugs, not tuning bugs. When a change touches
movement, spawning, hazards, map scale, camera, renderer projection, flow
sampling, or sim snapshots, review these contracts before blaming constants:

- `src/coords.js` is the only place for coordinate conversions. No inline
  `1.0 - y`, ad hoc world wrapping, or pixel/world scale math in feature code.
- Server sim truth is world-space, Y-down, toroidal, and authoritative. Client
  code may present, predict, or debug that truth, but cannot become the only
  implementation of gameplay physics.
- The Three camera is top-down 3D, but it is still aligned to the square
  `CAMERA_VIEW`/fluid window. If a visible hazard, well, star, spawn, or kill
  radius moves, update the renderer fixture contract as well as gameplay tests.
- Radius projection is axis-specific on widescreen targets. Gameplay ranges use
  `worldRadiusToScreen()` / `worldRadiusToSceneScale()` in `world` mode; only
  decorative glyphs get screen-round sizing.
- A local sandbox fix is incomplete until the same behavior is correct in the
  remote/authority path. Movement force, slingshot state, collision/death,
  spawn placement, signal, loot, and run results must be sim-side first.

Minimum regression lane for this class of work:

```sh
npm test
npm run test:playtest
npm run test:authority
npm run test:visual
```

Then do one fresh Codex app browser pass. Automated tests can prove the contract
did not drift; they cannot prove the ship feels good.

## Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Stable core gate for local code changes. Three renderer target. |
| `npm run test:fast` | Cheap static + Three smoke canary for quick iteration. |
| `npm run test:legacy` | Deprecated compatibility check for the old renderer target. Use only for deliberate fallback archaeology. |
| `npm run test:three` | Three renderer canary: smoke, infra boot, and renderer fixtures with `?renderer=three`. |
| `npm run test:visual` | Three renderer fixture pass. Generates screenshots, manifests, and `visualReference` readability stats. |
| `npm run test:authority` | Control-plane, sim, telemetry, lifecycle, and remote-authority stack checks. |
| `npm run test:playtest` | Synthetic menu/input flows. Useful, but not a substitute for Codex app browser review. |
| `npm run test:full` | All committed automated suites on the Three target. Long and more timing-sensitive. |

## Forge Pass Alignment

Use `$lbh-forge-pass` occasionally, not as a replacement for daily validation.
It is the deeper architecture hygiene pass for stale assumptions, comments,
centralization drift, orphaned code, docs, and harness relevance.

During that pass:

- Choose test lanes by the contracts touched, not by habit.
- Delete, rewrite, or move tests that only protect superseded v0.1 behavior.
- Add representative tests for new v0.2 sim authority, Three projection,
  lifecycle, platform build, or controls contracts.
- Treat manual playfeel gaps as explicit residual risk rather than pretending
  automation can prove them.
- Update this doc when the expected validation path changes.

The underlying runner is manifest-driven:

```sh
node tests/run-all.cjs --lane=core --renderer=three
node tests/run-all.cjs --lane=visual --renderer=three
node tests/run-all.cjs --lane=browser --renderer=three
node tests/run-all.cjs --suite=Smoke,Renderer --renderer=both
node tests/run-all.cjs --list --lane=full
```

Renderer values:

- `legacy` sets `?renderer=legacy` for the deprecated fallback.
- `three` sets `?renderer=three`.
- `both` repeats every browser suite once per renderer.
- `target` preserves the target URL exactly.

Renderer fixtures default to a representative sweep plus the `visualReference`
object-family scene. That reference scene checks coarse contrast/readability
for stars, wrecks, portals, ships, fauna, sentries, and planetoids against the
final post-processed background. Set `LBH_RENDERER_DEEP=1` to capture every
fixture at the older multi-time cadence for a deliberate visual audit.

## Lanes

| Lane | What Belongs Here | What Does Not |
|------|-------------------|---------------|
| `fast` | static manifests, tiny smoke | remote authority, screenshots, menu play |
| `core` | commit gate: data, local browser state, representative gameplay API checks | subjective feel, long remote flows |
| `static` | pure Node/data invariants | browser or process lifecycle |
| `browser` | headless browser checks through `__TEST_API` | aesthetic approval |
| `authority` | sim/control-plane/remote protocol health | local-only visual questions |
| `visual` | deterministic renderer fixtures and screenshot manifests | gameplay balance |
| `playtest` | synthetic real-flow menu/input coverage | final UX judgment |
| `full` | all committed automated suites | Codex app browser/manual review |

## Three.js Applicability

Three is the primary renderer target. Remote-capable suites merge `simServer`
with existing query params instead of building broken URLs. The Three migration
gate is:

1. `npm run test:three`
2. `npm run test:visual`
3. A Codex app browser pass on `index-a.html?renderer=three`

The legacy renderer remains as an explicit fallback lane, but it is no longer a
default migration target. A browser test that asserts gameplay state should use
Three unless the task is specifically about fallback behavior; renderer fixtures
record backend diagnostics so failures say whether the visual graph or gameplay
state moved.

The Three renderer is no longer allowed to be a copy-only fullscreen bridge.
Renderer fixtures assert the first-class scene contract:

- `sceneKind: "top-down-3d"`
- `camera.kind: "orthographic-top-down"`
- `background-parallax-field`, `fabric-source-layer`, and
  `semantic-flow-field-layer`, `world-entity-layer`, and
  `foreground-screen-space-layer` are present
- `three-screen-space-post` appears in the pass graph
- `sharedContext: true` and `canvasUploads: 0` prove the Three path is not
  falling back to CPU canvas copies

## Codex App Browser Lane

Use the in-app browser for the work headless automation is bad at: visual identity, HUD
weight, menu feel, title presence, and readable motion.

Recommended flow:

1. For product-feel testing, start a fresh authority stack:
   ```sh
   npm run stack:stop
   npm run stack -- --no-open
   ```
   Use the `Client URL:` printed by the command. It includes the local
   `simServer` query string.
2. For renderer-only sandbox work, start only the static dev server:
   ```sh
   npm run dev
   ```
   and open `http://127.0.0.1:8080/index-a.html?renderer=three`.
3. Verify page identity, visible content, console health, and a screenshot.
4. Check `npm run stack:status` or sim `/health` if the session has been open
   long enough that stale authority state could explain weird movement.
5. Exercise one flow: title to profile/home, map launch, a short flying session,
   pause, death or extraction fixture when relevant.
6. Capture screenshots for the states that prove the claim.

Do not force every playtest into a headless script. If the question is "does
this look/feel right?", the browser lane should produce evidence and a human
readable finding, not a fake boolean.

## Computer Use Lane

Computer Use is a fallback for surfaces outside the browser runtime:

- packaged Electron/macOS app windows
- OS-level dialogs
- app menu items, dock behavior, or native file pickers
- situations where Codex Browser cannot see the target surface

It is not the default for web game testing. Prefer the Codex app browser for
local URLs and the shared CDP browser driver for deterministic CLI checks.

## Screenshot Policy

For LBH pages, screenshots should ask `__TEST_API.getRenderCanvasId()` for the
active render canvas, then composite that canvas with `overlay-canvas`. In the
current Three path this returns `fluid-canvas`, because Composer and Three share
one WebGL2 context. The old `three-canvas` remains a DOM placeholder only during
the migration. Full page screenshots can still miss game pixels, so the shared
`tests/helpers.cjs` screenshot helper uses the canvas-composited path first and
falls back to a browser screenshot only when no game canvas exists. Renderer
fixture runs append `?capture=1` for deterministic readback; do not use that
flag for normal performance claims.

## When To Escalate

- A `fast` or `core` failure blocks normal code handoff.
- A `three` failure blocks renderer migration work.
- A `visual` diff/failure blocks aesthetic claims, even if gameplay tests pass.
- A `playtest` failure should be reproduced in Codex Browser before treating it
  as a product bug; many old menu-flow tests are timing-sensitive.
- An `authority` failure blocks remote/multiplayer claims and packaged authority
  work.
