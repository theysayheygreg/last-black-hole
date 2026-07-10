# Last Singularity

**Last Singularity** is an ASCII-fluid extraction roguelike about piloting through the last surviving pockets of a collapsing universe.

You do not fly through empty space. You fly through spacetime as a hostile ocean: currents pull, wells churn, stars become route anchors, and every confident burn spends the delta-v you may need to get home.

> Formerly developed under the repository name `last-black-hole`.

## Status

Current public train: **v0.2.2 — Authority, Three, and Deck Foundation**

Next candidate branch: **v0.3.0 — Ballpark Authority** on
`codex/v0.3-ballpark-roadmap`. It is not promoted to the public/demo line yet.

Builds identify themselves as `v0.2.2.<commit-hash>` so private handoff
artifacts can advance every commit without pretending every commit is a public
release.

The project is in active pre-public-playtest development. It has a playable local stack, server-authoritative run simulation, persistent profiles, ship classes, AI rivals, extraction/death flows, a Three.js renderer direction, and a large test harness. It does **not** yet ship public hosted multiplayer, matchmaking, final balance, or a public demo page.

For the current design snapshot, start here:

- [v0.2 docs](docs/v0.2/README.md)
- [v0.2 release notes](docs/v0.2/V0.2-RELEASE-NOTES.md)
- [design/code delta](docs/v0.2/DESIGN-CODE-DELTA.md)
- [v0.2 roadmap](docs/v0.2/ROADMAP.md)
- [v0.3 Ballpark roadmap](docs/v0.3/ROADMAP.md)
- [v0.3 release-candidate gate](docs/v0.3/RC-GATE.md)

## Pitch

You are a black-hole surfer and salvage pilot. Drop into collapsing universe instances, read the flow of spacetime, loot wreckage from dead civilizations, manage the signal you throw into the dark, and extract before the remaining portals evaporate.

```text
PROFILE -> LOADOUT -> DROP -> READ FLOW -> LOOT -> MANAGE SIGNAL
        -> EXTRACT OR DIE -> RESULTS -> VAULT/UPGRADE -> REPEAT
```

## Current Foundation And v0.3 Candidate

- **Three.js is now the product renderer direction.** The default target is `?renderer=three`: an orthographic top-down 3D scene layered over the ASCII fluid fabric.
- **The renderer no longer copies the game canvas through the CPU.** Three and the Composer/ASCII chain share the `fluid-canvas` WebGL2 context.
- **The sim/client split is real.** Normal local play starts the authority stack; the browser/Electron client renders snapshots and sends inputs.
- **Steam Deck local play is self-contained.** The Deck package starts its own embedded control plane and sim on dynamic `127.0.0.1` ports; Tailscale/SSH is only for deploying builds to the device.
- **Movement is an economy.** Thrust costs delta-v, braking is reverse-thrust, currents are free motion, and slingshot anchors turn map geometry into route puzzles.
- **Slingshot authority is shipped.** Remote-authority runs expose sim-owned engagement, energy, release, and chain state.
- **The public roster is honest.** Drifter and Breacher are the selectable
  v0.3 hulls; Resonant, Shroud, and Hauler remain internal until their complete
  authority, UI, balance, and journey proof exists.
- **The run loop has persistent shape.** Profiles, save slots, vault foundations, item tiers, consumables, run results, chronicle records, and echo-wreck foundations exist.
- **The test harness is first-class.** Fast, core, Three, visual, playtest, and authority lanes use the project CDP browser driver and sim/control-plane probes.
- **Ballpark makes world identity boring.** Stable generation-checked bodies,
  wrapped spatial queries, lifecycle, swept contacts, event/snapshot recovery,
  and protocol-v2 credentials support future multiplayer without forcing ECS.
- **Shallows has a truthful teaching route.** Slingshot, salvage, signal, and
  cyan zone-plus-confirm extraction are seeded authority facts.

## Current Features

- GPU Navier-Stokes fluid simulation with toroidal worlds.
- ASCII dithering and Composer post-processing pipeline.
- First-class Three renderer path with pooled world layers and top-down camera.
- Server-authoritative local stack with control plane, sim process, snapshots, telemetry, and lifecycle management.
- Wreck looting, cargo, consumables, vault/profile foundations, extraction portals, and death/result screens.
- Signal system with six zones and Inhibitor escalation.
- AI players and scavenger/rival behavior.
- Ambient fauna, signal blooms, gradient sentries, phantoms, haunts, stars, wells, planetoids, and comets.
- Drifter and Breacher public hulls with distinct movement, delta-v, slingshot,
  ability, cargo, and rig identities; three internal hull prototypes remain in
  development.
