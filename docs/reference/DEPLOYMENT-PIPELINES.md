# Deployment Pipelines

This is the current v0.2 deployment map for Last Singularity.

The key distinction: the existing web build is not automatically the right
artifact for every platform. Steam Deck, itch.io, and Steam all need different
wrappers around the same gameplay runtime.

## Current Source Build

The canonical runtime is still the web game:

- `index-a.html`
- `src/`
- WebGL2/Three/Composer rendering
- DOM HUD
- JavaScript sim fallback for sandbox mode
- Node authority stack for product local/remote mode

`npm run build:web` produces a web folder. That folder is useful, but it is
only one ingredient.

## Steam Deck Local Test

### Public Weekly Installer

For outside testers, the simplest Deck path is the one-command installer from
Desktop Mode / Konsole:

```sh
curl -fsSL https://raw.githubusercontent.com/theysayheygreg/last-black-hole/main/scripts/install-steam-deck.sh | bash
```

That script downloads the Linux weekly asset from the `nightly-latest` GitHub
release:

```text
last-singularity-linux-nightly.zip
```

The tag and filename remain `nightly` for stable installer URLs; the GitHub
workflow that refreshes them is weekly and skips if no commits changed.

It installs the app to `~/Games/last-singularity`, writes the Deck launcher and
Desktop Mode `.desktop` entries, backs up `shortcuts.vdf`, and adds a Steam
non-Steam shortcut for Gaming Mode. See the
[Steam Deck runbook](STEAM-DECK-RUNBOOK.md) for the full install, triage, and
acceptance checklist.

The install script supports overrides for private builds:

```sh
LBH_DECK_BUILD_URL=https://example.com/last-singularity-linux.zip bash scripts/install-steam-deck.sh
LBH_SKIP_STEAM_SHORTCUT=1 curl -fsSL https://raw.githubusercontent.com/theysayheygreg/last-black-hole/main/scripts/install-steam-deck.sh | bash
```

### Greg/Codex Tailscale Deploy

Command:

```sh
LBH_DECK_HOST=steamdeck npm run deploy:deck
```

Useful options:

```sh
npm run deploy:deck -- --host=100.x.y.z --user=deck --dir=/home/deck/Games/last-singularity
npm run deploy:deck -- --no-build
npm run deploy:deck -- --dry-run
```

Gaming Mode library registration:

```sh
LBH_DECK_HOST=steamdeck npm run deck:gaming-mode -- --shutdown-steam --all-users
```

Useful options:

```sh
npm run deck:gaming-mode -- --host=100.x.y.z --user=deck
npm run deck:gaming-mode -- --host=steamdeck --dry-run
npm run deck:gaming-mode -- --host=steamdeck --steam-user-id=<id>
npm run deck:gaming-mode -- --host=steamdeck --shutdown-steam --all-users
```

What the Deck target needs that the web build does not:

- a native-ish Linux desktop package, not just `index.html`;
- embedded local authority for ordinary local play;
- no dependency on a dev server, localhost browser tab, or Mac-side Node process;
- a launchable executable or shell script that Steam can add as a non-Steam game;
- controller-first input and handheld-legible HUD;
- a 1280x800 / 16:10 check, because the Deck is not the current fixed 16:9 authoring window;
- suspend/resume testing from Gaming Mode.

The current pipeline builds `Last Singularity-linux-x64`, copies it over SSH to a
Tailscale-visible Deck, writes `run-last-singularity.sh`, and can register that
wrapper as a Steam non-Steam shortcut for Gaming Mode.

The running Deck app stays local to the Deck. Electron serves packaged renderer
assets through the app-owned `lbh://` protocol so modules, JSON manifests, and
the split Three.js runtime load with correct browser MIME types. It then starts
the embedded control plane and sim on dynamic `127.0.0.1` loopback ports and
passes that loopback `simServer` URL to the renderer. Tailscale/SSH is only how
Greg/Codex pushes a new build onto the device.

