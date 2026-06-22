# Test Harness

> Current testing contract for Last Singularity. The original headless-only
> plan in `AGENT-TESTING.md` is historical; this doc is the live operator guide.

## Position

The harness is split by the question being asked. Fast data invariants, browser
boot checks, authority-process checks, renderer visual fixtures, and real
playtest flows should not all live in one default command. When they do, a
stale browser or a slow menu transition makes unrelated renderer work look
broken.

Use the CLI harness for deterministic facts. Use the Codex app browser for
visual/playtest judgment. Use Computer Use only when the target is a real Mac
app surface or OS UI that the browser cannot expose.

Browser suites run through `tests/browser-driver.cjs`, a small Chrome DevTools
Protocol wrapper around system Chrome. In Codex desktop sessions headless Chrome
may not advance ambient `requestAnimationFrame`, so frame-sensitive tests call
`window.__TEST_API.stepFrameForTest()` through the shared `stepGameFrames()`
helper. Tests that need rendered evidence should step frames explicitly before
reading FPS, perf stats, or pixels.

## Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Stable core gate for local code changes. Three renderer target. |
| `npm run test:fast` | Cheap static + Three smoke canary for quick iteration. |
| `npm run test:legacy` | Deprecated compatibility check for the old renderer target. Use only for deliberate fallback archaeology. |
| `npm run test:three` | Three renderer canary: smoke, infra boot, and renderer fixtures with `?renderer=three`. |
| `npm run test:visual` | Three renderer fixture pass. Generates screenshots and manifests. |
| `npm run test:authority` | Control-plane, sim, telemetry, lifecycle, and remote-authority stack checks. |
| `npm run test:playtest` | Synthetic menu/input flows. Useful, but not a substitute for Codex app browser review. |
| `npm run test:full` | All committed automated suites on the Three target. Long and more timing-sensitive. |

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

Renderer fixtures default to a representative three-scene sweep. Set
`LBH_RENDERER_DEEP=1` to capture every fixture at the older multi-time cadence
for a deliberate visual audit.

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

1. Start the local client:
   ```sh
   npm run dev
   ```
2. Open `http://127.0.0.1:8080/index-a.html?renderer=three` in the Codex app browser.
3. Verify page identity, visible content, console health, and a screenshot.
4. Exercise one flow: title to profile/home, map launch, a short flying session,
   pause, death or extraction fixture when relevant.
5. Capture screenshots for the states that prove the claim.

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