- SNES-flavored synthesized Web Audio.
- Keyboard/mouse and gamepad support.
- Web and Electron local-play surfaces.
- Steam Deck package path verified through the Linux Electron artifact, Deck launcher wrapper, and Gaming Mode shortcut.

## Playable Targets

| Target | Status | How to play |
|--------|--------|-------------|
| Local desktop from source | Primary development target | Clone the repo, install deps, run `npm run play` |
| Steam Deck | Weekly handheld playtest target | Install the Linux weekly build with the Deck installer below |
| Packaged desktop | Friend/tester handoff target | Open the platform artifact and read `START-HERE.md` |
| iPad / iOS | Native Apple-platform bench + controller wrapper target | `npm run build:ipad` for Safari install, `npm run ios:build:sim` for native simulator |
| Browser sandbox | Debug/demo fallback | `npm run stack:sandbox`; not product play |
| Cloudflare Drop | Temporary browser-share lane | `npm run release:drop`, then drop the zip or folder on Cloudflare Drop; sandboxed, not full authority |
| itch.io HTML5 | Planned public demo lane | Uses a sandboxed web artifact, not the full authority stack |
| Steam Early Access | Planned storefront lane | Uses desktop depots; not public yet |

## How To Play

### Local Desktop From Source

Use this path when you are developing the game or playtesting from the repo:

```sh
git clone https://github.com/theysayheygreg/last-black-hole.git
cd last-black-hole
npm install
npm run play
```

`npm run play` starts the local authority stack, resets the local sim for a
fresh run, and opens an Electron game window. When you close the window, the
stack stays available for debugging; shut it down with:

```sh
npm run stop
```

When testing movement, spawning, hazards, or camera feel, treat a fresh process
as part of the test. If the game has been running for a while and motion feels
wrong, run `npm run stop` before launching again. A browser refresh is not a
clean sim reset.

First launch flow:

1. Press `Space` / `Enter` on keyboard or `A` on Steam Deck/controller at the
   title screen.
2. Choose an existing pilot or select an empty slot, type a pilot name, and
   press `Enter`.
3. On the home screen, use `Q/E` on keyboard or `L1/R1` on Deck/controller to
   switch tabs.
4. Go to `LAUNCH`, confirm with `Space` or `A`, choose a destination, then
   confirm again to drop in.
5. In a run, loot wrecks, manage signal and delta-v, follow cyan route
   apertures, remain inside one, then press `Enter` / `A` to extract before it
   expires or the universe collapses.
6. After extraction or death, press `Space` / `A` to return to the pilot flow.

### Steam Deck Weekly Build

On a Steam Deck in Desktop Mode, open Konsole and run:

```sh
curl -fsSL https://raw.githubusercontent.com/theysayheygreg/last-black-hole/main/scripts/install-steam-deck.sh | bash
```

The installer downloads the latest Linux weekly release, installs it to
`~/Games/last-singularity`, creates Desktop Mode launchers, and registers the
wrapper as a Steam non-Steam game for Gaming Mode. After it finishes, restart
Steam or return to Gaming Mode and launch **Last Singularity** from the normal
library.

Steam Deck operational notes live in the [Steam Deck runbook](docs/reference/STEAM-DECK-RUNBOOK.md).

The Deck UI uses controller-first prompts (`A`, `B`, `View`, `L1/R1`, `R2`,
`L2`) and larger HUD minimums. If you see keyboard-only labels like
`press space` in a Deck build, treat that as a compatibility regression.

The Deck build is not a networked renderer. It packages the renderer inside the
Electron app, serves those local assets through the app-owned `lbh://` protocol,
and launches the control plane and sim as Deck-local child processes on loopback
ports. The only network dependency in Greg's current workflow is the Tailscale
copy step used to install a fresh build onto the Deck.

Use Desktop Mode to install or triage boot logs, but use Gaming Mode for real
controller play. Steam Input may leave non-Steam apps on the Desktop control
layout in Desktop Mode, so `L1`/`R1` tab navigation is only a reliable acceptance
check once **Last Singularity** appears under **Library -> Non-Steam**.

### Packaged Desktop Builds

Open `START-HERE.md` in the build zip. The short version:

- macOS: run `Run Last Singularity.command`, or open `Last Singularity.app`.
- Windows: run `Last Singularity-win32-x64/Last Singularity.exe`.
- Linux: run `Last Singularity-linux-x64/Last Singularity`.
- Steam Deck: prefer the installer above so the wrapper and Gaming Mode shortcut
  are registered correctly.

