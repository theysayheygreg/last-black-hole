# Agent Self-Testing: What Machines Verify So Humans Don't Have To

> Agents can open browsers, take screenshots, read console output, measure
> performance, and simulate inputs. Every minute Greg spends confirming
> "does it load?" is a minute not spent on "does it feel right?"
>
> This doc defines what agents verify automatically, what tools they use,
> and how the test harness fits into the night shift → morning review cycle.

---

## The Split

| Agent verifies | Greg verifies |
|---------------|---------------|
| Does it load without errors? | Does surfing feel like surfing? |
| Does it hit 60fps? | Is the wave catch satisfying? |
| Does the ship move when you thrust? | Is the Inhibitor terrifying? |
| Do waves propagate from wells? | Is the ASCII art beautiful? |
| Does the catch window engage at the right angle? | Is there enough tension? |
| Does signal increase when thrusting? | Is the "one more wreck" temptation real? |
| Do portals evaporate on schedule? | Would you share this link? |
| Does the Inhibitor spawn at threshold? | |
| Does extraction end the run? | |
| Do all screens transition without errors? | |
| Does it work in Firefox? | |

**Rule:** If a machine can answer the question, a machine should answer it. Greg's time is for taste, not QA.

---

## Test Tooling

### Browser Automation: Puppeteer (headless Chrome)

Already available via npm. No framework needed — raw Puppeteer scripts.

```
npm install puppeteer
```

A test script:
1. Launches headless Chrome (or headed, for screenshot review)
2. Opens `index.html` (served via `npx serve .` or `python3 -m http.server`)
3. Waits for canvas to render
4. Reads console output (fps, errors, sim state)
5. Simulates mouse/keyboard input
6. Takes screenshots
7. Reports pass/fail

### What Puppeteer Can Do

- **`page.evaluate()`** — read any JS variable from the game (CONFIG, game state, entity positions, signal level, fps)
- **`page.mouse.move(x, y)`** / **`page.mouse.down()`** — simulate mouse input (thrust toward a point)
- **`page.keyboard.press()`** — simulate key presses
- **`page.screenshot()`** — capture the canvas at any moment
- **`page.metrics()`** — frame timing data
- **`page.on('console')`** — capture all console.log output
- **`page.on('pageerror')`** — capture JS errors

### What Puppeteer Can't Do (well)

