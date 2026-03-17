# Build Pipeline

`Last Black Hole` now has a first-pass artifact pipeline.

The rule is simple:

- one gameplay source of truth: the web runtime
- one build command: `npm run build`
- versioned outputs under `builds/`
- a manifest and per-target `BUILD-INFO.json` for traceability

## Commands

From `/Users/theysayheygreg/clawd/projects/last-black-hole`:

- `npm run build` — build `web`, `mac`, and `win`
- `npm run build:web` — build only the web playtest artifact
- `npm run build:desktop` — build web + desktop wrapper targets

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

- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/<timestamp>-lbh-v<version>/`

That folder contains:

- `BUILD-MANIFEST.json`
- `last-black-hole-web/`
- `last-black-hole-web.zip`
- `mac/` if mac packaging succeeded
- `win/` if Windows packaging succeeded
- zipped desktop artifacts for any packaged desktop target

Each built target also gets its own `BUILD-INFO.json`.

## Current wrapper strategy

The desktop path is intentionally thin.

- The source gameplay runtime is still `index-a.html` + `src/`
- The build copies that into an Electron shell
- The artifact entrypoint is normalized to `index.html`

That means the `.app` and `.exe` are wrappers around the same web game, not separate runtime implementations.

## What works today

This machine can build:

- a shareable web artifact
- a macOS Electron app bundle plus ZIP
- a Windows Electron app folder with `.exe` entrypoint plus ZIP

This is enough for playtest packaging. The Windows output is already useful as a portable playtest build even though it is not an installer yet.

## What this does not solve yet

- code signing
- notarization
- Windows installer generation
- Steam packaging
- auto-update

Those are later concerns. This pipeline is for making dated, traceable playtest builds now.

## Practical next step for Windows

For now, treat the Windows target as a zipped app folder with a real `.exe` entrypoint.

That is enough to hand to testers. If you later want a friendlier installer, add an installer layer or CI-backed packaging step on top of this build flow instead of replacing it.
