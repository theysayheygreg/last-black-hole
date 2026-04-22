# Last Singularity

a roguelike extraction game set in a dying universe. surf gravitational currents between collapsing black holes. loot the ruins of dead civilizations. escape before the void consumes everything.

built during a game jam (march 2026) and expanded in the weeks after.

## the game

you pilot a small ship through a fluid-simulated universe rendered entirely in ASCII characters. gravity wells pull everything — your ship, the fluid, the loot, the stars — toward inevitable collapse. extract what you can through temporary wormholes before the universe closes in.

**core loop:** fly → loot wrecks → survive wells → find a portal → extract → upgrade → drop back in

**key features:**
- GPU navier-stokes fluid simulation with toroidal wrapping
- ASCII dithering post-process shader
- server-authoritative simulation (local or remote)
- 5 ship classes (Drifter, Breacher, Resonant, Shroud, Hauler) with distinct physics
- signal system — 6 zones from ghost to threshold, taxes ambition
- the inhibitor — 3-form escalation (glitch → swarm → vessel) driven by player signal
- ambient fauna (drift jellies, signal blooms) and active threats (gradient sentries)
- AI players with 5 personalities (Prospector, Raider, Vulture, Ghost, Desperado)
- 4 star types (yellow dwarf, red giant, white dwarf, neutron star) with orbital systems
- AI scavenger ships competing for the same loot and portals
- loot drift — everything falls toward the nearest well over time
- 3 save slots with persistent profiles
- SNES-flavored synthesized audio (no sample files, all Web Audio)
- force pulse combat, shield burst, time dilation, breach flares
- proximity-based flavor text on every entity in the universe

## architecture

```
browser client (renderer)          sim server (authority)
  ├── WebGL fluid sim                ├── world physics tick
  ├── ASCII post-process             ├── wells, wrecks, portals
  ├── canvas entity overlay          ├── AI players + scavengers
  ├── HUD (signal bar, cargo)        ├── signal + inhibitor
  └── input → POST /input           ├── fauna + sentries
                                     └── snapshots → GET /snapshot
```

the sim server owns all game state. clients render snapshots and send inputs. runs on the same machine (localhost) or remotely via tailscale/LAN.

## controls

