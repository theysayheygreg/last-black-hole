# Steam Deck Runbook

This is the operational runbook for getting Last Singularity onto a Steam Deck,
launching it the way SteamOS expects, and diagnosing the failures we have
already seen.

Current position: the Deck build is the Linux Electron desktop package with the
embedded control plane and sim. Desktop Mode is useful for install and triage.
Gaming Mode through Steam is the real playtest target.

Do not treat Desktop Mode as the controller acceptance surface. Steam Input can
keep the built-in controls on the Desktop layout for non-Steam apps there, which
means buttons such as `L1`/`R1` may trigger desktop/browser actions instead of
LBH tab navigation. If the title screen paints in Desktop Mode, that proves the
package boots; controller playability must be checked from Gaming Mode.

The Deck build is intentionally self-contained. The renderer is packaged inside
the Electron app and loaded through the app-owned `lbh://` protocol so local JS,
JSON, Three.js, and asset files get browser-correct MIME types. Electron then
starts the control plane and sim as child processes on dynamic `127.0.0.1`
ports. A `simServer=http://127.0.0.1:<port>` URL is local IPC over loopback, not
a network-streamed renderer.

## Public Tester Install

Use this when someone has a Steam Deck and should install the latest public
weekly build without cloning the repo.

On the Deck in Desktop Mode:

1. Open a browser to this repo.
2. Open Konsole.
3. Run:

```sh
curl -fsSL https://raw.githubusercontent.com/theysayheygreg/last-black-hole/main/scripts/install-steam-deck.sh | bash
```

The installer downloads:

```text
https://github.com/theysayheygreg/last-black-hole/releases/download/nightly-latest/last-singularity-linux-nightly.zip
```

The release tag and zip filename still say `nightly` for stable public URLs.
Treat them as compatibility names for the current weekly playtest build.

It installs the game to:

```text
~/Games/last-singularity
```

It creates Desktop Mode launchers at:

```text
~/Games/last-singularity/run-last-singularity.sh
~/Games/last-singularity/last-singularity.desktop
~/.local/share/applications/last-singularity.desktop
~/Desktop/Last Singularity.desktop
```

It also closes Steam if needed, backs up `shortcuts.vdf`, and adds **Last
Singularity** as a non-Steam shortcut so it appears in Gaming Mode.

After the installer finishes, restart Steam or return to Gaming Mode and launch
**Last Singularity** from **Library -> Non-Steam**.

First launch flow on Deck:

1. Launch **Last Singularity** from Gaming Mode when possible. Desktop Mode is
   for install and triage.
2. Press `A` on the title screen.
3. Choose a pilot slot. Empty slots ask for a pilot name; use the on-screen
   keyboard or a paired keyboard, then press `Enter`.
4. Use `L1/R1` to switch home tabs, choose `LAUNCH`, and press `A`.
5. Choose a destination and press `A` again to start the run.
6. Use the left stick to aim, `R2` to thrust, `L2` to brake, `Y` to
   engage/release slingshot anchors, `X` for pulse, and D-pad left/right for
   consumables.
7. Loot wrecks, preserve delta-v, follow wormhole arrows, and extract before
   portals expire or the universe collapses.

### Public Installer Overrides

Use a specific release/tag:

```sh
LBH_RELEASE_TAG=v0.2.0 curl -fsSL https://raw.githubusercontent.com/theysayheygreg/last-black-hole/main/scripts/install-steam-deck.sh | bash
```

Use a specific zip URL:

```sh
LBH_DECK_BUILD_URL=https://example.com/last-singularity-linux.zip \
  bash scripts/install-steam-deck.sh
```

Skip Steam library registration and install only the Desktop Mode launcher:

```sh
LBH_SKIP_STEAM_SHORTCUT=1 curl -fsSL https://raw.githubusercontent.com/theysayheygreg/last-black-hole/main/scripts/install-steam-deck.sh | bash
```

If a Deck has multiple Steam users and the shortcut lands under the wrong user,
rerun with:

