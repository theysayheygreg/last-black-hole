# Last Singularity

**Last Singularity** is an ASCII-fluid extraction roguelike about piloting through the last surviving pockets of a collapsing universe.

You do not fly through empty space. You fly through spacetime as a hostile ocean: currents pull, wells churn, stars become route anchors, and every confident burn spends the delta-v you may need to get home.

> Formerly developed under the repository name `last-black-hole`.

## Status

Current version: **v0.2.0 — Authority and Three Foundation**

The project is in active pre-public-playtest development. It has a playable local stack, server-authoritative run simulation, persistent profiles, ship classes, AI rivals, extraction/death flows, a Three.js renderer direction, and a large test harness. It does **not** yet ship public hosted multiplayer, matchmaking, final balance, or a public demo page.

For the current design snapshot, start here:

- [v0.2 docs](docs/v0.2/README.md)
- [v0.2 release notes](docs/v0.2/V0.2-RELEASE-NOTES.md)
- [design/code delta](docs/v0.2/DESIGN-CODE-DELTA.md)
- [v0.2 roadmap](docs/v0.2/ROADMAP.md)

## Pitch

You are a black-hole surfer and salvage pilot. Drop into collapsing universe instances, read the flow of spacetime, loot wreckage from dead civilizations, manage the signal you throw into the dark, and extract before the remaining portals evaporate.

```text
PROFILE -> LOADOUT -> DROP -> READ FLOW -> LOOT -> MANAGE SIGNAL
        -> EXTRACT OR DIE -> RESULTS -> VAULT/UPGRADE -> REPEAT
```

## v0.2 Highlights

- **Three.js is now the product renderer direction.** The default target is `?renderer=three`: an orthographic top-down 3D scene layered over the ASCII fluid fabric.
- **The renderer no longer copies the game canvas through the CPU.** Three and the Composer/ASCII chain share the `fluid-canvas` WebGL2 context.
- **The sim/client split is real.** Normal local play starts the authority stack; the browser/Electron client renders snapshots and sends inputs.
- **Movement is an economy.** Thrust costs delta-v, braking is reverse-thrust, currents are free motion, and slingshot anchors turn map geometry into route puzzles.
- **Slingshot authority is shipped.** Remote-authority runs expose sim-owned engagement, energy, release, and chain state.
- **Five hulls have mechanical identities.** Drifter, Breacher, Resonant, Shroud, and Hauler resolve through PlayerBrain and shared content manifests.
- **The run loop has persistent shape.** Profiles, save slots, vault foundations, item tiers, consumables, run results, chronicle records, and echo-wreck foundations exist.
- **The test harness is first-class.** Fast, core, Three, visual, playtest, and authority lanes use the project CDP browser driver and sim/control-plane probes.

## Current Features

- GPU Navier-Stokes fluid simulation with toroidal worlds.
- ASCII dithering and Composer post-processing pipeline.
- First-class Three renderer path with pooled world layers and top-down camera.
- Server-authoritative local stack with control plane, sim process, snapshots, telemetry, and lifecycle management.
- Wreck looting, cargo, consumables, vault/profile foundations, extraction portals, and death/result screens.
- Signal system with six zones and Inhibitor escalation.
- AI players and scavenger/rival behavior.
- Ambient fauna, signal blooms, gradient sentries, phantoms, haunts, stars, wells, planetoids, and comets.
- Five hulls with movement, delta-v, slingshot, ability, and cargo differences.
- SNES-flavored synthesized Web Audio.
- Keyboard/mouse and gamepad support.
- Web and Electron local-play surfaces.

## Playable Targets

| Target | Status | How to play |
|--------|--------|-------------|
| Local desktop | Primary development target | `npm run play` |
| Browser sandbox | Debug/demo fallback | `npm run stack:sandbox` |
| Steam Deck | Private/nightly playtest target | Install the Linux nightly with the Deck installer below |
| itch.io HTML5 | Planned public demo lane | Uses a sandboxed web artifact, not the full authority stack |
| Steam Early Access | Planned storefront lane | Uses desktop depots; not public yet |

### Steam Deck Nightly

On a Steam Deck in Desktop Mode, open Konsole and run:

```sh
curl -fsSL https://raw.githubusercontent.com/theysayheygreg/last-black-hole/main/scripts/install-steam-deck.sh | bash
```

The installer downloads the latest Linux nightly release, installs it to
`~/Games/last-singularity`, creates Desktop Mode launchers, and registers the
wrapper as a Steam non-Steam game for Gaming Mode. After it finishes, restart
Steam or return to Gaming Mode and launch **Last Singularity** from the normal
library.

Steam Deck operational notes live in the [Steam Deck runbook](docs/reference/STEAM-DECK-RUNBOOK.md).

## Install And Play

### Requirements

- Node.js 22.12+ recommended.
- Node.js 18+ is usually enough for browser-only local development.
- Chrome or another WebGL2-capable browser for local web play.

### Player-Facing Local Launch

```sh
git clone https://github.com/theysayheygreg/last-black-hole.git
cd last-black-hole
npm install
npm run play
```