The Deck launcher sets `LBH_DECK=1`, which switches the packaged shell to a
1280x800 fullscreen window for handheld play while preserving the 16:9
playfield. It also applies the current SteamOS Electron profile:

- `--disable-gpu-sandbox`
- `--ignore-gpu-blocklist`
- `--ozone-platform=x11`
- `--enable-logging=stderr`

The GPU flags keep Chromium's hardware WebGL path alive on the Deck while
avoiding the `GPU process isn't usable` trap observed during the first launch
attempt. `--ozone-platform=x11` forces XWayland, which avoids the current
Wayland/Vulkan warning in SteamOS Desktop Mode and is closer to the XWayland
path most native Linux games use under gamescope.

If a black window appears, first inspect `deck-launch.log` for renderer protocol
or missing packaged-module errors before treating it as a SteamOS compositor
problem. The known fixed failure was `file://...app.asar` module loading plus an
incomplete copied Three runtime.

The launcher writes rolling logs on the Deck:

```text
/home/deck/.local/state/last-singularity/deck-launch.log
/home/deck/.local/state/last-singularity/deck-launch.previous.log
/home/deck/.local/state/last-singularity/electron.log
/home/deck/.local/state/last-singularity/electron.previous.log
```

For emergency diagnosis, set this before launching:

```sh
LBH_DECK_DISABLE_GPU=1 /home/deck/Games/last-singularity/run-last-singularity.sh
```

That adds `--disable-gpu`. It is a rescue path, not the default target.

The deploy also installs `.desktop` launchers so Desktop Mode can launch the
same deployed folder.

Run `npm run deck:preflight` before the first push. The current GregBot setup
uses the Tailscale macOS app CLI at
`/Applications/Tailscale.app/Contents/MacOS/Tailscale`; the Steam Deck itself
must still be enrolled in the tailnet before Codex can push builds to it. See
[Steam Deck Tailscale Deploy Setup](STEAM-DECK-TAILSCALE.md).

Tailscale expectation:

- the Deck is on the tailnet;
- SSH is available over the tailnet, either through Tailscale SSH or normal SSH
  bound to the Tailscale address;
- `LBH_DECK_HOST` is a MagicDNS name or Tailscale IP.

The Tailscale deploy path is intentionally local-test only. GitHub-hosted
runners cannot reach Greg's personal Steam Deck tailnet. Public testers should
use the release-backed installer above.

### Gaming Mode Status

The private deploy folder is now the right shape for SteamOS, and Codex can add
the Steam library entry directly over Tailscale:

```sh
LBH_DECK_HOST=steamdeck npm run deck:gaming-mode -- --shutdown-steam
```

The script:

- verifies the wrapper exists at `/home/deck/Games/last-singularity/run-last-singularity.sh`;
- refuses to write while Steam is running unless `--shutdown-steam` is passed;
- backs up `shortcuts.vdf` with a timestamped `.lbh-backup-*` suffix;
- inserts or updates exactly one **Last Singularity** non-Steam shortcut;
- points Steam at the wrapper, not the raw Electron binary.

After the script runs, restart Steam or return to Gaming Mode so Steam reloads
the library entry. If the shortcut does not appear, write with `--all-users` so
every `userdata/<id>/config/shortcuts.vdf` gets the same entry; the active
Gaming Mode account is sometimes not obvious from SSH.

Manual fallback:

1. Boot the Deck into Desktop Mode.
2. Open Steam.
3. Use **Games -> Add a Non-Steam Game to My Library**.
4. Add this wrapper, not the raw Electron binary:

```text
/home/deck/Games/last-singularity/run-last-singularity.sh
```

5. Return to Gaming Mode and launch **Last Singularity** from the normal Deck
   library.

Future Codex deploys overwrite files in place, so the Steam library entry should
continue pointing at the latest build.

Do not edit `shortcuts.vdf` while Steam is running. Use `deck:gaming-mode` so
the backup, Steam-closed check, and idempotent entry update happen together.

Desktop Mode is not the input acceptance surface. Steam Input can keep the
Deck's built-in controls on the Desktop layout there, so `L1`/`R1` may not
behave like LBH tab buttons until the game launches from Gaming Mode.