```sh
LBH_STEAM_USER_ID=<steam-userdata-id> \
  curl -fsSL https://raw.githubusercontent.com/theysayheygreg/last-black-hole/main/scripts/install-steam-deck.sh | bash
```

## Private Codex Deploy To Greg's Deck

Use this when Codex is pushing a local build to Greg's Deck over Tailscale.

Preflight:

```sh
npm run deck:preflight -- --host=steamdeck
```

Deploy or redeploy the current local build:

```sh
LBH_DECK_HOST=steamdeck npm run deploy:deck
```

Register the wrapper in Gaming Mode:

```sh
LBH_DECK_HOST=steamdeck npm run deck:gaming-mode -- --shutdown-steam
```

Dry-run the Steam shortcut registration:

```sh
npm run deck:gaming-mode -- --host=steamdeck --dry-run
```

When the active Steam account is ambiguous, write the shortcut to every Steam
userdata directory on the Deck:

```sh
LBH_DECK_HOST=steamdeck npm run deck:gaming-mode -- --shutdown-steam --all-users
```

This directly updates each `userdata/<id>/config/shortcuts.vdf` with a **Last
Singularity** non-Steam entry pointed at
`~/Games/last-singularity/run-last-singularity.sh`. Steam must be closed while
the file is written, then restarted or returned to Gaming Mode so the library
reloads.

## What The Deck Launcher Does

Always launch through:

```text
~/Games/last-singularity/run-last-singularity.sh
```

Do not add or launch the raw `Last Singularity` executable. The wrapper sets the
Deck runtime profile:

```text
LBH_DECK=1
ELECTRON_ENABLE_LOGGING=1
ELECTRON_LOG_FILE=~/.local/state/last-singularity/electron.log
--no-sandbox
--disable-gpu-sandbox
--ignore-gpu-blocklist
--ozone-platform=x11
--enable-logging=stderr
```

Those flags are not decorative. They came from actual Deck failures:

- missing Deck profile -> wrong window/fullscreen behavior;
- missing GPU flags -> `GPU process isn't usable. Goodbye.`;
- missing XWayland selection -> Wayland/Vulkan compatibility warnings;
- missing logs -> no useful remote triage when the app falls into Stack Status.
- raw `file://...app.asar` renderer loading -> module/MIME failures that showed
  up as a black screen.

## Logs

Current run:

```text
~/.local/state/last-singularity/deck-launch.log
~/.local/state/last-singularity/electron.log
```

Previous run:

```text
~/.local/state/last-singularity/deck-launch.previous.log
~/.local/state/last-singularity/electron.previous.log
```

Healthy embedded startup includes:

```text
[electron-main] renderer.protocol.registered {"scheme":"lbh"}
[embedded:control] ... "event":"runtime.started"
[embedded:sim] ... "event":"runtime.started"
[embedded:control] ... "event":"sim.registered"
[electron-main] embedded.ready ...
[LBH boot] webgl2.ready ...
[LBH boot] init.completed ...
```

## Acceptance Checklist

Before calling a Deck build bulletproof, verify all of this from Gaming Mode:

- **Library launch:** the game starts from Steam's Gaming Mode library, not only
  from Desktop Mode.
- **Single instance:** launching twice focuses the existing game instead of
  starting two embedded stacks.
- **Embedded authority:** the Stack Status screen reports embedded control plane
  and sim as online.
- **Local renderer contract:** `deck-launch.log` shows `lbh://` renderer asset
  loading and a `simServer=http://127.0.0.1:<port>` URL, with no Mac-side sim
  dependency.
- **No coredump:** `coredumpctl` shows no fresh `Last Singularity` crash after
  launch and a short play session.
- **Controller path:** controller can reach title, map select, flight, brake,
  slingshot, inventory, pause, extraction, death/results, and quit.
- **Text entry:** profile/name flows do not require a physical keyboard.
- **Legibility:** HUD text is readable at 1280x800 handheld distance.
- **Suspend/resume:** suspend during a run, resume, continue, and quit without
  corrupting the run or profile.