### keyboard + mouse
| action | input |
|--------|-------|
| aim | mouse cursor |
| thrust | left click / W / Space |
| brake | right click / S / Ctrl |
| keyboard aim fallback | arrow keys / A-D |
| force pulse | E |
| inventory | Tab / I |
| consumable 1 | 1 |
| consumable 2 | 2 |
| pause | Escape |
| dev panel | backtick (`) |

### gamepad (dualsense / xbox)
| action | button |
|--------|--------|
| aim | left stick |
| thrust | R2 |
| brake | L2 |
| force pulse | square / X |
| inventory | select/share |
| consumable 1 | d-pad left |
| consumable 2 | d-pad right |
| menu navigate | d-pad / left stick |
| confirm | cross / A |
| back | circle / B |

## setup

### prerequisites
- node.js 22.12+ recommended (GitHub Actions uses Node 22; Electron packaging currently expects modern Node)
- node.js 18+ is usually enough for browser-only local development
- a browser with WebGL 2 support (chrome, firefox, edge, safari 15+)

### install + play
```bash
git clone https://github.com/theysayheygreg/last-black-hole.git
cd last-black-hole
npm install
npm start
```

that's it. `npm start` launches everything and opens the game in your browser. `npm run stop` shuts it all down.

### what npm start does
under the hood, three processes run: a control plane (persistence), a sim server (game authority), and a dev server (static files). you don't need to think about them — `npm start` handles it. if you care, the individual commands are:

```bash
npm run control    # persistence layer (profiles, vault)
npm run sim        # authoritative game sim
npm run dev        # static file server for the browser client
```

### alternative: no node (client-only, local sim)
the game can run without the sim server — it falls back to a local simulation in the browser. serve the project directory with any static file server:

```bash
# python
python3 -m http.server 8080

# or just open index-a.html in a browser
# (some browsers block ES module imports from file://, so a server is recommended)
```

### build
```bash
# web build (writes builds/v<version>/last-singularity-web/)
npm run build:web

# desktop builds (electron — mac/win/linux)
npm run build:desktop

# release build (all platforms, minified)
npm run build:release
```

### nightly playables
A GitHub Actions workflow now owns the nightly playable path:

- builds and uploads a **web playable zip**
- optionally deploys the web build to **GitHub Pages** when `LBH_ENABLE_GITHUB_PAGES=true`
- builds and uploads a **Windows playable zip**
- builds and uploads a **macOS `.app` zip**
- publishes them on the rolling prerelease tag **`nightly-latest`**
- skips the heavy build jobs on scheduled runs when the repo SHA has not changed since the last successful nightly

That gives Orrery stable link targets for daily posts instead of vague "latest build" talk.

desktop builds require `electron` and `@electron/packager` (included in devDependencies).

### tests
```bash
npm test
```

runs the full harness via puppeteer: validation, smoke, infra, telemetry, sim lifecycle, meta flow, controller, keyboard+mouse, physics, coordinates, flow, inventory, systems, PlayerBrain, control plane, overload, coarse field, sim scale, and remote authority. requires a chromium-compatible browser.

focused harnesses:

```bash
npm run test:renderer   # deterministic visual fixtures + screenshots
npm run test:title-prototype  # standalone Composer title-prototype probe
npm run test:telemetry  # structured runtime log contract
node scripts/build-health.js status
```

## tech stack

- **rendering:** WebGL 2 (navier-stokes fluid sim + LBH-native Composer passes; gameplay uses fluid display → ASCII, title prototype adds Bloom as a visual canary)
- **game logic:** vanilla JS, ES modules, no framework
- **sim server:** node.js HTTP server (authoritative game state)
- **audio:** Web Audio API synthesis (oscillators, noise, filters — no sample files)
- **persistence:** browser profiles for local play plus external control-plane persistence for remote/server-authoritative play
- **testing:** puppeteer (headless chrome)
- **desktop:** electron (optional)
- **build:** custom node.js build script

no typescript. no react. no webpack. the game loads directly from ES module source files in development.

## project structure

```
src/
  main.js          — game loop, input, rendering, phase management
  fluid.js         — GPU navier-stokes solver (WebGL 2 shaders)
  render/          — Composer + display/bloom/ASCII render passes
  ship.js          — player ship physics
  wells.js         — gravity wells
  stars.js         — 4 star types with orbital systems
  planetoids.js    — comets with canvas tails
  wrecks.js        — lootable wrecks with drift
  scavengers.js    — AI opponent ships
  portals.js       — extraction wormholes
  combat.js        — force pulse system
  inventory.js     — cargo + loadout
  profile.js       — save slots + upgrades
  hud.js           — signal bar, cargo display, zone indicators
  audio.js         — SNES-flavored synthesis engine
  items.js         — item catalog + loot generation
  config.js        — all tunable parameters
  coords.js        — coordinate system authority
  maps/            — map definitions (3x3, 5x5, 10x10)

scripts/
  sim-runtime.js   — authoritative sim: physics, AI, signal, inhibitor, fauna
  sim-server.js    — HTTP server wrapping the sim runtime
  control-plane-server.js — persistence/session orchestration process
  stack.js         — canonical local stack launcher
  dev-server.js    — static file server for development
  build.js         — web + desktop build script

docs/
  design/          — design documents (20+)
  journal/         — devlog, changelog, decision log
  project/         — roadmap, backlog, architecture plans

tests/             — puppeteer + Node integration suites
```

## version

current: **0.2.0** (post-jam, server-authoritative sim + entity ecology)

## license

not yet determined. all rights reserved for now.
