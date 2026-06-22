# Build Pipeline

`Last Singularity` now has a first-pass artifact pipeline.

The rule is simple:

- one gameplay source of truth: the web runtime
- one build command: `npm run build`
- one runtime mode per build: `dev`, `test`, or `release`
- versioned outputs under `builds/`
- a manifest and per-target `BUILD-INFO-*.json` files for traceability
- one combined playtest zip for handing to friends

## Commands

From `/Users/theysayheygreg/clawd/projects/last-black-hole`:

- `npm run build` — build `web`, `ipad`, `mac`, `win`, and `linux`
- `npm run build:release` — explicit friend-facing build with debug UX stripped
- `npm run build:test` — build with test API enabled but dev UX stripped
- `npm run build:dev` — build with dev panel + test API + debug overlays enabled
- `npm run build:web` — build only the web playtest artifact
- `npm run build:ipad` — build only the Safari/Add-to-Home-Screen iPad web-app artifact
- `npm run build:desktop` — build web + desktop/mobile wrapper targets
- `npm run ios:sync` — sync the current web runtime into the native iOS wrapper
- `npm run ios:build:sim` — sync and build the native iOS wrapper for iPad Simulator
- `npm run ios:build:device` — sync and build the native iOS wrapper for signed devices
- `npm run deploy:deck` — build/copy the Linux package to a Tailscale-visible Steam Deck
- `scripts/install-steam-deck.sh` — public Deck installer that downloads the Linux weekly release asset
- `npm run deploy:itch` — stage an itch HTML5 artifact and push it with butler
- `npm run deploy:steam` — prepare SteamPipe content and VDF scripts

`npm run build` currently defaults to `release` mode.

## Runtime modes

LBH now has three runtime modes.

- `dev`
  - dev panel enabled
  - test API enabled
  - debug overlay allowed
- `test`
  - dev panel disabled
  - test API enabled
  - debug overlay disabled
- `release`
  - dev panel disabled
  - test API disabled
  - debug overlay disabled

The source tree stays in `dev` by default for local iteration. The build pipeline writes a generated `src/build-flags.js` into each artifact so packaged builds can behave differently without a bundler or second config system.

## Runtime prerequisites

The first build layer is intentionally light.

- Node.js is required for the build script and Electron tooling.
- Electron Packager currently requires Node.js `22.12.0+`.
- Xcode is not required to make an unsigned macOS `.app`.
- Xcode, Apple certificates, and notarization only matter once you want a trusted macOS distribution.

Useful references:

