# Build Pipeline

`Last Singularity` now has a first-pass artifact pipeline.

The rule is simple:

- one gameplay source of truth: the web runtime
- one build command: `npm run build`
- one default release-push command for real build handoffs: `npm run release:internal`
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
- `npm run build:drop` — build only the static Cloudflare Drop share artifact
- `npm run build:ipad` — build only the Safari/Add-to-Home-Screen iPad web-app artifact
- `npm run build:desktop` — build web + desktop/mobile wrapper targets
- `npm run release:drop` — build a committed-source Cloudflare Drop artifact for temporary public sharing
- `npm run ios:sync` — sync the current web runtime into the native iOS wrapper
- `npm run ios:build:sim` — sync and build the native iOS wrapper for iPad Simulator
- `npm run ios:build:device` — sync and build the native iOS wrapper for signed devices
- `npm run deploy:deck` — build/copy the Linux package to a Tailscale-visible Steam Deck
- `scripts/install-steam-deck.sh` — public Deck installer that downloads the Linux weekly release asset
- `npm run deploy:itch` — stage an itch HTML5 artifact and push it with butler
- `npm run deploy:steam` — prepare SteamPipe content and VDF scripts
- `npm run release:bump` — legacy alias for `release:public`
- `npm run release:build` — run the fast gate, build every release target
  (`web,ipad,mac,win,linux`), package weekly assets, and verify outputs for
  `<major>.<minor>.<public>.<current-commit-hash>`
- `npm run release:internal` — alias for `release:build`; internal handoffs use
  the commit hash as the fourth version field
- `npm run release:public` — increment the public patch on the active train; commit that
  bump, then run `npm run release:build`
- `npm run release:patch` — legacy alias for `release:public`
- `npm run release:check` — verify the current four-field hash version has a
  complete all-target release build
- `npm run release:prepush` — same shape as the tracked pre-push hook: public
  version must not be behind upstream and the current hash-named all-target
  build must exist
- `npm run release:status` — print the current public train, hash build version,
  and whether the matching all-target release artifact already exists
- `git push origin main` — the tracked hook automatically skips release
  preparation when the complete pushed range is recognized docs, tests, or
  process-only; runtime/build/content changes still require the release build

`npm run build` currently defaults to `release` mode.

## Version Policy

LBH uses a four-field product build identifier:

```text
major.minor.public.commit
```

On the v0.3 integration branch, builds look like `0.3.0.<git-hash>`. The v0.2
public/demo line on `main` keeps its own `0.2.2.<git-hash>` identity until Greg
promotes a version.

- The first two fields identify the product era Greg has called for that branch.
- The third number is the public release train. It advances only when Greg calls
  a public release bump.
- The fourth field is the short git commit hash. Internal handoffs chew up this
  field automatically.
- Large decisive train moves remain Greg's call only.

`package.json.version` stores only the three-field public train because a
committed file cannot contain its own future commit hash. Build, deploy, and
release scripts compute the full `<public-version>.<hash>` version at build time from the
committed `HEAD`.

Release builds must therefore be made from committed tracked source. If the
tree is dirty, `npm run release:build` refuses to produce a hash-named artifact
unless `LBH_ALLOW_DIRTY_BUILD=1` is set for an explicit local probe.

The tracked `.githooks/post-commit` hook runs `npm run release:status -- --brief`
after each commit when hooks are installed. It is a reminder, not a build step:
ordinary development commits stay quick, while handoff/push commits still need
`npm run release:internal` before the pre-push guard will pass.

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
- `BUILD-INFO-drop.json` if the Cloudflare Drop target succeeded
- `BUILD-INFO-ipad.json` if the iPad web-app target succeeded
- `BUILD-INFO-mac.json` if mac packaging succeeded
- `BUILD-INFO-win.json` if Windows packaging succeeded
- `BUILD-INFO-linux.json` if Linux packaging succeeded
- `last-singularity-web/`
- `last-singularity-cloudflare-drop/` if the Cloudflare Drop target succeeded
- `last-singularity-ipad-webapp/` if the iPad web-app target succeeded
- `Last Singularity.app` if mac packaging succeeded
- `Last Singularity-win32-x64/` if Windows packaging succeeded
- `Last Singularity-linux-x64/` if Linux packaging succeeded

`release` keeps the clean `v<version>` folder because that is the friend-facing artifact. `test` and `dev` get a mode suffix so they do not overwrite the release build.

The build date now lives inside the manifest and build info files instead of the folder name. The selected runtime mode is recorded in the manifest and per-target build info files.

### Historical playable retention

`builds/` is repo-local and gitignored, but its designated release packages are
not all disposable. When a newer major/minor version replaces the current
public line, preserve one final known-good release folder and matching
`last-singularity-playtest-v<version>.zip` for the displaced version. Preserve
the same artifacts on the corresponding GitHub Release so the playable does
not depend on one machine.

Do not reuse that version folder, rename it to the incoming version, or delete
it during build cleanup. Record its source SHA, build identity, manifest and
archive SHA-256, GitHub Release URL, and Deck location in
`docs/project/BUILD-STATUS.md`. Failed builds, mode-suffixed test/dev builds,
and intermediate RCs may still be pruned normally.

Publish the final build under an immutable GitHub Release tag, then add its
version-isolated installer commands to `docs/public/OLD-VERSIONS.md`. The
public README links that archive. Confirm the old-version command resolves,
verifies the release checksum, and uses a distinct name/slug before promotion;
`nightly-latest` remains the moving current channel and is never an archival
identity.

### Rolling latest playtest

