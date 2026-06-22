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

What the Deck target needs that the web build does not:

- a native-ish Linux desktop package, not just `index.html`;
- embedded local authority for ordinary local play;
- no dependency on a dev server, localhost browser tab, or Mac-side Node process;
- a launchable executable or shell script that Steam can add as a non-Steam game;
- controller-first input and handheld-legible HUD;
- a 1280x800 / 16:10 check, because the Deck is not the current fixed 16:9 authoring window;
- suspend/resume testing from Gaming Mode.

The current pipeline builds `Last Singularity-linux-x64`, copies it over SSH to a
Tailscale-visible Deck, writes `run-last-singularity.sh`, and leaves Steam
library registration as the manual Deck-side step.

Tailscale expectation:

- the Deck is on the tailnet;
- SSH is available over the tailnet, either through Tailscale SSH or normal SSH
  bound to the Tailscale address;
- `LBH_DECK_HOST` is a MagicDNS name or Tailscale IP.

This is intentionally local-test only. GitHub-hosted runners cannot reach
Greg's personal Steam Deck tailnet.

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