- Electron packaging tutorial: [Packaging Your Application](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)
- Electron distribution: [Application Packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution/)
- Electron code signing: [Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- Electron Packager: [@electron/packager](https://github.com/electron/packager)

## Output shape

Builds land under:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/v<version>/`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/v<version>-test/`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/v<version>-dev/`

That folder contains:

- `BUILD-MANIFEST.json`
- `BUILD-INFO-web.json`
- `BUILD-INFO-ipad.json` if the iPad web-app target succeeded
- `BUILD-INFO-mac.json` if mac packaging succeeded
- `BUILD-INFO-win.json` if Windows packaging succeeded
- `BUILD-INFO-linux.json` if Linux packaging succeeded
- `last-singularity-web/`
- `last-singularity-ipad-webapp/` if the iPad web-app target succeeded
- `Last Singularity.app` if mac packaging succeeded
- `Last Singularity-win32-x64/` if Windows packaging succeeded
- `Last Singularity-linux-x64/` if Linux packaging succeeded

`release` keeps the clean `v<version>` folder because that is the friend-facing artifact. `test` and `dev` get a mode suffix so they do not overwrite the release build.

The build date now lives inside the manifest and build info files instead of the folder name. The selected runtime mode is recorded in the manifest and per-target build info files.

Before cutting a serious playtest build, the lightweight verification lane should be green:

- `npm test`
- `npm run test:telemetry`
- `npm run test:renderer`
- `node scripts/build-health.cjs status`

`npm test` already includes the telemetry smoke suite, but keeping the focused telemetry command around is useful when diagnosing stack-status and embedded-runtime regressions without rerunning the whole harness.

Alongside the version folder, the build also writes:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/last-singularity-playtest-v<version>.zip`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/last-singularity-playtest-v<version>-test.zip`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/last-singularity-playtest-v<version>-dev.zip`

Each zip contains the whole matching build folder. In practice, the friend-facing handoff should almost always be the plain `release` zip with no mode suffix.

## Current wrapper strategy

The desktop path is intentionally thin.

- The source gameplay runtime is still `index-a.html` + `src/`
- The build copies that into an Electron shell
- The artifact entrypoint is normalized to `index.html`

That means the `.app` and `.exe` are wrappers around the same web game, not separate runtime implementations.

## Remote-authority note

The build story now splits cleanly by target.

- web builds are still plain rendering clients
- packaged desktop builds now embed the control plane + sim for ordinary local packaged play
- remote-authority play remains a separate mode and still expects a browser client to point at an external sim authority
- packaged desktop builds also expose a small in-app stack-status window so embedded authority state is visible without a terminal

So the honest rule is:

- **desktop package** = self-contained local playtest app
- **browser remote mode** = local-rendering client against separate authority

If you want mini→MacBook play, run the authority machine separately and start the MacBook browser client in `remote-client` mode.

## What works today

This machine can build:

- a shareable web artifact folder
- a controller-first iPad web-app bundle for Safari "Add to Home Screen"
- a macOS Electron app bundle
- a Windows Electron app folder with `.exe` entrypoint
- a Linux Electron app folder
- one combined playtest zip containing all of the above

This is enough for playtest packaging. The Windows output is already useful as a portable playtest build even though it is not an installer yet.

## Steam Deck Weekly Install Contract

The public Deck installer expects the `nightly-latest` GitHub release to attach:

```text
last-singularity-linux-nightly.zip
```

The tag and filename intentionally keep their `nightly` compatibility names so
existing installer commands remain stable. The regular GitHub workflow now
refreshes them weekly and skips scheduled builds when the current SHA already
matches the last successful run.

That zip contains the Linux desktop package:

```text
Last Singularity-linux-x64/
```

The installer script at `scripts/install-steam-deck.sh` downloads that zip,
installs it under `~/Games/last-singularity`, writes the Deck launcher profile,
creates Desktop Mode launchers, and registers the wrapper as a Steam non-Steam
shortcut for Gaming Mode.

If the Linux artifact name or folder shape changes, update the installer,
weekly workflow, README, and Steam Deck runbook in one change.

## What this does not solve yet

- code signing
- notarization
- Windows installer generation
- Steam packaging
- auto-update

Those are later concerns. This pipeline is for making dated, traceable playtest builds now.

The first deploy layer now exists in [Deployment Pipelines](DEPLOYMENT-PIPELINES.md).
It deliberately separates the web runtime from platform artifacts: Deck wants a
Linux desktop package, itch HTML5 wants a self-contained sandbox page, and Steam
wants SteamPipe depot content.

## iPad note

There are now two iPad paths:

- `npm run build:ipad` creates a local-install web app bundle meant for:
  - serving over HTTP
  - opening in Safari on iPad
  - using "Add to Home Screen"
  - playing with a controller and no touch-first UI assumptions
- `npm run ios:build:sim` builds a native `WKWebView` wrapper around the same
  synced web runtime for simulator testing.

The native wrapper is not a gameplay rewrite and does not embed the Node
authority stack. It runs self-contained only in sandbox mode, or it can point at
an external sim server with `--sim-server=http://HOST:8787`.

Physical iPad deployment still needs Xcode signing, an Apple Developer Team, and
a provisioning profile. See [iPad / iOS Build Path](IPAD-IOS-BUILD.md).

## Practical next step for Windows

For now, treat the Windows target as an app folder with a real `.exe` entrypoint inside the combined playtest zip.

That is enough to hand to testers. If you later want a friendlier installer, add an installer layer or CI-backed packaging step on top of this build flow instead of replacing it.