The `Latest Playtest` GitHub Action is the public convenience channel. Each
Monday, or on a manual dispatch, it compares `main` with the commit named by
the mutable `nightly-latest` tag. A changed source runs the deterministic,
non-browser fast release-contract suites, builds web, iPad, macOS, Windows, and
Linux/Steam Deck playables, then replaces that rolling release's assets.

The release is self-describing: it carries `SOURCE.json`,
`BUILD-MANIFEST.json`, `SHA256SUMS`, the installer/helper scripts, and all five
platform archives. The publish job verifies every required remote asset, its
GitHub SHA-256 digest, and the final tag/source match. Browser/playable RC
evidence remains a version-candidate gate rather than a flaky prerequisite for
the weekly convenience build.

`nightly-latest` is intentionally mutable and is never an archive. Before a
public version line is displaced, preserve one known-good build under a new
immutable release tag and add its isolated one-click commands to
[`OLD-VERSIONS.md`](../public/OLD-VERSIONS.md).

One planned use is a chronological build-history timelapse showing the real
game at each public version. The historical package therefore needs to remain
launchable on its own; preserve its launch instructions and any runtime flags
or compatibility notes needed to capture it later. Do not block promotion on
recording footage. The future media pass consumes the retained builds.

Before cutting a serious internal playtest build, commit the source, then use:

```sh
npm run release:internal
```

That performs the current all-target release build and names the artifact with
the current commit hash. If you only need to rebuild artifacts for the same
commit, use:

```sh
npm run release:build
```

For a public release bump, use:

```sh
npm run release:public
git add package.json package-lock.json
git commit -m "L6: bump public release train"
npm run release:build
```

If you are only pushing docs/process cleanup with no new build handoff, skip the
guard explicitly instead of manufacturing a new patch:

```sh
git push origin main
```

The underlying lightweight verification lane should be green:

- `npm test`
- `npm run test:telemetry`
- `npm run test:renderer`
- `node scripts/build-health.cjs status`

The release helper currently runs `npm run test:fast` before packaging because
it is meant to be usable during active development. A public milestone should
still refresh full build health before it is announced.

The telemetry smoke suite lives in the authority lane rather than the everyday
core lane. Keep `npm run test:telemetry` or the authority lane around when
diagnosing stack-status and embedded-runtime regressions without rerunning the
whole harness.

Alongside the version folder, the build also writes:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/last-singularity-playtest-v<version>.zip`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/last-singularity-playtest-v<version>-test.zip`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/last-singularity-playtest-v<version>-dev.zip`
- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/last-singularity-cloudflare-drop-v<version>.zip` when the Drop target is built

Each zip contains the whole matching build folder. In practice, the friend-facing handoff should almost always be the plain `release` zip with no mode suffix.

The Cloudflare Drop zip is the exception: it is content-rooted so `index.html`
is at the archive root. That is the safer shape for dragging the zip directly
onto Cloudflare Drop or Cloudflare Pages drag-and-drop upload surfaces.

## Current wrapper strategy

The desktop path is intentionally thin.

- The source gameplay runtime is still `index-a.html` + `src/`
- The build copies that into an Electron shell
- The artifact entrypoint is normalized to `index.html`

That means the `.app` and `.exe` are wrappers around the same web game, not separate runtime implementations.

Packaged desktop and Deck builds do not load renderer modules directly from raw
`file://...app.asar` paths anymore. Electron serves the bundled renderer through
the app-owned `lbh://` protocol so ES modules, JSON manifests, and static assets
arrive with browser-correct MIME types. The build must also copy the complete
`node_modules/three/build/` directory because current Three.js split modules load
files such as `three.core.js` beside `three.module.js`.

## Remote-authority note

The build story now splits cleanly by target.

- web builds are still plain rendering clients
- Cloudflare Drop builds are browser-sandbox share links with no embedded authority
- packaged desktop builds now embed the control plane + sim for ordinary local packaged play
- remote-authority play remains a separate mode and still expects a browser client to point at an external sim authority
- packaged desktop builds also expose a small in-app stack-status window so embedded authority state is visible without a terminal
- Steam Deck uses the same self-contained desktop package shape: renderer,
  control plane, and sim all run on the Deck, with the renderer talking to the
  embedded sim over `127.0.0.1`

So the honest rule is:

- **desktop package** = self-contained local playtest app
- **Steam Deck package** = self-contained Linux desktop package plus Deck launcher/Gaming Mode wrapper
- **Cloudflare Drop package** = temporary static sandbox link for quick public sharing
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

There are now two iPad paths, with a native Metal bench rung planned:

- `npm run build:ipad` creates a local-install web app bundle meant for:
  - serving over HTTP
  - opening in Safari on iPad
  - using "Add to Home Screen"
  - playing with a controller and no touch-first UI assumptions
- `npm run ios:build:sim` builds a native `WKWebView` wrapper around the same
  synced web runtime for simulator testing.

The iPad lane is a native Apple-platform bench, not only an install convenience
target. The current native wrapper is not a gameplay rewrite and does not embed
the Node authority stack. It runs self-contained only in sandbox mode, or it can
point at an external sim server with `--sim-server=http://HOST:8787`. Its job is
to get SwiftUI lifecycle, signing, orientation, controller, audio/WebKit, and
hardware launch behavior under test before a future Metal snapshot renderer
probe.

Physical iPad deployment still needs Xcode signing, an Apple Developer Team, and
a provisioning profile. See [iPad / iOS Build Path](IPAD-IOS-BUILD.md).

## Practical next step for Windows

For now, treat the Windows target as an app folder with a real `.exe` entrypoint inside the combined playtest zip.

That is enough to hand to testers. If you later want a friendlier installer, add an installer layer or CI-backed packaging step on top of this build flow instead of replacing it.
