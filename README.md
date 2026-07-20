# Last Singularity

**Last Singularity** is an ASCII extraction roguelike about piloting through the last surviving pockets of a collapsing universe.

You do not fly through empty space. You fly through spacetime as a hostile ocean: currents pull, gravity wells churn, stars become route anchors, and every confident burn spends the delta-v you may need to get home.

Drop into a dying universe, read the flow, loot the wreckage of civilizations that didn't make it out, and extract before the remaining portals evaporate — or before something notices the signal you've been throwing into the dark.

```text
DROP -> READ FLOW -> LOOT -> MANAGE SIGNAL -> EXTRACT OR DIE -> REPEAT
```

The entire game renders through a live ASCII fluid shader — the terminal look is the art direction, not a filter.

> Formerly developed under the repository name `last-black-hole`.

## Versions

**Now — v0.2.2.** The current playable line: full run loop (pilots, loadouts, drop, loot, extract, death), server-authoritative simulation even in local play, two hulls with distinct movement identities, gravity slingshots, AI rivals and scavengers, the signal/escalation system, and Steam Deck support. Weekly builds ship from this line.

**In development — v0.3 "Ballpark."** A top-to-bottom second pass on every system: movement and physics feel, seeded per-match worlds built from an encounter catalog instead of fixed layouts, a match director that escalates the collapse in phases, and staged unlocks worth fighting over. In active development on the `codex/v0.3-ballpark-roadmap` branch.

**Next — v0.4.** Online multiplayer. Currently a technical exploration; the game is multiplayer-first by design (solo runs fill the map with AI pilots on the same stakes), and v0.4 is where humans join the same dying universe.

## Play It

### Download a weekly build

Grab the latest from [Releases → Weekly Playables](https://github.com/theysayheygreg/last-black-hole/releases):

- **macOS:** unzip, then run `Run Last Singularity.command` (or open `Last Singularity.app`).
- **Windows:** unzip, then run `Last Singularity.exe`.
- **Linux:** unzip, then run the `Last Singularity` binary.

### Steam Deck

In Desktop Mode, open Konsole and run:

```sh
curl -fsSL https://raw.githubusercontent.com/theysayheygreg/last-black-hole/main/scripts/install-steam-deck.sh | bash
```

This installs the latest Linux build, sets up launchers, and registers **Last Singularity** as a non-Steam game so it appears in your library in Gaming Mode.

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

1. Press `Space` / `Enter` (or `A` on a controller) at the title screen.
2. Pick a pilot slot and name your pilot.
3. On the home screen, switch tabs with `Q`/`E` (or `L1`/`R1`), go to **LAUNCH**, choose a destination, and confirm to drop in.
4. In a run: loot wrecks, watch your delta-v and your signal, and follow the cyan route apertures. Sit inside one and press `Enter` / `A` to extract before it expires — or before the universe finishes collapsing.
5. Extract and you keep what you carried. Die and you don't.

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
