# Steam Deck Tailscale Deploy Setup

Goal: let Codex push a fresh Linux desktop build to the Steam Deck over
Tailscale with one repeatable command.

The intended destination is:

```text
/home/deck/Games/last-singularity
```

The deploy command copies the built `Last Singularity-linux-x64` folder there
and writes a `run-last-singularity.sh` launcher plus desktop entries.

## Current Mac State

On GregBot, Tailscale is installed as the macOS app rather than as a shell
command on `PATH`.

Use this CLI directly when needed:

```sh
/Applications/Tailscale.app/Contents/MacOS/Tailscale status
```

Current observed tailnet:

```text
tail1ac9cf.ts.net
```

Current observed Mac Tailscale node:

```text
gregbot.tail1ac9cf.ts.net
100.121.150.32
```

Current observed Steam Deck target:

```text
steamdeck.tail1ac9cf.ts.net
100.77.19.24
```

## One-Time Deck Setup

Do this on the Steam Deck in Desktop Mode, using Konsole.

Tailscale has a Steam Deck specific install path because SteamOS is not a
normal mutable Linux distro. Use the official Deck installer repo:

```sh
git clone https://github.com/tailscale-dev/deck-tailscale.git ~/deck-tailscale
sudo -i
cd ~deck/deck-tailscale
bash tailscale.sh
source /etc/profile.d/tailscale.sh
tailscale up --qr --operator=deck --ssh
```

Scan the QR code and authenticate the Deck into the same tailnet as GregBot.

Recommended node name in the Tailscale admin UI:

```text
steamdeck
```

The `--ssh` flag advertises Tailscale SSH from the Deck. If Tailscale SSH is
blocked by ACL policy, use the Deck's normal OpenSSH server instead, but keep
the traffic on the Tailscale IP/MagicDNS name.

## Mac-Side Preflight

After the Deck is enrolled, run:

```sh
npm run deck:preflight
```

If auto-discovery does not find it, pass the MagicDNS name or Tailscale IP:

```sh
npm run deck:preflight -- --host=steamdeck.tail1ac9cf.ts.net
npm run deck:preflight -- --host=100.x.y.z
```

To create the deploy folder during the SSH check:

```sh
npm run deck:preflight -- --host=steamdeck.tail1ac9cf.ts.net --prepare
```

The preflight checks:

- Tailscale CLI availability;
- visible tailnet peers;
- candidate Deck hostnames;
- MagicDNS or IP resolution;
- `tailscale ping`;
- SSH as `deck`;
- remote destination readiness.

It does not build or copy the game.

## Push A Build

Once preflight reports a ready target:

```sh
LBH_DECK_HOST=steamdeck.tail1ac9cf.ts.net npm run deploy:deck
```

Useful variants:

```sh
npm run deploy:deck -- --host=steamdeck.tail1ac9cf.ts.net --no-build
npm run deploy:deck -- --host=steamdeck.tail1ac9cf.ts.net --dry-run
npm run deploy:deck -- --host=steamdeck.tail1ac9cf.ts.net --dir=/home/deck/Games/last-singularity
```

`deploy:deck` now checks SSH reachability before building, then uses `rsync`
over SSH to mirror the Linux package onto the Deck. The installed launcher sets
`LBH_DECK=1`, so the packaged shell opens as a 1280x800 fullscreen Deck build
while the game keeps its 16:9 internal playfield.

The Deck launcher also applies the current SteamOS Electron profile:

```text
--disable-gpu-sandbox
--ignore-gpu-blocklist
--ozone-platform=x11
--enable-logging=stderr
```

Logs are written on the Deck here:

```text
/home/deck/.local/state/last-singularity/deck-launch.log
/home/deck/.local/state/last-singularity/electron.log
```

Previous runs are kept as:

```text
/home/deck/.local/state/last-singularity/deck-launch.previous.log
/home/deck/.local/state/last-singularity/electron.previous.log
```

## Add To Steam Once

After the first successful copy, do this on the Deck in Desktop Mode:

1. Open Steam.
2. Use **Games -> Add a Non-Steam Game to My Library**.
3. Browse to either:

```text
/home/deck/Games/last-singularity/run-last-singularity.sh
/home/deck/Games/last-singularity/last-singularity.desktop
```

4. Add it.
5. Return to Gaming Mode and launch it from the normal Deck surface.

Future Codex deploys should overwrite the files in place, so the Steam library
entry should keep working.

Do not add the raw `Last Singularity` executable. Add the wrapper script so the
Deck profile, embedded-stack logging, and future launch fixes all stay under
our control.

If the app crashes or opens Stack Status, pull the latest log over Tailscale:

```sh
ssh deck@steamdeck.tail1ac9cf.ts.net 'tail -200 ~/.local/state/last-singularity/deck-launch.log'
```

The healthy startup pattern includes lines like:

```text
[embedded:control] ... "event":"runtime.started"
[embedded:sim] ... "event":"runtime.started"
[embedded:control] ... "event":"sim.registered"
```

## If SSH Fails

First confirm the Deck is visible:

```sh
/Applications/Tailscale.app/Contents/MacOS/Tailscale status
/Applications/Tailscale.app/Contents/MacOS/Tailscale ping steamdeck.tail1ac9cf.ts.net
```

Then try:

```sh
ssh deck@steamdeck.tail1ac9cf.ts.net
```

If the node is visible but SSH is denied, check one of these:

- Tailscale SSH was not enabled on the Deck;
- tailnet ACLs do not allow SSH to the Deck;
- the Deck user is not `deck`;
- normal OpenSSH is being used and the Mac does not have an authorized key.

## Why This Shape

This keeps the Deck deploy lane local and private. GitHub-hosted runners should
not be expected to reach Greg's personal tailnet or Deck. Codex running on
GregBot can push the build because GregBot is already a tailnet node and has
normal `ssh` and `rsync` available.