### Browser Sandbox

`npm run stack:sandbox` opens the old client-only browser sandbox. Use it for
renderer or HUD debugging only. Normal play should use `npm run play`, the Deck
installer, or a packaged desktop build so the authoritative sim owns the run.

### iPad / iOS

The iPad target has the same strategic purpose as the Switch target: it is a
hardware and platform-competence bench. The current wrapper keeps the game
playable while we learn the Apple-specific surface area: SwiftUI app structure,
iOS lifecycle, signing/provisioning, controller behavior, WebKit limits, audio,
and eventually Metal renderer probes.

For the lowest-friction iPad check, build the Safari local-install artifact:

```sh
npm run build:ipad
```

For the native wrapper simulator path:

```sh
npm run ios:sync -- --mode=release
npm run ios:build:sim -- --mode=release
```

The native iOS app is a thin `WKWebView` shell around the same web runtime. It
does not embed the Node sim/control-plane stack; use sandbox mode by default or
build with `--sim-server=http://HOST:8787` to point at remote authority. It is
the first native bench rung, not the final Apple runtime. Device deployment
requires Apple signing. See [iPad / iOS Build Path](docs/reference/IPAD-IOS-BUILD.md).

## Requirements

- Node.js 22.12+ recommended for source builds and Electron packaging.
- Chrome or another WebGL2-capable browser for browser-only local debugging.
- A keyboard/mouse or gamepad. Steam Deck controls use the built-in controller.

### Developer Launches

```sh
npm run stack          # local authority stack: control plane + sim + dev server
npm start              # same local authority stack, browser-oriented convenience
npm run stack:sandbox  # debug-only client sandbox, not the product mode
npm run stack:remote -- --sim=http://HOST:PORT
npm run stack:status
npm run stack:stop
```

The product path is authority-first. `stack:sandbox` exists for renderer and debugging work, but it is intentionally named as a sandbox so client-only behavior does not masquerade as shipped game truth.

## Controls

### Keyboard And Mouse

| Action | Input |
|--------|-------|
| Menu navigate | Arrow keys / WASD |
| Menu confirm | Space / Enter |
| Menu back | Escape |
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

The sim owns gameplay truth. The client owns presentation. Local play can run
every process on one machine, but the architecture is built around separate sim
and renderer responsibilities. Packaged desktop and Steam Deck builds keep that
split inside one local app: Electron starts the renderer, embedded control
plane, and embedded sim locally, then connects the renderer to the sim over
`127.0.0.1`.

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
npm run build:drop
npm run build:desktop
npm run build:release
npm run release:drop
npm run release:internal
npm run release:public
npm run release:check
npm run release:status
```

Desktop builds use Electron and package the local-play surface. Web builds write versioned artifacts under `builds/`.

Use `npm run release:internal` after committing source when a remote handoff
should carry a real build. It keeps the public train at `0.2.x`, appends the
current commit hash as the fourth version field, runs the fast gate, builds web,
iPad web-app, macOS, Windows, and Linux release artifacts, stages weekly assets,
and verifies the output shape. Use `npm run release:public` only when Greg calls
for the third number to advance.

The tracked pre-push hook runs the same release check for `origin`; install it
once with:

```sh
git config core.hooksPath .githooks
```

For now, the version shape is `major.minor.public.commit`. Internal commits chew
up the hash field automatically. Public release increments chew up the third
field. Large decisive `0.3` or `1.0` moves are by Greg's call only. Intentional
docs/process-only pushes that do not publish a build can use
`LBH_SKIP_RELEASE_PREP=1 git push origin main`.

With `git config core.hooksPath .githooks` installed, every commit prints the
new hash build version and whether its all-target artifact already exists. That
reminder is intentionally cheap; the expensive build still runs only when a
commit is becoming a real handoff/push build.

## Deployment Pipelines

```sh
npm run deploy:deck           # local Steam Deck copy over Tailscale/SSH
npm run release:drop          # temporary Cloudflare Drop static sandbox build
npm run deploy:itch           # itch.io HTML5 staging + butler push
npm run deploy:steam          # SteamPipe content/VDF package prep
npm run deploy:steam:upload   # SteamCMD upload when Steamworks config is ready
```

See [Deployment Pipelines](docs/reference/DEPLOYMENT-PIPELINES.md) for the important target split: Deck wants a Linux desktop package, Cloudflare Drop and itch HTML5 want self-contained sandbox artifacts, and Steam wants desktop depots rather than the raw web folder.

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
