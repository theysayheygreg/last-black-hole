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

## What This Does NOT Replace

- **Feel testing.** No automated test can tell you if surfing feels good.
- **Art direction.** Screenshots help but Greg decides if the ASCII is beautiful.
- **Design decisions.** Tests verify the mechanic works, not whether it should exist.
- **Balance.** Tests can verify "run lasts 8-12 minutes" but not "is the tension curve right?"

The test harness is a time multiplier, not a replacement for the human. It buys Greg 30 minutes of taste-testing per morning review by eliminating 30 minutes of "does it even work?" verification.