Valve's official Devkit Client is the more formal future path. It pairs a dev PC
with the Deck, uploads a local build with rsync-over-SSH, and creates a
`Devkit Game: ...` library entry with a configured start command:

- [How to load and run games on Steam Deck and Steam Machine](https://partner.steamgames.com/doc/steamhardware/loadgames)

### Current Acceptance Bar

Before calling a Deck build playable, confirm:

- it launches from Gaming Mode through Steam, not only Desktop Mode;
- the wrapper starts one Electron instance, one embedded control plane, and one
  embedded sim;
- `~/.local/state/last-singularity/deck-launch.log` shows embedded
  `runtime.started` lines;
- the renderer URL is `lbh://renderer/index.html?...` and the `simServer`
  parameter points at `http://127.0.0.1:<port>`;
- `/health` for both embedded services returns `ok: true`;
- no new `Last Singularity` coredump appears after launch;
- controller can reach every menu and gameplay command;
- text entry works without a physical keyboard;
- HUD text remains legible at 1280x800;
- suspend/resume does not corrupt the local session or save files.

## itch.io

Command:

```sh
LBH_ITCH_TARGET=theysayheygreg/last-singularity npm run deploy:itch
```

Preview without uploading:

```sh
LBH_ITCH_TARGET=theysayheygreg/last-singularity npm run deploy:itch -- --dry-run
LBH_ITCH_TARGET=theysayheygreg/last-singularity npm run deploy:itch:preview
```

What itch needs that the generic web build does not:

- a self-contained HTML5 artifact if the page is playable in browser;
- no expectation that itch.io can run the Node control plane or sim process;
- relative assets and an `index.html` entry point;
- an itch channel such as `html5-private`, `html5-beta`, `linux-beta`, or
  `windows-beta`;
- page settings changed in itch's dashboard to mark the upload as HTML5 /
  playable in browser after the first push.

The script stages a dedicated artifact under:

```text
dist/deploy/itch/v<version>/html5/
```

That staged artifact starts from `npm run build:web`, then injects a tiny
bootstrap before `src/main.js` loads:

- `localSandbox=1` is forced into the URL;
- remembered sim URLs are cleared;
- the page cannot accidentally depend on a local authority server.

That is the right shape for itch HTML5 playtests. For a more product-faithful
itch storefront build, use downloadable desktop channels instead:

- `linux-beta` from `Last Singularity-linux-x64`
- `windows-beta` from `Last Singularity-win32-x64`
- `mac-beta` from `Last Singularity.app`

Those downloadable channels preserve embedded local authority, but they are not
browser-playable.

## iPad / iOS

The iPad deployment story now has two lanes, with a third native bench rung
planned:

```sh
npm run build:ipad
npm run ios:build:sim
```

What iPad needs that the generic web build does not:

- a controller-first local install surface;
- landscape-only presentation;
- explicit sandbox vs remote-authority mode;
- a WebKit shell for simulator/device lifecycle checks;
- a future Metal snapshot-renderer probe for native Apple GPU learning;
- Apple signing before physical iPad deployment.

The Safari/Add-to-Home-Screen target remains the fastest local playtest lane.
The native iOS target is a thin `WKWebView` wrapper around a generated web
bundle under `ios/LastSingularity/WebApp/`. That bundle is generated by
`scripts/ios-wrapper.cjs` and should not be edited directly. The wrapper's job
is to put SwiftUI lifecycle, signing, orientation, resource loading, controller
behavior, audio/WebKit limits, and remote-authority launch behavior under test
before a later Metal renderer probe.

The native wrapper does not embed the Node authority stack. It launches with
`localSandbox=1` unless built with a remote sim URL:

```sh
npm run ios:build:sim -- --mode=release --sim-server=http://HOST:8787
```

For physical iPad builds, configure `ios/Config/Local.xcconfig` or pass signing
settings at build time:

```sh
npm run ios:build:device -- --mode=release --team=ABCDE12345
```

Current blockers:

- no Apple Team ID or provisioning profile is configured in the repo;
- real iPad controller/WebGL/audio behavior still needs hardware verification;
- TestFlight/App Store packaging is not implemented.
- Metal rendering is not implemented yet.

Full runbook: [iPad / iOS Build Path](IPAD-IOS-BUILD.md).

CI:

- `.github/workflows/deploy-itch.yml` is manual-only.
- It installs butler from itch's automation-friendly broth URL.
- It expects `BUTLER_API_KEY` as a GitHub secret.
- It expects `LBH_ITCH_TARGET` as a repository variable unless provided as a
  workflow input.

## Steam Early Access

Commands:

```sh
npm run deploy:steam
npm run deploy:steam:upload
```

The default `deploy:steam` command is safe: it builds/prepares SteamPipe content
and VDF scripts, but it does not upload.

What Steam needs that the web build does not:

- SteamPipe depot content, not a raw web folder;
- one or more platform depots with stable AppID/DepotID configuration;
- launch options configured in Steamworks for Linux, Windows, and macOS;
- Steam Input / controller review work before Steam Deck claims;
- a Coming Soon page, store checklist, build checklist, review, and Early Access
  questionnaire before public release;
- an honest Early Access state: no promises beyond what the current build can
  support.

The Steam script stages:

```text
dist/deploy/steam/v<version>/
  content/
    linux/
    windows/
    macos/
  scripts/
    app_build_<appid>.vdf
    depot_build_<platform>_<depotid>.vdf
  output/
  STEAMPIPE-MANIFEST.json
```

Required variables for real upload:

```sh
STEAM_APP_ID=...
STEAM_DEPOT_ID_LINUX=...
STEAM_DEPOT_ID_WINDOWS=...
STEAM_DEPOT_ID_MAC=...
STEAM_USERNAME=...
STEAMCMD_PATH=/path/to/steamcmd
```

Optional:

```sh
STEAM_SET_LIVE=internal-beta
STEAM_PASSWORD=...
STEAM_GUARD_CODE=...
```

Prefer preserving a SteamCMD login token on a private/self-hosted build machine
over putting Steam credentials into CI. `STEAM_SET_LIVE` should point at a beta
branch, not the default branch, until a release candidate is actually approved.

CI:

- `.github/workflows/steam-pipeline.yml` is manual-only.
- On GitHub-hosted runners it prepares and uploads a SteamPipe package artifact.
- Real upload should run on a trusted runner with the Steamworks SDK/SteamCMD
  already configured.

## What Should Change In The Build System Next

### Deck

The current Linux Electron package is good enough for first copy-and-launch
testing. Before calling it Deck-ready, the build should gain:

1. A Steam Deck profile or runtime flag that chooses 1280x800-safe layout.
2. A controller-only first-run smoke/playtest lane.
3. A launch artifact that is friendlier than a raw Electron folder.
4. Optional Proton fallback packaging from the Windows artifact.
5. A Deck capture checklist for performance, suspend/resume, and HUD legibility.

### itch

The current itch HTML5 lane is intentionally sandboxed. Before using itch as a
serious public storefront, choose one of two product positions:

1. **HTML5 demo/page:** keep the sandboxed browser build, design it as a demo,
   and make peace with it not being the authoritative product mode.
2. **Downloadable game:** push Linux/Windows/macOS desktop channels and use itch
   as a storefront/download host for the embedded-authority build.

The second option is more faithful to v0.2 architecture. The first option is
faster for public sharing.

### Steam

Steam should not ship the HTML5 artifact. Steam should ship desktop depots:

- Linux first for Steam Deck;
- Windows for mainstream desktop/Proton fallback;
- macOS if the wrapper remains healthy.

The next build-system work here is not code signing yet. It is productization:

- stable launch options;
- controller-action naming;
- Deck layout profile;
- save path sanity;
- crash/log collection;
- screenshots/trailer capture pipeline;
- store copy that matches the v0.2 public README and does not overpromise.
