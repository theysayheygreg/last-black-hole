# Deploy to Steam Deck

This is the simple private-testing path for `Last Singularity`.

You do **not** need the Steamworks SDK just to get the current build onto a Steam Deck.

## What to use

Use the Linux desktop target first:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/v0.2.0/Last Singularity-linux-x64`

That is the cleanest Deck path because Steam Deck is really a Linux machine.

The Windows build is still a valid fallback through Proton:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/v0.2.0/Last Singularity-win32-x64`

## Fastest install path

For public/nightly testers, the easiest path is the installer:

```sh
curl -fsSL https://raw.githubusercontent.com/theysayheygreg/last-black-hole/main/scripts/install-steam-deck.sh | bash
```

It downloads the latest Linux nightly, installs it under
`~/Games/last-singularity`, creates Desktop Mode launchers, and adds a Steam
non-Steam shortcut for Gaming Mode.

For manual local copying, the path is:

1. Boot the Deck into Desktop Mode.
2. Copy the Linux build folder onto the Deck.
3. Add the launcher wrapper as a non-Steam app.
4. Launch it from Steam and test controller behavior.

That is enough for private playtests.

## Copy options

### Option A: network copy

Best path if the Deck is on the same network:

- use `scp`, `rsync`, or an SMB share
- copy the whole `Last Singularity-linux-x64` folder to the Deck

This is the best future target for automation.

### Option B: USB drive or SD card

If you do not want to set up network copy:

- copy the folder to removable storage from the Mac
- plug that storage into the Deck
- move it into a normal user-accessible folder on the Deck

### Option C: Windows fallback

If the Linux build misbehaves, copy:

- `Last Singularity-win32-x64`

and add the `.exe` as a non-Steam app so Steam can run it with Proton.

## Add as a non-Steam app

On the Deck in Desktop Mode:

1. Open Steam.
2. Use **Games → Add a Non-Steam Game to My Library**.
3. Browse to the launcher wrapper inside the copied folder.
4. Add it.
5. Return to Gaming Mode if you want to test the normal Deck surface.

For the current automated deploy, the wrapper is:

```text
/home/deck/Games/last-singularity/run-last-singularity.sh
```

Do not add the raw `Last Singularity` executable. The wrapper owns the Deck
runtime flags and launch logs.

Valve's docs confirm that Deck supports installing external apps and adding them from Desktop Mode:

- [Steam Deck FAQ](https://partner.steamgames.com/doc/steamdeck/faq)

## Controller expectations

Before calling a Deck build good, verify:

- the game is fully playable on controller
- the HUD is legible at handheld distance
- fullscreen behavior is sane
- suspend/resume does not immediately break the session

For Steam release quality later, Steam Input and Deck compatibility matter more:

- [Getting your game ready for Steam Deck](https://partner.steamgames.com/doc/steamdeck/recommendations)
- [Steam Input](https://partner.steamgames.com/documentation/controller_templates)

## About plugging the Deck into a Mac

Do not assume a Steam Deck plugged into a Mac by USB-C will show up like an iPhone or a mounted app target.

For this project, the safe assumption is:

- USB connection alone is **not** the deployment model
- network copy or removable storage is the real path
- later, if you enable SSH on the Deck, scripted deploy becomes straightforward

## Automated local deploy

For public/nightly installs, use `scripts/install-steam-deck.sh` as described in
the [Steam Deck runbook](STEAM-DECK-RUNBOOK.md).

For Codex pushing a local build to Greg's Deck over Tailscale:

First check whether the Deck is visible and SSH-ready:

```sh
npm run deck:preflight
```

See [Steam Deck Tailscale Deploy Setup](STEAM-DECK-TAILSCALE.md) for the
one-time Deck enrollment and SSH setup.

The current local pipeline is:

```sh
LBH_DECK_HOST=steamdeck npm run deploy:deck
```

That command builds the Linux package, copies `Last Singularity-linux-x64` over
SSH to the Deck, and writes a `run-last-singularity.sh` launcher. The launcher
sets `LBH_DECK=1`, which makes the packaged Electron shell use the Deck profile:
1280x800 fullscreen with the normal 16:9 playfield letterboxed inside it.

After deploy, register the wrapper with Steam for Gaming Mode:

```sh
LBH_DECK_HOST=steamdeck npm run deck:gaming-mode -- --shutdown-steam
```

The Gaming Mode command backs up Steam's `shortcuts.vdf`, inserts or updates one
**Last Singularity** non-Steam entry, and points it at the wrapper. It refuses
to write while Steam is running unless `--shutdown-steam` is passed.

The deploy also writes launcher shortcuts to:

- `/home/deck/Games/last-singularity/last-singularity.desktop`
- `/home/deck/.local/share/applications/last-singularity.desktop`
- `/home/deck/Desktop/Last Singularity.desktop`

Use a Tailscale MagicDNS name or Tailscale IP:

```sh
npm run deploy:deck -- --host=100.x.y.z --user=deck --dir=/home/deck/Games/last-singularity
```

This is still a local-test pipeline, not a Steamworks deployment path. See
[Deployment Pipelines](DEPLOYMENT-PIPELINES.md) for the larger Deck/itch/Steam
split and the build-target deltas from the web runtime.