- Subjective feel ("is this fun?")
- Audio quality (can verify audio context exists, not whether it sounds good)
- "Is the ASCII beautiful?" (can screenshot for human review, can't judge beauty)
- Subtle physics feel (can measure velocities, can't measure satisfaction)

---

## Test Layers (Built Incrementally)

### Layer 0: Smoke Tests (Monday night — ships with first prototype)

**Run after every commit.** These take <10 seconds and catch "I broke something."

```
tests/smoke.js
```

| Test | What it checks | How |
|------|---------------|-----|
| **Loads** | Page opens, canvas exists, WebGL context created | `page.evaluate(() => !!document.querySelector('canvas').getContext('webgl2'))` |
| **No errors** | Zero JS errors in 5 seconds of running | `page.on('pageerror')` — fail if any fire |
| **Renders** | Canvas is not blank (pixels have been drawn) | Screenshot → check it's not all-black |
| **FPS** | Maintains 60fps for 3 seconds | Read fps from CONFIG/debug output, fail if avg < 55 |
| **CONFIG exists** | The CONFIG object is accessible | `page.evaluate(() => typeof CONFIG === 'object')` |

**Agent workflow:** After committing, run `node tests/smoke.js`. If it fails, fix before moving on. If it passes, proceed.

### Layer 1: Physics Verification (Monday night — after ship is moving)

**Run after physics changes.** These take ~30 seconds and verify the sim is behaving.

```
tests/physics.js
```

| Test | What it checks | How |
|------|---------------|-----|
| **Ship moves** | Thrusting changes ship position | Simulate mouse at (400, 300), hold click for 1s, read ship position before/after. Must differ. |
| **Ship drifts** | Releasing thrust, ship still moves (carried by fluid) | Thrust for 1s, release for 1s, read velocity. Must be > 0. |
| **Well pulls** | Ship near well drifts toward it | Place ship at well + 200px (via teleport/sandbox), wait 2s, check ship moved toward well. |
| **Waves exist** | Fluid velocity at distance from well oscillates | Sample fluid velocity at a fixed point over 5s. Must show periodic variation (not constant). |
| **Fluid coupling** | Ship velocity includes fluid component | Read ship velocity and fluid velocity at ship position. Ship velocity should be ~80% fluid (per CONFIG.ship.fluidCoupling). |
| **Catch window** | Wave magnetism engages when aligned | Move ship to wave crest, align within catch window. Check for magnetism force. Move outside window. Check no force. |

**Implementation notes:**
- Tests use sandbox mode to place the ship precisely (no need to "play" to reach a position)
- Tests read game state via `page.evaluate(() => gameState)` — requires the game to expose state
- Expose a `window.__TEST_API` object with: `getShipPos()`, `getShipVel()`, `getFluidVelAt(x,y)`, `getSignalLevel()`, `getWellPositions()`, `teleportShip(x,y)`, `setConfig(path, value)`

### Layer 2: Game Loop Verification (Tuesday — after L1 entities)

**Run after entity/loop changes.** ~60 seconds.

```
tests/gameloop.js
```

| Test | What it checks | How |
|------|---------------|-----|
| **Wrecks spawn** | N wrecks exist at run start | `page.evaluate(() => gameState.wrecks.length)` ≥ CONFIG value |
| **Loot pickup** | Flying near wreck adds to inventory | Teleport ship to wreck position, wait 1s. Check inventory grew. |
| **Wreck dims** | Looted wreck changes visual state | Check wreck.looted === true after pickup |
| **Portals exist** | Portals spawn at run start | `gameState.portals.length` ≥ CONFIG value |
| **Portal evaporation** | Portals disappear over time | Fast-forward time (set time scale to 10x), wait, check portal count decreased |
| **Extraction works** | Entering portal ends run with success | Teleport ship to portal position. Check game state transitions to "success" |
| **Death works** | All portals gone = death | Remove all portals (or fast-forward until gone). Check state = "death" |
| **Restart works** | After end state, new run initializes cleanly | Trigger restart, check fresh game state (new wells, new wrecks, reset signal) |
| **Well growth** | Wells get stronger over time | Read well mass at t=0 and t=60s (fast-forwarded). Must have increased. |

### Layer 3: Signal + Threat Verification (Wednesday)

```
tests/signal.js
```

| Test | What it checks | How |
|------|---------------|-----|
| **Thrust → signal** | Thrusting increases signal | Read signal, thrust for 2s, read again. Must have increased. |
| **Drift → decay** | Not thrusting decreases signal | Set signal to 50%, drift for 3s. Signal must decrease. |
| **Loot → spike** | Looting a wreck spikes signal | Read signal, teleport to wreck, loot, read again. Spike must match CONFIG. |
| **Threshold → Inhibitor** | Crossing threshold spawns Inhibitor | Set signal to 95% (above any threshold). Wait 6s. Inhibitor must exist. |
| **Inhibitor tracks** | Inhibitor moves toward ship | Record Inhibitor position, wait 3s, record again. Must be closer to ship. |
| **Silent → Inhibitor pauses** | Drifting silently stops Inhibitor tracking | Set signal to 0, drift for 6s. Inhibitor should enter search mode. |
| **Inhibitor kills** | Inhibitor contact = death | Teleport ship to Inhibitor position. Game state must = "death". |

### Layer 4: Integration + Regression (Thursday+)

```
tests/integration.js
```

| Test | What it checks | How |
|------|---------------|-----|
| **Full run playable** | Can complete a run start to finish via automation | Bot plays: thrust toward nearest portal, extract. Must succeed. |
| **Full run times out** | Ignoring portals leads to death | Bot plays: drift doing nothing. Must die within 12 minutes (fast-forward). |
| **All screen transitions** | Title → run → success → title → run → death → title | Automate the full loop. No errors. |
| **Config hot-reload** | Changing CONFIG mid-run takes effect | Change CONFIG.ship.thrustForce via evaluate, verify ship acceleration changed. |
| **Browser compat** | Works in Firefox | Run smoke tests in Firefox (Puppeteer with Firefox support, or Playwright). |
| **Resize** | Window resize doesn't break rendering | Resize viewport mid-run, take screenshot, verify no errors. |

### Layer 5: Visual Regression (Thursday+ — optional but powerful)

```
tests/visual.js
```

- Take screenshots at defined moments (title screen, mid-run, near well, extraction, death)
- Compare to baseline screenshots (pixel diff or perceptual hash)
- Flag if >5% of pixels changed (something shifted visually)
- **Not** for judging aesthetics — for catching "the ASCII shader broke and everything is black"

Baseline screenshots committed to `tests/baselines/`. Updated when visual changes are intentional.

---

## The Test API: What the Game Exposes

The game needs a thin test API that Puppeteer can call. This is NOT game logic — it's a window into game state for automated verification.

```js
// Exposed on window for test access. No-op in production.
window.__TEST_API = {
  // State readers
  getShipPos: () => ({ x: ship.x, y: ship.y }),
  getShipVel: () => ({ x: ship.vx, y: ship.vy }),
  getShipFacing: () => ship.facing,
  getFluidVelAt: (x, y) => fluid.getVelocity(x, y),
  getSignalLevel: () => gameState.signal,
  getWells: () => gameState.wells.map(w => ({ x: w.x, y: w.y, mass: w.mass })),
  getWrecks: () => gameState.wrecks.map(w => ({ x: w.x, y: w.y, looted: w.looted })),
  getPortals: () => gameState.portals.map(p => ({ x: p.x, y: p.y, active: p.active })),
  getInhibitor: () => gameState.inhibitor ? { x: gameState.inhibitor.x, y: gameState.inhibitor.y, active: true } : null,
  getGamePhase: () => gameState.phase, // 'title' | 'playing' | 'success' | 'death'
  getFPS: () => debug.fps,
  getRunTime: () => gameState.runTime,
  getInventory: () => gameState.inventory,

  // State mutators (sandbox/test only)
  teleportShip: (x, y) => { ship.x = x; ship.y = y; ship.vx = 0; ship.vy = 0; },
  setSignal: (level) => { gameState.signal = level; },
  setTimeScale: (scale) => { gameState.timeScale = scale; },
  spawnInhibitor: () => { /* force spawn */ },
  triggerRestart: () => { /* reset game state */ },

  // Config access (dev panel also uses this)
  getConfig: () => JSON.parse(JSON.stringify(CONFIG)),
  setConfig: (path, value) => { /* set nested CONFIG value by dot path */ },
};
```

**Agent prompt addition:** "Expose `window.__TEST_API` with the interface defined in AGENT-TESTING.md. This is how automated tests and the dev panel interact with game state."

---

## When Tests Run

### Night Shift (Agent-Driven)

1. Agent writes code, commits
2. Agent runs `node tests/smoke.js` after each commit
3. If smoke fails → fix before proceeding
4. Agent runs layer-appropriate tests after completing a task (e.g., `node tests/physics.js` after N1a)
5. If tests fail → fix or document why in night report
6. Night report includes: test pass/fail summary, any known failures with explanations

### Morning Review (Greg-Facing)

1. Greg sees test results in the night report
2. Green = "it works, go play it"
3. Red = "here's what's broken, here's what the agent tried, here's what needs your input"
4. Greg skips the "does it load? does it crash?" phase entirely — that's been verified
5. Greg goes straight to "does it feel good?"

### Day Shift (Continuous)

- Agent runs smoke tests after any code change
- After a tuning session (Greg commits new CONFIG values), agent runs physics + gameloop tests to verify nothing broke
- Tests act as a regression safety net during rapid iteration

---

## Implementation Budget

| Component | Lines of Code | When Built | By Whom |
|-----------|--------------|------------|---------|
| `window.__TEST_API` | ~50 | Monday night (part of N1a/N1b) | Physics agent |
| `tests/smoke.js` | ~60 | Monday night (after first prototype) | Either agent |
| `tests/physics.js` | ~120 | Monday night (after ship moves) | Either agent |
| `tests/gameloop.js` | ~150 | Tuesday night (after L1) | Night agent |
| `tests/signal.js` | ~100 | Wednesday night (after L2) | Night agent |
| `tests/integration.js` | ~100 | Thursday (after full game exists) | Parallel agent |
| `tests/visual.js` | ~80 | Thursday (optional) | Parallel agent |
| `tests/run-all.js` | ~30 | Monday night | Either agent |
| **Total** | **~690** | **Progressive** | **Agent-owned** |

Puppeteer dependency: `npm init -y && npm install puppeteer` in the game repo. One-time setup.

---

## What This Enables

1. **Night shifts ship tested code.** Greg wakes up to "all 15 tests pass" not "hope it works."
2. **Tuning doesn't break things.** After Greg drags sliders for 30 minutes and commits, the agent runs regression tests. If the new wave amplitude breaks the catch window math, the test catches it.
3. **Agents can self-iterate.** An agent building the Inhibitor can verify "does it spawn at threshold? does it track? does contact kill?" without a human playing. The human only needs to verify "is it scary?"
4. **Parallel verification.** While one agent builds L2 features, another can continuously run the L0/L1 test suite against the same codebase to catch regressions.
5. **Screenshot-based review.** Agents take screenshots at key moments (title, mid-run, near-well, extraction, death). Greg reviews the screenshots in the morning report instead of playing through every state.

---

## Test File Structure

```
tests/
  smoke.js
  physics.js
  gameloop.js
  signal.js
  integration.js
  visual.js
  run-all.js
  screenshots/
    (auto-generated, gitignored)
  baselines/
    (committed reference screenshots)
```

`tests/screenshots/` is `.gitignore`d — these are ephemeral artifacts generated each run. `tests/baselines/` is committed — these are the reference images that visual regression tests compare against. When a visual change is intentional, update the baselines and commit them.

---

## Screenshot Review Pipeline

Agents take screenshots at defined game moments so Greg can visual-review overnight work without launching the game. Screenshots are the bridge between "tests pass" and "it looks right."

### Key Moments

| Moment | When to capture | Why Greg cares |
|--------|----------------|----------------|
| Title screen | On first render after load | Does the title screen exist and look intentional? |
| 30s into run | 30s after run start (real or fast-forwarded) | Is the playing field populated? Do wells/wrecks/portals look right? |
| Near a well | Ship teleported to well + 100px | Do waves render? Is the well visually pulling? |
| Wave catching | Ship aligned with a wave crest, magnetism engaged | Does the catch look like surfing? |
| Wreck looting | Ship at wreck position, loot triggered | Does the wreck dim? Does inventory feel like it updated? |
| Portal approach | Ship within 200px of active portal | Does the portal look like a way out? |
| Inhibitor spawn | Signal pushed above threshold, Inhibitor appears | Is the Inhibitor visible and distinct? |
| Extraction | Ship enters portal, success state | Does the success screen render? |
| Death | All portals gone or Inhibitor contact | Does the death screen render? |

### Filename Convention

```
tests/screenshots/{moment}-{ISO-timestamp}.png
```

Examples:
```
tests/screenshots/title-screen-2026-03-17T034512Z.png
tests/screenshots/near-well-2026-03-17T034530Z.png
tests/screenshots/inhibitor-spawn-2026-03-17T034545Z.png
```

### Puppeteer Screenshot Pattern

```js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function screenshotName(moment) {
  const ts = new Date().toISOString().replace(/[:.]/g, '');
  return path.join(SCREENSHOT_DIR, `${moment}-${ts}.png`);
}

async function captureKeyMoments(page) {
  // Title screen — captured right after load
  await page.waitForSelector('canvas');
  await page.screenshot({ path: screenshotName('title-screen') });

  // Start a run, wait 30s (or fast-forward)
  await page.evaluate(() => window.__TEST_API.triggerRestart());
  await page.evaluate(() => window.__TEST_API.setTimeScale(10)); // 3s real = 30s game
  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate(() => window.__TEST_API.setTimeScale(1));
  await page.screenshot({ path: screenshotName('30s-into-run') });

  // Near a well
  const wells = await page.evaluate(() => window.__TEST_API.getWells());
  if (wells.length > 0) {
    await page.evaluate((w) => window.__TEST_API.teleportShip(w.x + 100, w.y), wells[0]);
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: screenshotName('near-well') });
  }

  // Clip region example — capture just the ship area (300x300 around ship)
  const shipPos = await page.evaluate(() => window.__TEST_API.getShipPos());
  await page.screenshot({
    path: screenshotName('ship-closeup'),
    clip: {
      x: Math.max(0, shipPos.x - 150),
      y: Math.max(0, shipPos.y - 150),
      width: 300,
      height: 300
    }
  });

  // Inhibitor spawn
  await page.evaluate(() => window.__TEST_API.setSignal(0.96));
  await new Promise(r => setTimeout(r, 6000));
  const inhibitor = await page.evaluate(() => window.__TEST_API.getInhibitor());
  if (inhibitor) {
    await page.screenshot({ path: screenshotName('inhibitor-spawn') });
  }

  // Extraction
  const portals = await page.evaluate(() => window.__TEST_API.getPortals());
  const active = portals.find(p => p.active);
  if (active) {
    await page.evaluate((p) => window.__TEST_API.teleportShip(p.x, p.y), active);
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: screenshotName('extraction') });
  }

  // Death — start fresh run, remove all portals via fast-forward
  await page.evaluate(() => window.__TEST_API.triggerRestart());
  await page.evaluate(() => window.__TEST_API.setTimeScale(100));
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: screenshotName('death') });
}
```

### Morning Report Integration

The night report includes a screenshots section:

```
## Screenshots

Title screen: tests/screenshots/title-screen-2026-03-17T034512Z.png
30s into run: tests/screenshots/30s-into-run-2026-03-17T034520Z.png
Near well:    tests/screenshots/near-well-2026-03-17T034530Z.png
Inhibitor:    tests/screenshots/inhibitor-spawn-2026-03-17T034545Z.png
Extraction:   tests/screenshots/extraction-2026-03-17T034550Z.png
Death:        tests/screenshots/death-2026-03-17T034600Z.png

No visual anomalies detected. Wells rendering correctly.
Inhibitor sprite visible and distinct from background.
```

Greg reviews these in 60 seconds instead of booting the game and playing through every state.

---

## Regression Guard

After Greg tunes via the dev panel and commits new CONFIG values, the agent runs the full test suite automatically. The test suite acts as a safety net: tuning should change feel, not break mechanics.

### Workflow

1. Greg opens the dev panel, drags sliders, finds settings that feel good
2. Greg commits the new CONFIG values (e.g., `Tune: widened catch window to 45deg, surfing feels more forgiving`)
3. Agent detects the commit (or Greg asks the agent to verify)
4. Agent runs `node tests/run-all.js`
5. If all tests pass: agent confirms in report, Greg's tuning is safe
6. If a test fails: agent reports which test broke and why, with a concrete explanation

### Concrete Example: Catch Window Too Wide

Greg is tuning the wave catch mechanic. The default catch window is 30 degrees. Greg widens it to 120 degrees because it feels more forgiving in play.

```
CONFIG.ship.catchWindowDeg = 120; // was 30
```

Greg commits. Agent runs the test suite. `tests/physics.js` has this test:

**"Waves exist"** — samples fluid velocity at a fixed point over 5 seconds and checks for periodic variation. With a 120-degree catch window, the magnetism force is almost always active, which means the ship is almost always being pulled toward wave crests. The test that checks "ship drifts freely when not catching" now fails, because at 120 degrees the ship is always catching.

The agent reports:

```
FAIL: physics.js — "Ship drifts freely when not catching"
  Expected ship to drift without magnetism force when not aligned with wave.
  With catchWindowDeg=120, the ship is aligned with a wave crest >90% of the time.
  The magnetism force is nearly always active, so "free drift" never happens.

  Suggestion: The catch window may be too wide for the physics model.
  Greg should verify in-game whether 120deg still feels like "catching"
  or if it just feels like "always being pulled." If 120deg is intentional,
  the test threshold for "free drift" needs updating.
```

Greg reads this, realizes 120 was too aggressive, tries 55 degrees instead. Agent re-runs, all tests pass. The tuning and the test suite stay in sync.

### What the Regression Guard Catches

- Tuning that breaks existing mechanics (catch window so wide it eliminates free drift)
- Tuning that breaks thresholds (signal decay so fast the Inhibitor never spawns)
- Tuning that breaks timing (portal evaporation so slow that "death by timeout" never triggers in tests)
- Tuning that breaks physics assumptions (thrust so high the ship escapes gravity wells, breaking the "well pulls" test)

### What It Does NOT Catch

- Whether the new tuning feels better (that is Greg's job)
- Whether the new tuning is balanced (that is playtesting)
- Whether the new tuning looks right (that is screenshot review)

---

## Night Shift Test Protocol

Numbered checklist the night shift agent follows. Every night shift, every time.

1. **After each commit:** run smoke tests (`node tests/smoke.js`). If smoke fails, fix before moving to the next task. Do not accumulate broken commits.

2. **After completing a task:** run the layer-appropriate test suite.
   - Physics work (ship, fluid, wells, waves) → `node tests/physics.js`
   - Entity/loop work (wrecks, portals, extraction) → `node tests/gameloop.js`
   - Signal/threat work (signal, Inhibitor, fauna) → `node tests/signal.js`
   - Cross-system work or unsure → `node tests/integration.js`

3. **After all tasks for the night are complete:** run the full suite (`node tests/run-all.js`). This is the final gate before the night report.

4. **Take screenshots at each key moment** (see Screenshot Review Pipeline above). Run the screenshot capture after the full suite passes, so screenshots reflect the final working state — not an intermediate broken one.

5. **Include test summary and screenshots in the night report:**
   - Total tests: X passed, Y failed, Z skipped
   - Per-layer breakdown if any failures
   - Screenshot links/embeds for each key moment
   - Any new baselines committed (and why the visual changed)

6. **If tests fail and you cannot fix them:**
   - Do not silently skip. Document in the night report:
     - Which test failed
     - What the expected vs. actual result was
     - What you tried to fix it
     - Your best guess at root cause
     - Whether it blocks the next task or is isolated
   - Tag it clearly so Greg sees it first thing:
     ```
     ## TEST FAILURE — needs morning review
     physics.js: "Catch window engages when aligned"
     Expected magnetism force > 0 when ship is within 30deg of wave crest.
     Got: force = 0. Suspect the wave phase calculation changed when I
     refactored well oscillation. Did not revert because the new oscillation
     pattern is correct per DESIGN.md — the test assertion may need updating.
     ```

---

## Codex Compatibility

The test harness is CI-agnostic. Any agent that can run shell commands can verify the build.

**Requirements to run the tests:**
- Node.js (for Puppeteer and test scripts)
- A shell (`bash`, `zsh`, whatever)
- `npm install` (installs Puppeteer, which bundles Chromium)

**No Claude-specific dependencies.** The tests do not use Claude APIs, MCP tools, or any agent-specific infrastructure. They are plain Node.js scripts that launch a headless browser and check game state.

**Running the full suite:**

```
cd /path/to/last-black-hole
npm install
node tests/run-all.js
```

That is it. OpenAI's Codex, Claude Code, a GitHub Action, a local dev machine — anything that can run those three lines can verify the build. The test output is stdout text (pass/fail per test, summary at end) and screenshots written to `tests/screenshots/`.

If Codex or another agent is running the night shift, it follows the same Night Shift Test Protocol above. The protocol is agent-agnostic — it describes what to do, not which agent does it.

---

## What This Does NOT Replace

- **Feel testing.** No automated test can tell you if surfing feels good.
- **Art direction.** Screenshots help but Greg decides if the ASCII is beautiful.
- **Design decisions.** Tests verify the mechanic works, not whether it should exist.
- **Balance.** Tests can verify "run lasts 8-12 minutes" but not "is the tension curve right?"

The test harness is a time multiplier, not a replacement for the human. It buys Greg 30 minutes of taste-testing per morning review by eliminating 30 minutes of "does it even work?" verification.
