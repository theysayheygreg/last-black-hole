# Build Pipeline

`Last Black Hole` now has a first-pass artifact pipeline.

The rule is simple:

- one gameplay source of truth: the web runtime
- one build command: `npm run build`
- versioned outputs under `builds/`
- a manifest and per-target `BUILD-INFO-*.json` files for traceability
- one combined playtest zip for handing to friends

## Commands

From `/Users/theysayheygreg/clawd/projects/last-black-hole`:

- `npm run build` — build `web`, `ipad`, `mac`, `win`, and `linux`
- `npm run build:web` — build only the web playtest artifact
- `npm run build:desktop` — build web + desktop/mobile wrapper targets

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

That folder contains:

- `BUILD-MANIFEST.json`
- `BUILD-INFO-web.json`
- `BUILD-INFO-ipad.json` if the iPad web-app target succeeded
- `BUILD-INFO-mac.json` if mac packaging succeeded
- `BUILD-INFO-win.json` if Windows packaging succeeded
- `BUILD-INFO-linux.json` if Linux packaging succeeded
- `last-black-hole-web/`
- `last-black-hole-ipad-webapp/` if the iPad web-app target succeeded
- `Last Black Hole.app` if mac packaging succeeded
- `Last Black Hole-win32-x64/` if Windows packaging succeeded
- `Last Black Hole-linux-x64/` if Linux packaging succeeded

The build date now lives inside the manifest and build info files instead of the folder name.

Alongside the version folder, the build also writes:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/last-black-hole-playtest-v<version>.zip`

That zip contains the whole version folder so you can hand one file to friends instead of three separate archives.

## Current wrapper strategy

The desktop path is intentionally thin.

- The source gameplay runtime is still `index-a.html` + `src/`
- The build copies that into an Electron shell
- The artifact entrypoint is normalized to `index.html`

That means the `.app` and `.exe` are wrappers around the same web game, not separate runtime implementations.

## What works today

This machine can build:

- a shareable web artifact folder
- a controller-first iPad web-app bundle for Safari "Add to Home Screen"
- a macOS Electron app bundle
- a Windows Electron app folder with `.exe` entrypoint
- a Linux Electron app folder
- one combined playtest zip containing all of the above

This is enough for playtest packaging. The Windows output is already useful as a portable playtest build even though it is not an installer yet.

## What this does not solve yet

- code signing
- notarization
- Windows installer generation
- Steam packaging
- auto-update

Those are later concerns. This pipeline is for making dated, traceable playtest builds now.

## iPad note

The iPad target is intentionally not a signed IPA yet.

It is a local-install web app bundle meant for:

- serving over HTTP
- opening in Safari on iPad
- using "Add to Home Screen"
- playing with a controller and no touch-first UI assumptions

A real iPad app build would need Xcode, Apple signing, and a thin native shell. That is a later layer.

## Practical next step for Windows

For now, treat the Windows target as an app folder with a real `.exe` entrypoint inside the combined playtest zip.

That is enough to hand to testers. If you later want a friendlier installer, add an installer layer or CI-backed packaging step on top of this build flow instead of replacing it.
