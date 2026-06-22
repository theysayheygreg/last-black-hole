# v0.2 Design Bible

## Pitch

**Last Singularity** is an ASCII-fluid extraction roguelike about piloting through the last surviving pockets of a collapsing universe. You do not fly through empty space. You fly through spacetime as a hostile ocean: currents pull, wells churn, stars become route anchors, and every confident burn spends the delta-v you may need to get home.

## Player Fantasy

You are not a spaceship in a shooter. You are a black-hole surfer and salvage pilot. The fantasy is reading impossible water, committing to a line, stealing from dead civilizations, and leaving with just enough fuel, cargo, and nerve.

## Pillars In v0.2 Terms

1. **Art Is Product.** ASCII-over-fluid remains the identity. Three.js exists to deepen and organize that identity, not replace it with generic 3D space.
2. **Movement Is the Game.** Delta-v, currents, slingshots, and route geometry are the main skill expression.
3. **Signal Is Consequence.** Loud play invites the universe to answer. Signal can shape tradeoffs, but it does not become a currency to spend.
4. **Universe Is the Clock.** Wells grow, portals vanish, wrecks drift, pressure rises, and the Inhibitor wakes. The world tells time by becoming worse.
5. **Dread Over Difficulty.** Threats should change the emotional register before they change the math.
6. **Run It Twice.** Parallel experiments are allowed, but v0.2 work should now resolve into clear product contracts.

## Core Loop

```text
PROFILE -> LOADOUT -> DROP -> READ FLOW -> LOOT -> MANAGE SIGNAL -> EXTRACT OR DIE -> RESULTS -> VAULT/UPGRADE -> REPEAT
```

### What Is Live

- Profile slots and pilot identity.
- Map select and launch.
- Wreck looting, cargo, sell/vault flow, and consumables.
- Signal zones and Inhibitor pressure.
- Portal extraction and death results.
- Run records and chronicle foundations.

### What Needs Product Polish

- Upgrade purchasing and persistence write-back.
- Better loadout/vault clarity.
- More legible run-result causality.
- Playtest-tuned economy numbers.

## Movement Model

Movement is an economy with three overlapping resources:

- **Delta-v:** finite thrust budget. Burning makes things happen but spends future escape options.
- **Flow:** the universe gives free motion if the player reads it.
- **Geometry:** wells, stars, planetoids, wrecks, and portals define routes, not just obstacles.

Core verbs:

- Aim and thrust.
- Brake/reverse-thrust.
- Coast and read current.
- Pulse to shove space.
- Engage/release slingshot anchors.
- Use hull abilities to bend movement identity.

Slingshot is now a first-class movement verb. The map should increasingly be designed as route puzzle space: two-hop lines, risky three-chain lines, quiet detours, and emergency exits.

## Run World

Current playable maps:

- **Shallows:** small map, high readability, onboarding and tuning baseline.
- **Expanse:** medium map, first real route-planning space.
- **Deep Field:** large map, scaling/performance stress case and dread space.

World objects:

- **Wells** pull, kill, grow, and shape waves.
- **Stars** push, radiate, and become slingshot anchors.
- **Planetoids/comets** move and serve as low-risk slingshot anchors.
- **Wrecks** drift, age, hold loot, and can become chronicle evidence.
- **Portals** spawn in waves, expire, and define extraction pressure.

## Threats

### Signal

Signal is the consequence layer. Thrust, looting, abilities, echo wrecks, and noisy tactics raise the chance that the run changes tone. The HUD may report signal, but the better long-term goal is that the world feels louder before the UI explains it.

### Inhibitor

The Inhibitor is the existential capstone. It is not a fair opponent. It is the consequence of being noticed. v0.2 keeps the three-form design direction and should tune for dread, not raw lethality.

### Rivals And Ecology

Rivals, scavengers, fauna, sentries, phantoms, and haunts exist to make the universe feel inhabited and watched. The current code has enough foundations to support this, but the next design pass should pick fewer stronger behaviors rather than broaden the catalog blindly.

## Hulls And Progression

Live hulls:

- **Drifter:** current mastery, quiet motion, strong slingshot energy.
- **Breacher:** raw speed, loud burn, brute-force lines.
- **Resonant:** pulse/eddy control and forgiving chain windows.
- **Shroud:** stealth, decoys, lower signal profile.
- **Hauler:** cargo reach, salvage control, heavier movement costs.

Live loadout contract:

- 8 cargo slots.
- 2 equipped artifact slots.
- 2 consumable slots.

Do not use the older 3-artifact-slot design as live truth until profile, HUD, control plane, sim, and tests migrate together.

## Renderer Direction

The v0.2 renderer is a flat-view 3D scene:

- Composer still produces the ASCII/fabric source frame.
- Three shares the same WebGL2 context and renders transparent world layers over it.
- The camera is orthographic top-down.
- Dynamic entities are pooled meshes/lines.
- DOM HUD remains valid for text-heavy UI.

Renderer priorities:

1. Preserve ASCII readability.
2. Move entity/VFX presentation into Three where it improves layering or motion.
3. Keep gameplay truth out of renderer objects.
4. Use renderer fixtures and screenshots for visual regressions.

## Authority Model

The authoritative sim owns gameplay truth. The browser/Electron client owns rendering, local audio, HUD, input collection, interpolation, and visual fluid reconstruction.

Product local play should use:

```sh
npm run stack
```

Debug-only browser sandbox:

```sh
npm run stack:sandbox
```

The sandbox is not a product mode.

## What v0.2 Does Not Promise

- Public hosted multiplayer.
- Matchmaking.
- Fully procedural maps.
- Finished upgrade economy.
- Complete faction/mission layer.
- Final audio score.
- Removal of every legacy renderer path.

Those are future goals, not current player promises.