`npm run play` starts the local authority stack and opens the game in an Electron window. Use `npm run stop` when you are done.

### Developer Launches

```sh
npm run stack          # local authority stack: control plane + sim + dev server
npm start              # same local authority stack, browser-oriented convenience
npm run stack:sandbox  # debug-only client sandbox, not the product mode
npm run stack:remote   # remote-client mode when an authority stack already exists
npm run stack:status
npm run stack:stop
```

The product path is authority-first. `stack:sandbox` exists for renderer and debugging work, but it is intentionally named as a sandbox so client-only behavior does not masquerade as shipped game truth.

## Controls

### Keyboard And Mouse

| Action | Input |
|--------|-------|
| Aim | Mouse cursor |
| Thrust | Left click / W / Space |
| Brake | Right click / S / Ctrl |
| Keyboard aim fallback | Arrow keys / A-D |
| Slingshot engage / release | F |
| Force pulse | E |
| Hull ability 1 | Q |
| Hull ability 2 | R |
| Inventory | Tab / I |
| Consumable 1 | 1 |
| Consumable 2 | 2 |
| Pause | Escape |
| Dev panel | Backtick |

### Gamepad

| Action | Button |
|--------|--------|
| Aim | Left stick |
| Thrust | R2 / right trigger |
| Brake | L2 / left trigger |
| Slingshot engage / release | Triangle / Y |
| Force pulse | Square / X |
| Hull ability 1 | L1 / left bumper |
| Hull ability 2 | R1 / right bumper |
| Inventory | Select / Share |
| Consumable 1 | D-pad left |
| Consumable 2 | D-pad right |
| Menu navigate | D-pad / left stick |
| Confirm | Cross / A |
| Back | Circle / B |

## Architecture

```text
control plane                 sim process                  client renderer
profiles, vaults, sessions -> authoritative run truth   -> Electron/browser presentation
session registry              physics, AI, signal          input collection
stack lifecycle               slingshot authority          Three + Composer + ASCII
structured telemetry          snapshots/events             HUD, audio, interpolation
```

The sim owns gameplay truth. The client owns presentation. Local play can run every process on one machine, but the architecture is built around separate sim and renderer responsibilities.

## Tests

```sh
npm test                # core Three gate
npm run test:fast       # quick validation + smoke canary
npm run test:three      # Three renderer, infra, and fixture lane
npm run test:authority  # control-plane + sim + remote-authority checks
npm run test:visual     # renderer screenshots and fixture manifests
npm run test:full       # long full automated lane
```

The browser suites use `tests/browser-driver.cjs`, a small Chrome DevTools Protocol driver. Set `LBH_CHROME_PATH` if Chrome is not discoverable.

## Build

```sh
npm run build:web
npm run build:desktop
npm run build:release
```

Desktop builds use Electron and package the local-play surface. Web builds write versioned artifacts under `builds/`.

## Deployment Pipelines

```sh
npm run deploy:deck           # local Steam Deck copy over Tailscale/SSH
npm run deploy:itch           # itch.io HTML5 staging + butler push
npm run deploy:steam          # SteamPipe content/VDF package prep
npm run deploy:steam:upload   # SteamCMD upload when Steamworks config is ready
```

See [Deployment Pipelines](docs/reference/DEPLOYMENT-PIPELINES.md) for the important target split: Deck wants a Linux desktop package, itch HTML5 wants a self-contained sandbox artifact, and Steam wants desktop depots rather than the raw web folder.

## Project Structure

```text
src/
  main.js                    game loop, input, phases, runtime coordination
  fluid.js                   GPU Navier-Stokes solver
  render/                    Composer, display, bloom, tonemap, ASCII passes
  render-three/              top-down Three scene and pooled presentation layers
  ship.js                    player ship physics
  slingshot.js               anchor engagement, energy, release, chain logic
  wells.js / stars.js        gravity sources and route anchors
  wrecks.js / portals.js     salvage and extraction loop
  scavengers.js              rival/scavenger behavior
  inventory.js / profile.js  cargo, loadout, profile state
  content/                   canonical JSON manifests for hulls, items, balance
  coords.js                  coordinate-space conversions

scripts/
  sim-runtime.cjs            authoritative sim runtime
  sim-server.cjs             HTTP wrapper for sim snapshots and inputs
  control-plane-server.cjs   profile/session control plane
  stack.cjs                  canonical stack launcher
  dev-server.cjs             static development server
  build.cjs                  web and desktop builds

docs/
  v0.2/                      current versioned design snapshot
  design/                    original and ongoing design documents
  journal/                   changelog, decision log, devlog
  project/                   roadmap, backlog, architecture plans

tests/
  run-all.cjs                manifest-driven harness
  browser-driver.cjs         CDP browser automation
  renderer.cjs               visual/renderer fixtures
```

## What v0.2 Does Not Promise Yet

- Public hosted multiplayer.
- Internet matchmaking.
- Fully procedural maps.
- Final upgrade economy or balance.
- Complete factions/missions.
- Final audio score.
- Removal of every legacy renderer fallback.

Those are roadmap items, not current player promises.

## License

Not yet determined. All rights reserved for now.
