# Last Singularity

**Last Singularity** is an ASCII extraction roguelike about piloting through the last surviving pockets of a collapsing universe.

You do not fly through empty space. You fly through spacetime as a hostile ocean: currents pull, gravity wells churn, stars become route anchors, and every confident burn spends the delta-v you may need to get home.

Drop into a dying universe, read the flow, loot the wreckage of civilizations that didn't make it out, and extract before the remaining portals evaporate - or before something notices the signal you've been throwing into the dark.

```text
DROP -> READ FLOW -> LOOT -> MANAGE SIGNAL -> EXTRACT OR DIE -> REPEAT
```

The entire game renders through a live ASCII fluid shader - the terminal look is the art direction, not a filter.

> Formerly developed under the repository name `last-black-hole`.

## Versions

**Now - v0.2.2.** The current playable line: full run loop (pilots, loadouts, drop, loot, extract, death), server-authoritative simulation even in local play, two hulls with distinct movement identities, gravity slingshots, AI rivals and scavengers, the signal/escalation system, and Steam Deck support. Public builds ship from this line.

**In development - v0.3 "Ballpark."** A top-to-bottom second pass on every system: movement and physics feel, seeded per-match worlds built from an encounter catalog instead of fixed layouts, a match director that escalates the collapse in phases, and staged unlocks worth fighting over. In active development on the `codex/v0.3-ballpark-roadmap` branch.

**Next - v0.4.** Online multiplayer. Currently a technical exploration; the game is multiplayer-first by design (solo runs fill the map with AI pilots on the same stakes), and v0.4 is where humans join the same dying universe.

## Play It

## Playable Targets

| Target | How to play |
|---|---|
| macOS Apple silicon | Run the installer below or download the macOS release zip |
| Windows x64 | Run the PowerShell installer below or download the Windows release zip |
| Linux x64 / Steam Deck | Run the installer below or download the Linux release zip |
| Local desktop from source | Clone the repo and run `npm run play` |

### Install the current build — v0.2.2

The current playable line. One command per platform; the installer downloads
the pinned release, verifies its SHA-256, and installs user-locally while
preserving saves.

Linux, macOS, or SteamOS/Steam Deck (on Deck: Konsole in Desktop Mode — the
installer also registers **Last Singularity** as a non-Steam game for Gaming
Mode):

```sh
curl -fsSL https://github.com/theysayheygreg/last-black-hole/releases/download/v0.2.2-final/install.sh | sh -s -- --version v0.2.2-final
```

Windows PowerShell:

```powershell
$installer = [scriptblock]::Create((irm https://github.com/theysayheygreg/last-black-hole/releases/download/v0.2.2-final/install.ps1))
& $installer -Version v0.2.2-final
```

Prefer a direct download? Grab the platform zip from the
[v0.2.2 release](https://github.com/theysayheygreg/last-black-hole/releases/tag/v0.2.2-final):

- **macOS:** unzip, then run `Run Last Singularity.command` (or open `Last Singularity.app`).
- **Windows:** unzip, then run `Last Singularity.exe`.
- **Linux:** unzip, then run the `Last Singularity` binary.

Downloaded packages include `START-HERE.md` with direct launch instructions.
Steam Deck details and troubleshooting live in the
[Steam Deck runbook](docs/reference/STEAM-DECK-RUNBOOK.md).

### v0.3 beta — not published yet

A v0.3 build becomes the public beta only when it passes the
[release gate](docs/v0.3/RC-GATE.md) and ships a Steam Deck build. The
current candidates haven't cleared the gate, so there is no beta download
today. When one clears, it will appear here and on the releases page as
**Last Singularity BETA**, installing alongside the stable game with
separate saves.

Want v0.3 sooner? Use the dev channel below.

### Dev channel — build from source, at your own risk

The bleeding edge is the repo itself. Anything not in a published release
is unsupported: systems are rebalanced and reworked commit to commit,
saves may break, and no acceptance has been done. If that sounds fine,
the build-from-source path below runs whatever the branch has today.

### Older versions

The [Old Versions](docs/public/OLD-VERSIONS.md) page keeps immutable,
version-pinned one-click installers and checksums for every displaced public
line, each with separate folders, saves, and launchers.

### Build from source

Requires Node.js 22.12+ and a WebGL2-capable machine.

```sh
git clone https://github.com/theysayheygreg/last-black-hole.git
cd last-black-hole
npm install
npm run play
```

`npm run play` starts the local simulation and opens the game window. `npm run stop` shuts the background stack down when you're done.

Working on the game itself? Developer commands, tests, builds, and deployment lanes live in [docs/reference/DEVELOPMENT.md](docs/reference/DEVELOPMENT.md).

## How To Play

First launch flow:

1. Press `Space` / `Enter` (or `A` on a controller) at the title screen.
2. Pick a pilot slot and name your pilot.
3. On the home screen, switch tabs with `Q`/`E` (or `L1`/`R1`).
4. Go to `LAUNCH`, choose a destination, and confirm to drop in.
5. In a run, loot wrecks, manage signal and delta-v, follow wormhole arrows,
   and extract before the universe finishes collapsing.
6. Extract and you keep what you carried. Die and you don't.

For a remote authority development client:

```sh
npm run stack:remote -- --sim=http://HOST:PORT
```

### Keyboard and Mouse

| Action | Input |
|--------|-------|
| Aim | Mouse cursor |
| Thrust | Left click / W / Space |
| Brake | Right click / S / Ctrl |
| Slingshot engage / release | F |
| Force pulse | E |
| Hull ability 1 | Q |
| Hull ability 2 | R |
| Inventory | Tab / I |
| Consumables | 1 / 2 |
| Menu navigate / confirm / back | Arrows or WASD / Space or Enter / Escape |
| Pause | Escape |

### Gamepad

| Action | Button |
|--------|--------|
| Aim | Left stick |
| Thrust | Right trigger |
| Brake | Left trigger |
| Slingshot engage / release | Y / Triangle |
| Force pulse | X / Square |
| Hull ability 1 | Left bumper |
| Hull ability 2 | Right bumper |
| Inventory | Select / Share |
| Consumables | D-pad left / right |
| Menu navigate / confirm / back | D-pad or stick / A or Cross / B or Circle |

## License

Not yet determined. All rights reserved for now.
