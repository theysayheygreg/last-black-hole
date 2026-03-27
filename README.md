# Last Singularity

a roguelike extraction game set in a dying universe. surf gravitational currents between collapsing black holes. loot the ruins of dead civilizations. escape before the void consumes everything.

built during a game jam (march 2026) and expanded in the weeks after.

## the game

you pilot a small ship through a fluid-simulated universe rendered entirely in ASCII characters. gravity wells pull everything — your ship, the fluid, the loot, the stars — toward inevitable collapse. extract what you can through temporary wormholes before the universe closes in.

**core loop:** fly → loot wrecks → survive wells → find a portal → extract → upgrade → drop back in

**key features:**
- GPU navier-stokes fluid simulation with toroidal wrapping
- ASCII dithering post-process shader
- 4 star types (yellow dwarf, red giant, white dwarf, neutron star) with orbital systems
- comets with teardrop bodies and trailing tails
- AI scavenger ships competing for the same loot and portals
- loot drift — everything falls toward the nearest well over time
- 6-track upgrade system (thrust, hull, coupling, drag, sensor, vault)
- 3 save slots with persistent profiles
- SNES-flavored synthesized audio (no sample files, all Web Audio)
- force pulse combat, shield burst, time dilation, breach flares
- proximity-based flavor text on every entity in the universe

## controls

### keyboard + mouse
| action | key |
|--------|-----|
| aim | mouse cursor |
| thrust | left click / W |
| brake | right click / S |
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
- node.js 18+ (for dev server + tests)
- a browser with WebGL 2 support (chrome, firefox, edge, safari 15+)

### install + run
```bash
git clone https://github.com/theysayheygreg/last-black-hole.git
cd last-black-hole
npm install
npm run dev
```

open `http://localhost:8080` in your browser.

### alternative: no node
the game is vanilla JS with ES modules — no build step required. you can serve the project directory with any static file server:

```bash
# python
python3 -m http.server 8080

# or just open index-a.html in a browser
# (some browsers block ES module imports from file://, so a server is recommended)
```

### build
```bash
# web build (bundles into builds/web/)
npm run build:web

# desktop builds (electron — mac/win/linux)
npm run build:desktop

# release build (all platforms, minified)
npm run build:release
```

desktop builds require `electron` and `@electron/packager` (included in devDependencies).

### tests
```bash
npm test
```

runs 7 test suites (validation, smoke, physics, coordinates, flow, inventory, systems) via puppeteer. requires a chromium-compatible browser.

## tech stack

- **rendering:** WebGL 2 (navier-stokes fluid sim + ASCII post-process shader)
- **game logic:** vanilla JS, ES modules, no framework
- **audio:** Web Audio API synthesis (oscillators, noise, filters — no sample files)
- **persistence:** localStorage (3 save slots)
- **testing:** puppeteer (headless chrome)
- **desktop:** electron (optional)
- **build:** custom node.js build script

no typescript. no react. no webpack. the game loads directly from ES module source files in development.

## project structure

```
src/
  main.js          — game loop, input, rendering, phase management
  fluid.js         — GPU navier-stokes solver (WebGL 2 shaders)
  ascii-renderer.js — ASCII dithering post-process
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
  audio.js         — SNES-flavored synthesis engine
  items.js         — item catalog + loot generation
  config.js        — all tunable parameters
  coords.js        — coordinate system authority
  maps/            — map definitions (3x3, 5x5, 10x10)
  sim/             — decoupled sim core

docs/
  design/          — design documents (15+)
  journal/         — devlog, changelog, decision log
  project/         — roadmap, backlog, status

tests/             — 7 puppeteer test suites
scripts/           — dev server, build, static server
```

## license

not yet determined. all rights reserved for now.