- **Logs:** `deck-launch.log` and `electron.log` exist after the session.

## Triage Playbook

### App Opens Stack Status

Check:

```sh
tail -200 ~/.local/state/last-singularity/deck-launch.log
```

If logs show `MODULE_NOT_FOUND` under `resources/app.asar/server`, the desktop
package is missing a CJS runtime dependency. Fix `DESKTOP_SERVER_SCRIPTS` in
`scripts/build.cjs` and add/extend `tests/desktop-package.cjs`.

### App Opens A Black Window

First check whether the renderer failed before WebGL or whether Chromium never
painted:

```sh
tail -240 ~/.local/state/last-singularity/deck-launch.log
tail -240 ~/.local/state/last-singularity/electron.log
```

If the log shows `renderer.protocol.miss`, the packaged renderer is missing a
local file. For Three.js failures, confirm the desktop build copied the whole
`node_modules/three/build/` directory, not only `three.module.js`. If the log
shows `Failed to load src/main.js`, the app-owned protocol or MIME mapping is
broken and `tests/desktop-package.cjs` should grow a guard for it.

If the diagnostic page is needed, launch from Desktop Mode with:

```sh
LBH_DECK_DIAGNOSTIC=1 ~/Games/last-singularity/run-last-singularity.sh
```

If the diagnostic page paints but the game does not, Electron/window creation is
working and the failure is in renderer asset loading or WebGL boot.

### App Crashes Immediately

Check:

```sh
coredumpctl --since "10 minutes ago"
tail -200 ~/.local/state/last-singularity/electron.log
tail -200 ~/.local/state/last-singularity/deck-launch.log
```

If logs show `GPU process isn't usable`, confirm the wrapper still includes:

```text
--disable-gpu-sandbox
--ignore-gpu-blocklist
--ozone-platform=x11
```

For emergency diagnosis only:

```sh
LBH_DECK_DISABLE_GPU=1 ~/Games/last-singularity/run-last-singularity.sh
```

### Gaming Mode Entry Is Missing

Restart Steam or return to Gaming Mode. Steam only reloads `shortcuts.vdf` on
startup, and the entry appears under **Library -> Non-Steam**.

If it is still missing, rerun:

```sh
curl -fsSL https://raw.githubusercontent.com/theysayheygreg/last-black-hole/main/scripts/install-steam-deck.sh | bash
```

or, for Greg's private Deck:

```sh
LBH_DECK_HOST=steamdeck npm run deck:gaming-mode -- --shutdown-steam --all-users
```

If the Deck is offline or asleep, both SSH and Tailscale ping will time out and
Codex cannot inspect or rewrite the shortcut until the device wakes.

### Restore A Steam Shortcut Backup

Backups are written next to `shortcuts.vdf`:

```text
~/.steam/steam/userdata/<id>/config/shortcuts.vdf.lbh-backup-YYYYMMDDHHMMSS
```

Close Steam, then restore:

```sh
cp ~/.steam/steam/userdata/<id>/config/shortcuts.vdf.lbh-backup-YYYYMMDDHHMMSS \
   ~/.steam/steam/userdata/<id>/config/shortcuts.vdf
```

Restart Steam afterward.

## Release Pipeline Contract

The public installer depends on the `nightly-latest` GitHub release attaching:

```text
last-singularity-linux-nightly.zip
```

That zip must contain:

```text
Last Singularity-linux-x64/Last Singularity
```

The weekly workflow builds the Linux Electron artifact, packages it with
`scripts/ci/package-nightly-assets.cjs`, and uploads it beside the web, Windows,
and macOS release zips. The workflow now runs weekly and skips scheduled builds
when the repository SHA has not changed since the last successful run.

If this contract changes, update all of these together:

- `scripts/install-steam-deck.sh`
- `.github/workflows/nightly-playables.yml`
- `docs/reference/STEAM-DECK-RUNBOOK.md`
- `README.md`
