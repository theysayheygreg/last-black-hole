# Test Harness

> Document revision: v0.3. The Three renderer and authoritative sim are the
> release validation targets. The original headless-only plan in
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

## North Star: Agents As First QA

The harness should let agents play, look, and understand LBH well enough that
Greg is the last stop for feel, taste, and polish, not the first person to
discover that a feature does not work.

That means every meaningful feature should have evidence in three layers:

1. **Contract proof** — deterministic tests prove the sim, renderer, protocol,
   or UI contract that changed.
2. **Playable proof** — an agent reaches the relevant state from fresh browser
   and sim processes, performs the action, and records what happened.
3. **Visual proof** — screenshots or fixture manifests show that the feature
   can be seen and understood in the Three scene or UI.

`npm run test:agent-eval` is the explicit playable-proof lane. It runs two
fresh authoritative Shallows sessions in disposable browsers with normal menus
and virtual Steam-style controller input. The first performs a real slingshot,
salvages live wrecks, raises signal/Inhibitor pressure, confirms extraction,
verifies result/Profile/Rig/Chronicle continuity, and starts a changed second
run. The second selects the public Breacher through Home, dives into a visible
well, verifies server-owned death, and returns Home. The report carries eighteen
1280x800 screenshots under `tests/screenshots/agent-play-eval-*`. Neither
journey mutates sim debug state.

This lane is not a replacement for manual playfeel. It is the handoff receipt
that should exist before asking Greg to spend attention on a build.

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

Remote client state also exposes protocol timing through
`window.__TEST_API.getNetworkState().networkMetrics`. Use
`lastInputAckRttMs`, `lastInputToSnapshotMs`, `lastSnapshotLagMs`,
`pendingInputCount`, and the mirrored remote fields in
`window.__TEST_API.getPerfStats()` to distinguish network packaging,
presentation delay, and actual movement tuning.

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
| `npm run test:visual` | Visual lane: Three renderer fixtures plus UI surface captures. Generates screenshots, manifests, `visualReference` readability stats, and UI couch proxies. |
| `npm run test:ui` | Focused UI visual pass. Captures title, profile, home, map select, in-match HUD, extraction results, and death results with 50%/25% couch-proxy images. |
| `npm run test:ui-motion` | Pure Node checks for shared UI motion helpers: reduced-motion resolution, reveal clips, type-on text, command pulses, and directional wipes. |
| `npm run test:authority` | Control-plane, sim, telemetry, lifecycle, and remote-authority stack checks. |
| `npm run test:sim-structure` | v0.3 structural gate for persistent Ballpark identity/lifecycle, required relevance/pickup/portal queries, toroidal geometry and swept contacts, movement fixtures, protocol v2, bounded growth, journal, and live snapshot rebase. |
| `npm run test:playtest` | Synthetic menu/input flows. Useful, but not a substitute for Codex app browser review. |
| `npm run test:agent-eval` | Natural Shallows product journey plus 1280x800 visual/readability evidence before Greg reviews feel and taste. |
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
node tests/run-all.cjs --lane=sim-structure --renderer=three
node tests/run-all.cjs --lane=visual --renderer=three
node tests/run-all.cjs --lane=agent-eval --renderer=three
node tests/run-all.cjs --lane=browser --renderer=three
node tests/run-all.cjs --suite=Smoke,Renderer --renderer=both
node tests/run-all.cjs --list --lane=full
```

Renderer values:

- `legacy` is archaeology for the retired renderer, not candidate evidence.
- `three` sets `?renderer=three`.
- `both` repeats every browser suite once per renderer.
- `target` preserves the target URL exactly.

Renderer fixtures default to a representative sweep plus the `visualReference`
object-family scene and `shipBakeoff` player asset comparison. `visualReference`
checks coarse contrast/readability for stars, wrecks, portals, ships, fauna,
sentries, and planetoids against the final post-processed background.
It also verifies that generated assets load, bind through the shared texture
cache, and release when their lifecycle owner is disposed. `shipBakeoff` keeps
the historical sprite-card versus pixel-textured top-down mesh comparison
available as an art-direction reference; production player hulls now use the
generated top-down sprite family. The
`ascii-...png` captures are the art-target frames. The `debug-scene-...png`
captures intentionally bypass ASCII quantization so shader input can be
inspected; they can look smooth, bright, or rainbowed around wells and should
not be treated as promo or target visuals.
Set `LBH_RENDERER_DEEP=1` to capture every fixture at the older multi-time
cadence for a deliberate visual audit.

UI visual captures run through `tests/ui-visual.cjs`. They use deterministic
test API fixtures rather than fragile menu key choreography, then save full-page
screenshots plus 50 percent and 25 percent downscaled couch proxies. This lane
analyzes those PNGs with the local Sharp pipeline so evidence generation does
not add large temporary canvases to the game page under test. It checks that
major UI surfaces exist, are not blank, preserve the expected phase,
and keep named action/value/text regions above local contrast floors. It covers
1280x800 and 1280x720 layouts, verifies transition progression and settled
states, and proves reduced motion resolves the same UI state. The title surface includes both
the immediate `title` frame and a later `title-attract` frame so attract-mode
events can change without regressing the couch read, plus a reduced-motion title
capture so accessibility fallback state stays visible in the review bundle. It is
a canary for UI drift, not a pixel-perfect approval gate.

Home, Map Select, in-match HUD, extraction results, and death results now carry
hard named-region checks. Broad whole-frame brightness remains review telemetry,
not a false art-direction verdict: the final game is intentionally black and
local readability matters more than making every pixel bright.

## Lanes

| Lane | What Belongs Here | What Does Not |
|------|-------------------|---------------|
| `fast` | static manifests, tiny smoke | remote authority, screenshots, menu play |
| `core` | commit gate: data, local browser state, representative gameplay API checks | subjective feel, long remote flows |
| `static` | pure Node/data invariants | browser or process lifecycle |
| `browser` | headless browser checks through `__TEST_API` | aesthetic approval |
| `authority` | sim/control-plane/remote protocol health | local-only visual questions |
| `sim-structure` | persistent Ballpark identity, required spatial queries, world geometry/sweeps, movement fixtures, protocol v2, bounded growth, journal, and snapshot rebase | browser visuals or playfeel |
| `visual` | deterministic renderer fixtures and screenshot manifests | gameplay balance |
| `playtest` | synthetic real-flow menu/input coverage | final UX judgment |
| `agent-eval` | fresh no-debug Shallows journey, second-run continuity, screenshots, and a narrative report | exhaustive authority coverage or subjective art approval |
| `full` | all committed automated suites | Codex app browser/manual review |

## Three.js Applicability

Three is the primary renderer target. Remote-capable suites merge `simServer`
with existing query params instead of building broken URLs. The Three migration
gate is:

1. `npm run test:three`
2. `npm run test:visual`
3. `npm run test:agent-eval`
4. A Codex app browser pass on `index-a.html?renderer=three`

The legacy renderer is not a v0.3 release requirement. Default browser runs,
screenshots, packages, and build health use Three. Do not weaken Three or
authority contracts to preserve old 2D output.

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
