# Development Reference

> Salvaged from the pre-2026-07-20 README during the public-facing rewrite.
> Player-facing install/play/controls now live in the root README; this doc
> keeps the developer surface: stack commands, tests, builds, releases, and
> deployment lanes.

## Developer Launches

```sh
npm run stack          # local authority stack: control plane + sim + dev server
npm start              # same local authority stack, browser-oriented convenience
npm run stack:sandbox  # debug-only client sandbox, not the product mode
npm run stack:remote -- --sim=http://HOST:PORT
npm run stack:status
npm run stack:stop
```

The product path is authority-first. `stack:sandbox` exists for renderer and debugging work, but it is intentionally named as a sandbox so client-only behavior does not masquerade as shipped game truth.

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

The tracked pre-push hook runs release preparation only when `origin/main` is
being updated; version-branch pushes remain cheap. Install it once with:

```sh
git config core.hooksPath .githooks
```

For now, the version shape is `major.minor.public.commit`. Internal commits chew
up the hash field automatically. Public release increments chew up the third
field. Large decisive `0.3` or `1.0` moves are by Greg's call only. The tracked
hook automatically skips release preparation when the complete pushed range is
limited to recognized docs, tests, or process files; any runtime/build/content
path still requires the hash-named release artifact.

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
